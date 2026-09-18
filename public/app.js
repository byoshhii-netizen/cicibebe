const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000/api'
  : `${window.location.origin}/api`;

const EMOJIS = ['😀','😂','😍','🥰','😎','🤔','👍','👎','❤️','🔥','🎉','✅','❌','⭐','🙏','👋','🫖','☕','🍵','💬','📎','🎵','📷','🎮','⚽','🌙','☀️','🌈','💯','🤣'];

let currentUser = null;
let currentChannel = null;
let currentDmUser = null;
let chatMode = null; // 'channel' | 'dm'
let messages = [];
let channels = [];
let users = [];
let dmConversations = [];
let blockedUsers = new Set();
let settingsTabsBound = false;

const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mainChat = document.querySelector('.main-chat');
const emojiPicker = document.getElementById('emojiPicker');
const emojiPickerGrid = document.getElementById('emojiPickerGrid');

// ── YARDIMCI FONKSİYONLAR ──────────────────────────────

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = 'toast-notification';
    notification.style.cssText = `
        position: fixed;
        top: max(20px, env(safe-area-inset-top));
        right: 20px;
        left: auto;
        max-width: calc(100vw - 40px);
        padding: 15px 20px;
        background: ${type === 'error' ? '#f04747' : type === 'success' ? '#43b581' : '#7289da'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        animation: slideIn 0.2s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function openSidebar() {
    sidebar?.classList.add('open');
    sidebarOverlay?.classList.add('active');
}

function closeSidebar() {
    sidebar?.classList.remove('open');
    sidebarOverlay?.classList.remove('active');
}

function setChatActive(active) {
    if (mainChat) {
        mainChat.classList.toggle('chat-active', active);
    }
}

function resetChatView() {
    currentChannel = null;
    currentDmUser = null;
    chatMode = null;
    messages = [];
    messageInput.disabled = true;
    sendBtn.disabled = true;
    document.getElementById('chatTitle').textContent = 'Kanal veya mesaj seçin';
    document.getElementById('chatDescription').textContent = '';
    messagesContainer.innerHTML = `
        <div class="welcome-message">
            <h2>🫖 DEMLİK'e Hoş Geldiniz!</h2>
            <p>Sohbete başlamak için bir kanal veya kullanıcı seçin.</p>
        </div>`;
    setChatActive(false);
    renderChannels();
    renderDmConversations();
}

function initMobileNav() {
    document.getElementById('sidebarToggle')?.addEventListener('click', openSidebar);
    document.getElementById('backToSidebar')?.addEventListener('click', () => {
        closeSidebar();
        openSidebar();
        resetChatView();
    });
    sidebarOverlay?.addEventListener('click', closeSidebar);
}

function initEmojiPicker() {
    if (!emojiPickerGrid) return;
    emojiPickerGrid.innerHTML = '';
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-picker-btn';
        btn.textContent = emoji;
        btn.addEventListener('click', () => {
            messageInput.value += emoji;
            messageInput.focus();
            emojiPicker.hidden = true;
        });
        emojiPickerGrid.appendChild(btn);
    });

    document.getElementById('emojiBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.hidden = !emojiPicker.hidden;
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#emojiPicker') && !e.target.closest('#emojiBtn')) {
            if (emojiPicker) emojiPicker.hidden = true;
        }
    });
}

function initFileUpload() {
    const attachBtn = document.getElementById('attachBtn');
    const fileInput = document.getElementById('fileInput');
    if (!attachBtn || !fileInput) return;

    attachBtn.addEventListener('click', () => {
        if (!chatMode) {
            showNotification('Önce bir kanal veya kullanıcı seçin', 'error');
            return;
        }
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        fileInput.value = '';

        if (file.size > 10 * 1024 * 1024) {
            showNotification('Dosya 10MB\'dan büyük olamaz', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                showNotification(data.error || 'Dosya yüklenemedi', 'error');
                return;
            }

            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name) || data.mimetype?.startsWith('image/');
            const payload = {
                content: file.name,
                type: isImage ? 'image' : 'file',
                attachment: data.url
            };

            if (chatMode === 'channel') {
                const msgResponse = await fetch(`${API_URL}/channels/${currentChannel.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: currentUser.id, ...payload })
                });
                const msgData = await msgResponse.json();
                if (msgData.success) {
                    messages.push(msgData.message);
                    renderMessages();
                    showNotification('Dosya gönderildi', 'success');
                } else {
                    showNotification(msgData.error || 'Dosya gönderilemedi', 'error');
                }
            } else if (chatMode === 'dm') {
                const msgResponse = await fetch(`${API_URL}/dm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fromUserId: currentUser.id,
                        toUserId: currentDmUser.id,
                        ...payload
                    })
                });
                const msgData = await msgResponse.json();
                if (msgData.success) {
                    messages.push(msgData.message);
                    renderMessages();
                    loadDmConversations();
                    showNotification('Dosya gönderildi', 'success');
                } else {
                    showNotification(msgData.error || 'Dosya gönderilemedi', 'error');
                }
            }
        } catch (error) {
            showNotification('Dosya yüklenemedi', 'error');
        }
    });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
    if (diff < 86400000) return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getAvatarEmoji(username) {
    const emojis = ['😀', '😎', '🤖', '👽', '🦊', '🐱', '🐶', '🐼', '🦁', '🐯'];
    return emojis[username.charCodeAt(0) % emojis.length];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── AUTH ──────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${tab}Form`).classList.add('active');
    });
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) {
        showNotification('Kullanıcı adı ve şifre gerekli', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            currentUser = data.user;
            localStorage.setItem('demlik_user', JSON.stringify(currentUser));
            showChatScreen();
            showNotification('Giriş başarılı!', 'success');
        } else {
            showNotification(data.error || 'Giriş başarısız', 'error');
        }
    } catch (error) {
        showNotification('Giriş yapılamadı', 'error');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const display_name = document.getElementById('registerDisplayName').value.trim();
    const password = document.getElementById('registerPassword').value;
    if (!username || !email || !password) {
        showNotification('Zorunlu alanları doldurun', 'error');
        return;
    }
    if (password.length < 4) {
        showNotification('Şifre en az 4 karakter olmalı', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, display_name, password })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            showNotification('Kayıt başarılı! Giriş yapabilirsiniz.', 'success');
            document.querySelector('[data-tab="login"]').click();
            document.getElementById('loginUsername').value = username;
            registerForm.reset();
        } else {
            showNotification(data.error || 'Kayıt başarısız', 'error');
        }
    } catch (error) {
        showNotification('Kayıt yapılamadı', 'error');
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (!confirm('Çıkış yapmak istediğinize emin misiniz?')) return;
    try {
        await fetch(`${API_URL}/logout/${currentUser.id}`, { method: 'POST' });
    } catch (_) {}
    localStorage.removeItem('demlik_user');
    currentUser = null;
    currentChannel = null;
    currentDmUser = null;
    chatMode = null;
    stopPolling();
    loginScreen.classList.add('active');
    chatScreen.classList.remove('active');
    showNotification('Çıkış yapıldı', 'success');
});

// ── CHAT SCREEN ──────────────────────────────────────────────

function showChatScreen() {
    loginScreen.classList.remove('active');
    chatScreen.classList.add('active');
    document.getElementById('userDisplayName').textContent = currentUser.display_name || currentUser.username;
    document.getElementById('userAvatar').textContent = getAvatarEmoji(currentUser.username);
    resetChatView();
    closeSidebar();
    loadChannels();
    loadUsers();
    loadDmConversations();
    loadBlockedUsers();
    startPolling();
}

// ── KANALLAR ──────────────────────────────────────────────

async function loadChannels() {
    try {
        const response = await fetch(`${API_URL}/channels`);
        channels = await response.json();
        renderChannels();
    } catch (error) {
        console.error('Kanal yükleme hatası:', error);
    }
}

function renderChannels() {
    const container = document.getElementById('channelsContent');
    container.innerHTML = '';
    channels.forEach(channel => {
        const item = document.createElement('div');
        const isActive = chatMode === 'channel' && currentChannel?.id === channel.id;
        item.className = 'list-item' + (isActive ? ' active' : '');
        item.innerHTML = `
            <div class="list-item-icon">#</div>
            <div class="list-item-content">
                <div class="list-item-name">${escapeHtml(channel.name)}</div>
                <div class="list-item-desc">${channel.member_count || 0} üye</div>
            </div>
        `;
        item.addEventListener('click', () => selectChannel(channel));
        container.appendChild(item);
    });
}

async function selectChannel(channel) {
    currentChannel = channel;
    currentDmUser = null;
    chatMode = 'channel';
    document.getElementById('chatTitle').textContent = `# ${channel.name}`;
    document.getElementById('chatDescription').textContent = channel.description || '';
    messageInput.disabled = false;
    sendBtn.disabled = false;
    setChatActive(true);
    closeSidebar();
    renderChannels();
    renderDmConversations();
    await loadMessages();
    messageInput.focus();
}

// ── ÖZEL MESAJLAR (DM) ──────────────────────────────────────────────

async function loadDmConversations() {
    try {
        const response = await fetch(`${API_URL}/dm/conversations/${currentUser.id}`);
        if (!response.ok) return;
        dmConversations = await response.json();
        renderDmConversations();
    } catch (error) {
        console.error('DM konuşma yükleme hatası:', error);
    }
}

function renderDmConversations() {
    const container = document.getElementById('messagesContent');
    if (!container) return;
    container.innerHTML = '';
    if (dmConversations.length === 0) {
        container.innerHTML = '<p class="list-empty">Henüz özel mesaj yok. Kullanıcılar sekmesinden mesaj gönderin.</p>';
        return;
    }
    dmConversations.forEach(conv => {
        const item = document.createElement('div');
        const isActive = chatMode === 'dm' && currentDmUser?.id === conv.id;
        const statusEmoji = conv.status === 'online' ? '🟢' : '⚫';
        item.className = 'list-item' + (isActive ? ' active' : '');
        item.innerHTML = `
            <div class="message-avatar">${getAvatarEmoji(conv.username)}</div>
            <div class="list-item-content">
                <div class="list-item-name">${escapeHtml(conv.display_name || conv.username)}</div>
                <div class="list-item-desc">${statusEmoji} ${escapeHtml(conv.last_message || 'Mesaj yok')}</div>
            </div>
        `;
        item.addEventListener('click', () => selectDmUser(conv));
        container.appendChild(item);
    });
}

async function selectDmUser(user) {
    currentDmUser = user;
    currentChannel = null;
    chatMode = 'dm';
    const statusText = user.status === 'online' ? '🟢 Çevrimiçi' : '⚫ Çevrimdışı';
    document.getElementById('chatTitle').textContent = user.display_name || user.username;
    document.getElementById('chatDescription').textContent = statusText;
    messageInput.disabled = false;
    sendBtn.disabled = false;
    setChatActive(true);
    closeSidebar();
    renderChannels();
    renderDmConversations();
    await loadDmMessages();
    messageInput.focus();
}

async function loadDmMessages() {
    if (!currentDmUser) return;
    try {
        const response = await fetch(`${API_URL}/dm/${currentUser.id}/${currentDmUser.id}`);
        if (!response.ok) return;
        messages = await response.json();
        renderMessages();
    } catch (error) {
        console.error('DM yükleme hatası:', error);
    }
}

// ── MESAJLAR ──────────────────────────────────────────────

async function loadMessages() {
    if (!currentChannel) return;
    try {
        const response = await fetch(`${API_URL}/channels/${currentChannel.id}/messages`);
        messages = await response.json();
        renderMessages();
    } catch (error) {
        console.error('Mesaj yükleme hatası:', error);
    }
}

function renderMessages() {
    messagesContainer.innerHTML = '';
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <h2>Henüz mesaj yok</h2>
                <p>İlk mesajı siz gönderin!</p>
            </div>`;
        return;
    }
    messages.forEach(message => {
        if (chatMode === 'channel' && blockedUsers.has(message.user_id)) return;
        messagesContainer.appendChild(createMessageElement(message));
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function createMessageElement(message) {
    const div = document.createElement('div');
    const isDm = chatMode === 'dm';
    const authorId = isDm ? message.from_user_id : message.user_id;
    const isOwn = authorId === currentUser.id;
    div.className = 'message' + (isDm ? ' dm-message' : '') + (isOwn ? ' own-message' : '');
    div.dataset.messageId = message.id;

    let attachmentHtml = '';
    if (message.attachment) {
        const isImage = message.type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(message.attachment);
        if (isImage) {
            attachmentHtml = `<div class="message-attachment"><img src="${escapeHtml(message.attachment)}" alt="Görsel" loading="lazy"></div>`;
        } else {
            attachmentHtml = `<div class="message-attachment"><a href="${escapeHtml(message.attachment)}" target="_blank" rel="noopener">📎 ${escapeHtml(message.content || 'Dosyayı aç')}</a></div>`;
        }
    }

    const showActions = !isDm && isOwn;
    const authorName = message.display_name || message.username || 'Kullanıcı';

    div.innerHTML = `
        ${!isOwn ? `<div class="message-avatar">${getAvatarEmoji(message.username || 'U')}</div>` : ''}
        <div class="message-content">
            <div class="message-header">
                ${!isOwn ? `<span class="message-author">${escapeHtml(authorName)}</span>` : ''}
                <span class="message-time">${formatTime(message.created_at)}</span>
                ${message.edited ? '<span class="message-edited">(düzenlendi)</span>' : ''}
            </div>
            ${message.content && !message.attachment ? `<div class="message-text">${escapeHtml(message.content)}</div>` : ''}
            ${message.content && message.attachment && message.type !== 'image' ? `<div class="message-text">${escapeHtml(message.content)}</div>` : ''}
            ${attachmentHtml}
            ${showActions ? `
                <div class="message-actions">
                    <button class="icon-btn edit-message" title="Düzenle">✏️</button>
                    <button class="icon-btn delete-message" title="Sil">🗑️</button>
                </div>
            ` : ''}
        </div>
    `;
    if (showActions) {
        div.querySelector('.edit-message')?.addEventListener('click', () => editMessage(message));
        div.querySelector('.delete-message')?.addEventListener('click', () => deleteMessage(message));
    }
    return div;
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !chatMode) return;
    try {
        if (chatMode === 'channel') {
            const response = await fetch(`${API_URL}/channels/${currentChannel.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, content })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                messageInput.value = '';
                messages.push(data.message);
                renderMessages();
            } else {
                showNotification(data.error || 'Mesaj gönderilemedi', 'error');
            }
        } else if (chatMode === 'dm') {
            const response = await fetch(`${API_URL}/dm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromUserId: currentUser.id,
                    toUserId: currentDmUser.id,
                    content
                })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                messageInput.value = '';
                messages.push(data.message);
                renderMessages();
                loadDmConversations();
            } else {
                showNotification(data.error || 'Mesaj gönderilemedi', 'error');
            }
        }
    } catch (error) {
        showNotification('Mesaj gönderilemedi', 'error');
    }
}

async function editMessage(message) {
    if (message.attachment) {
        showNotification('Dosya mesajları düzenlenemez', 'error');
        return;
    }
    const newContent = prompt('Yeni mesaj:', message.content);
    if (!newContent || newContent === message.content) return;
    try {
        const response = await fetch(`${API_URL}/messages/${message.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, content: newContent })
        });
        const data = await response.json();
        if (data.success) {
            await loadMessages();
            showNotification('Mesaj düzenlendi', 'success');
        }
    } catch (error) {
        showNotification('Mesaj düzenlenemedi', 'error');
    }
}

async function deleteMessage(message) {
    if (!confirm('Bu mesajı silmek istediğinize emin misiniz?')) return;
    try {
        const response = await fetch(`${API_URL}/messages/${message.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const data = await response.json();
        if (data.success) {
            await loadMessages();
            showNotification('Mesaj silindi', 'success');
        }
    } catch (error) {
        showNotification('Mesaj silinemedi', 'error');
    }
}

// ── KULLANICILAR ──────────────────────────────────────────────

async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/users`);
        const allUsers = await response.json();
        // Engellenen ve bizi engelleyenleri filtrele
        users = allUsers.filter(u => !blockedUsers.has(u.id));
        renderUsers();
    } catch (error) {
        console.error('Kullanıcı yükleme hatası:', error);
    }
}

function renderUsers() {
    const container = document.getElementById('usersContent');
    container.innerHTML = '';
    users.forEach(user => {
        if (user.id === currentUser.id) return;
        const item = document.createElement('div');
        item.className = 'list-item';
        const statusEmoji = user.status === 'online' ? '🟢' : '⚫';
        item.innerHTML = `
            <div class="message-avatar">${getAvatarEmoji(user.username)}</div>
            <div class="list-item-content">
                <div class="list-item-name">${escapeHtml(user.display_name || user.username)}</div>
                <div class="list-item-desc">${statusEmoji} ${user.status === 'online' ? 'Çevrimiçi' : 'Çevrimdışı'}</div>
            </div>
            <div class="user-actions">
                <button class="icon-btn dm-btn" data-id="${user.id}" title="Mesaj Gönder">💬</button>
                <button class="icon-btn follow-btn" data-id="${user.id}" title="Takip Et">➕</button>
                <button class="icon-btn block-btn" data-id="${user.id}" title="Engelle">🚫</button>
            </div>
        `;
        item.querySelector('.dm-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            selectDmUser(user);
            document.querySelector('[data-tab="messages"]').click();
        });
        item.querySelector('.follow-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFollow(user.id, e.currentTarget);
        });
        item.querySelector('.block-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            blockUser(user.id, user.display_name || user.username);
        });
        item.addEventListener('click', () => selectDmUser(user));
        container.appendChild(item);
    });
    // Takip durumlarını güncelle
    updateFollowButtons();
}

async function updateFollowButtons() {
    const buttons = document.querySelectorAll('.follow-btn');
    for (const btn of buttons) {
        const targetId = parseInt(btn.dataset.id);
        try {
            const res = await fetch(`${API_URL}/follow/status?followerId=${currentUser.id}&followingId=${targetId}`);
            const data = await res.json();
            if (data.following) {
                btn.textContent = '✅';
                btn.title = 'Takibi Bırak';
                btn.dataset.following = '1';
            } else {
                btn.textContent = '➕';
                btn.title = 'Takip Et';
                btn.dataset.following = '0';
            }
        } catch (_) {}
    }
}

async function toggleFollow(targetId, btn) {
    const isFollowing = btn.dataset.following === '1';
    try {
        const response = await fetch(`${API_URL}/follow`, {
            method: isFollowing ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followerId: currentUser.id, followingId: targetId })
        });
        const data = await response.json();
        if (data.success) {
            btn.dataset.following = isFollowing ? '0' : '1';
            btn.textContent = isFollowing ? '➕' : '✅';
            btn.title = isFollowing ? 'Takip Et' : 'Takibi Bırak';
            showNotification(isFollowing ? 'Takip bırakıldı' : 'Takip edildi', 'success');
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('İşlem başarısız', 'error');
    }
}

// ── ENGELLEME ──────────────────────────────────────────────

async function loadBlockedUsers() {
    try {
        const res = await fetch(`${API_URL}/users/${currentUser.id}/blocks`);
        const blocked = await res.json();
        blockedUsers = new Set(blocked.map(u => u.id));
    } catch (_) {}
}

async function blockUser(targetId, targetName) {
    if (!confirm(`"${targetName}" adlı kullanıcıyı engellemek istediğinize emin misiniz?\n\nEngellenen kişi sizin içeriklerinizi göremez ve size mesaj gönderemez.`)) return;
    try {
        const response = await fetch(`${API_URL}/block`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blockerId: currentUser.id, blockedId: targetId })
        });
        const data = await response.json();
        if (data.success) {
            blockedUsers.add(targetId);
            showNotification(`${targetName} engellendi`, 'success');
            if (chatMode === 'dm' && currentDmUser?.id === targetId) resetChatView();
            await loadUsers();
            await loadDmConversations();
            renderMessages();
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Engelleme başarısız', 'error');
    }
}

async function unblockUser(targetId, targetName) {
    try {
        const response = await fetch(`${API_URL}/block`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blockerId: currentUser.id, blockedId: targetId })
        });
        const data = await response.json();
        if (data.success) {
            blockedUsers.delete(targetId);
            showNotification(`${targetName} engeli kaldırıldı`, 'success');
            await loadUsers();
            renderMessages();
            renderBlockedList(); // Ayarlar panelini güncelle
        } else {
            showNotification(data.error, 'error');
        }
    } catch (error) {
        showNotification('Engel kaldırma başarısız', 'error');
    }
}

// ── ARAMA ──────────────────────────────────────────────

const searchInput = document.getElementById('searchInput');
let searchTimeout = null;

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = searchInput.value.trim();
    if (!q) {
        closeSearchResults();
        return;
    }
    searchTimeout = setTimeout(() => performSearch(q), 300);
});

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        searchInput.value = '';
        closeSearchResults();
    }
});

// Dışarı tıklayınca kapat
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
        closeSearchResults();
    }
});

async function performSearch(q) {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(q)}&userId=${currentUser.id}`);
        if (!res.ok) return;
        const data = await res.json();
        showSearchResults(data);
    } catch (error) {
        console.error('Arama hatası:', error);
    }
}

function showSearchResults(data) {
    closeSearchResults();
    const box = document.querySelector('.search-box');
    const dropdown = document.createElement('div');
    dropdown.id = 'searchDropdown';
    dropdown.className = 'search-dropdown';

    const hasResults = data.users.length > 0 || data.channels.length > 0;
    if (!hasResults) {
        dropdown.innerHTML = '<div class="search-empty">Sonuç bulunamadı</div>';
        box.appendChild(dropdown);
        return;
    }

    if (data.users.length > 0) {
        const header = document.createElement('div');
        header.className = 'search-section-header';
        header.textContent = 'Kullanıcılar';
        dropdown.appendChild(header);
        data.users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <span class="search-avatar">${getAvatarEmoji(user.username)}</span>
                <span class="search-name">${escapeHtml(user.display_name || user.username)}</span>
                <span class="search-username">@${escapeHtml(user.username)}</span>
            `;
            item.addEventListener('click', () => {
                closeSearchResults();
                searchInput.value = '';
                const found = users.find(u => u.id === user.id) || user;
                selectDmUser(found);
                document.querySelector('[data-tab="messages"]').click();
            });
            dropdown.appendChild(item);
        });
    }

    if (data.channels.length > 0) {
        const header = document.createElement('div');
        header.className = 'search-section-header';
        header.textContent = 'Kanallar';
        dropdown.appendChild(header);
        data.channels.forEach(channel => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <span class="search-avatar">#</span>
                <span class="search-name">${escapeHtml(channel.name)}</span>
                <span class="search-username">${escapeHtml(channel.description || '')}</span>
            `;
            item.addEventListener('click', () => {
                const found = channels.find(c => c.id === channel.id);
                if (found) selectChannel(found);
                closeSearchResults();
                searchInput.value = '';
            });
            dropdown.appendChild(item);
        });
    }

    box.appendChild(dropdown);
}

function closeSearchResults() {
    document.getElementById('searchDropdown')?.remove();
}

// ── SIDEBAR TABS ──────────────────────────────────────────────

document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.list-container').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tabName}List`).classList.add('active');
    });
});

// ── KANAL OLUŞTUR ──────────────────────────────────────────────

document.getElementById('createChannelBtn').addEventListener('click', () => {
    document.getElementById('createChannelModal').classList.add('active');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').classList.remove('active');
    });
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

document.getElementById('createChannelForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('channelName').value;
    const description = document.getElementById('channelDescription').value;
    try {
        const response = await fetch(`${API_URL}/channels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, type: 'text', created_by: currentUser.id })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            document.getElementById('createChannelModal').classList.remove('active');
            document.getElementById('createChannelForm').reset();
            await loadChannels();
            showNotification('Kanal oluşturuldu!', 'success');
        } else {
            showNotification(data.error || 'Kanal oluşturulamadı', 'error');
        }
    } catch (error) {
        showNotification('Kanal oluşturulamadı', 'error');
    }
});

// ── AYARLAR PANELİ ──────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('active');
    const usernameEl = document.getElementById('settings-username');
    const displayNameInput = document.getElementById('profileDisplayName');
    const bioInput = document.getElementById('profileBio');
    if (usernameEl) usernameEl.textContent = currentUser.username;
    if (displayNameInput) displayNameInput.value = currentUser.display_name || '';
    if (bioInput) bioInput.value = currentUser.bio || '';
    renderBlockedList();
    loadSettingsTabs();
});

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const display_name = document.getElementById('profileDisplayName').value.trim();
    const bio = document.getElementById('profileBio').value.trim();
    try {
        const response = await fetch(`${API_URL}/users/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name, bio, avatar: currentUser.avatar })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            currentUser.display_name = display_name;
            currentUser.bio = bio;
            localStorage.setItem('demlik_user', JSON.stringify(currentUser));
            document.getElementById('userDisplayName').textContent = display_name || currentUser.username;
            showNotification('Profil güncellendi', 'success');
        } else {
            showNotification(data.error || 'Profil güncellenemedi', 'error');
        }
    } catch (error) {
        showNotification('Profil güncellenemedi', 'error');
    }
});

function loadSettingsTabs() {
    if (settingsTabsBound) return;
    settingsTabsBound = true;
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`settings-${tab.dataset.panel}`).classList.add('active');
        });
    });
}

async function renderBlockedList() {
    const container = document.getElementById('blockedListContent');
    if (!container) return;
    try {
        const res = await fetch(`${API_URL}/users/${currentUser.id}/blocks`);
        const blocked = await res.json();
        if (blocked.length === 0) {
            container.innerHTML = '<p class="settings-empty">Engellenen kullanıcı yok.</p>';
            return;
        }
        container.innerHTML = '';
        blocked.forEach(user => {
            const item = document.createElement('div');
            item.className = 'blocked-item';
            item.innerHTML = `
                <span class="blocked-avatar">${getAvatarEmoji(user.username)}</span>
                <span class="blocked-name">${escapeHtml(user.display_name || user.username)}</span>
                <span class="blocked-username">@${escapeHtml(user.username)}</span>
                <button class="btn-unblock" data-id="${user.id}" data-name="${escapeHtml(user.display_name || user.username)}">Engeli Kaldır</button>
            `;
            item.querySelector('.btn-unblock').addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id);
                const name = e.currentTarget.dataset.name;
                await unblockUser(id, name);
            });
            container.appendChild(item);
        });
    } catch (error) {
        container.innerHTML = '<p class="settings-empty">Yüklenemedi.</p>';
    }
}

// Engellenen arama (ayarlar içinde)
document.addEventListener('input', (e) => {
    if (e.target.id === 'blockedSearchInput') {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.blocked-item').forEach(item => {
            const name = item.querySelector('.blocked-name').textContent.toLowerCase();
            const username = item.querySelector('.blocked-username').textContent.toLowerCase();
            item.style.display = (name.includes(q) || username.includes(q)) ? '' : 'none';
        });
    }
});

// ── POLLING ──────────────────────────────────────────────

let pollingInterval;

function startPolling() {
    pollingInterval = setInterval(async () => {
        if (chatMode === 'channel') await loadMessages();
        else if (chatMode === 'dm') await loadDmMessages();
        loadDmConversations();
    }, 3000);
}

function stopPolling() {
    clearInterval(pollingInterval);
}

// ── BAŞLANGIÇ ──────────────────────────────────────────────

initMobileNav();
initEmojiPicker();
initFileUpload();

async function restoreSession() {
    const savedUser = localStorage.getItem('demlik_user');
    if (!savedUser) return;
    try {
        currentUser = JSON.parse(savedUser);
        const res = await fetch(`${API_URL}/users/${currentUser.id}`);
        if (!res.ok) throw new Error('Session invalid');
        const user = await res.json();
        currentUser = { ...currentUser, ...user };
        localStorage.setItem('demlik_user', JSON.stringify(currentUser));
        showChatScreen();
    } catch (_) {
        localStorage.removeItem('demlik_user');
        currentUser = null;
    }
}

restoreSession();
