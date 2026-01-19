// Session yönetimi
let sessionId = localStorage.getItem('whatsapp_session_id');
let socket = null;
let config = {};
let isReady = false;

// Axios interceptor - her isteğe session ID ekle
axios.interceptors.request.use(reqConfig => {
    if (sessionId) {
        reqConfig.headers['X-Session-ID'] = sessionId;
    }
    console.log(`[API] ${reqConfig.method?.toUpperCase()} ${reqConfig.url} - Session: ${sessionId?.substring(0, 8)}...`);
    return reqConfig;
});

// Session başlat
async function initSession() {
    console.log('initSession başlatılıyor, mevcut sessionId:', sessionId);

    if (!sessionId) {
        // Yeni session oluştur
        try {
            const response = await axios.post('/api/session/create');
            sessionId = response.data.sessionId;
            localStorage.setItem('whatsapp_session_id', sessionId);
            console.log('Yeni session oluşturuldu:', sessionId);
        } catch (error) {
            console.error('Session oluşturma hatası:', error);
            showNotification('Session oluşturulamadı', 'error');
            return;
        }
    } else {
        console.log('Mevcut session kullanılıyor:', sessionId);
    }

    // Session ID'yi header'da göster (debug için)
    updateSessionDisplay();

    // Socket.IO bağlantısı
    initSocket();
}

// Session ID'yi ekranda göster
function updateSessionDisplay() {
    const badge = document.getElementById('statusBadge');
    const sessionDisplay = document.getElementById('sessionIdDisplay');

    if (badge && sessionId) {
        badge.title = `Session: ${sessionId}`;
    }

    if (sessionDisplay && sessionId) {
        sessionDisplay.textContent = sessionId.substring(0, 16) + '...';
        sessionDisplay.title = sessionId;
    }
}

// Socket.IO başlat
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Socket.IO bağlantısı kuruldu');
        // Session'a katıl
        socket.emit('join-session', sessionId);
        loadInitialData();
    });

    socket.on('status', (status) => {
        isReady = status.isReady;
        updateStatusBadge(status.isReady);
        updateDashboard(status);

        if (status.hasQR && status.qrCode) {
            displayQRCode(status.qrCode);
        }
    });

    socket.on('qr', (qrCode) => {
        displayQRCode(qrCode);
    });

    socket.on('ready', (info) => {
        isReady = true;
        updateStatusBadge(true);
        displayBotInfo(info);
        hideQRCode();
        loadGroups();
    });

    socket.on('authenticated', () => {
        showNotification('Kimlik doğrulama başarılı!', 'success');
    });

    socket.on('auth_failure', (msg) => {
        showNotification(`Kimlik doğrulama hatası: ${msg}`, 'error');
    });

    socket.on('disconnected', (reason) => {
        isReady = false;
        updateStatusBadge(false);
        showNotification(`Bağlantı kesildi: ${reason}`, 'error');
    });

    socket.on('log', (logEntry) => {
        addLog(logEntry);
    });

    socket.on('logs', (logs) => {
        logs.forEach(log => addLog(log));
    });

    socket.on('config', (newConfig) => {
        config = newConfig;
        updateUI();
    });

    socket.on('config-updated', (newConfig) => {
        config = newConfig;
        updateUI();
    });

    socket.on('message', (msg) => {
        const logEntry = {
            timestamp: new Date().toLocaleString('tr-TR'),
            message: `[${msg.isGroup ? msg.groupName : 'DM'}] ${msg.senderName}: ${msg.body}`,
            type: 'info'
        };
        addLog(logEntry);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showNotification(error.message || 'Bağlantı hatası', 'error');
    });
}

// İlk veri yükleme
async function loadInitialData() {
    try {
        const statusRes = await axios.get('/api/status');
        isReady = statusRes.data.isReady;
        updateStatusBadge(statusRes.data.isReady);
        updateDashboard(statusRes.data);

        if (statusRes.data.hasQR && statusRes.data.qrCode) {
            displayQRCode(statusRes.data.qrCode);
        } else if (statusRes.data.isReady) {
            displayBotInfo({
                number: statusRes.data.botNumber,
                name: statusRes.data.botName
            });
            hideQRCode();
        }

        const configRes = await axios.get('/api/config');
        config = configRes.data;
        updateUI();

        const logsRes = await axios.get('/api/logs');
        logsRes.data.forEach(log => addLog(log));

        if (isReady) {
            loadGroups();
        }
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
        // Session hatası ise yeni session oluştur
        if (error.response?.status === 400) {
            localStorage.removeItem('whatsapp_session_id');
            sessionId = null;
            initSession();
        }
    }
}

// Tab değiştir
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');

    if (tabName === 'groups' && isReady) {
        loadGroups();
    }
}

// Durum badge güncelle
function updateStatusBadge(ready) {
    const badge = document.getElementById('statusBadge');
    if (ready) {
        badge.textContent = 'Çevrimiçi';
        badge.className = 'status-badge online';
    } else {
        badge.textContent = 'Çevrimdışı';
        badge.className = 'status-badge offline';
    }
}

// Dashboard güncelle
function updateDashboard(status) {
    const botStatusEl = document.getElementById('botStatus');
    if (botStatusEl) {
        if (status.isReady) {
            botStatusEl.textContent = 'Çevrimiçi';
            botStatusEl.style.color = 'white';
        } else {
            botStatusEl.textContent = 'Çevrimdışı';
            botStatusEl.style.color = 'white';
        }
    }
}

// Bot bilgileri göster
function displayBotInfo(info) {
    const botInfoEl = document.getElementById('botInfo');
    botInfoEl.innerHTML = `
        <div style="padding: 20px; background: #f8f9fa; border-radius: 8px;">
            <p style="margin-bottom: 10px;"><strong>Bot Numarası:</strong> ${info.number}</p>
            <p><strong>Bot Adı:</strong> ${info.name || 'Belirtilmemiş'}</p>
        </div>
    `;
}

// QR kod göster
function displayQRCode(qrCode) {
    const qrContent = document.getElementById('qrContent');
    qrContent.innerHTML = `
        <img src="${qrCode}" alt="QR Code">
        <div class="message">WhatsApp uygulamanızla bu QR kodu tarayın</div>
    `;
}

// QR kodu gizle
function hideQRCode() {
    const qrContent = document.getElementById('qrContent');
    qrContent.innerHTML = `
        <div style="padding: 40px;">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style="color: #28a745; margin-bottom: 20px;">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <div class="message" style="color: #28a745; font-weight: 600;">WhatsApp Bağlantısı Aktif!</div>
        </div>
    `;
}

// UI güncelle
function updateUI() {
    refreshStats();
}

// Numara listesi güncelle
function updateNumbersList() {
    const container = document.getElementById('numbersContainer');
    if (!container) return;

    if (!config.inviteNumbers || config.inviteNumbers.length === 0) {
        container.innerHTML = '<div class="empty-state">Henüz numara eklenmemiş</div>';
        return;
    }

    container.innerHTML = config.inviteNumbers.map(number => `
        <li class="number-item">
            <span>${number}</span>
            <button class="btn btn-danger" onclick="removeNumber('${number}')">Sil</button>
        </li>
    `).join('');
}

// Numara ekle
async function addNumber() {
    const input = document.getElementById('newNumber');
    const number = input.value.trim();

    if (!number) {
        showNotification('Lütfen bir numara girin', 'error');
        return;
    }

    if (!/^90\d{10}$/.test(number)) {
        showNotification('Geçerli bir Türkiye numarası girin (90XXXXXXXXXX)', 'error');
        return;
    }

    try {
        await axios.post('/api/numbers/add', { number });
        input.value = '';
        showNotification('Numara eklendi', 'success');
    } catch (error) {
        showNotification('Numara eklenirken hata oluştu', 'error');
    }
}

// Numara sil
async function removeNumber(number) {
    if (!confirm(`${number} numarasını silmek istediğinize emin misiniz?`)) {
        return;
    }

    try {
        await axios.post('/api/numbers/remove', { number });
        showNotification('Numara silindi', 'success');
    } catch (error) {
        showNotification('Numara silinirken hata oluştu', 'error');
    }
}

// Toplu numara ekle
async function addBulkNumbers() {
    const textarea = document.getElementById('bulkNumbers');
    const numbers = textarea.value.trim();

    if (!numbers) {
        showBulkAlert('Lütfen en az bir numara girin', 'error');
        return;
    }

    try {
        const response = await axios.post('/api/numbers/add-bulk', { numbers });
        const { addedCount, totalProvided } = response.data;

        if (addedCount === 0) {
            showBulkAlert(`${totalProvided} numara kontrol edildi, ancak tümü zaten listede mevcut.`, 'warning');
        } else if (addedCount < totalProvided) {
            showBulkAlert(`${addedCount} yeni numara eklendi. ${totalProvided - addedCount} numara zaten listede mevcuttu.`, 'success');
        } else {
            showBulkAlert(`${addedCount} numara başarıyla eklendi!`, 'success');
        }

        textarea.value = '';
        refreshStats();
    } catch (error) {
        showBulkAlert(`Hata: ${error.response?.data?.error || error.message}`, 'error');
    }
}

// Toplu girdi temizle
function clearBulkInput() {
    document.getElementById('bulkNumbers').value = '';
    const alert = document.getElementById('bulkAlert');
    if (alert) {
        alert.className = 'alert';
        alert.textContent = '';
    }
}

// Toplu numara alert göster
function showBulkAlert(message, type) {
    const alert = document.getElementById('bulkAlert');
    if (!alert) return;
    alert.className = `alert alert-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'success'} show`;
    alert.textContent = message;
    setTimeout(() => {
        alert.className = 'alert';
    }, 5000);
}

// İstatistikleri yenile
async function refreshStats() {
    try {
        const response = await axios.get('/api/invite-stats');
        const { stats } = response.data;

        const dashToday = document.getElementById('dashTodayInvites');
        const dashRemaining = document.getElementById('dashRemainingLimit');
        const dashLimit = document.getElementById('dashDailyLimit');

        if (dashToday) dashToday.textContent = stats.today.count;
        if (dashRemaining) dashRemaining.textContent = stats.remainingToday;
        if (dashLimit) dashLimit.textContent = stats.dailyLimit;

        if (dashRemaining) {
            if (stats.remainingToday <= 0) {
                dashRemaining.style.color = 'var(--danger)';
            } else if (stats.remainingToday <= 10) {
                dashRemaining.style.color = 'var(--warning)';
            } else {
                dashRemaining.style.color = 'var(--success)';
            }
        }
    } catch (error) {
        console.error('İstatistikler yüklenirken hata:', error);
    }
}

// Tek tuşla grup oluştur ve davet gönder
async function createGroupAndInvite() {
    if (!isReady) {
        showAlert('groupAlert', 'WhatsApp bağlantısı hazır değil! Önce QR Kod sekmesinden giriş yapın.', 'error');
        return;
    }

    const groupName = document.getElementById('groupName').value.trim();
    const numbers = document.getElementById('groupNumbers').value.trim();

    if (!groupName) {
        showAlert('groupAlert', 'Lütfen grup adı girin', 'error');
        return;
    }

    if (!numbers) {
        showAlert('groupAlert', 'Lütfen en az bir numara girin', 'error');
        return;
    }

    if (!confirm(`"${groupName}" adlı grubu oluşturup davetleri göndermek istediğinize emin misiniz?`)) {
        return;
    }

    try {
        showAlert('groupAlert', '1/5 - Eski veriler temizleniyor...', 'info');

        await axios.post('/api/config', {
            group: {
                name: groupName,
                groupId: '',
                inviteLink: ''
            },
            inviteNumbers: [],
            inviteHistory: {},
            inviteStats: { date: '', count: 0 }
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        showAlert('groupAlert', '2/5 - Yeni numaralar ekleniyor...', 'info');

        const bulkResponse = await axios.post('/api/numbers/add-bulk', { numbers });
        const { addedCount } = bulkResponse.data;

        showAlert('groupAlert', `${addedCount} numara eklendi. 3/5 - Grup oluşturuluyor...`, 'info');

        await new Promise(resolve => setTimeout(resolve, 1000));

        let refreshedConfig = await axios.get('/api/config');
        config = refreshedConfig.data;

        showAlert('groupAlert', '4/5 - Grup oluşturuluyor... (20-30 saniye sürebilir)', 'info');
        await axios.post('/api/group/create');
        await new Promise(resolve => setTimeout(resolve, 3000));

        refreshedConfig = await axios.get('/api/config');
        config = refreshedConfig.data;

        if (!config.group?.groupId) {
            throw new Error('Grup ID bulunamadı!');
        }

        showAlert('groupAlert', `5/5 - Davetler gönderiliyor... (${addedCount} kişiye)`, 'info');

        const inviteResponse = await axios.post('/api/group/send-invites');

        if (inviteResponse.data.success) {
            showAlert('groupAlert', `Tamamlandı! Grup "${groupName}" hazır ve davetler gönderildi.`, 'success');
        } else {
            showAlert('groupAlert', 'Davetler gönderilirken bir sorun oluştu.', 'error');
        }

        document.getElementById('groupName').value = '';
        document.getElementById('groupNumbers').value = '';

        refreshStats();
    } catch (error) {
        console.error('Hata detayı:', error);
        const errorMsg = error.response?.data?.error || error.message || 'Bilinmeyen hata';
        showAlert('groupAlert', `Hata oluştu: ${errorMsg}`, 'error');
    }
}

// Grup oluştur
async function createGroup() {
    if (!isReady) {
        showAlert('groupAlert', 'WhatsApp bağlantısı hazır değil', 'error');
        return;
    }

    if (!confirm('Grup oluşturmak istediğinize emin misiniz?')) {
        return;
    }

    try {
        await axios.post('/api/group/create');
        showAlert('groupAlert', 'Grup başarıyla oluşturuldu!', 'success');
        loadGroups();
    } catch (error) {
        showAlert('groupAlert', `Grup oluşturulurken hata: ${error.response?.data?.error || error.message}`, 'error');
    }
}

// Davet gönder
async function sendInvites() {
    if (!isReady) {
        showAlert('groupAlert', 'WhatsApp bağlantısı hazır değil', 'error');
        return;
    }

    if (!config.group?.groupId) {
        showAlert('groupAlert', 'Önce grup oluşturun', 'error');
        return;
    }

    if (!confirm('Davet linkleri gönderilsin mi?')) {
        return;
    }

    try {
        await axios.post('/api/group/send-invites');
        showAlert('groupAlert', 'Davet linkleri gönderildi!', 'success');
    } catch (error) {
        showAlert('groupAlert', `Davet gönderilirken hata: ${error.response?.data?.error || error.message}`, 'error');
    }
}

// Grubu temizle
async function cleanupGroup() {
    if (!isReady) {
        showAlert('groupAlert', 'WhatsApp bağlantısı hazır değil', 'error');
        return;
    }

    if (!config.group?.groupId) {
        showAlert('groupAlert', 'Önce grup oluşturun', 'error');
        return;
    }

    if (!confirm('Gruptan tüm üyeler çıkarılacak. Emin misiniz?')) {
        return;
    }

    try {
        await axios.post('/api/group/cleanup');
        showAlert('groupAlert', 'Grup temizlendi!', 'success');
    } catch (error) {
        showAlert('groupAlert', `Grup temizlenirken hata: ${error.response?.data?.error || error.message}`, 'error');
    }
}

// Davet linki al
async function getInviteLink() {
    if (!isReady) {
        showAlert('groupAlert', 'WhatsApp bağlantısı hazır değil', 'error');
        return;
    }

    if (!config.group?.groupId) {
        showAlert('groupAlert', 'Önce grup oluşturun', 'error');
        return;
    }

    try {
        const res = await axios.get('/api/group/invite-link');
        navigator.clipboard.writeText(res.data.link);
        showAlert('groupAlert', `Davet linki kopyalandı: ${res.data.link}`, 'success');
    } catch (error) {
        showAlert('groupAlert', `Link alınırken hata: ${error.response?.data?.error || error.message}`, 'error');
    }
}

// Grupları yükle
async function loadGroups() {
    try {
        const res = await axios.get('/api/groups');
        const groupsList = document.getElementById('groupsList');
        const totalGroups = document.getElementById('totalGroups');

        if (!res.data.groups || res.data.groups.length === 0) {
            if (groupsList) groupsList.innerHTML = '<div class="empty-state">Henüz grup bulunmuyor</div>';
            if (totalGroups) totalGroups.textContent = '0';
            return;
        }

        if (totalGroups) totalGroups.textContent = res.data.groups.length;
        if (groupsList) {
            groupsList.innerHTML = res.data.groups.map(group => `
                <div class="group-item">
                    <h4>${group.name}</h4>
                    <p>Katılımcı: ${group.participants}</p>
                    <p style="font-size: 12px; color: #999; margin-top: 5px;">${group.id}</p>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Gruplar yüklenirken hata:', error);
    }
}

// Mesaj gönder
async function sendMessage() {
    if (!isReady) {
        showAlert('messageAlert', 'WhatsApp bağlantısı hazır değil', 'error');
        return;
    }

    const recipient = document.getElementById('messageRecipient').value.trim();
    const message = document.getElementById('messageContent').value.trim();

    if (!recipient || !message) {
        showAlert('messageAlert', 'Lütfen alıcı ve mesaj alanlarını doldurun', 'error');
        return;
    }

    const numbers = recipient.split(',').map(n => n.trim()).filter(n => n);

    if (numbers.length > 1) {
        if (!confirm(`${numbers.length} kişiye mesaj gönderilecek. Devam edilsin mi?`)) {
            return;
        }

        try {
            const res = await axios.post('/api/message/send-bulk', { numbers, message });
            const successCount = res.data.results.filter(r => r.success).length;
            showAlert('messageAlert', `${successCount}/${numbers.length} mesaj başarıyla gönderildi`, 'success');
            document.getElementById('messageContent').value = '';
        } catch (error) {
            showAlert('messageAlert', `Mesaj gönderilirken hata: ${error.response?.data?.error || error.message}`, 'error');
        }
    } else {
        try {
            await axios.post('/api/message/send', { to: numbers[0], message });
            showAlert('messageAlert', 'Mesaj başarıyla gönderildi!', 'success');
            document.getElementById('messageContent').value = '';
        } catch (error) {
            showAlert('messageAlert', `Mesaj gönderilirken hata: ${error.response?.data?.error || error.message}`, 'error');
        }
    }
}

// Log ekle
function addLog(logEntry) {
    const container = document.getElementById('logContainer');
    if (!container) return;

    const logEl = document.createElement('div');
    logEl.className = `log-entry ${logEntry.type}`;
    logEl.textContent = `[${logEntry.timestamp}] ${logEntry.message}`;
    container.appendChild(logEl);
    container.scrollTop = container.scrollHeight;

    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

// Alert göster
function showAlert(elementId, message, type) {
    const alert = document.getElementById(elementId);
    if (!alert) return;

    const alertClass = type === 'info' ? 'alert-warning' : `alert-${type === 'error' ? 'danger' : type}`;
    alert.className = `alert ${alertClass} show`;
    alert.textContent = message;

    const timeout = type === 'info' ? 10000 : 5000;
    setTimeout(() => {
        alert.classList.remove('show');
    }, timeout);
}

// Bildirim göster
function showNotification(message, type) {
    const logEntry = {
        timestamp: new Date().toLocaleString('tr-TR'),
        message,
        type: type === 'success' ? 'success' : 'error'
    };
    addLog(logEntry);
}

// WhatsApp'ı yeniden başlat
async function restartWhatsApp() {
    if (!confirm('WhatsApp bağlantısı yeniden başlatılacak. Devam edilsin mi?')) {
        return;
    }

    try {
        const qrContent = document.getElementById('qrContent');
        qrContent.innerHTML = `
            <div class="loading show">
                <div class="spinner"></div>
                <p style="margin-top: 20px; color: #666;">WhatsApp yeniden başlatılıyor...</p>
            </div>
        `;

        const response = await axios.post('/api/restart');

        if (response.data.success) {
            showNotification('WhatsApp yeniden başlatıldı, QR kod bekleniyor...', 'success');
        }
    } catch (error) {
        showNotification(`Yeniden başlatma hatası: ${error.response?.data?.error || error.message}`, 'error');
    }
}

// Yeni session başlat (mevcut session'ı sil)
async function newSession() {
    if (!confirm('Mevcut oturum silinecek ve yeni oturum başlatılacak. Devam edilsin mi?')) {
        return;
    }

    localStorage.removeItem('whatsapp_session_id');
    sessionId = null;

    if (socket) {
        socket.disconnect();
    }

    // Sayfayı yenile
    window.location.reload();
}

// Sayfa yüklendiğinde session başlat
document.addEventListener('DOMContentLoaded', () => {
    initSession();
});
