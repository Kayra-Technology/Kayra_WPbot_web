const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { SessionManager, CONFIG } = require('./sessionManager');

// ============== SERVER CONFIG ==============
const SERVER_CONFIG = {
    PORT: process.env.PORT || 3000,
    RATE_LIMIT_WINDOW: 60000,           // 1 dakika
    RATE_LIMIT_MAX_REQUESTS: 100,       // Dakikada max istek
    BODY_SIZE_LIMIT: '1mb',
    TRUST_PROXY: process.env.NODE_ENV === 'production'
};

// Express uygulaması
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// ============== RATE LIMITING ==============
const rateLimitMap = new Map();

function rateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + SERVER_CONFIG.RATE_LIMIT_WINDOW });
        return next();
    }

    const record = rateLimitMap.get(ip);

    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + SERVER_CONFIG.RATE_LIMIT_WINDOW;
        return next();
    }

    if (record.count >= SERVER_CONFIG.RATE_LIMIT_MAX_REQUESTS) {
        return res.status(429).json({
            success: false,
            error: 'Çok fazla istek. Lütfen biraz bekleyin.'
        });
    }

    record.count++;
    next();
}

// Rate limit temizliği
setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitMap) {
        if (now > record.resetTime) {
            rateLimitMap.delete(ip);
        }
    }
}, 60000);

// ============== MIDDLEWARE ==============
if (SERVER_CONFIG.TRUST_PROXY) {
    app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json({ limit: SERVER_CONFIG.BODY_SIZE_LIMIT }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/', rateLimit);

// Session ID oluştur
function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

// ============== INPUT VALIDATION ==============

function validateSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') return false;
    // 32 karakter hex string
    return /^[a-f0-9]{32}$/i.test(sessionId);
}

function validateGroupName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length >= 1 && trimmed.length <= 100;
}

function validatePhoneNumber(number) {
    if (!number) return false;
    const cleaned = String(number).replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

function validateMessage(message) {
    if (!message || typeof message !== 'string') return false;
    return message.trim().length > 0 && message.length <= 4096;
}

// Session middleware - API istekleri için
function getSessionFromRequest(req) {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    if (!sessionId) {
        return null;
    }
    return SessionManager.get(sessionId);
}

// ============== HEALTH & STATS ==============

// Health check endpoint (Railway için)
app.get('/health', (req, res) => {
    const stats = SessionManager.getStats();
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        sessions: stats
    });
});

// Session istatistikleri
app.get('/api/stats', (req, res) => {
    const stats = SessionManager.getStats();
    res.json({
        success: true,
        sessions: stats,
        config: {
            maxSessions: CONFIG.MAX_SESSIONS,
            sessionTimeout: CONFIG.SESSION_TIMEOUT / 60000 // dakika
        }
    });
});

// ============== API ENDPOINTS ==============

// Yeni session oluştur
app.post('/api/session/create', (req, res) => {
    const sessionId = generateSessionId();
    const session = SessionManager.getOrCreate(sessionId, io);
    console.log(`Yeni session oluşturuldu: ${sessionId}`);
    res.json({ success: true, sessionId });
});

// Session durumu
app.get('/api/status', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.json({
            isReady: false,
            hasQR: false,
            qrCode: null,
            botNumber: null,
            botName: null,
            error: 'Session bulunamadı'
        });
    }
    res.json(session.getStatus());
});

// Config al
app.get('/api/config', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    res.json(session.config);
});

// Config güncelle
app.post('/api/config', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    session.config = { ...session.config, ...req.body };
    session.saveConfig();
    res.json({ success: true, config: session.config });
});

// Logları al
app.get('/api/logs', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.json([]);
    }
    res.json(session.logs);
});

// WhatsApp'ı yeniden başlat
app.post('/api/restart', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        await session.restart();
        res.json({ success: true, message: 'WhatsApp Client yeniden başlatıldı' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Grup oluştur
app.post('/api/group/create', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const groupName = session.config.group.name || req.body.name;
        if (!validateGroupName(groupName)) {
            return res.status(400).json({ success: false, error: 'Geçersiz grup adı (1-100 karakter)' });
        }
        await session.createGroup(groupName.trim());
        res.json({ success: true, groupId: session.config.group.groupId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet gönder
app.post('/api/group/send-invites', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const sentCount = await session.sendInvites();
        res.json({ success: true, sentCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Grubu temizle
app.post('/api/group/cleanup', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const removedCount = await session.cleanupGroup();
        res.json({ success: true, removedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet linki al
app.get('/api/group/invite-link', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const link = await session.getInviteLink();
        res.json({ success: true, link });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Grupları listele
app.get('/api/groups', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const groups = await session.getGroups();
        res.json({ success: true, groups });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mesaj gönder
app.post('/api/message/send', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const { to, message } = req.body;
        if (!validatePhoneNumber(to)) {
            return res.status(400).json({ success: false, error: 'Geçersiz telefon numarası' });
        }
        if (!validateMessage(message)) {
            return res.status(400).json({ success: false, error: 'Geçersiz mesaj (1-4096 karakter)' });
        }
        await session.sendMessage(to, message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toplu mesaj gönder
app.post('/api/message/send-bulk', async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const { numbers, message } = req.body;
        const results = [];

        for (const number of numbers) {
            try {
                await session.sendMessage(number, message);
                results.push({ number, success: true });
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                results.push({ number, success: false, error: error.message });
            }
        }

        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Numara ekle
app.post('/api/numbers/add', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const { number } = req.body;
        if (!session.config.inviteNumbers.includes(number)) {
            session.config.inviteNumbers.push(number);
            session.saveConfig();
        }
        res.json({ success: true, numbers: session.config.inviteNumbers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Numara formatını düzelt - Gelişmiş versiyon
function formatPhoneNumber(num) {
    if (!num) return null;

    // String'e çevir ve boşlukları temizle
    let original = String(num).trim();
    let cleaned = original;

    // Tüm özel karakterleri temizle (boşluk, tire, parantez, nokta, artı)
    cleaned = cleaned.replace(/[\s\-\(\)\.\+\/\\]/g, '');

    // Sadece rakamları al
    cleaned = cleaned.replace(/\D/g, '');

    if (cleaned.length === 0) {
        console.log(`[formatPhoneNumber] Geçersiz numara (boş): "${original}"`);
        return null;
    }

    // Türkiye numarası formatları:
    // 05321234567 -> 905321234567 (11 hane, 0 ile başlıyor)
    // 5321234567 -> 905321234567 (10 hane, 5 ile başlıyor)
    // 905321234567 -> 905321234567 (12 hane, 90 ile başlıyor)
    // 00905321234567 -> 905321234567 (14 hane, 0090 ile başlıyor)
    // +905321234567 -> 905321234567 (+ temizlendikten sonra 12 hane)

    // Başındaki 00'ları kaldır (uluslararası format)
    if (cleaned.startsWith('00')) {
        cleaned = cleaned.substring(2);
    }

    // 0 ile başlayan Türkiye numaraları
    if (cleaned.startsWith('0')) {
        // 05XX, 053X, 054X, 055X formatları (GSM)
        if (cleaned.length === 11 && /^0[5][0-9]{9}$/.test(cleaned)) {
            cleaned = '9' + cleaned; // 05xx -> 905xx
        }
        // Sabit hat: 0212, 0312, 0232 vb.
        else if (cleaned.length === 11 && /^0[2-4][0-9]{9}$/.test(cleaned)) {
            cleaned = '9' + cleaned; // 0212xxx -> 90212xxx
        }
        // Tek 0 varsa ve 10 haneden kısaysa
        else if (cleaned.length === 10 && cleaned.startsWith('0')) {
            // 05XXXXXXXX formatı
            cleaned = '9' + cleaned;
        }
    }

    // 5 ile başlayan 10 haneli numaralar (ülke kodu olmadan GSM)
    if (cleaned.startsWith('5') && cleaned.length === 10) {
        cleaned = '90' + cleaned;
    }

    // 2, 3, 4 ile başlayan 10 haneli numaralar (ülke kodu olmadan sabit hat)
    if (/^[234]/.test(cleaned) && cleaned.length === 10) {
        cleaned = '90' + cleaned;
    }

    // Türkiye numarası kontrolü (90 ile başlamalı, 12 hane olmalı)
    if (cleaned.startsWith('90') && cleaned.length === 12) {
        console.log(`[formatPhoneNumber] Türkiye numarası: "${original}" -> "${cleaned}"`);
        return cleaned;
    }

    // Diğer ülke numaraları için (en az 10, en fazla 15 hane)
    if (cleaned.length >= 10 && cleaned.length <= 15) {
        // Eğer ülke kodu ile başlamıyorsa, Türkiye için 90 ekle
        if (!cleaned.startsWith('90') && !cleaned.startsWith('1') && 
            !cleaned.startsWith('44') && !cleaned.startsWith('49') && 
            !cleaned.startsWith('33') && !cleaned.startsWith('39')) {
            // Bilinmeyen format - Türkiye varsayalım
            if (cleaned.length === 10) {
                cleaned = '90' + cleaned;
                console.log(`[formatPhoneNumber] 90 eklendi: "${original}" -> "${cleaned}"`);
                return cleaned;
            }
        }
        console.log(`[formatPhoneNumber] Uluslararası numara: "${original}" -> "${cleaned}"`);
        return cleaned;
    }

    console.log(`[formatPhoneNumber] Geçersiz numara format: "${original}" (${cleaned.length} hane)`);
    return null;
}

// Toplu numara ekle
app.post('/api/numbers/add-bulk', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const { numbers } = req.body;
        let numberList = [];

        if (Array.isArray(numbers)) {
            numberList = numbers;
        } else if (typeof numbers === 'string') {
            // Çeşitli ayırıcıları destekle
            numberList = numbers
                .split(/[\n\r,;|\t]+/)
                .map(n => n.trim())
                .filter(n => n.length > 0);
        }

        const validNumbers = [];
        const invalidNumbers = [];

        numberList.forEach(num => {
            const formatted = formatPhoneNumber(num);
            if (formatted) {
                validNumbers.push(formatted);
            } else if (num.trim()) {
                invalidNumbers.push(num);
            }
        });

        const uniqueNumbers = [...new Set(validNumbers)];
        let addedCount = 0;

        uniqueNumbers.forEach(num => {
            if (!session.config.inviteNumbers.includes(num)) {
                session.config.inviteNumbers.push(num);
                addedCount++;
            }
        });

        session.saveConfig();

        if (invalidNumbers.length > 0) {
            session.log(`${addedCount} numara eklendi, ${invalidNumbers.length} geçersiz numara atlandı`, 'warning');
        } else {
            session.log(`${addedCount} yeni numara eklendi`, 'success');
        }

        res.json({
            success: true,
            addedCount,
            totalProvided: uniqueNumbers.length,
            invalidCount: invalidNumbers.length,
            invalidNumbers: invalidNumbers.slice(0, 5), // İlk 5 geçersiz numarayı göster
            numbers: session.config.inviteNumbers
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Numara sil
app.post('/api/numbers/remove', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.status(400).json({ success: false, error: 'Session bulunamadı' });
    }
    try {
        const { number } = req.body;
        session.config.inviteNumbers = session.config.inviteNumbers.filter(n => n !== number);
        session.saveConfig();
        res.json({ success: true, numbers: session.config.inviteNumbers });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Davet istatistikleri
app.get('/api/invite-stats', (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
        return res.json({
            success: true,
            stats: {
                today: { date: new Date().toISOString().split('T')[0], count: 0 },
                dailyLimit: 50,
                remainingToday: 50,
                totalNumbers: 0,
                inviteHistory: {}
            }
        });
    }
    try {
        const stats = {
            today: session.config.inviteStats || { date: new Date().toISOString().split('T')[0], count: 0 },
            dailyLimit: session.config.safetySettings?.dailyLimit || 50,
            remainingToday: (session.config.safetySettings?.dailyLimit || 50) - (session.config.inviteStats?.count || 0),
            totalNumbers: session.config.inviteNumbers.length,
            inviteHistory: session.config.inviteHistory || {}
        };
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============== SOCKET.IO ==============

io.on('connection', (socket) => {
    console.log(`Yeni socket bağlantısı: ${socket.id}`);

    // Her socket için session ID'yi sakla
    socket.sessionId = null;

    // Session'a katıl
    socket.on('join-session', (sessionId) => {
        if (!sessionId || !validateSessionId(sessionId)) {
            socket.emit('error', { message: 'Geçersiz Session ID' });
            return;
        }

        // Önceki session'dan çık
        if (socket.sessionId && socket.sessionId !== sessionId) {
            socket.leave(socket.sessionId);
            console.log(`Socket ${socket.id} eski session'dan çıktı: ${socket.sessionId}`);
        }

        socket.sessionId = sessionId;
        socket.join(sessionId);
        console.log(`Socket ${socket.id} session'a katıldı: ${sessionId}`);
        console.log(`Aktif session sayısı: ${SessionManager.getAll().length}`);

        // Session'ı al veya oluştur
        const session = SessionManager.getOrCreate(sessionId, io);

        // Mevcut durumu gönder - sadece bu session'a ait bilgiler
        const status = session.getStatus();
        console.log(`Session ${sessionId.substring(0, 8)}... durumu: isReady=${status.isReady}, hasQR=${status.hasQR}`);

        socket.emit('status', status);

        if (session.qrCodeData && !session.isReady) {
            socket.emit('qr', session.qrCodeData);
        }

        socket.emit('logs', session.logs);
        socket.emit('config', session.config);
    });

    socket.on('disconnect', () => {
        console.log(`Socket bağlantısı koptu: ${socket.id}, session: ${socket.sessionId}`);
    });
});

// ============== STATIC FILES ==============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
}); 

// ============== ERROR HANDLING ==============

process.on('uncaughtException', (err) => {
    console.error('[Server] Uncaught Exception:', err.message);
    // Kritik hata durumunda sunucuyu kapatma (Railway otomatik restart yapar)
});

process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection:', reason);
});

// ============== GRACEFUL SHUTDOWN ==============

let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Server] ${signal} sinyali alındı. Sunucu kapatılıyor...`);

    // Yeni bağlantıları reddet
    server.close(() => {
        console.log('[Server] HTTP sunucusu kapatıldı');
    });

    // Socket.io bağlantılarını kapat
    io.close(() => {
        console.log('[Server] Socket.io kapatıldı');
    });

    // Session temizliğini durdur
    SessionManager.stopCleanup();

    // Tüm session'ları kapat
    try {
        await SessionManager.destroyAll();
    } catch (err) {
        console.error('[Server] Session kapatma hatası:', err.message);
    }

    console.log('[Server] Sunucu başarıyla kapatıldı');
    process.exit(0);
}

// Shutdown sinyalleri
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============== START SERVER ==============

server.listen(SERVER_CONFIG.PORT, () => {
    console.log('='.repeat(50));
    console.log(`[Server] WhatsApp Bot Panel başlatıldı`);
    console.log(`[Server] Port: ${SERVER_CONFIG.PORT}`);
    console.log(`[Server] Max Sessions: ${CONFIG.MAX_SESSIONS}`);
    console.log(`[Server] Session Timeout: ${CONFIG.SESSION_TIMEOUT / 60000} dakika`);
    console.log(`[Server] Health: http://localhost:${SERVER_CONFIG.PORT}/health`);
    console.log('='.repeat(50));
});
