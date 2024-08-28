let messageCount = 0;
let currentModel;
let audioContext;
let analyser;
let youtubeEnabled = false;
let youtubeVideoId = '';
let latestCommentDate = new Date().toISOString();
let apiKeys = {
    'gpt-3.5-turbo': '',
    'gpt-4': '',
    'claude:claude-2': '',
    'claude:claude-instant-1': ''
};
let currentAiModel = 'ollama:llama2';
let isPlaying = false;
let currentAudio = null;

function sendMessage(message = null) {
    const userInput = document.getElementById('userInput');
    const chatBox = document.getElementById('chatBox');
    message = message || userInput.value.trim();

    if (message) {
        if (currentAiModel.startsWith('gpt') || currentAiModel.startsWith('claude')) {
            if (!apiKeys[currentAiModel]) {
                addMessageToChat('エラー: 選択されたAIモデルのAPIキーが設定されていません。設定画面でAPIキーを入力してください。', 'error-message');
                return;
            }
        }
        addMessageToChat(message, 'user-message');
        userInput.value = '';
        sendMessageToServer(message);
    }
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
            if (!isPlaying) {
                playAudioAndAnimate(data.audio, data.sample_rate);
            }
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

    closeSettings();
}

async function loadLive2DModel(modelUrl) {
    try {
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

        function resizeModel() {
            const scale = Math.min(app.screen.width / model.width, app.screen.height / model.height) * 0.8;
            model.scale.set(scale);
            model.x = app.screen.width * 0.5;
            model.y = app.screen.height * 0.5;
        }

        resizeModel();
        window.addEventListener('resize', resizeModel);

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
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
    if (isPlaying) {
        stopCurrentAudio();
    }

    const audioData = base64ToArrayBuffer(audioBase64);
    audioContext.decodeAudioData(audioData, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        isPlaying = true;
        currentAudio = source;
        
        source.onended = () => {
            isPlaying = false;
            currentAudio = null;
        };
        
        source.start(0);
        requestAnimationFrame(updateAnimation);
    });
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.stop();
        currentAudio.onended = null;
        currentAudio = null;
    }
    isPlaying = false;
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function updateAnimation() {
    if (!currentModel || !analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    currentModel.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', average / 255);

    requestAnimationFrame(updateAnimation);
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

function startSpeechInput() {
    stopCurrentAudio();
    // 必要に応じて、ここでUIの更新やユーザーへの通知を行う
}

function endSpeechInput() {
    // 必要に応じて、ここでUIの更新やユーザーへの通知を行う
}

document.addEventListener('DOMContentLoaded', () => {
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

    const characterSelect = document.getElementById('characterSelect');
    const characters = [
        { name: 'シオリ', path: '/static/live2d/satou_vts2/佐藤シオリ.model3.json' },
        { name: 'ミク', path: '/static/live2d/miku/miku/runtime/miku.model3.json' },
    ];

    characters.forEach(char => {
        const option = document.createElement('option');
        option.value = char.path;
        option.textContent = char.name;
        characterSelect.appendChild(option);
    });

    const aiModelSelect = document.getElementById('aiModelSelect');
    const aiModels = [
        { name: 'OLLAMA: llama2', value: 'ollama:llama2' },
        { name: 'OLLAMA: mistral', value: 'ollama:mistral' },
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

    loadVoiceModels();
    loadLive2DModel(characters[0].path);
});