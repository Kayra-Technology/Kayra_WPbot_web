# 📱 WhatsApp Bot Panel

WhatsApp Web üzerinden çalışan, grup oluşturma ve toplu davet gönderme özelliklerine sahip profesyonel bir bot paneli.

![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![WhatsApp](https://img.shields.io/badge/WhatsApp-Web-25D366)
![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Özellikler

### 🔐 Çoklu Oturum Desteği
- Her kullanıcı için benzersiz session ID
- Oturumlar arası izolasyon
- Otomatik session yönetimi

### 📞 Gelişmiş Numara Formatlama
Çeşitli telefon numarası formatlarını otomatik olarak tanır ve düzeltir:

| Girdi Formatı | Çıktı |
|---------------|-------|
| `05529444589` | `905529444589` |
| `5529444589` | `905529444589` |
| `905529444589` | `905529444589` |
| `+90 552 944 45 89` | `905529444589` |
| `0090-552-944-4589` | `905529444589` |
| `0212 123 45 67` | `902121234567` |

✅ GSM numaraları (5XX)  
✅ Sabit hat numaraları (2XX, 3XX, 4XX)  
✅ Uluslararası formatlar (+90, 0090)  
✅ Boşluk, tire, parantez temizleme

### 👥 Grup Yönetimi
- Otomatik grup oluşturma
- Davet linki alma
- Grup temizleme (üyeleri çıkarma)
- Grup listesi görüntüleme

### 📨 Toplu Davet Gönderimi
- URL navigasyonu ile güvenilir mesaj gönderme
- Puppeteer tabanlı otomasyon
- Numara doğrulama (WhatsApp'ta kayıtlı mı?)
- Günlük limit kontrolü
- Rastgele mesaj varyasyonları

### ⚙️ Güvenlik Ayarları
- Günlük davet limiti (varsayılan: 50)
- Minimum/maksimum gecikme süresi
- Mesaj varyasyonları (ban koruması)

### 📊 İstatistikler
- Günlük gönderim sayısı
- Toplam numara sayısı
- Davet geçmişi

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Chrome/Chromium (Puppeteer için)

### Adımlar

```bash
# Repoyu klonla
git clone https://github.com/Kayra-Technology/Kayra_WPbot_web.git
cd Kayra_WPbot_web

# Bağımlılıkları yükle
npm install

# Sunucuyu başlat
npm start
```

## 📖 Kullanım

1. **Sunucuyu Başlat**
   ```bash
   node server.js
   ```

2. **Tarayıcıda Aç**
   ```
   http://localhost:3000
   ```

3. **QR Kodu Tara**
   - WhatsApp uygulamasından QR kodu tarayın
   - Bağlantı kurulunca yeşil onay görünecek

4. **Numaraları Ekle**
   - Toplu numara ekle bölümüne numaraları girin
   - Her satıra bir numara veya virgülle ayırın
   - Format otomatik düzeltilir

5. **Grup Oluştur**
   - Grup adı girin
   - "Grup Oluştur" butonuna tıklayın

6. **Davet Gönder**
   - "Davet Gönder" butonuna tıklayın
   - İlerleme loglardan takip edilebilir

## 🔧 API Endpoints

### Session
| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/session/create` | POST | Yeni session oluştur |
| `/api/status` | GET | Session durumu |
| `/api/config` | GET/POST | Konfigürasyon al/güncelle |
| `/api/logs` | GET | Logları al |

### Grup
| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/group/create` | POST | Grup oluştur |
| `/api/group/invite-link` | GET | Davet linki al |
| `/api/group/send-invites` | POST | Davet gönder |
| `/api/group/cleanup` | POST | Grubu temizle |
| `/api/groups` | GET | Grupları listele |

### Numara
| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/numbers/add` | POST | Tek numara ekle |
| `/api/numbers/add-bulk` | POST | Toplu numara ekle |
| `/api/numbers/remove` | POST | Numara sil |

### Mesaj
| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/message/send` | POST | Tek mesaj gönder |
| `/api/message/send-bulk` | POST | Toplu mesaj gönder |

## 🛡️ Güvenlik Özellikleri

### Ban Koruması
- **Rastgele Gecikmeler**: Her mesaj arasında 3-8 saniye bekleme
- **Günlük Limit**: Maksimum 50 davet/gün
- **Mesaj Varyasyonları**: 4 farklı mesaj şablonu
- **Numara Doğrulama**: Kayıtlı olmayan numaralar atlanır

### Teknik Güvenlik
- Session izolasyonu
- CORS koruması
- Hata yakalama ve loglama

## 📁 Proje Yapısı

```
Kayra_WPbot_web/
├── server.js           # Ana sunucu dosyası
├── sessionManager.js   # WhatsApp session yönetimi
├── package.json        # Bağımlılıklar
├── public/             # Frontend dosyaları
│   ├── index.html      # Ana sayfa
│   ├── style.css       # Stiller
│   └── script.js       # Frontend JavaScript
└── sessions/           # Session verileri (otomatik oluşturulur)
```

## ⚠️ Önemli Notlar

1. **WhatsApp Politikaları**: Bu bot eğitim amaçlıdır. WhatsApp'ın kullanım koşullarını ihlal etmemeye dikkat edin.

2. **Ban Riski**: Toplu mesaj gönderimi hesabınızın banlanmasına yol açabilir. Güvenlik ayarlarını kullanın.

3. **Numara Formatı**: Türkiye numaraları için başında 0 veya 90 olup olmadığı önemli değil, sistem otomatik düzeltir.

## 🐛 Bilinen Sorunlar ve Çözümler

### markedUnread Hatası
WhatsApp Web güncellemelerinden kaynaklanan bu hata, URL navigasyonu yöntemiyle çözülmüştür.

### Port Kullanımda
```bash
fuser -k 3000/tcp
node server.js
```

## 📝 Lisans

MIT License - Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing`)
3. Commit edin (`git commit -m 'Add amazing feature'`)
4. Push edin (`git push origin feature/amazing`)
5. Pull Request açın

---

<p align="center">
  <b>Kayra Technology</b> tarafından ❤️ ile geliştirildi
</p>
