console.log('PIXI:', PIXI);
console.log('PIXI.live2d:', PIXI.live2d);
let currentModel;
let audioContext;
let analyser;
let isPlaying = false;
let currentAudio = null;
let animationFrameId = null;
let wavFileHandler;

// 感情分析用の辞書
const emotionKeywords = {
    angry: ['怒', '腹立', 'ムカつく', '許せない', '激怒'],
    sad: ['悲', '寂し', '辛い', '切ない', '落ち込む'],
    confused: ['困', '戸惑', '分からない', '混乱', '迷う'],
    happy: ['嬉し', '楽し', '幸せ', '喜び', '最高'],
    // 'normal'はデフォルトの状態とします
};

// テキストから感情を判定する関数
function analyzeEmotion(text) {
    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        if (keywords.some(keyword => text.includes(keyword))) {
            console.log(`感情分析結果: ${emotion}`);
            return emotion;
        }
    }
    console.log('感情分析結果: normal');
    return 'normal';
}

// モーションを設定する関数
async function setMotion(emotion) {
    if (!currentModel) {
        console.error('Live2Dモデルが読み込まれていません');
        return;
    }

    let motionName;

    switch (emotion) {
        case 'angry':
        case 'sad':
        case 'confused':
        case 'happy':
            motionName = emotion;
            break;
        default:
            motionName = 'idle';
    }

    console.log(`モーション設定: ${motionName}`);
    try {
        await currentModel.motion(motionName);
    } catch (error) {
        console.error('モーションの設定に失敗しました:', error);
    }
}

async function loadLive2DModel(modelUrl) {
    try {
        console.log('PIXI:', PIXI);
        console.log('PIXI.live2d:', PIXI.live2d);

        if (!PIXI.live2d || !PIXI.live2d.Live2DModel) {
            console.error('PIXI Live2D プラグインが正しく読み込まれていません');
            return;
        }

        const app = new PIXI.Application({
            view: document.getElementById("live2d-container"),
            autoStart: true,
            resizeTo: window,
            transparent: true
        });

        app.stage.removeChildren();

        const model = await PIXI.live2d.Live2DModel.from(modelUrl);
        app.stage.addChild(model);
        currentModel = model;

        // マウス制御の初期化
        if (typeof initializeMouseControl === 'function') {
            console.log("Calling initializeMouseControl");
            window.resizeModel = initializeMouseControl(app, model);
            console.log("initializeMouseControl completed");
        } else {
            console.error('initializeMouseControl関数が見つかりません。mouseControl.jsが正しく読み込まれているか確認してください。');
        }
    } catch (error) {
        console.error('Live2Dモデルの読み込みエラー:', error);
    }
}

function loadVoiceModels() {
    fetch('/voice_models')
        .then(response => response.json())
        .then(models => {
            const voiceSelect = document.getElementById('voiceSelect');
            voiceSelect.innerHTML = '';
            models.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                voiceSelect.appendChild(option);
            });
        })
        .catch(error => console.error('音声モデルの取得に失敗しました:', error));
}

function changeVoice(selectedVoice) {
    fetch('/change_voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedVoice })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            console.log(data.message);
        } else {
            console.error('音声モデルの変更に失敗しました: ' + data.message);
        }
    })
    .catch(error => console.error('音声モデルの変更に失敗しました:', error));
}

function playAudioAndAnimate(audioBase64, sampleRate) {
    // クライアント側での音声再生を停止
    // if (isPlaying) {
    //     stopCurrentAudio();
    // }

    // Base64デコードしてArrayBufferに変換
    const binaryString = window.atob(audioBase64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // AudioContextを作成
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // ArrayBufferをデコード
    audioContext.decodeAudioData(bytes.buffer, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        
        source.onended = () => {
            isPlaying = false;
            closeMouth();
        };

        // クライアント側での音声再生を停止
        // source.start(0);
        isPlaying = true;
        openMouth();
    }, (error) => {
        console.error('音声のデコードに失敗しました:', error);
    });
}

function openMouth() {
    if (currentModel) {
        currentModel.internalModel.coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', 1);
    }
}

function closeMouth() {
    if (currentModel) {
        currentModel.internalModel.coreModel.setParameterValueById('PARAM_MOUTH_OPEN_Y', 0);
    }
}

function stopCurrentAudio() {
    if (isPlaying) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.close();
        isPlaying = false;
    }
}

function startSpeechInput() {
    stopCurrentAudio();
    // 必要に応じて、ここでUIの更新やユーザーへの通知を行う
}

function endSpeechInput() {
    // 必要に応じて、ここでUIの更新やユーザーへの通知を行う
}

// 初期化関数
function initializeCharacter() {
    loadLive2DModel('/static/miku/miku/runtime/miku.model3.json');
    loadVoiceModels();
}

// ページ読み込み時に初期化を実行
window.addEventListener('DOMContentLoaded', initializeCharacter);