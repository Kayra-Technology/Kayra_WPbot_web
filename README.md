# WhatsApp Bot Yönetim Paneli

Modern web arayüzü ile WhatsApp bot yönetim sistemi. Grup oluşturma, mesaj gönderme, numara yönetimi ve zamanlama özelliklerine sahip tam özellikli WhatsApp otomasyon botu.

## Özellikler

- **Web Arayüzü**: Modern, responsive ve kullanıcı dostu web paneli
- **Real-time Güncelleme**: Socket.IO ile anlık durum güncellemeleri
- **QR Kod Okuma**: Web arayüzünden QR kod tarama
- **Numara Yönetimi**: Davet edilecek numaraları ekle/sil/düzenle
- **Grup Yönetimi**: Grup oluşturma, davet gönderme, temizleme
- **Mesaj Gönderme**: Tekil ve toplu mesaj gönderme
- **Zamanlama**: Otomatik davet ve temizleme görevleri
- **Dashboard**: İstatistikler ve canlı loglar
- **Otomatik Yanıtlar**: Gruplarda otomatik mesaj yanıtlama

## Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm install
```

### 2. Yapılandırma

`config.json` dosyasını düzenleyin:

```json
{
  "idaGroup": {
    "name": "Grup Adınız",
    "groupId": ""
  },
  "inviteNumbers": [
    "905xxxxxxxxx"
  ],
  "monitoredGroups": [],
  "autoReplies": {
    "ping": "pong",
    "merhaba": "Merhaba! Nasıl yardımcı olabilirim?"
  },
  "schedule": {
    "inviteDay": 0,
    "inviteHour": 12,
    "inviteMinute": 0,
    "cleanupDay": 6,
    "cleanupHour": 12,
    "cleanupMinute": 0
  }
}
```

### 3. Sunucuyu Başlat

```bash
npm start
```

Veya geliştirme modunda (otomatik yeniden başlatma):

```bash
npm run dev
```

### 4. Web Paneline Eriş

Tarayıcınızda şu adresi açın:

```
http://localhost:3000
```

## Kullanım

### İlk Kurulum

1. Web paneline gidin (`http://localhost:3000`)
2. **QR Kod** sekmesine geçin
3. WhatsApp uygulamanızla QR kodu tarayın
4. Bağlantı kurulduktan sonra dashboard'da "Çevrimiçi" durumunu görmelisiniz

### Numara Yönetimi

1. **Numaralar** sekmesine gidin
2. Yeni numara ekle kutusuna numara girin (örn: 905xxxxxxxxx)
3. "Ekle" butonuna tıklayın
4. Listeyi görüntüleyin ve istenmeyen numaraları silin

### Grup İşlemleri

**Grup Oluştur:**
- **Gruplar** sekmesinde "Grup Oluştur" butonuna tıklayın
- IDA Grubu otomatik olarak oluşturulur

**Davet Gönder:**
- "Davet Gönder" butonuna tıklayın
- Numara listesindeki tüm kişilere davet linki gönderilir

**Grubu Temizle:**
- "Grubu Temizle" butonuna tıklayın
- Gruptan bot hariç tüm üyeler çıkarılır

**Davet Linki Al:**
- "Davet Linki Al" butonuna tıklayın
- Link otomatik olarak kopyalanır

### Mesaj Gönderme

**Tekil Mesaj:**
1. **Mesajlar** sekmesine gidin
2. Alıcı numarasını girin (örn: 905xxxxxxxxx)
3. Mesajınızı yazın
4. "Gönder" butonuna tıklayın

**Toplu Mesaj:**
1. Alıcı kutusuna virgülle ayrılmış numaralar girin
2. Örnek: `905xxxxxxxxx,905yyyyyyyyy,905zzzzzzzzz`
3. Mesajınızı yazın
4. "Gönder" butonuna tıklayın

### Zamanlama Ayarları

1. **Zamanlama** sekmesine gidin
2. Davet ve temizlik görevleri için gün, saat ve dakika ayarlayın
3. Gün formatı: 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
4. "Kaydet" butonuna tıklayın

**Varsayılan Zamanlama:**
- Davet Gönderme: Her Pazar 12:00
- Grup Temizleme: Her Cumartesi 12:00

### Log İzleme

**Loglar** sekmesinde tüm bot aktivitelerini gerçek zamanlı olarak izleyebilirsiniz:
- Mesaj gönderme/alma
- Grup işlemleri
- Hata mesajları
- Sistem bildirimleri

## API Endpoints

Sunucu aşağıdaki REST API endpoint'lerini sunar:

### Durum & Config
- `GET /api/status` - Bot durumunu al
- `GET /api/config` - Yapılandırmayı al
- `POST /api/config` - Yapılandırmayı güncelle
- `GET /api/logs` - Logları al

### Grup İşlemleri
- `POST /api/group/create` - Grup oluştur
- `POST /api/group/send-invites` - Davet gönder
- `POST /api/group/cleanup` - Grubu temizle
- `GET /api/group/invite-link` - Davet linki al
- `GET /api/groups` - Tüm grupları listele

### Mesaj İşlemleri
- `POST /api/message/send` - Tekil mesaj gönder
- `POST /api/message/send-bulk` - Toplu mesaj gönder

### Numara İşlemleri
- `POST /api/numbers/add` - Numara ekle
- `POST /api/numbers/remove` - Numara sil

### Zamanlama
- `POST /api/schedule/update` - Zamanlama güncelle

## Socket.IO Events

Real-time güncellemeler için Socket.IO olayları:

**Server -> Client:**
- `qr` - QR kodu
- `ready` - Bot hazır
- `authenticated` - Kimlik doğrulandı
- `auth_failure` - Kimlik doğrulama hatası
- `disconnected` - Bağlantı kesildi
- `log` - Yeni log girişi
- `config-updated` - Config güncellendi
- `message` - Yeni mesaj alındı

## Proje Yapısı

```
├── server.js           # Ana sunucu (Express + Socket.IO + WhatsApp)
├── index.js            # Eski komut satırı bot (opsiyonel)
├── config.json         # Yapılandırma dosyası
├── package.json        # NPM bağımlılıkları
├── public/             # Web arayüzü
│   ├── index.html      # Ana HTML
│   └── app.js          # Frontend JavaScript
└── .wwebjs_auth/       # WhatsApp oturum verileri (otomatik oluşur)
```

## Teknolojiler

**Backend:**
- Node.js
- Express.js
- Socket.IO
- whatsapp-web.js
- node-schedule
- qrcode

**Frontend:**
- HTML5
- CSS3 (Modern gradient tasarım)
- Vanilla JavaScript
- Socket.IO Client
- Axios

## Güvenlik Notları

- Web paneli varsayılan olarak `localhost:3000` üzerinde çalışır
- Üretim ortamında kullanmak için:
  - HTTPS kullanın
  - Kimlik doğrulama ekleyin
  - CORS ayarlarını sıkılaştırın
  - Güvenlik duvarı kuralları ayarlayın

## Sorun Giderme

### QR Kod Görünmüyor
- Sunucuyu yeniden başlatın
- `.wwebjs_auth` klasörünü silin ve tekrar deneyin
- Chrome/Chromium yüklü olduğundan emin olun

### Mesaj Gönderilmiyor
- WhatsApp bağlantısının aktif olduğundan emin olun
- Numara formatının doğru olduğunu kontrol edin (90XXXXXXXXXX)
- Rate limit'e dikkat edin (mesajlar arası 1-2 saniye bekleyin)

### Grup İşlemleri Çalışmıyor
- Botun grup yöneticisi olduğundan emin olun
- Grup ID'sinin doğru olduğunu kontrol edin

## Eski Komut Satırı Botu

Eski komut satırı botunu çalıştırmak için:

```bash
npm run old
```

## Lisans

ISC

## Katkıda Bulunma

Pull request'ler memnuniyetle karşılanır. Büyük değişiklikler için lütfen önce bir issue açın.

## Destek

Sorun yaşıyorsanız:
1. README dosyasını dikkatlice okuyun
2. Logları kontrol edin
3. Issue açın

---

**Not:** Bu bot WhatsApp'ın resmi API'sini kullanmaz ve WhatsApp kullanım şartlarını ihlal edebilir. Kendi sorumluluğunuzda kullanın.
