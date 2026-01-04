const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

// Konfigürasyon dosyasını yükle
const configPath = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Konfigürasyonu kaydet
function saveConfig() {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Client oluştur
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Türkiye saatini al (UTC+3)
function getTurkeyTime() {
    const now = new Date();
    const turkeyOffset = 3 * 60; // UTC+3 dakika cinsinden
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (turkeyOffset * 60000));
}

// Log fonksiyonu
function log(message) {
    const turkeyTime = getTurkeyTime();
    const timestamp = turkeyTime.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    console.log(`[${timestamp}] ${message}`);
}

// IDA Grubunu oluştur
async function createIdaGroup() {
    try {
        log('IDA Grubu oluşturuluyor...');

        // Grup oluşturmak için en az bir katılımcı gerekli
        // Bot kendi numarasını kullanacak, sonra diğerlerini ekleyecek
        const group = await client.createGroup(config.group.name, []);

        config.group.groupId = group.gid._serialized;
        saveConfig();

        log(`IDA Grubu oluşturuldu! ID: ${config.group.groupId}`);
        return group;
    } catch (error) {
        log(`Grup oluşturma hatası: ${error.message}`);
        return null;
    }
}

// Grup davet linki oluştur
async function getGroupInviteLink(groupId) {
    try {
        const chat = await client.getChatById(groupId);
        if (chat.isGroup) {
            const inviteCode = await chat.getInviteCode();
            return `https://chat.whatsapp.com/${inviteCode}`;
        }
    } catch (error) {
        log(`Davet linki alma hatası: ${error.message}`);
    }
    return null;
}

// Belirli numaralara davet linki gönder
async function sendInviteToNumbers() {
    log('Davet linki gönderme işlemi başlatılıyor...');

    if (!config.group.groupId) {
        log('IDA Grubu henüz oluşturulmamış!');
        return;
    }

    const inviteLink = await getGroupInviteLink(config.group.groupId);
    if (!inviteLink) {
        log('Davet linki alınamadı!');
        return;
    }

    for (const number of config.inviteNumbers) {
        try {
            const chatId = `${number}@c.us`;
            await client.sendMessage(chatId, `IDA Grubuna davetlisiniz!\n\n${inviteLink}`);
            log(`Davet linki gönderildi: ${number}`);
        } catch (error) {
            log(`Davet gönderme hatası (${number}): ${error.message}`);
        }
    }
}

// Gruptan bot hariç herkesi at
async function cleanupGroup() {
    log('Grup temizleme işlemi başlatılıyor...');

    if (!config.group.groupId) {
        log('IDA Grubu henüz oluşturulmamış!');
        return;
    }

    try {
        const chat = await client.getChatById(config.group.groupId);
        if (!chat.isGroup) {
            log('Bu bir grup değil!');
            return;
        }

        // Grup bilgilerini yeniden al (katılımcılar için)
        const groupChat = await chat.getContact();

        // Katılımcıları al - farklı yöntemler dene
        let participants = [];

        if (chat.participants && chat.participants.length > 0) {
            participants = chat.participants;
            log(`chat.participants ile ${participants.length} katılımcı bulundu`);
        } else {
            // Alternatif: groupMetadata kullan
            try {
                const metadata = await client.groupMetadata(config.group.groupId);
                if (metadata && metadata.participants) {
                    participants = metadata.participants;
                    log(`groupMetadata ile ${participants.length} katılımcı bulundu`);
                }
            } catch (e) {
                log(`Metadata alınamadı: ${e.message}`);
            }
        }

        if (participants.length === 0) {
            log('Katılımcı listesi alınamadı!');
            return;
        }

        const botNumber = client.info.wid._serialized;
        log(`Bot numarası: ${botNumber}`);
        log(`Toplam katılımcı: ${participants.length}`);

        let removedCount = 0;
        for (const participant of participants) {
            const participantId = participant.id ? participant.id._serialized : participant._serialized;

            log(`İşleniyor: ${participantId}`);

            // Bot kendini atmasın
            if (participantId === botNumber) {
                log('Bot atlanıyor...');
                continue;
            }

            // Kullanıcıyı at
            try {
                await chat.removeParticipants([participantId]);
                log(`✓ Kullanıcı gruptan çıkarıldı: ${participantId}`);
                removedCount++;

                // Rate limit'e takılmamak için bekle
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (error) {
                log(`✗ Kullanıcı çıkarma hatası (${participantId}): ${error.message}`);
            }
        }

        log(`Grup temizlendi! ${removedCount} kullanıcı çıkarıldı.`);
    } catch (error) {
        log(`Grup temizleme hatası: ${error.message}`);
    }
}

// Zamanlanmış görevleri ayarla
function setupScheduledTasks() {
    const { schedule: scheduleConfig } = config;

    // Pazar 12:00 - Davet linki gönder (Türkiye saati)
    // node-schedule cron formatı: saniye dakika saat gün ay haftanın_günü
    // 0 = Pazar, 6 = Cumartesi
    const inviteRule = new schedule.RecurrenceRule();
    inviteRule.tz = 'Europe/Istanbul';
    inviteRule.dayOfWeek = scheduleConfig.inviteDay; // 0 = Pazar
    inviteRule.hour = scheduleConfig.inviteHour;
    inviteRule.minute = scheduleConfig.inviteMinute;

    schedule.scheduleJob(inviteRule, () => {
        log('Zamanlanmış görev: Davet linki gönderme');
        sendInviteToNumbers();
    });

    log(`Davet görevi zamanlandı: Her Pazar ${scheduleConfig.inviteHour}:${String(scheduleConfig.inviteMinute).padStart(2, '0')} (TR)`);

    // Cumartesi 12:00 - Grubu temizle (Türkiye saati)
    const cleanupRule = new schedule.RecurrenceRule();
    cleanupRule.tz = 'Europe/Istanbul';
    cleanupRule.dayOfWeek = scheduleConfig.cleanupDay; // 6 = Cumartesi
    cleanupRule.hour = scheduleConfig.cleanupHour;
    cleanupRule.minute = scheduleConfig.cleanupMinute;

    schedule.scheduleJob(cleanupRule, () => {
        log('Zamanlanmış görev: Grup temizleme');
        cleanupGroup();
    });

    log(`Temizleme görevi zamanlandı: Her Cumartesi ${scheduleConfig.cleanupHour}:${String(scheduleConfig.cleanupMinute).padStart(2, '0')} (TR)`);
}

// Mesajın izlenen gruptan gelip gelmediğini kontrol et
function isFromMonitoredGroup(msg) {
    if (!msg.from.endsWith('@g.us')) return false;
    return true; // Tüm grupları izle, veya config'den kontrol et
}

// QR kodu terminale yazdır
client.on('qr', (qr) => {
    log('QR Kodu tarayın:');
    qrcode.generate(qr, { small: true });
});

// Bağlantı kurulduğunda
client.on('ready', async () => {
    log('WhatsApp bağlantısı kuruldu!');
    log(`Bot numarası: ${client.info.wid.user}`);

    // Zamanlanmış görevleri başlat
    setupScheduledTasks();

    // IDA Grubu yoksa bilgi ver
    if (!config.group.groupId) {
        log('IDA Grubu bulunamadı. Oluşturmak için bota DM\'den !idaolustur yazın.');
    } else {
        log(`Mevcut IDA Grubu: ${config.group.groupId}`);
    }

    // Mevcut grupları listele
    try {
        const chats = await client.getChats();
        const groups = chats.filter(chat => chat.isGroup);
        log(`Toplam ${groups.length} grup bulundu.`);
    } catch (error) {
        log(`Gruplar listelenirken hata: ${error.message}`);
    }
});

// Kimlik doğrulama başarılı
client.on('authenticated', () => {
    log('Kimlik doğrulama başarılı!');
});

// Kimlik doğrulama hatası
client.on('auth_failure', (msg) => {
    log(`Kimlik doğrulama hatası: ${msg}`);
});

// Bağlantı kesildiğinde
client.on('disconnected', (reason) => {
    log(`Bağlantı kesildi: ${reason}`);
});

// Gelen mesajları dinle
client.on('message', async (msg) => {
    try {
        const chat = await msg.getChat();
        let senderName = msg.author || msg.from;

        try {
            const contact = await msg.getContact();
            senderName = contact.pushname || contact.number || senderName;
        } catch (e) {
            // Contact bilgisi alınamazsa devam et
        }

        // Grup mesajı mı kontrol et
        if (chat.isGroup) {
            log(`[${chat.name}] ${senderName}: ${msg.body}`);
        } else {
            log(`[DM] ${senderName}: ${msg.body}`);
        }

    // Bot komutları (sadece DM'den)
    if (!chat.isGroup) {
        const body = msg.body.toLowerCase().trim();

        // Grup oluştur komutu
        if (body === '!idaolustur') {
            await createIdaGroup();
            await msg.reply('IDA Grubu oluşturuldu!');
            return;
        }

        // Davet linki gönder komutu
        if (body === '!davetgonder') {
            await sendInviteToNumbers();
            await msg.reply('Davet linkleri gönderildi!');
            return;
        }

        // Grubu temizle komutu
        if (body === '!grubtemizle') {
            await cleanupGroup();
            await msg.reply('Grup temizlendi!');
            return;
        }

        // Durum komutu
        if (body === '!durum') {
            const turkeyTime = getTurkeyTime();
            const status = `
📊 Bot Durumu
━━━━━━━━━━━━━━━
🕐 Türkiye Saati: ${turkeyTime.toLocaleString('tr-TR')}
📱 IDA Grup ID: ${config.group.groupId || 'Oluşturulmamış'}
👥 Davet Listesi: ${config.inviteNumbers.length} numara
⏰ Davet: Her Pazar 12:00
🧹 Temizlik: Her Cumartesi 12:00
━━━━━━━━━━━━━━━`;
            await msg.reply(status);
            return;
        }

        // Yardım komutu
        if (body === '!yardim' || body === '!help') {
            const help = `
🤖 Bot Komutları
━━━━━━━━━━━━━━━
!idaolustur - IDA Grubunu oluştur
!davetgonder - Davet linklerini manuel gönder
!grubtemizle - Grubu manuel temizle
!durum - Bot durumunu göster
!gruplar - Grupları listele
!yardim - Bu mesajı göster
━━━━━━━━━━━━━━━`;
            await msg.reply(help);
            return;
        }

        // Grupları listele
        if (body === '!gruplar') {
            const chats = await client.getChats();
            const groups = chats.filter(c => c.isGroup);
            let groupList = '📋 Gruplar:\n━━━━━━━━━━━━━━━\n';
            groups.forEach((g, i) => {
                groupList += `${i + 1}. ${g.name}\n`;
            });
            await msg.reply(groupList);
            return;
        }
    }

    // İzlenen gruplarda otomatik yanıtlar
    if (chat.isGroup) {
        const body = msg.body.toLowerCase().trim();

        // config'deki otomatik yanıtları kontrol et
        for (const [trigger, response] of Object.entries(config.autoReplies)) {
            if (body === trigger.toLowerCase()) {
                await msg.reply(response);
                return;
            }
        }
    }
    } catch (error) {
        log(`Mesaj işleme hatası: ${error.message}`);
    }
});

// Client'ı başlat
log('WhatsApp Bot başlatılıyor...');
log('Türkiye saati kullanılıyor (UTC+3)');
client.initialize();
