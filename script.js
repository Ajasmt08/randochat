const socket = new WebSocket('ws://localhost:8080');

// DOM Elements
const screens = {
    welcome: document.getElementById('welcome-screen'),
    selection: document.getElementById('selection-screen'),
    chat: document.getElementById('chat-screen')
};

const inputs = {
    username: document.getElementById('username-input'),
    message: document.getElementById('message-input')
};

const buttons = {
    join: document.getElementById('join-btn'),
    disconnect: document.getElementById('disconnect-btn'),
    random: document.getElementById('random-chat-btn'),
    send: document.getElementById('send-btn'),
    back: document.getElementById('back-btn'),
    accept: document.getElementById('accept-btn'),
    decline: document.getElementById('decline-btn'),
    cancelSearch: document.getElementById('cancel-search-btn'),
    postChatRandom: document.getElementById('post-chat-random-btn'),
    postChatHome: document.getElementById('post-chat-home-btn')
};

const containers = {
    users: document.getElementById('users-grid'),
    messages: document.getElementById('messages-container'),
    inputArea: document.getElementById('chat-input-area'),
    postChatActions: document.getElementById('post-chat-actions'),
    quickJoin: document.getElementById('quick-join-chips')
};

const modal = {
    el: document.getElementById('notification-modal'),
    title: document.getElementById('modal-title'),
    message: document.getElementById('modal-message'),
    searching: document.getElementById('searching-modal')
};

// State
let currentUser = {
    username: '',
    id: null
};
let currentPartner = null;
let pendingRequest = null;

// WebSocket Event Handlers
socket.onopen = function (e) {
    console.log("Connection established!");
    generateQuickJoinNames();
};

socket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    console.log("Received:", data);

    switch (data.type) {
        case 'user_list':
            updateUserList(data.users);
            break;
        case 'connection_request':
            showRequestModal(data);
            break;
        case 'connected':
            hideSearchingModal();
            startChat(data);
            break;
        case 'message':
            addMessage(data.message, 'received');
            break;
        case 'connection_declined':
            alert(`User ${data.username} declined your request.`);
            break;
        case 'partner_disconnected':
            addSystemMessage(`${data.username} has disconnected.`);
            endChatSession();
            break;
        case 'partner_left':
            addSystemMessage(`${data.username} left the chat.`);
            endChatSession();
            break;
    }
};

// UI Interactions
buttons.join.addEventListener('click', () => {
    const username = inputs.username.value.trim();
    if (username) {
        currentUser.username = username;
        socket.send(JSON.stringify({
            type: 'login',
            username: username
        }));
        switchScreen('selection');
        document.getElementById('current-user').textContent = username;
    }
});

buttons.disconnect.addEventListener('click', () => {
    location.reload();
});

buttons.random.addEventListener('click', () => {
    socket.send(JSON.stringify({
        type: 'find_random'
    }));
    showSearchingModal();
});

buttons.back.addEventListener('click', () => {
    if (currentPartner) {
        socket.send(JSON.stringify({
            type: 'leave_chat',
            target: currentPartner.with
        }));
    }
    currentPartner = null;
    switchScreen('selection');
    containers.messages.innerHTML = '';
    resetChatUI();
});

buttons.send.addEventListener('click', sendMessage);
inputs.message.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

buttons.accept.addEventListener('click', () => {
    if (pendingRequest) {
        socket.send(JSON.stringify({
            type: 'accept_connection',
            target: pendingRequest.from
        }));
        hideModal();
    }
});

buttons.decline.addEventListener('click', () => {
    if (pendingRequest) {
        socket.send(JSON.stringify({
            type: 'decline_connection',
            target: pendingRequest.from
        }));
        hideModal();
    }
});

buttons.cancelSearch.addEventListener('click', () => {
    // Ideally send a cancel message to server to remove from queue
    // For now just hide modal and reload/disconnect to be safe or just hide
    hideSearchingModal();
    // socket.close(); // Simple way to ensure removed from queue
    // location.reload(); 
    // Or just hide and let server handle it if matched (user will just ignore)
});

buttons.postChatRandom.addEventListener('click', () => {
    resetChatUI();
    containers.messages.innerHTML = '';
    socket.send(JSON.stringify({
        type: 'find_random'
    }));
    showSearchingModal();
});

buttons.postChatHome.addEventListener('click', () => {
    currentPartner = null;
    switchScreen('selection');
    containers.messages.innerHTML = '';
    resetChatUI();
});

// Helper Functions
function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

function updateUserList(users) {
    containers.users.innerHTML = '';
    users.forEach(user => {
        // Don't show self
        // Note: In a real app we'd need a way to know our own ID from server, 
        // but for now we filter by username if unique or just show all
        if (user.username === currentUser.username) return;

        const userEl = document.createElement('div');
        userEl.className = 'user-item';
        userEl.innerHTML = `
            <div class="user-circle">${user.username.charAt(0).toUpperCase()}</div>
            <div class="user-name">${user.username}</div>
        `;
        userEl.addEventListener('click', () => requestConnection(user));
        containers.users.appendChild(userEl);
    });
}

function requestConnection(user) {
    socket.send(JSON.stringify({
        type: 'request_connection',
        target: user.id
    }));
    showToast(`Request sent to ${user.username}`);
}

function showRequestModal(data) {
    pendingRequest = data;
    modal.message.textContent = `${data.username} wants to chat with you.`;
    modal.el.classList.add('active');
}

function hideModal() {
    modal.el.classList.remove('active');
    pendingRequest = null;
}

function showSearchingModal() {
    modal.searching.classList.add('active');
}

function hideSearchingModal() {
    modal.searching.classList.remove('active');
}

function startChat(data) {
    resetChatUI();
    currentPartner = data;
    document.getElementById('chat-partner-name').textContent = data.username;
    switchScreen('chat');
    containers.messages.innerHTML = ''; // Clear previous messages
    addSystemMessage(`You are connected with ${data.username}`);
}

function endChatSession() {
    currentPartner = null;
    document.querySelector('.status-dot').className = 'status-dot offline';
    // Hide input area and show post-chat actions
    containers.inputArea.style.display = 'none';
    containers.postChatActions.style.display = 'flex';
}

function resetChatUI() {
    inputs.message.placeholder = "Type a message...";
    inputs.message.disabled = false;
    buttons.send.disabled = false;
    document.querySelector('.status-dot').className = 'status-dot online';
    // Show input area and hide post-chat actions
    containers.inputArea.style.display = 'flex';
    containers.postChatActions.style.display = 'none';
}

function sendMessage() {
    const text = inputs.message.value.trim();
    if (text && currentPartner) {
        socket.send(JSON.stringify({
            type: 'message',
            target: currentPartner.with,
            message: text
        }));
        addMessage(text, 'sent');
        inputs.message.value = '';
    }
}

function addMessage(text, type) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${type}`;
    msgEl.textContent = text;
    containers.messages.appendChild(msgEl);
    containers.messages.scrollTop = containers.messages.scrollHeight;
}

function addSystemMessage(text) {
    const msgEl = document.createElement('div');
    msgEl.className = 'message system';
    msgEl.textContent = text;
    msgEl.style.textAlign = 'center';
    msgEl.style.color = '#94a3b8';
    msgEl.style.fontSize = '0.8rem';
    msgEl.style.backgroundColor = 'transparent';
    containers.messages.appendChild(msgEl);
    containers.messages.scrollTop = containers.messages.scrollHeight;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.getElementById('toast-container').appendChild(toast);

    // Remove after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function generateQuickJoinNames() {
    const adjectives = ['Happy', 'Cool', 'Mysterious', 'Silent', 'Wild', 'Clever', 'Brave', 'Calm'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Wolf', 'Fox', 'Bear', 'Hawk', 'Lion'];
    const names = [];

    for (let i = 0; i < 4; i++) {
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 100);
        names.push(`${adj}${noun}${num}`);
    }

    containers.quickJoin.innerHTML = '';
    names.forEach(name => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.textContent = name;
        chip.addEventListener('click', () => {
            inputs.username.value = name;
            buttons.join.click();
        });
        containers.quickJoin.appendChild(chip);
    });
}
