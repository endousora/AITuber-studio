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
    { name: 'レン', path: '/static/len/len/runtime/len.model3.json' },
    { name: 'シオリ', path: '/static/satou_vts2/佐藤シオリ.model3.json' },
];

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
            playAudioAndAnimate(data.audio, data.sample_rate);
            messageCount++;
        } else {
            console.error('エラー:', data.message);
        }
    })
    .catch(error => {
        console.error('エラー:', error);
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
            playAudioAndAnimate(data.audio, data.sample_rate);
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