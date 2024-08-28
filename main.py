import os
import openai
import warnings
import numpy as np
import sounddevice as sd
import queue
import torch
from pathlib import Path
from faster_whisper import WhisperModel
from style_bert_vits2.nlp import bert_models
from style_bert_vits2.constants import Languages
from style_bert_vits2.tts_model import TTSModel
from style_bert_vits2.logging import logger
import requests
from flask import Flask, request, jsonify, render_template, send_from_directory
import threading
import base64
import json
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app)

# 警告を無視する設定
warnings.filterwarnings("ignore", message=".*torchaudio._backend.set_audio_backend.*")
logger.remove()

# VTube Studio API設定
VTS_API_URL = "http://localhost:8001/v1/"
VTS_AUTH_TOKEN = "your_vts_auth_token_here"

# デバイスとモデルの設定
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
BEAM_SIZE = 3 if DEVICE == "cuda" else 2
MODEL_TYPE = "medium" if DEVICE == "cuda" else "medium"

model = WhisperModel(MODEL_TYPE, device=DEVICE, compute_type=COMPUTE_TYPE)

bert_models.load_model(Languages.JP, "ku-nlp/deberta-v2-large-japanese-char-wwm")
bert_models.load_tokenizer(Languages.JP, "ku-nlp/deberta-v2-large-japanese-char-wwm")

# 音声モデルの設定
VOICE_MODELS = {
    "シオリ": {
        "model_file": "siori/satou_e36_s1000.safetensors",
        "config_file": "siori/config.json",
        "style_file": "siori/style_vectors.npy"
    },
    "ミク": {
        "model_file": "miku/miku_model.safetensors",
        "config_file": "miku/config.json",
        "style_file": "miku/style_vectors.npy"
    }
    # 他の音声モデルを追加
}

current_voice_model = "シオリ"  # デフォルトの音声モデル
assets_root = Path("model_assets")

def load_voice_model(model_name):
    global model_TTS, current_voice_model
    model_info = VOICE_MODELS[model_name]
    model_TTS = TTSModel(
        model_path=assets_root / model_info["model_file"],
        config_path=assets_root / model_info["config_file"],
        style_vec_path=assets_root / model_info["style_file"],
        device=DEVICE
    )
    current_voice_model = model_name

# 初期音声モデルの読み込み
load_voice_model(current_voice_model)

audio_que = queue.Queue()

# プロンプトの初期ファイル読み込み
PROMPT_FILE = "./prompt/ai.txt"
FIRST_MESSAGE_FILE = "./prompt/ai-first.txt"

with open(PROMPT_FILE, encoding="utf-8") as f:
    sys_prompt = f.read()

with open(FIRST_MESSAGE_FILE, encoding="utf-8") as f:
    first_message = f.read()

def call_first_message():
    sr, audio = model_TTS.infer(text=first_message)
    sd.play(audio, sr)
    sd.wait()

def speech2audio(fs=16000, silence_threshold=0.5, min_duration=0.1, amplitude_threshold=0.025):
    notify_client('start_speech_input')
    record_Flag = False
    non_recorded_data = []
    recorded_audio = []
    silent_time = 0
    input_time = 0
    start_threshold = 0.3
    all_time = 0
    

    with sd.InputStream(samplerate=fs, channels=1) as stream:
        while True:
            data, overflowed = stream.read(int(fs * min_duration))
            all_time += 1
            if all_time == 10:
                print("stand by ready OK")
            elif all_time >= 10:
                if np.max(np.abs(data)) > amplitude_threshold and not record_Flag:
                    input_time += min_duration
                    if input_time >= start_threshold:
                        record_Flag = True
                        print("recording...")
                        recorded_audio = non_recorded_data[int(-1 * start_threshold * 10) - 2:]
                else:
                    input_time = 0

                if overflowed:
                    print("Overflow occurred. Some samples might have been lost.")
                if record_Flag:
                    recorded_audio.append(data)
                else:
                    non_recorded_data.append(data)

                if np.all(np.abs(data) < amplitude_threshold):
                    silent_time += min_duration
                    if silent_time >= silence_threshold and record_Flag:
                        print("finished")
                        record_Flag = False
                        break
                else:
                    silent_time = 0

    audio_data = np.concatenate(recorded_audio, axis=0)
    notify_client('end_speech_input')
    return audio_data

def audio2text(data, model):
    result = ""
    data = data.flatten().astype(np.float32)

    segments, _ = model.transcribe(data, beam_size=BEAM_SIZE)
    for segment in segments:
        result += segment.text

    return result

def ollama_chat(prompt, model="llama2"):
    url = "http://localhost:11434/api/generate"
    data = {
        "model": model,
        "prompt": prompt
    }
    response = requests.post(url, json=data)
    if response.status_code == 200:
        return response.json()["response"]
    else:
        raise Exception(f"OLLAMA API error: {response.status_code}")

def claude_chat(prompt, api_key, model="claude-2"):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    data = {
        "model": model,
        "prompt": prompt,
        "max_tokens_to_sample": 300
    }
    response = requests.post("https://api.anthropic.com/v1/complete", headers=headers, json=data)
    if response.status_code == 200:
        return response.json()["completion"]
    else:
        raise Exception(f"CLAUDE API error: {response.status_code}")

def text2text2speech(user_prompt, cnt, ai_model, api_key):
    """ユーザーのプロンプトをもとにテキスト生成と音声生成を行う"""
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": user_prompt}
    ]

    try:
        if ai_model.startswith("ollama:"):
            generated_text = ollama_chat(user_prompt, ai_model.split(":")[1])
        elif ai_model.startswith("claude:"):
            if not api_key:
                raise ValueError("Claude APIにはAPIキーが必要です。")
            generated_text = claude_chat(user_prompt, api_key, ai_model.split(":")[1])
        elif ai_model.startswith("gpt"):
            if not api_key:
                raise ValueError("OpenAI GPTにはAPIキーが必要です。")
            response = openai.ChatCompletion.create(
                model=ai_model,
                messages=messages,
                api_key=api_key
            )
            generated_text = response['choices'][0]['message']['content']
        else:
            raise ValueError(f"未知のAIモデル: {ai_model}")

        print("AI response:", generated_text)

        # VTube Studio APIを使用して感情を設定
        set_vts_expression("happy")  # 例として「happy」感情を設定

        sr, audio = model_TTS.infer(text=generated_text)
        sd.play(audio, sr)
        sd.wait()

        return generated_text, sr, audio
    except Exception as e:
        print(f"Error during AI chat completion: {e}")
        return str(e), None, None

def set_vts_expression(expression):
    """VTube Studioのキャラクターの感情を設定する"""
    # ... (既存のコード)

def process_text_input(user_prompt, cnt, ai_model, api_key):
    """テキスト入力を処理する"""
    print("user: ", user_prompt)
    return text2text2speech(user_prompt, cnt, ai_model, api_key)

def process_audio_input(audio_data, model, cnt, ai_model, api_key):
    """音声入力を処理する"""
    user_prompt = audio2text(audio_data, model)
    print("user: ", user_prompt)
    return text2text2speech(user_prompt, cnt, ai_model, api_key)

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/voice_models', methods=['GET'])
def get_voice_models():
    return jsonify(list(VOICE_MODELS.keys()))

@app.route('/change_voice', methods=['POST'])
def change_voice():
    model_name = request.json.get('model')
    if model_name in VOICE_MODELS:
        load_voice_model(model_name)
        return jsonify({"status": "success", "message": f"音声モデルを{model_name}に変更しました。"})
    else:
        return jsonify({"status": "error", "message": "指定された音声モデルが見つかりません。"}), 400

@app.route('/chat', methods=['POST'])
def chat():
    user_prompt = request.json.get('prompt')
    cnt = request.json.get('cnt', 0)
    ai_model = request.json.get('ai_model', 'gpt-3.5-turbo')
    api_key = request.json.get('api_key', '')
    
    if (ai_model.startswith('gpt') or ai_model.startswith('claude')) and not api_key:
        return jsonify({"status": "error", "message": "APIキーが必要です。"}), 400

    try:
        response_text, sr, audio = process_text_input(user_prompt, cnt, ai_model, api_key)
        
        # 音声データをBase64エンコード
        audio_base64 = base64.b64encode(audio.tobytes()).decode('utf-8')
        
        return jsonify({
            "status": "success", 
            "response": response_text,
            "audio": audio_base64,
            "sample_rate": sr,
            "current_voice": current_voice_model
        }), 200
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

def notify_client(event):
    socketio.emit('speech_event', {'event': event})

def run_flask():
    socketio.run(app, host='0.0.0.0', port=5000)

def run_console():
    cnt = 0
    call_first_message()
    OPENAI_API_KEY = "openaiのAPIキーを入力してください"  # 音声対話用のAPIキーを直接定義
    while True:
        audio_data = speech2audio()
        process_audio_input(audio_data, model, cnt, 'gpt-3.5-turbo', OPENAI_API_KEY)  # 直接定義したAPIキーを使用
        cnt += 1

def main():
    # Flaskアプリケーションを別スレッドで実行
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.start()

    # コンソールアプリケーションを実行
    run_console()

if __name__ == "__main__":
    main()