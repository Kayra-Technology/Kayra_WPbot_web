const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const schedule = require('node-schedule');

// Express uygulaması
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Config dosyası
const configPath = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Config kaydet
function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    io.emit('config-updated', config);
}

// Log yönetimi
const logs = [];
function log(message, type = 'info') {
    const turkeyTime = getTurkeyTime();
    const timestamp = turkeyTime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const logEntry = {
        timestamp,
        message,
        type
    };
    logs.push(logEntry);
    if (logs.length > 100) logs.shift(); // Son 100 log
    console.log(`[${timestamp}] ${message}`);
    io.emit('log', logEntry);
}

// Türkiye saati
function getTurkeyTime() {
    const now = new Date();
    const turkeyOffset = 3 * 60;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (turkeyOffset * 60000));
}

// WhatsApp Client
let client = null;
let qrCodeData = null;
let isClientReady = false;
let scheduledJobs = [];

function initializeWhatsAppClient() {
    if (client) {
        log('Client zaten başlatılmış', 'warning');
        return;
    }

    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: 60000  // 60 saniye timeout
        },
        qrMaxRetries: 5,
        restartOnAuthFail: true,
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
    });

    // QR kodu
    client.on('qr', async (qr) => {
        log('QR Kodu oluşturuldu', 'info');
        qrCodeData = await qrcode.toDataURL(qr);
        io.emit('qr', qrCodeData);
    });

    // Bağlantı hazır
    client.on('ready', async () => {
        log('WhatsApp bağlantısı kuruldu!', 'success');
        isClientReady = true;
        qrCodeData = null;
        io.emit('ready', {
            number: client.info.wid.user,
            name: client.info.pushname
        });
        setupScheduledTasks();
    });

    // Kimlik doğrulama
    client.on('authenticated', () => {
        log('Kimlik doğrulama başarılı!', 'success');
        io.emit('authenticated');
    });

    client.on('auth_failure', (msg) => {
        log(`Kimlik doğrulama hatası: ${msg}`, 'error');
        io.emit('auth_failure', msg);
    });

    client.on('disconnected', (reason) => {
        log(`Bağlantı kesildi: ${reason}`, 'error');
        isClientReady = false;
        io.emit('disconnected', reason);
    });

    // Mesajları dinle
    client.on('message', async (msg) => {
        try {
            const chat = await msg.getChat();
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.number || msg.from;

            io.emit('message', {
                from: msg.from,
                body: msg.body,
                isGroup: chat.isGroup,
                groupName: chat.isGroup ? chat.name : null,
                senderName,
                timestamp: msg.timestamp
            });
        } catch (error) {
            log(`Mesaj işleme hatası: ${error.message}`, 'error');
        }
    });

    client.initialize();
    log('WhatsApp Client başlatılıyor...', 'info');
}

// Zamanlanmış görevleri ayarla
function setupScheduledTasks() {
    // Önce mevcut görevleri temizle
    scheduledJobs.forEach(job => job.cancel());
    scheduledJobs = [];

    const { schedule: scheduleConfig } = config;

    // Davet görevi
    const inviteRule = new schedule.RecurrenceRule();
    inviteRule.tz = 'Europe/Istanbul';
    inviteRule.dayOfWeek = scheduleConfig.inviteDay;
    inviteRule.hour = scheduleConfig.inviteHour;
    inviteRule.minute = scheduleConfig.inviteMinute;

    const inviteJob = schedule.scheduleJob(inviteRule, () => {
        log('Zamanlanmış görev: Davet linki gönderme', 'info');
        sendInviteToNumbers();
    });
    scheduledJobs.push(inviteJob);

    // Temizlik görevi
    const cleanupRule = new schedule.RecurrenceRule();
    cleanupRule.tz = 'Europe/Istanbul';
    cleanupRule.dayOfWeek = scheduleConfig.cleanupDay;
    cleanupRule.hour = scheduleConfig.cleanupHour;
    cleanupRule.minute = scheduleConfig.cleanupMinute;

    const cleanupJob = schedule.scheduleJob(cleanupRule, () => {
        log('Zamanlanmış görev: Grup temizleme', 'info');
        cleanupGroup();
    });
    scheduledJobs.push(cleanupJob);

    log(`Zamanlanmış görevler ayarlandı`, 'success');
}

// Grup oluştur
async function createIdaGroup() {
    try {
        if (!isClientReady) {
            throw new Error('WhatsApp bağlantısı hazır değil');
        }

        // Grup adı kontrolü
        const groupName = config.group.name || 'IDA Grubu';
        if (!groupName || groupName.trim().length === 0) {
            throw new Error('Grup adı belirtilmemiş! Lütfen config\'den grup adı girin.');
        }

        log(`🔄 "${groupName}" grubu oluşturuluyor...`, 'info');

        // Sadece eski grup verilerini temizle (numaralar değil!)
        config.inviteHistory = {};
        config.inviteStats = { date: '', count: 0 };
        config.group.inviteLink = '';

        // Grup oluştur
        const group = await client.createGroup(groupName, []);

        if (!group || !group.gid) {
            throw new Error('Grup oluşturuldu ancak ID alınamadı');
        }

        config.group.groupId = group.gid._serialized;
        config.group.name = groupName;

        saveConfig();
        log(`✅ Grup oluşturuldu! ID: ${config.group.groupId}`, 'success');

        // WhatsApp sunucularının grubu senkronize etmesi için bekle
        log('⏳ WhatsApp sunucularının grubu senkronize etmesi bekleniyor (20 saniye)...', 'info');
        await new Promise(resolve => setTimeout(resolve, 20000));

        // Grubun erişilebilir olduğunu doğrula
        log('🔍 Grubun erişilebilirliği kontrol ediliyor...', 'info');
        let verificationAttempts = 3;
        let groupVerified = false;

        while (verificationAttempts > 0 && !groupVerified) {
            try {
                const chat = await client.getChatById(config.group.groupId);
                if (chat && chat.isGroup) {
                    groupVerified = true;
                    log('✅ Grup doğrulandı ve erişilebilir!', 'success');
                }
            } catch (verifyError) {
                verificationAttempts--;
                if (verificationAttempts > 0) {
                    log(`⚠️ Grup henüz hazır değil, tekrar deneniyor (${verificationAttempts} deneme kaldı)...`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }

        if (!groupVerified) {
            log('⚠️ Grup oluşturuldu ancak doğrulanamadı. Birkaç dakika bekleyip tekrar deneyin.', 'warning');
        }

        return group;
    } catch (error) {
        log(`❌ Grup oluşturma hatası: ${error.message}`, 'error');
        log(`📋 Hata detayı: ${error.stack || 'Stack yok'}`, 'error');
        throw error;
    }
}

// Grup davet linki al
async function getGroupInviteLink(groupId) {
    // GroupId kontrolü
    if (!groupId || !groupId.includes('@g.us')) {
        log('❌ Geçersiz grup ID formatı! Lütfen önce grup oluşturun.', 'error');
        return null;
    }

    log(`🔗 Davet linki alınıyor... GroupId: ${groupId}`, 'info');

    let retries = 5;
    let chat = null;

    // İlk olarak grup chat'ini al
    while (retries > 0 && !chat) {
        try {
            log(`📍 Grup bulunuyor... (Deneme: ${6 - retries}/5)`, 'info');
            chat = await client.getChatById(groupId);

            if (!chat) {
                throw new Error('Chat bulunamadı');
            }

            if (!chat.isGroup) {
                log('❌ Bu bir grup değil!', 'error');
                return null;
            }

            log(`✅ Grup bulundu: ${chat.name || 'İsimsiz'}`, 'success');

        } catch (chatError) {
            retries--;
            const errorMsg = chatError.message || JSON.stringify(chatError) || 'Bilinmeyen hata';
            log(`⚠️ Grup bulunamadı (${retries} deneme kaldı): ${errorMsg}`, 'warning');

            if (chatError.stack) {
                log(`📋 Hata stack: ${chatError.stack.split('\n').slice(0, 3).join(' | ')}`, 'warning');
            }

            if (retries > 0) {
                const waitTime = 5000;
                log(`⏳ ${waitTime / 1000} saniye bekleniyor...`, 'info');
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                log('❌ Grup bulunamadı! GroupId geçersiz olabilir.', 'error');
                log('💡 Lütfen yeni bir grup oluşturun.', 'warning');
                return null;
            }
        }
    }

    // Davet linki al
    retries = 3;
    while (retries > 0) {
        try {
            log(`🔑 Davet kodu alınıyor... (Deneme: ${4 - retries}/3)`, 'info');

            // Önce mevcut kodu almayı dene
            let inviteCode = null;
            try {
                inviteCode = await Promise.race([
                    chat.getInviteCode(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Timeout (15s)')), 15000)
                    )
                ]);

                if (inviteCode && typeof inviteCode === 'string' && inviteCode.length > 5) {
                    const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                    log(`✅ Davet linki alındı: ${inviteLink}`, 'success');
                    return inviteLink;
                }
            } catch (getError) {
                log(`⚠️ Mevcut kod alınamadı: ${getError.message}`, 'warning');
            }

            // Mevcut kod alınamazsa yeni oluştur
            log('🔄 Yeni davet kodu oluşturuluyor...', 'info');
            await new Promise(resolve => setTimeout(resolve, 3000));

            inviteCode = await Promise.race([
                chat.revokeInvite(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout (15s)')), 15000)
                )
            ]);

            if (inviteCode && typeof inviteCode === 'string' && inviteCode.length > 5) {
                const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                log(`✅ Yeni davet linki oluşturuldu: ${inviteLink}`, 'success');
                return inviteLink;
            } else {
                throw new Error(`Davet kodu geçersiz: ${typeof inviteCode} - ${inviteCode}`);
            }

        } catch (error) {
            retries--;
            const errorMsg = error.message || JSON.stringify(error) || 'Bilinmeyen hata';
            log(`⚠️ Davet linki hatası (${retries} deneme kaldı): ${errorMsg}`, 'warning');

            if (retries > 0) {
                const waitTime = 5000;
                log(`⏳ ${waitTime / 1000} saniye bekleniyor...`, 'info');
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                log('❌ Davet linki alınamadı! Tüm denemeler tükendi.', 'error');
                log('💡 Grubun admin ayarlarını kontrol edin veya yeni grup oluşturun.', 'warning');
            }
        }
    }
    return null;
}

// Güvenli rastgele bekleme süresi (anti-ban)
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Günlük limit kontrolü
function checkDailyLimit() {
    const today = new Date().toISOString().split('T')[0];
    if (!config.inviteStats) {
        config.inviteStats = { date: today, count: 0 };
    }
    if (config.inviteStats.date !== today) {
        config.inviteStats = { date: today, count: 0 };
    }
    return config.inviteStats.count < (config.safetySettings?.dailyLimit || 50);
}

// Davet kaydı ekle
function recordInvite(number) {
    if (!config.inviteHistory) {
        config.inviteHistory = {};
    }
    config.inviteHistory[number] = {
        lastInvite: new Date().toISOString(),
        count: (config.inviteHistory[number]?.count || 0) + 1
    };
    config.inviteStats.count++;
    saveConfig();
}

// Davet linki gönder (güvenli mod)
async function sendInviteToNumbers() {
    log('Davet linki gönderme işlemi başlatılıyor...', 'info');

    if (!config.group.groupId) {
        log('IDA Grubu henüz oluşturulmamış!', 'error');
        return;
    }

    // Önce config'te otomatik kaydedilmiş link var mı kontrol et
    let inviteLink = config.group.inviteLink;

    if (inviteLink && inviteLink.includes('chat.whatsapp.com/')) {
        log('✅ Kaydedilmiş davet linki kullanılıyor', 'success');
        log(`Link: ${inviteLink}`, 'info');
    } else {
        // Link yoksa, grubun tamamen hazır olması için bekle
        log('ℹ️ Grubun WhatsApp sunucusunda hazır olması bekleniyor...', 'info');
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 saniye bekle

        // Şimdi davet linkini al ve kaydet
        log('Davet linki otomatik alınıyor...', 'info');
        inviteLink = await getGroupInviteLink(config.group.groupId);

        if (!inviteLink) {
            log('❌ Davet linki alınamadı!', 'error');
            log('⚠️ WhatsApp bağlantınızı ve grubun durumunu kontrol edin', 'warning');
            return;
        }

        // Başarılı link alındı, config'e kaydet
        config.group.inviteLink = inviteLink;
        saveConfig();
        log('✅ Davet linki kaydedildi', 'success');
    }

    const safetySettings = config.safetySettings || {
        minDelay: 3000,
        maxDelay: 8000,
        dailyLimit: 50,
        messageVariations: true
    };

    const messageTemplates = [
        `Merhaba,\n\n${config.group.name} grubuna katılımınız beklenmektedir.\n\nKatılım linki:\n${inviteLink}`,
        `Sayın ilgili,\n\n${config.group.name} grubuna davetlisiniz. Katılım sağlamanız beklenmektedir.\n\n${inviteLink}`,
        `${config.group.name} grubuna katılım linkiniz:\n\n${inviteLink}\n\nKatılımınız beklenmektedir.`,
        `Merhaba,\n\n${config.group.name} için grup oluşturulmuştur. Aşağıdaki linkten katılım sağlayabilirsiniz:\n\n${inviteLink}`
    ];

    let sentCount = 0;
    for (const number of config.inviteNumbers) {
        if (!checkDailyLimit()) {
            log('Günlük davet limiti doldu! Yarın tekrar deneyiniz.', 'warning');
            break;
        }

        try {
            const chatId = `${number}@c.us`;
            const message = safetySettings.messageVariations
                ? messageTemplates[Math.floor(Math.random() * messageTemplates.length)]
                : `${config.group.name} grubuna davetlisiniz!\n\n${inviteLink}`;

            await client.sendMessage(chatId, message);
            recordInvite(number);
            sentCount++;
            log(`✓ Davet gönderildi (${sentCount}/${config.inviteNumbers.length}): ${number}`, 'success');

            // Progresif gecikme: her 10 mesajda bir gecikmeyi artır
            const baseDelay = getRandomDelay(safetySettings.minDelay, safetySettings.maxDelay);
            const progressiveDelay = Math.floor(sentCount / 10) * 1000;
            const totalDelay = baseDelay + progressiveDelay;

            log(`Sonraki mesaj için ${(totalDelay / 1000).toFixed(1)} saniye bekleniyor...`, 'info');
            await new Promise(resolve => setTimeout(resolve, totalDelay));
        } catch (error) {
            log(`✗ Davet gönderme hatası (${number}): ${error.message}`, 'error');
            // Hata durumunda daha uzun bekle
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    log(`Davet gönderimi tamamlandı! ${sentCount} kişiye davet gönderildi.`, 'success');
}

// Grubu temizle
async function cleanupGroup() {
    log('Grup temizleme işlemi başlatılıyor...', 'info');

    if (!config.group.groupId) {
        log('IDA Grubu henüz oluşturulmamış!', 'error');
        return;
    }

    try {
        const chat = await client.getChatById(config.group.groupId);
        if (!chat.isGroup) {
            log('Bu bir grup değil!', 'error');
            return;
        }

        let participants = [];
        if (chat.participants && chat.participants.length > 0) {
            participants = chat.participants;
        } else {
            const metadata = await client.groupMetadata(config.group.groupId);
            if (metadata && metadata.participants) {
                participants = metadata.participants;
            }
        }

        if (participants.length === 0) {
            log('Katılımcı listesi alınamadı!', 'error');
            return;
        }

        const botNumber = client.info.wid._serialized;
        let removedCount = 0;

        for (const participant of participants) {
            const participantId = participant.id ? participant.id._serialized : participant._serialized;

            if (participantId === botNumber) continue;

            try {
                await chat.removeParticipants([participantId]);
                log(`Kullanıcı gruptan çıkarıldı: ${participantId}`, 'success');
                removedCount++;
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (error) {
                log(`Kullanıcı çıkarma hatası (${participantId}): ${error.message}`, 'error');
            }
        }

        log(`Grup temizlendi! ${removedCount} kullanıcı çıkarıldı.`, 'success');
    } catch (error) {
        log(`Grup temizleme hatası: ${error.message}`, 'error');
    }
}

// API Endpoints

// Config al
app.get('/api/config', (req, res) => {
    res.json(config);
});

// Config güncelle
app.post('/api/config', (req, res) => {
    config = { ...config, ...req.body };
    saveConfig();

    // Zamanlanmış görevleri yeniden ayarla
    if (isClientReady) {
        setupScheduledTasks();
    }

    res.json({ success: true, config });
});

// Durum al
app.get('/api/status', (req, res) => {
    res.json({
        isReady: isClientReady,
        hasQR: !!qrCodeData,
        qrCode: qrCodeData,
        botNumber: isClientReady ? client.info.wid.user : null,
        botName: isClientReady ? client.info.pushname : null
    });
});

// Logları al
app.get('/api/logs', (req, res) => {
    res.json(logs);
});

// Grup oluştur
app.post('/api/group/create', async (req, res) => {
    try {
        await createIdaGroup();
        res.json({ success: true, groupId: config.group.groupId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet gönder
app.post('/api/group/send-invites', async (req, res) => {
    try {
        await sendInviteToNumbers();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Grubu temizle
app.post('/api/group/cleanup', async (req, res) => {
    try {
        await cleanupGroup();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet linki al
app.get('/api/group/invite-link', async (req, res) => {
    try {
        if (!config.group.groupId) {
            return res.status(400).json({ success: false, error: 'Grup oluşturulmamış' });
        }
        const link = await getGroupInviteLink(config.group.groupId);
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Grupları listele
app.get('/api/groups', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(400).json({ success: false, error: 'WhatsApp bağlantısı hazır değil' });
        }
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup).map(g => ({
            id: g.id._serialized,
            name: g.name,
            participants: g.participants ? g.participants.length : 0
        }));
        res.json({ success: true, groups });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mesaj gönder
app.post('/api/message/send', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(400).json({ success: false, error: 'WhatsApp bağlantısı hazır değil' });
        }

        const { to, message } = req.body;
        const chatId = to.includes('@') ? to : `${to}@c.us`;
        await client.sendMessage(chatId, message);
        log(`Mesaj gönderildi: ${to}`, 'success');
        res.json({ success: true });
    } catch (error) {
        log(`Mesaj gönderme hatası: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toplu mesaj gönder
app.post('/api/message/send-bulk', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(400).json({ success: false, error: 'WhatsApp bağlantısı hazır değil' });
        }

        const { numbers, message } = req.body;
        const results = [];

        for (const number of numbers) {
            try {
                const chatId = `${number}@c.us`;
                await client.sendMessage(chatId, message);
                log(`Mesaj gönderildi: ${number}`, 'success');
                results.push({ number, success: true });
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                log(`Mesaj gönderme hatası (${number}): ${error.message}`, 'error');
                results.push({ number, success: false, error: error.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Numara ekle (tekil)
app.post('/api/numbers/add', (req, res) => {
    try {
        const { number } = req.body;
        if (!config.inviteNumbers.includes(number)) {
            config.inviteNumbers.push(number);
            saveConfig();
        }
        res.json({ success: true, numbers: config.inviteNumbers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toplu numara ekle
app.post('/api/numbers/add-bulk', (req, res) => {
    try {
        const { numbers } = req.body; // Array veya string (satır satır)
        let numberList = [];

        if (Array.isArray(numbers)) {
            numberList = numbers;
        } else if (typeof numbers === 'string') {
            // Satır satır veya virgülle ayrılmış numaralar
            numberList = numbers
                .split(/[\n,;]+/)
                .map(n => n.trim())
                .filter(n => n.length > 0);
        }

        // Numara formatını kontrol et ve düzelt
        const validNumbers = numberList.map(num => {
            // Başındaki + veya 0'ları temizle
            num = num.replace(/^\+/, '').replace(/^00/, '');
            // Sadece rakamları al
            num = num.replace(/\D/g, '');
            // Türkiye kodu yoksa ekle (5 ile başlıyorsa)
            if (num.startsWith('5') && num.length === 10) {
                num = '90' + num;
            }
            return num;
        }).filter(num => num.length >= 10); // En az 10 haneli olmalı

        // Tekrar edenleri kaldır
        const uniqueNumbers = [...new Set(validNumbers)];

        // Mevcut olmayan numaraları ekle
        let addedCount = 0;
        uniqueNumbers.forEach(num => {
            if (!config.inviteNumbers.includes(num)) {
                config.inviteNumbers.push(num);
                addedCount++;
            }
        });

        saveConfig();
        log(`${addedCount} yeni numara eklendi (Toplam: ${uniqueNumbers.length} numara)`, 'success');

        res.json({
            success: true,
            addedCount,
            totalProvided: uniqueNumbers.length,
            numbers: config.inviteNumbers
        });
    } catch (error) {
        log(`Toplu numara ekleme hatası: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
    }
});

// Numara sil
app.post('/api/numbers/remove', (req, res) => {
    try {
        const { number } = req.body;
        config.inviteNumbers = config.inviteNumbers.filter(n => n !== number);
        saveConfig();
        res.json({ success: true, numbers: config.inviteNumbers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Zamanlamayı güncelle
app.post('/api/schedule/update', (req, res) => {
    try {
        config.schedule = { ...config.schedule, ...req.body };
        saveConfig();
        if (isClientReady) {
            setupScheduledTasks();
        }
        res.json({ success: true, schedule: config.schedule });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet istatistiklerini al
app.get('/api/invite-stats', (req, res) => {
    try {
        const stats = {
            today: config.inviteStats || { date: new Date().toISOString().split('T')[0], count: 0 },
            dailyLimit: config.safetySettings?.dailyLimit || 50,
            remainingToday: (config.safetySettings?.dailyLimit || 50) - (config.inviteStats?.count || 0),
            totalNumbers: config.inviteNumbers.length,
            inviteHistory: config.inviteHistory || {}
        };
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Güvenlik ayarlarını güncelle
app.post('/api/safety-settings', (req, res) => {
    try {
        config.safetySettings = { ...config.safetySettings, ...req.body };
        saveConfig();
        log('Güvenlik ayarları güncellendi', 'success');
        res.json({ success: true, safetySettings: config.safetySettings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet geçmişini temizle
app.post('/api/invite-history/clear', (req, res) => {
    try {
        config.inviteHistory = {};
        config.inviteStats = { date: new Date().toISOString().split('T')[0], count: 0 };
        saveConfig();
        log('Davet geçmişi temizlendi', 'success');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.IO bağlantıları
io.on('connection', (socket) => {
    log(`Yeni web bağlantısı: ${socket.id}`, 'info');

    // Mevcut durumu gönder
    socket.emit('status', {
        isReady: isClientReady,
        hasQR: !!qrCodeData,
        qrCode: qrCodeData
    });

    socket.emit('logs', logs);
    socket.emit('config', config);

    socket.on('disconnect', () => {
        log(`Web bağlantısı koptu: ${socket.id}`, 'info');
    });
});

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    log(`Server başlatıldı: http://localhost:${PORT}`, 'success');
    initializeWhatsAppClient();
});
