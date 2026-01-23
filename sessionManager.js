const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// ============== CONFIGURATION ==============
const CONFIG = {
    MAX_SESSIONS: parseInt(process.env.MAX_SESSIONS) || 5,          // Maksimum eş zamanlı session
    SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 1800000, // 30 dakika inaktiflik
    CLEANUP_INTERVAL: 60000,  // Her 1 dakikada temizlik kontrolü
    MAX_LOGS_PER_SESSION: 100,
    PUPPETEER_TIMEOUT: 60000
};

// Aktif sessionlar
const sessions = new Map();

// Session dizini
const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// ============== UTILITIES ==============

// Timeout ile Promise sarmalama
function withTimeout(promise, ms, errorMessage = 'İşlem zaman aşımına uğradı') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMessage)), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// Güvenli JSON parse
function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch {
        return defaultValue;
    }
}

// ============== SESSION CLASS ==============

class WhatsAppSession {
    constructor(sessionId, io) {
        this.sessionId = sessionId;
        this.io = io;
        this.client = null;
        this.qrCodeData = null;
        this.isReady = false;
        this.isInitializing = false;
        this.isSendingInvites = false;
        this.lastActivity = Date.now();
        this.config = this.loadConfig();
        this.logs = [];
    }

    // Aktivite güncelle
    touch() {
        this.lastActivity = Date.now();
    }

    // Config yükle
    loadConfig() {
        const configPath = path.join(SESSIONS_DIR, this.sessionId, 'config.json');
        const defaultConfig = {
            group: { name: '', groupId: '', inviteLink: '' },
            inviteNumbers: [],
            inviteHistory: {},
            inviteStats: { date: '', count: 0 },
            safetySettings: {
                minDelay: 5000,
                maxDelay: 10000,
                dailyLimit: 50,
                messageVariations: true
            }
        };

        try {
            if (fs.existsSync(configPath)) {
                const loaded = safeJsonParse(fs.readFileSync(configPath, 'utf8'), {});
                return {
                    ...defaultConfig,
                    ...loaded,
                    safetySettings: { ...defaultConfig.safetySettings, ...loaded.safetySettings }
                };
            }
        } catch (e) {
            console.error(`[${this.sessionId.substring(0, 8)}] Config load error:`, e.message);
        }

        // Dizin ve config oluştur
        const sessionDir = path.join(SESSIONS_DIR, this.sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }

    // Config kaydet
    saveConfig() {
        try {
            const configPath = path.join(SESSIONS_DIR, this.sessionId, 'config.json');
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
            this.emitToSession('config-updated', this.config);
        } catch (e) {
            console.error(`[${this.sessionId.substring(0, 8)}] Config save error:`, e.message);
        }
    }

    // Log ekle
    log(message, type = 'info') {
        const timestamp = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const logEntry = { timestamp, message, type };

        this.logs.push(logEntry);
        if (this.logs.length > CONFIG.MAX_LOGS_PER_SESSION) {
            this.logs.shift();
        }

        console.log(`[${this.sessionId.substring(0, 8)}][${timestamp}] ${message}`);
        this.emitToSession('log', logEntry);
        this.touch();
    }

    // Session'a emit
    emitToSession(event, data) {
        try {
            this.io.to(this.sessionId).emit(event, data);
        } catch (e) { }
    }

    // WhatsApp client başlat
    async initialize() {
        if (this.client || this.isInitializing) {
            this.log('Client zaten başlatılmış veya başlatılıyor', 'warning');
            return;
        }

        this.isInitializing = true;
        this.log('WhatsApp Client başlatılıyor...', 'info');

        try {
            this.client = new Client({
                authStrategy: new LocalAuth({
                    clientId: this.sessionId,
                    dataPath: path.join(SESSIONS_DIR, this.sessionId, '.wwebjs_auth')
                }),
                puppeteer: {
                    headless: true,
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-gpu',
                        '--disable-extensions',
                        '--disable-software-rasterizer',
                        '--disable-background-networking',
                        '--disable-default-apps',
                        '--disable-sync',
                        '--disable-translate',
                        '--hide-scrollbars',
                        '--metrics-recording-only',
                        '--mute-audio',
                        '--no-default-browser-check',
                        '--safebrowsing-disable-auto-update'
                    ],
                    timeout: CONFIG.PUPPETEER_TIMEOUT
                },
                qrMaxRetries: 3,
                restartOnAuthFail: false,
                webVersionCache: {
                    type: 'remote',
                    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
                }
            });

            this._setupEventHandlers();

            await this.client.initialize();

        } catch (err) {
            this.log(`Client başlatma hatası: ${err.message}`, 'error');
            this.isInitializing = false;
            this.client = null;
        }
    }

    // Event handler'ları ayarla
    _setupEventHandlers() {
        this.client.on('qr', (qr) => {
            this.log('QR Kodu alındı', 'info');
            qrcode.toDataURL(qr, { errorCorrectionLevel: 'M', width: 400, margin: 1 })
                .then((dataUrl) => {
                    this.qrCodeData = dataUrl;
                    this.log('QR Kodu hazır - Tarayın', 'success');
                    this.emitToSession('qr', this.qrCodeData);
                })
                .catch((err) => this.log(`QR hatası: ${err.message}`, 'error'));
        });

        this.client.on('ready', () => {
            this.log('WhatsApp bağlantısı kuruldu!', 'success');
            this.isReady = true;
            this.isInitializing = false;
            this.qrCodeData = null;
            this.emitToSession('ready', {
                number: this.client.info?.wid?.user,
                name: this.client.info?.pushname
            });
        });

        this.client.on('authenticated', () => {
            this.log('Kimlik doğrulama başarılı', 'success');
            this.emitToSession('authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            this.log(`Kimlik doğrulama hatası: ${msg}`, 'error');
            this.isInitializing = false;
            this.emitToSession('auth_failure', msg);
        });

        this.client.on('disconnected', (reason) => {
            this.log(`Bağlantı kesildi: ${reason}`, 'error');
            this.isReady = false;
            this.isInitializing = false;
            this.emitToSession('disconnected', reason);
        });

        this.client.on('loading_screen', (percent) => {
            if (percent % 20 === 0) {
                this.log(`Yükleniyor: ${percent}%`, 'info');
            }
        });
    }

    // Client'ı yeniden başlat
    async restart() {
        if (this.isInitializing) {
            this.log('Client zaten başlatılıyor', 'warning');
            return;
        }

        this.log('WhatsApp yeniden başlatılıyor...', 'info');
        await this.destroy();
        await new Promise(r => setTimeout(r, 2000));
        await this.initialize();
    }

    // Client'ı kapat
    async destroy() {
        this.isSendingInvites = false;

        // Send page'i kapat
        await this.closeSendPage();

        if (this.client) {
            try {
                await this.client.destroy();
            } catch (e) { }
            this.client = null;
        }

        this.isReady = false;
        this.isInitializing = false;
        this.qrCodeData = null;
    }

    // Status al
    getStatus() {
        return {
            sessionId: this.sessionId,
            isReady: this.isReady,
            hasQR: !!this.qrCodeData,
            qrCode: this.qrCodeData,
            botNumber: this.isReady && this.client?.info?.wid?.user || null,
            botName: this.isReady && this.client?.info?.pushname || null,
            isSendingInvites: this.isSendingInvites,
            lastActivity: this.lastActivity
        };
    }

    // Grup oluştur
    async createGroup(groupName) {
        this.touch();
        if (!this.isReady) throw new Error('WhatsApp bağlantısı hazır değil');
        if (!groupName?.trim()) throw new Error('Grup adı belirtilmemiş!');

        this.log(`"${groupName}" grubu oluşturuluyor...`, 'info');

        this.config.inviteHistory = {};
        this.config.inviteStats = { date: '', count: 0 };
        this.config.group.inviteLink = '';

        const group = await withTimeout(
            this.client.createGroup(groupName, []),
            30000,
            'Grup oluşturma zaman aşımı'
        );

        if (!group?.gid) throw new Error('Grup oluşturulamadı');

        this.config.group.groupId = group.gid._serialized;
        this.config.group.name = groupName;
        this.saveConfig();

        this.log(`Grup oluşturuldu: ${this.config.group.groupId}`, 'success');

        this.log('Senkronizasyon bekleniyor (15s)...', 'info');
        await new Promise(r => setTimeout(r, 15000));

        return group;
    }

    // Davet linki al
    async getInviteLink() {
        this.touch();
        const groupId = this.config.group.groupId;
        if (!groupId?.includes('@g.us')) throw new Error('Geçersiz grup ID!');

        this.log('Davet linki alınıyor...', 'info');

        const chat = await withTimeout(
            this.client.getChatById(groupId),
            15000,
            'Grup bulunamadı'
        );

        if (!chat?.isGroup) throw new Error('Grup bulunamadı');

        const inviteCode = await withTimeout(chat.getInviteCode(), 10000, 'Davet kodu alınamadı');
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

        this.config.group.inviteLink = inviteLink;
        this.saveConfig();

        this.log(`Davet linki: ${inviteLink}`, 'success');
        return inviteLink;
    }

    // Store API ile mesaj gönder (tab açmadan)
    async sendMessageViaStore(number, message) {
        const page = this.client?.pupPage;
        if (!page) throw new Error('Sayfa bulunamadı');

        const chatId = `${number}@c.us`;

        const result = await page.evaluate(async (chatId, message) => {
            try {
                const Store = window.Store;
                if (!Store) {
                    return { success: false, error: 'Store bulunamadı' };
                }

                // WID oluştur
                let wid;
                if (Store.WidFactory && Store.WidFactory.createWid) {
                    wid = Store.WidFactory.createWid(chatId);
                } else if (Store.createWid) {
                    wid = Store.createWid(chatId);
                } else {
                    // Manuel WID oluştur
                    const [user, server] = chatId.split('@');
                    wid = { user, server, _serialized: chatId };
                }

                // Chat'i bul
                let chat = Store.Chat.get(chatId);

                if (!chat) {
                    // Chat.find ile bul/oluştur
                    if (Store.Chat.find) {
                        chat = await Store.Chat.find(wid);
                    } else if (Store.Chat.findImpl) {
                        chat = await Store.Chat.findImpl(wid);
                    }
                }

                if (!chat) {
                    return { success: false, error: 'Chat bulunamadı' };
                }

                // Mesaj gönderme yöntemlerini dene
                // Yöntem 1: WWebJS'in kullandığı yöntem
                if (Store.SendMessage) {
                    const msgResult = await Store.SendMessage.sendTextMsgToChat(chat, message);
                    return { success: true, method: 'SendMessage' };
                }

                // Yöntem 2: Chat.sendMessage (eğer varsa)
                if (typeof chat.sendMessage === 'function') {
                    await chat.sendMessage(message);
                    return { success: true, method: 'chat.sendMessage' };
                }

                // Yöntem 3: ComposeBox API
                if (Store.ComposeBox && Store.ComposeBox.send) {
                    await Store.ComposeBox.send(chat, message);
                    return { success: true, method: 'ComposeBox' };
                }

                // Yöntem 4: createMsgProtobuf
                if (Store.MsgModel && Store.Msg) {
                    const msg = new Store.MsgModel({
                        id: Store.MsgKey.newId(),
                        type: 'chat',
                        body: message,
                        to: wid,
                        from: Store.Conn.wid,
                        self: 'out',
                        t: Math.floor(Date.now() / 1000)
                    });
                    await Store.Msg.send(msg);
                    return { success: true, method: 'MsgModel' };
                }

                return { success: false, error: 'Mesaj gönderme yöntemi bulunamadı' };

            } catch (err) {
                return { success: false, error: err.message || String(err) };
            }
        }, chatId, message);

        if (!result.success) {
            // Store API başarısız olursa URL yöntemine geç
            this.log(`Store API hatası: ${result.error}, URL yöntemi deneniyor...`, 'warning');
            return await this.sendMessageViaURL(number, message);
        }

        this.log(`✅ Store API ile gönderildi (${result.method})`, 'success');
        return result;
    }

    // Ana sayfada kalarak mesaj gönder (yeni tab açmaz)
    async sendMessageViaURL(number, message) {
        const page = this.client?.pupPage;
        if (!page) throw new Error('Sayfa bulunamadı');

        try {
            // Ana sayfada olduğumuzdan emin ol
            const currentUrl = page.url();
            if (!currentUrl.includes('web.whatsapp.com')) {
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle0', timeout: 30000 });
                await new Promise(r => setTimeout(r, 3000));
            }

            // Yeni sohbet butonuna tıkla
            const newChatSelectors = [
                'div[data-testid="chat-list-header-menu"]',
                'span[data-testid="menu"]',
                'div[title="Yeni sohbet"]',
                'span[data-icon="new-chat-outline"]',
                'div[aria-label="Yeni sohbet"]'
            ];

            let clicked = false;
            for (const sel of newChatSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 3000 });
                    await page.click(sel);
                    clicked = true;
                    await new Promise(r => setTimeout(r, 1000));
                    break;
                } catch (e) { }
            }

            // Arama kutusunu bul ve numarayı yaz
            const searchSelectors = [
                'div[data-testid="chat-list-search"]',
                'div[contenteditable="true"][data-tab="3"]',
                'div[title="Ara veya yeni sohbet başlat"]',
                'div[role="textbox"]'
            ];

            let searchBox = null;
            for (const sel of searchSelectors) {
                try {
                    searchBox = await page.waitForSelector(sel, { timeout: 5000 });
                    if (searchBox) break;
                } catch (e) { }
            }

            if (!searchBox) {
                // Alternatif: Direkt URL ile git ama aynı sayfada
                const encodedMessage = encodeURIComponent(message);
                const waUrl = `https://web.whatsapp.com/send?phone=${number}&text=${encodedMessage}`;
                
                await page.goto(waUrl, { waitUntil: 'networkidle0', timeout: 60000 });
                await new Promise(r => setTimeout(r, 5000));

                // Enter'a bas
                await page.keyboard.press('Enter');
                await new Promise(r => setTimeout(r, 3000));

                // Ana sayfaya dön
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle0', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                return { success: true };
            }

            // Numarayı yaz
            await searchBox.click();
            await page.keyboard.type(number, { delay: 50 });
            await new Promise(r => setTimeout(r, 2000));

            // Sonuçlardan ilkine tıkla veya yeni sohbet başlat
            const resultSelectors = [
                'div[data-testid="cell-frame-container"]',
                'span[data-testid="chat-msg-text"]',
                'div._ak8l',
                'div[role="listitem"]'
            ];

            for (const sel of resultSelectors) {
                try {
                    const result = await page.waitForSelector(sel, { timeout: 5000 });
                    if (result) {
                        await result.click();
                        break;
                    }
                } catch (e) { }
            }

            await new Promise(r => setTimeout(r, 2000));

            // Mesaj kutusunu bul
            const msgBoxSelectors = [
                'div[data-testid="conversation-compose-box-input"]',
                'div[contenteditable="true"][data-tab="10"]',
                'footer div[contenteditable="true"]',
                'div[role="textbox"][spellcheck="true"]'
            ];

            let msgBox = null;
            for (const sel of msgBoxSelectors) {
                try {
                    msgBox = await page.waitForSelector(sel, { timeout: 5000 });
                    if (msgBox) break;
                } catch (e) { }
            }

            if (!msgBox) {
                throw new Error('Mesaj kutusu bulunamadı');
            }

            // Mesajı yaz ve gönder
            await msgBox.click();
            await new Promise(r => setTimeout(r, 500));

            // Mesajı parça parça yaz (uzun mesajlar için)
            for (const line of message.split('\n')) {
                await page.keyboard.type(line, { delay: 10 });
                await page.keyboard.down('Shift');
                await page.keyboard.press('Enter');
                await page.keyboard.up('Shift');
            }

            await new Promise(r => setTimeout(r, 500));
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 2000));

            // ESC'ye bas - sohbetten çık
            await page.keyboard.press('Escape');
            await new Promise(r => setTimeout(r, 500));

            return { success: true };

        } catch (error) {
            // Hata durumunda ana sayfaya dönmeyi dene
            try {
                await page.goto('https://web.whatsapp.com', { waitUntil: 'networkidle0', timeout: 20000 });
            } catch (e) { }
            throw error;
        }
    }

    // Artık gerekli değil ama uyumluluk için bırak
    async closeSendPage() {
        // Artık ayrı sayfa kullanmıyoruz
    }

    // Davet gönder
    async sendInvites() {
        this.touch();
        if (!this.config.group.groupId) throw new Error('Grup henüz oluşturulmamış!');
        if (!this.isReady || !this.client) throw new Error('WhatsApp bağlantısı hazır değil!');
        if (this.isSendingInvites) throw new Error('Davet gönderimi zaten devam ediyor!');

        this.isSendingInvites = true;
        this.emitToSession('invite-status', { active: true });

        try {
            let inviteLink = this.config.group.inviteLink;
            if (!inviteLink?.includes('chat.whatsapp.com/')) {
                inviteLink = await this.getInviteLink();
            }

            const templates = [
                `Merhaba,\n\n${this.config.group.name} grubuna katılımınız beklenmektedir.\n\nKatılım linki:\n${inviteLink}`,
                `Sayın ilgili,\n\n${this.config.group.name} grubuna davetlisiniz.\n\n${inviteLink}`,
                `${this.config.group.name} grubuna katılım linkiniz:\n\n${inviteLink}`,
                `Merhaba,\n\n${this.config.group.name} için grup oluşturulmuştur:\n\n${inviteLink}`
            ];

            const { safetySettings } = this.config;
            const numbers = [...this.config.inviteNumbers];
            const total = numbers.length;

            let sentCount = 0;
            let skipCount = 0;

            this.log(`📋 Davet başlıyor: ${total} numara`, 'info');

            for (let i = 0; i < total; i++) {
                const number = numbers[i];

                if (!this.isReady || !this.client || !this.isSendingInvites) {
                    this.log(`⛔ İşlem durduruldu`, 'warning');
                    break;
                }

                if (!number || number.length < 10) {
                    skipCount++;
                    continue;
                }

                const today = new Date().toISOString().split('T')[0];
                if (this.config.inviteStats.date !== today) {
                    this.config.inviteStats = { date: today, count: 0 };
                }
                if (this.config.inviteStats.count >= safetySettings.dailyLimit) {
                    this.log(`⚠️ Günlük limit doldu (${safetySettings.dailyLimit})`, 'warning');
                    break;
                }

                this.log(`📤 [${i + 1}/${total}] Gönderiliyor: ${number}`, 'info');

                try {
                    const message = safetySettings.messageVariations
                        ? templates[Math.floor(Math.random() * templates.length)]
                        : templates[0];

                    // URL yöntemi ile gönder (stabil)
                    await withTimeout(
                        this.sendMessageViaURL(number, message),
                        90000,
                        'Mesaj gönderme zaman aşımı'
                    );

                    this.config.inviteHistory[number] = {
                        lastInvite: new Date().toISOString(),
                        count: (this.config.inviteHistory[number]?.count || 0) + 1
                    };
                    this.config.inviteStats.count++;
                    sentCount++;

                    this.log(`✅ [${sentCount}] Gönderildi: ${number}`, 'success');

                    this.emitToSession('invite-progress', {
                        current: i + 1,
                        total,
                        sent: sentCount,
                        skipped: skipCount,
                        number
                    });

                } catch (error) {
                    const errMsg = error.message || String(error);

                    if (errMsg.includes('Execution context') ||
                        errMsg.includes('Protocol error') ||
                        errMsg.includes('Session closed') ||
                        errMsg.includes('Target closed') ||
                        errMsg.includes('Browser')) {
                        this.log(`❌ Kritik hata: ${errMsg}`, 'error');
                        this.isReady = false;
                        break;
                    }

                    this.log(`❌ Hata (${number}): ${errMsg}`, 'error');
                    skipCount++;
                }

                const delay = Math.floor(Math.random() * (safetySettings.maxDelay - safetySettings.minDelay + 1)) + safetySettings.minDelay;
                this.log(`⏳ ${Math.round(delay / 1000)}s bekleniyor...`, 'info');
                await new Promise(r => setTimeout(r, delay));

                if (sentCount > 0 && sentCount % 5 === 0) {
                    this.saveConfig();
                }
            }

            this.saveConfig();
            this.log(`📊 Tamamlandı! Başarılı: ${sentCount}, Atlanan: ${skipCount}`, 'success');

            return sentCount;

        } finally {
            this.isSendingInvites = false;
            this.emitToSession('invite-status', { active: false });
            // Reusable tab'ı kapat
            await this.closeSendPage();
        }
    }

    // Davet iptal
    cancelInvites() {
        if (this.isSendingInvites) {
            this.isSendingInvites = false;
            this.log('Davet gönderimi iptal edildi', 'warning');
        }
    }

    // Grubu temizle
    async cleanupGroup() {
        this.touch();
        if (!this.config.group.groupId) throw new Error('Grup henüz oluşturulmamış!');

        const chat = await withTimeout(
            this.client.getChatById(this.config.group.groupId),
            15000,
            'Grup bulunamadı'
        );

        if (!chat.isGroup) throw new Error('Bu bir grup değil!');

        const participants = chat.participants || [];
        const botNumber = this.client.info.wid._serialized;
        let removedCount = 0;

        for (const participant of participants) {
            const participantId = participant.id?._serialized || participant._serialized;
            if (participantId === botNumber) continue;

            try {
                await chat.removeParticipants([participantId]);
                this.log(`Kullanıcı çıkarıldı: ${participantId}`, 'success');
                removedCount++;
                await new Promise(r => setTimeout(r, 1500));
            } catch (error) {
                this.log(`Çıkarma hatası: ${error.message}`, 'error');
            }
        }

        this.log(`Grup temizlendi! ${removedCount} kullanıcı çıkarıldı.`, 'success');
        return removedCount;
    }

    // Grupları listele
    async getGroups() {
        this.touch();
        if (!this.isReady) throw new Error('WhatsApp bağlantısı hazır değil');

        const chats = await this.client.getChats();
        return chats.filter(c => c.isGroup).map(g => ({
            id: g.id._serialized,
            name: g.name,
            participants: g.participants?.length || 0
        }));
    }

    // Mesaj gönder
    async sendMessage(to, message) {
        this.touch();
        if (!this.isReady) throw new Error('WhatsApp bağlantısı hazır değil');

        const chatId = to.includes('@') ? to : `${to}@c.us`;
        await this.client.sendMessage(chatId, message);
        this.log(`Mesaj gönderildi: ${to}`, 'success');
    }
}

// ============== SESSION MANAGER ==============

const SessionManager = {
    _cleanupInterval: null,

    // Session al veya oluştur
    getOrCreate(sessionId, io) {
        // Session zaten varsa döndür
        if (sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            session.touch();
            return session;
        }

        // Maksimum session kontrolü
        if (sessions.size >= CONFIG.MAX_SESSIONS) {
            // En eski inaktif session'ı bul ve sil
            let oldestSession = null;
            let oldestTime = Date.now();

            for (const [id, session] of sessions) {
                if (session.lastActivity < oldestTime && !session.isSendingInvites) {
                    oldestSession = id;
                    oldestTime = session.lastActivity;
                }
            }

            if (oldestSession) {
                console.log(`[SessionManager] Maksimum session limiti - eski session siliniyor: ${oldestSession.substring(0, 8)}`);
                this.remove(oldestSession);
            } else {
                throw new Error(`Maksimum session limiti (${CONFIG.MAX_SESSIONS}) aşıldı. Lütfen daha sonra tekrar deneyin.`);
            }
        }

        // Yeni session oluştur
        const session = new WhatsAppSession(sessionId, io);
        sessions.set(sessionId, session);
        session.initialize();

        console.log(`[SessionManager] Yeni session: ${sessionId.substring(0, 8)} (Toplam: ${sessions.size})`);
        return session;
    },

    get(sessionId) {
        const session = sessions.get(sessionId);
        if (session) session.touch();
        return session;
    },

    has(sessionId) {
        return sessions.has(sessionId);
    },

    async remove(sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
            console.log(`[SessionManager] Session siliniyor: ${sessionId.substring(0, 8)}`);
            await session.destroy();
            sessions.delete(sessionId);
        }
    },

    getAll() {
        return Array.from(sessions.entries());
    },

    getStats() {
        return {
            total: sessions.size,
            max: CONFIG.MAX_SESSIONS,
            active: Array.from(sessions.values()).filter(s => s.isReady).length,
            sending: Array.from(sessions.values()).filter(s => s.isSendingInvites).length
        };
    },

    // Inaktif session temizliği
    startCleanup() {
        if (this._cleanupInterval) return;

        this._cleanupInterval = setInterval(() => {
            const now = Date.now();

            for (const [id, session] of sessions) {
                const inactiveTime = now - session.lastActivity;

                // 30 dakika inaktif ve davet göndermiyor
                if (inactiveTime > CONFIG.SESSION_TIMEOUT && !session.isSendingInvites) {
                    console.log(`[SessionManager] Inaktif session temizleniyor: ${id.substring(0, 8)} (${Math.round(inactiveTime / 60000)} dk)`);
                    this.remove(id);
                }
            }
        }, CONFIG.CLEANUP_INTERVAL);

        console.log('[SessionManager] Otomatik temizlik başlatıldı');
    },

    stopCleanup() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    },

    // Tüm session'ları kapat
    async destroyAll() {
        console.log('[SessionManager] Tüm session\'lar kapatılıyor...');
        const promises = [];
        for (const [id, session] of sessions) {
            promises.push(session.destroy().catch(e => console.error(`Session ${id} destroy error:`, e)));
        }
        await Promise.all(promises);
        sessions.clear();
        console.log('[SessionManager] Tüm session\'lar kapatıldı');
    }
};

// Cleanup'ı başlat
SessionManager.startCleanup();

module.exports = { SessionManager, WhatsAppSession, CONFIG };
