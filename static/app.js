let messageCount = 0;
let youtubeEnabled = false;
let youtubeVideoId = '';
let latestCommentDate = new Date().toISOString();
let apiKeys = {
    'gpt-3.5-turbo': '',
    'gpt-4': '',
    'claude:claude-2': '',
    'claude:claude-instant-1': '',
    'youtube': ''
};
let currentAiModel = 'ollama:llama2';

const characters = [
    { name: 'ミク', path: '/static/miku/miku/runtime/miku.model3.json' },
    { name: 'ヒヨリ', path: '/static/hiyori_free_jp/hiyori_free_jp/runtime/hiyori_free_t08.model3.json' },
    { name: 'シオリ', path: '/static/satou_vts2/佐藤シオリ.model3.json' },
];

// AIモデルの選択肢を管理する配列
const aiModels = [
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    { value: "gpt-4", label: "GPT-4" },
    { value: "claude:claude-2", label: "Claude 2" },
    { value: "ollama:llama2", label: "Llama 2" },
    { value: "ollama:gemma", label: "OLLAMA: gemma" },
    { value: "ollama:mistral", label: "Mistral" }
];

// AIモデル選択のセレクトボックスを動的に生成する関数
function populateAIModelSelect() {
    const aiModelSelect = document.getElementById('aiModelSelect');
    aiModelSelect.innerHTML = ''; // 既存のオプションをクリア

    aiModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.label;
        aiModelSelect.appendChild(option);
    });
}

// ページ読み込み時にAIモデル選択を初期化
document.addEventListener('DOMContentLoaded', () => {
    populateAIModelSelect();
    document.getElementById('sendButton').addEventListener('click', () => sendMessage());
    document.getElementById('userInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    document.getElementById('settingsButton').addEventListener('click', openSettings);
    document.querySelector('.close').addEventListener('click', closeSettings);
    document.getElementById('applySettingsButton').addEventListener('click', applySettings);
    window.addEventListener('click', function(event) {
        if (event.target == document.getElementById('settingsModal')) {
            closeSettings();
        }
    });

    initializeCharacterSelect();
    initializeAiModelSelect();
    loadVoiceModels();
    
    if (typeof loadLive2DModel === 'function') {
        loadLive2DModel(characters[0].path);
    } else {
        console.error('loadLive2DModel関数が見つかりません。character.jsが正しく読み込まれているか確認してください。');
    }

    document.body.addEventListener('click', function() {
        if (typeof audioContext !== 'undefined' && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }, { once: true });

    // 位置とサイズの調整用スライダーのイベントリスナーを設定
    document.getElementById('positionX').addEventListener('input', updateCharacterPosition);
    document.getElementById('positionY').addEventListener('input', updateCharacterPosition);
    document.getElementById('characterSize').addEventListener('input', updateCharacterPosition);

    // リセットボタンのイベントリスナーを設定
    document.getElementById('resetModelPosition').addEventListener('click', resetCharacterPosition);


    // 代わりに、設定内の音声入力トグルにイベントリスナーを追加
    const voiceInputToggle = document.getElementById('voiceInputToggle');
    voiceInputToggle.addEventListener('click', toggleVoiceInput);

    // Web Speech API の設定
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'ja-JP';

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            document.getElementById('userInput').value = transcript;
            sendMessage();
        };

        recognition.onend = function() {
            if (isVoiceInputEnabled) {
                recognition.start();
            }
        };
    } else {
        console.log('Web Speech API is not supported in this browser.');
        voiceInputToggle.disabled = true;
        voiceInputToggle.textContent = '音声入力: 非対応';
    }
});

function initializeCharacterSelect() {
    const characterSelect = document.getElementById('characterSelect');
    characters.forEach(char => {
        const option = document.createElement('option');
        option.value = char.path;
        option.textContent = char.name;
        characterSelect.appendChild(option);
    });
}

function initializeAiModelSelect() {
    const aiModelSelect = document.getElementById('aiModelSelect');
    const aiModels = [
        { name: 'OLLAMA: llama2', value: 'ollama:llama2' },
        { name: 'OLLAMA: mistral', value: 'ollama:mistral' },
        { name: 'OLLAMA: gemma', value: 'ollama:gemma' },
        { name: 'OLLAMA: llama3', value: 'ollama:llama3' },
        { name: 'CLAUDE: claude-2', value: 'claude:claude-2' },
        { name: 'CLAUDE: claude-instant-1', value: 'claude:claude-instant-1' }
    ];

    aiModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.name;
        aiModelSelect.appendChild(option);
    });

    const apiKeyInput = document.getElementById('apiKeyInput');
    apiKeyInput.disabled = !(currentAiModel.startsWith('gpt') || currentAiModel.startsWith('claude'));

    aiModelSelect.addEventListener('change', function(e) {
        currentAiModel = e.target.value;
        apiKeyInput.value = apiKeys[currentAiModel] || '';
        apiKeyInput.disabled = !(currentAiModel.startsWith('gpt') || currentAiModel.startsWith('claude'));
    });
}

function addMessage(sender, message) {
    const chatBox = document.getElementById('chatBox');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;
    messageElement.textContent = message;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessage() {
    const userInput = document.getElementById('userInput').value.trim();
    if (userInput === '') return;

    addMessage('user', userInput);
    document.getElementById('userInput').value = '';

    fetch('/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: userInput,
            cnt: messageCount,
            ai_model: currentAiModel,
            api_key: apiKeys[currentAiModel]
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            const emotion = analyzeEmotion(data.response);
            setMotion(emotion);
            addMessage('mirai', data.response);
            // クライアント側での音声再生を停止
            // playAudioAndAnimate(data.audio, data.sample_rate);
            messageCount++;
        } else {
            console.error('エラー:', data.message);
            addMessage('mirai', 'エラーが発生しました: ' + data.message);
        }
    })
    .catch(error => {
        console.error('エラー:', error);
        addMessage('mirai', 'サーバーとの通信中にエラーが発生しました');
    });
}

function addMessageToChat(message, className) {
    const chatBox = document.getElementById('chatBox');
    const messageElement = document.createElement('div');
    messageElement.className = `message ${className}`;
    messageElement.textContent = message;
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMessageToServer(message) {
    fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            prompt: message, 
            cnt: messageCount,
            api_key: apiKeys[currentAiModel],
            ai_model: currentAiModel
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            addMessageToChat(data.response, 'mirai-message');
            const emotion = analyzeEmotion(data.response);
            setMotion(emotion);
            // クライアント側での音声再生を停止
            // playAudioAndAnimate(data.audio, data.sample_rate);
            addVoiceModelInfo(data.current_voice);
        } else {
            addMessageToChat('エラー: ' + data.message, 'mirai-message');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        addMessageToChat('エラー: 応答の取得に失敗しました', 'mirai-message');
    });

    messageCount++;
}

function addVoiceModelInfo(currentVoice) {
    const chatBox = document.getElementById('chatBox');
    const voiceModelInfo = document.createElement('div');
    voiceModelInfo.className = 'voice-model-info';
    voiceModelInfo.textContent = `現在の音声: ${currentVoice}`;
    chatBox.lastElementChild.appendChild(voiceModelInfo);
}

function openSettings() {
    document.getElementById('settingsModal').style.display = 'block';
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function applySettings() {
    const backgroundUpload = document.getElementById('backgroundUpload');
    const characterSelect = document.getElementById('characterSelect');
    const voiceSelect = document.getElementById('voiceSelect');
    const youtubeEnable = document.getElementById('youtubeEnable');
    const youtubeVideoIdInput = document.getElementById('youtubeVideoId');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const aiModelSelect = document.getElementById('aiModelSelect');
    const aiPrompt = document.getElementById('aiPrompt').value;

    if (backgroundUpload.files && backgroundUpload.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.body.style.backgroundImage = `url('${e.target.result}')`;
        }
        reader.readAsDataURL(backgroundUpload.files[0]);
    }

    if (characterSelect.value) {
        loadLive2DModel(characterSelect.value);
    }

    if (voiceSelect.value) {
        changeVoice(voiceSelect.value);
    }

    youtubeEnabled = youtubeEnable.checked;
    youtubeVideoId = youtubeVideoIdInput.value;
    if (youtubeEnabled) {
        fetchYoutubeComments();
        setInterval(fetchYoutubeComments, 10000);
    }

    if (apiKeyInput.value) {
        apiKeys[currentAiModel] = apiKeyInput.value;
    }

    currentAiModel = aiModelSelect.value;

    // サーバーにプロンプトを送信
    fetch('/update_prompt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: aiPrompt }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('プロンプトが更新されました:', data);
    })
    .catch((error) => {
        console.error('エラー:', error);
    });

    closeSettings();
}

function fetchYoutubeComments() {
    const apiUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${youtubeVideoId}&key=${apiKeys['youtube']}&publishedAfter=${latestCommentDate}`;

    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            data.items.forEach(item => {
                const comment = item.snippet.topLevelComment.snippet.textDisplay;
                const author = item.snippet.topLevelComment.snippet.authorDisplayName;
                const publishedAt = item.snippet.topLevelComment.snippet.publishedAt;
                
                if (new Date(publishedAt) > new Date(latestCommentDate)) {
                    latestCommentDate = publishedAt;
                    const youtubeMessage = `${author}: ${comment}`;
                    sendMessage(youtubeMessage);
                }
            });
        })
        .catch(error => console.error('YouTube APIエラー:', error));
}

function updateCharacterPosition() {
    const x = parseInt(document.getElementById('positionX').value);
    const y = parseInt(document.getElementById('positionY').value);
    const scale = parseFloat(document.getElementById('characterSize').value);

    if (typeof window.setInitialPosition === 'function') {
        window.setInitialPosition(x, y, scale);
    } else {
        console.error('setInitialPosition関数が見つかりません。mouseControl.jsが正しく読み込まれているか確認してください。');
    }
}

function resetCharacterPosition() {
    document.getElementById('positionX').value = 0;
    document.getElementById('positionY').value = 0;
    document.getElementById('characterSize').value = 1;
    updateCharacterPosition();
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

let isVoiceInputEnabled = false;
let isListening = false;
let recognition;

function toggleVoiceInput() {
    isVoiceInputEnabled = !isVoiceInputEnabled;
    const toggleButton = document.getElementById('voiceInputToggle');
    toggleButton.textContent = `音声入力: ${isVoiceInputEnabled ? 'ON' : 'OFF'}`;

    if (isVoiceInputEnabled) {
        startListening();
    } else {
        stopListening();
    }

    fetch('/toggle_voice_input', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: isVoiceInputEnabled }),
    })
    .then(response => response.json())
    .then(data => {
        console.log(data.message);
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

function startListening() {
    if (recognition && !isListening) {
        isListening = true;
        recognition.start();
    }
}

function stopListening() {
    if (recognition && isListening) {
        isListening = false;
        recognition.stop();
    }
}