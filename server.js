const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { SessionManager } = require('./sessionManager');

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

// Session ID oluştur
function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

// Session middleware - API istekleri için
function getSessionFromRequest(req) {
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    if (!sessionId) {
        return null;
    }
    return SessionManager.get(sessionId);
}

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
        await session.createGroup(groupName);
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
            numberList = numbers
                .split(/[\n,;]+/)
                .map(n => n.trim())
                .filter(n => n.length > 0);
        }

        const validNumbers = numberList.map(num => {
            num = num.replace(/^\+/, '').replace(/^00/, '');
            num = num.replace(/\D/g, '');
            if (num.startsWith('5') && num.length === 10) {
                num = '90' + num;
            }
            return num;
        }).filter(num => num.length >= 10);

        const uniqueNumbers = [...new Set(validNumbers)];
        let addedCount = 0;

        uniqueNumbers.forEach(num => {
            if (!session.config.inviteNumbers.includes(num)) {
                session.config.inviteNumbers.push(num);
                addedCount++;
            }
        });

        session.saveConfig();
        session.log(`${addedCount} yeni numara eklendi`, 'success');

        res.json({
            success: true,
            addedCount,
            totalProvided: uniqueNumbers.length,
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

    // Session'a katıl
    socket.on('join-session', (sessionId) => {
        if (!sessionId) {
            socket.emit('error', { message: 'Session ID gerekli' });
            return;
        }

        socket.join(sessionId);
        console.log(`Socket ${socket.id} session'a katıldı: ${sessionId}`);

        // Session'ı al veya oluştur
        const session = SessionManager.getOrCreate(sessionId, io);

        // Mevcut durumu gönder
        socket.emit('status', session.getStatus());

        if (session.qrCodeData && !session.isReady) {
            socket.emit('qr', session.qrCodeData);
        }

        socket.emit('logs', session.logs);
        socket.emit('config', session.config);
    });

    socket.on('disconnect', () => {
        console.log(`Socket bağlantısı koptu: ${socket.id}`);
    });
});

// ============== STATIC FILES ==============

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============== ERROR HANDLING ==============

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ============== START SERVER ==============

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server başlatıldı: http://localhost:${PORT}`);
});
