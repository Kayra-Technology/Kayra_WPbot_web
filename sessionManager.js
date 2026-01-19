const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Aktif sessionlar
const sessions = new Map();

// Session dizini
const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Session sınıfı
class WhatsAppSession {
    constructor(sessionId, io) {
        this.sessionId = sessionId;
        this.io = io;
        this.client = null;
        this.qrCodeData = null;
        this.isReady = false;
        this.config = this.loadConfig();
        this.logs = [];
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
                minDelay: 3000,
                maxDelay: 8000,
                dailyLimit: 50,
                messageVariations: true
            },
            schedule: {
                inviteDay: 1,
                inviteHour: 9,
                inviteMinute: 0,
                cleanupDay: 0,
                cleanupHour: 18,
                cleanupMinute: 0
            }
        };

        try {
            if (fs.existsSync(configPath)) {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            }
        } catch (e) {
            console.error(`Config load error for ${this.sessionId}:`, e);
        }

        // Dizini oluştur ve default config kaydet
        const sessionDir = path.join(SESSIONS_DIR, this.sessionId);
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }

    // Config kaydet
    saveConfig() {
        const configPath = path.join(SESSIONS_DIR, this.sessionId, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
        this.emitToSession('config-updated', this.config);
    }

    // Türkiye saati
    getTurkeyTime() {
        const now = new Date();
        const turkeyOffset = 3 * 60;
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        return new Date(utc + (turkeyOffset * 60000));
    }

    // Log ekle
    log(message, type = 'info') {
        const turkeyTime = this.getTurkeyTime();
        const timestamp = turkeyTime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const logEntry = { timestamp, message, type };

        this.logs.push(logEntry);
        if (this.logs.length > 100) this.logs.shift();

        console.log(`[${this.sessionId}][${timestamp}] ${message}`);
        this.emitToSession('log', logEntry);
    }

    // Session'a emit
    emitToSession(event, data) {
        this.io.to(this.sessionId).emit(event, data);
    }

    // WhatsApp client başlat
    initialize() {
        if (this.client) {
            this.log('Client zaten başlatılmış', 'warning');
            return;
        }

        this.log('WhatsApp Client yapılandırması hazırlanıyor...', 'info');

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
                    '--disable-gpu'
                ],
                timeout: 60000
            },
            qrMaxRetries: 5,
            restartOnAuthFail: true,
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        this.log('Event listener\'lar ekleniyor...', 'info');

        // QR kodu
        this.client.on('qr', (qr) => {
            this.log('QR Kodu alındı, oluşturuluyor...', 'info');

            qrcode.toDataURL(qr, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                width: 400,
                margin: 1
            })
                .then((dataUrl) => {
                    this.qrCodeData = dataUrl;
                    this.log('QR Kodu başarıyla oluşturuldu', 'success');
                    this.emitToSession('qr', this.qrCodeData);
                })
                .catch((err) => {
                    this.log(`QR Kodu oluşturma hatası: ${err.message}`, 'error');
                });
        });

        // Bağlantı hazır
        this.client.on('ready', async () => {
            this.log('WhatsApp bağlantısı kuruldu!', 'success');
            this.isReady = true;
            this.qrCodeData = null;
            this.emitToSession('ready', {
                number: this.client.info.wid.user,
                name: this.client.info.pushname
            });
        });

        // Kimlik doğrulama
        this.client.on('authenticated', () => {
            this.log('Kimlik doğrulama başarılı!', 'success');
            this.emitToSession('authenticated');
        });

        this.client.on('auth_failure', (msg) => {
            this.log(`Kimlik doğrulama hatası: ${msg}`, 'error');
            this.emitToSession('auth_failure', msg);
        });

        this.client.on('disconnected', (reason) => {
            this.log(`Bağlantı kesildi: ${reason}`, 'error');
            this.isReady = false;
            this.emitToSession('disconnected', reason);
        });

        this.client.on('loading_screen', (percent, message) => {
            this.log(`Yükleniyor: ${percent}% - ${message}`, 'info');
        });

        this.client.on('message', async (msg) => {
            try {
                const chat = await msg.getChat();
                const contact = await msg.getContact();
                const senderName = contact.pushname || contact.number || msg.from;

                this.emitToSession('message', {
                    from: msg.from,
                    body: msg.body,
                    isGroup: chat.isGroup,
                    groupName: chat.isGroup ? chat.name : null,
                    senderName,
                    timestamp: msg.timestamp
                });
            } catch (error) {
                this.log(`Mesaj işleme hatası: ${error.message}`, 'error');
            }
        });

        this.client.initialize().catch(err => {
            this.log(`WhatsApp Client başlatma hatası: ${err.message}`, 'error');
        });
        this.log('WhatsApp Client başlatılıyor...', 'info');
    }

    // Client'ı yeniden başlat
    async restart() {
        this.log('WhatsApp Client yeniden başlatılıyor...', 'info');

        if (this.client) {
            try {
                await this.client.destroy();
            } catch (e) {
                this.log(`Client destroy hatası: ${e.message}`, 'warning');
            }
            this.client = null;
        }

        this.isReady = false;
        this.qrCodeData = null;

        await new Promise(resolve => setTimeout(resolve, 2000));
        this.initialize();
    }

    // Client'ı kapat
    async destroy() {
        if (this.client) {
            try {
                await this.client.destroy();
            } catch (e) {
                console.error(`Session ${this.sessionId} destroy error:`, e);
            }
            this.client = null;
        }
        this.isReady = false;
        this.qrCodeData = null;
    }

    // Status al
    getStatus() {
        return {
            sessionId: this.sessionId,
            isReady: this.isReady,
            hasQR: !!this.qrCodeData,
            qrCode: this.qrCodeData,
            botNumber: this.isReady && this.client ? this.client.info.wid.user : null,
            botName: this.isReady && this.client ? this.client.info.pushname : null
        };
    }

    // Grup oluştur
    async createGroup(groupName) {
        if (!this.isReady) {
            throw new Error('WhatsApp bağlantısı hazır değil');
        }

        if (!groupName || groupName.trim().length === 0) {
            throw new Error('Grup adı belirtilmemiş!');
        }

        this.log(`"${groupName}" grubu oluşturuluyor...`, 'info');

        this.config.inviteHistory = {};
        this.config.inviteStats = { date: '', count: 0 };
        this.config.group.inviteLink = '';

        const group = await this.client.createGroup(groupName, []);

        if (!group || !group.gid) {
            throw new Error('Grup oluşturuldu ancak ID alınamadı');
        }

        this.config.group.groupId = group.gid._serialized;
        this.config.group.name = groupName;
        this.saveConfig();

        this.log(`Grup oluşturuldu! ID: ${this.config.group.groupId}`, 'success');

        // Senkronizasyon bekle
        this.log('WhatsApp senkronizasyonu bekleniyor...', 'info');
        await new Promise(resolve => setTimeout(resolve, 20000));

        return group;
    }

    // Davet linki al
    async getInviteLink() {
        const groupId = this.config.group.groupId;

        if (!groupId || !groupId.includes('@g.us')) {
            throw new Error('Geçersiz grup ID! Önce grup oluşturun.');
        }

        this.log(`Davet linki alınıyor...`, 'info');

        const chat = await this.client.getChatById(groupId);
        if (!chat || !chat.isGroup) {
            throw new Error('Grup bulunamadı');
        }

        const inviteCode = await chat.getInviteCode();
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

        this.config.group.inviteLink = inviteLink;
        this.saveConfig();

        this.log(`Davet linki alındı: ${inviteLink}`, 'success');
        return inviteLink;
    }

    // Davet gönder
    async sendInvites() {
        if (!this.config.group.groupId) {
            throw new Error('Grup henüz oluşturulmamış!');
        }

        let inviteLink = this.config.group.inviteLink;
        if (!inviteLink || !inviteLink.includes('chat.whatsapp.com/')) {
            inviteLink = await this.getInviteLink();
        }

        const messageTemplates = [
            `Merhaba,\n\n${this.config.group.name} grubuna katılımınız beklenmektedir.\n\nKatılım linki:\n${inviteLink}`,
            `Sayın ilgili,\n\n${this.config.group.name} grubuna davetlisiniz.\n\n${inviteLink}`,
            `${this.config.group.name} grubuna katılım linkiniz:\n\n${inviteLink}`,
            `Merhaba,\n\n${this.config.group.name} için grup oluşturulmuştur:\n\n${inviteLink}`
        ];

        const safetySettings = this.config.safetySettings;
        let sentCount = 0;

        // Mesaj gönderme yardımcı fonksiyonu (retry ile)
        const sendMessageWithRetry = async (chatId, message, maxRetries = 3) => {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    // Önce sohbeti kontrol et
                    let chat;
                    try {
                        chat = await this.client.getChatById(chatId);
                    } catch (chatError) {
                        // Yeni sohbet başlatmayı dene
                        this.log(`Sohbet bulunamadı, yeni mesaj gönderiliyor: ${chatId}`, 'info');
                    }

                    // Mesajı gönder
                    await this.client.sendMessage(chatId, message);
                    return true;
                } catch (error) {
                    const errorMessage = error.message || String(error);

                    // markedUnread hatası - bilinen whatsapp-web.js sorunu
                    if (errorMessage.includes('markedUnread') || errorMessage.includes('Cannot read properties of undefined')) {
                        this.log(`markedUnread hatası, tekrar deneniyor (${attempt}/${maxRetries})...`, 'warning');

                        // Kısa bekleme
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        if (attempt === maxRetries) {
                            // Son denemede farklı yöntem dene
                            try {
                                const contact = await this.client.getContactById(chatId);
                                if (contact) {
                                    await this.client.sendMessage(chatId, message);
                                    return true;
                                }
                            } catch (e) {
                                throw new Error(`Mesaj gönderilemedi: ${errorMessage}`);
                            }
                        }
                        continue;
                    }

                    // Diğer hatalar
                    if (attempt === maxRetries) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            }
            return false;
        };

        for (const number of this.config.inviteNumbers) {
            // Numara format kontrolü
            if (!number || number.length < 10) {
                this.log(`Geçersiz numara atlandı: ${number}`, 'warning');
                continue;
            }

            // Günlük limit kontrolü
            const today = new Date().toISOString().split('T')[0];
            if (this.config.inviteStats.date !== today) {
                this.config.inviteStats = { date: today, count: 0 };
            }
            if (this.config.inviteStats.count >= safetySettings.dailyLimit) {
                this.log('Günlük davet limiti doldu!', 'warning');
                break;
            }

            try {
                const chatId = `${number}@c.us`;
                const message = safetySettings.messageVariations
                    ? messageTemplates[Math.floor(Math.random() * messageTemplates.length)]
                    : messageTemplates[0];

                const success = await sendMessageWithRetry(chatId, message);

                if (success) {
                    // Kayıt
                    this.config.inviteHistory[number] = {
                        lastInvite: new Date().toISOString(),
                        count: (this.config.inviteHistory[number]?.count || 0) + 1
                    };
                    this.config.inviteStats.count++;
                    sentCount++;

                    this.log(`✓ Davet gönderildi (${sentCount}/${this.config.inviteNumbers.length}): ${number}`, 'success');
                }

                // Gecikme
                const delay = Math.floor(Math.random() * (safetySettings.maxDelay - safetySettings.minDelay + 1)) + safetySettings.minDelay;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                this.log(`✗ Davet hatası (${number}): ${error.message}`, 'error');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        this.saveConfig();
        this.log(`Davet gönderimi tamamlandı! ${sentCount} kişiye gönderildi.`, 'success');
        return sentCount;
    }

    // Grubu temizle
    async cleanupGroup() {
        if (!this.config.group.groupId) {
            throw new Error('Grup henüz oluşturulmamış!');
        }

        const chat = await this.client.getChatById(this.config.group.groupId);
        if (!chat.isGroup) {
            throw new Error('Bu bir grup değil!');
        }

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
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (error) {
                this.log(`Çıkarma hatası (${participantId}): ${error.message}`, 'error');
            }
        }

        this.log(`Grup temizlendi! ${removedCount} kullanıcı çıkarıldı.`, 'success');
        return removedCount;
    }

    // Grupları listele
    async getGroups() {
        if (!this.isReady) {
            throw new Error('WhatsApp bağlantısı hazır değil');
        }

        const chats = await this.client.getChats();
        return chats.filter(c => c.isGroup).map(g => ({
            id: g.id._serialized,
            name: g.name,
            participants: g.participants ? g.participants.length : 0
        }));
    }

    // Mesaj gönder
    async sendMessage(to, message) {
        if (!this.isReady) {
            throw new Error('WhatsApp bağlantısı hazır değil');
        }

        const chatId = to.includes('@') ? to : `${to}@c.us`;
        await this.client.sendMessage(chatId, message);
        this.log(`Mesaj gönderildi: ${to}`, 'success');
    }
}

// Session yöneticisi
const SessionManager = {
    // Session al veya oluştur
    getOrCreate(sessionId, io) {
        if (!sessions.has(sessionId)) {
            const session = new WhatsAppSession(sessionId, io);
            sessions.set(sessionId, session);
            session.initialize();
        }
        return sessions.get(sessionId);
    },

    // Session al
    get(sessionId) {
        return sessions.get(sessionId);
    },

    // Session var mı?
    has(sessionId) {
        return sessions.has(sessionId);
    },

    // Session sil
    async remove(sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
            await session.destroy();
            sessions.delete(sessionId);
        }
    },

    // Tüm sessionları al
    getAll() {
        return Array.from(sessions.entries());
    }
};

module.exports = { SessionManager, WhatsAppSession };
