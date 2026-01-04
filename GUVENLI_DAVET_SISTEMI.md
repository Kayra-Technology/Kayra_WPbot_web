# Güvenli Toplu Davet Sistemi Kullanım Kılavuzu

## WhatsApp'tan Ban Yememek İçin Geliştirilen Özellikler

Bu güncellemede WhatsApp'tan ban yememek için aşağıdaki güvenlik özellikleri eklenmiştir:

### 🔒 Güvenlik Özellikleri

1. **Rastgele Gecikme Süreleri**
   - Her mesaj arasında 3-8 saniye rastgele bekleme
   - Botların davranış kalıbını kırmak için tasarlandı

2. **Progresif Gecikme**
   - Her 10 mesajda bir gecikme süresi 1 saniye artırılır
   - Uzun listeler için daha güvenli

3. **Günlük Limit Kontrolü**
   - Varsayılan: Günde maksimum 50 davet
   - Ayarlanabilir limit (config dosyasından)
   - Limit dolduğunda otomatik durma

4. **Mesaj Varyasyonları**
   - 4 farklı mesaj şablonu
   - Her davette rastgele bir mesaj seçilir
   - Spam algılamasını engeller

5. **Davet Takibi**
   - Hangi numaraya ne zaman gönderildiği kaydedilir
   - Tekrar gönderim önlenir
   - İstatistiksel takip

## 📋 Kullanım

### 1. Sunucuyu Başlatma

```bash
cd /home/tugmirk/Downloads/Kayra_wp_bot-main\(1\)/Kayra_wp_bot-main/
npm start
```

### 2. Web Arayüzüne Giriş

Tarayıcınızda açın: `http://localhost:3000`

### 3. WhatsApp Bağlantısı

1. **QR Kod** sekmesine gidin
2. WhatsApp uygulamanızla QR kodu tarayın
3. Bağlantı kurulana kadar bekleyin

### 4. Toplu Numara Ekleme

**Numaralar** sekmesinde:

#### Seçenek A - Satır satır:
```
905321234567
905329876543
905331111111
```

#### Seçenek B - Virgülle ayrılmış:
```
905321234567, 905329876543, 905331111111
```

#### Seçenek C - Karışık format (otomatik temizlenir):
```
+90 532 123 45 67
0532 987 65 43
905331111111
```

"📋 Toplu Ekle" butonuna tıklayın.

### 5. Güvenli Davet Gönderme

**Gruplar** sekmesinde:

1. "Grup Oluştur" - İlk kullanımda grubu oluşturun
2. "Davet Gönder" - Güvenli mod ile davet başlatın

Bot şunları yapacak:
- ✓ Her numaraya rastgele 3-8 saniye aralıklarla mesaj gönderir
- ✓ Her 10 mesajda gecikmeyi artırır
- ✓ Günlük 50 davet limitini kontrol eder
- ✓ 4 farklı mesaj şablonundan birini kullanır
- ✓ Hata durumunda 10 saniye bekler

### 6. İstatistikleri İzleme

**Numaralar** sekmesinde "📊 Davet İstatistikleri" bölümünde:
- Toplam numara sayısı
- Bugün gönderilen davet sayısı
- Kalan günlük limit
- Günlük maksimum limit

## ⚙️ Güvenlik Ayarları

`config.json` dosyasındaki `safetySettings` bölümünü düzenleyebilirsiniz:

```json
"safetySettings": {
  "minDelay": 3000,        // Minimum bekleme süresi (ms)
  "maxDelay": 8000,        // Maksimum bekleme süresi (ms)
  "dailyLimit": 50,        // Günlük maksimum davet
  "messageVariations": true // Mesaj varyasyonlarını kullan
}
```

### Önerilen Ayarlar

**Çok Güvenli Mod** (Yeni hesaplar için):
```json
"safetySettings": {
  "minDelay": 5000,
  "maxDelay": 15000,
  "dailyLimit": 30,
  "messageVariations": true
}
```

**Normal Mod** (Eski hesaplar için):
```json
"safetySettings": {
  "minDelay": 3000,
  "maxDelay": 8000,
  "dailyLimit": 50,
  "messageVariations": true
}
```

**Hızlı Mod** (Riskli - sadece test için):
```json
"safetySettings": {
  "minDelay": 2000,
  "maxDelay": 5000,
  "dailyLimit": 100,
  "messageVariations": true
}
```

## 🚨 Ban Riskini Azaltma İpuçları

1. **Yeni Hesaplarda Dikkatli Olun**
   - İlk hafta günde 20-30 davet ile başlayın
   - Hesap yaşlandıkça limiti artırın

2. **Doğal Davranın**
   - Sadece bot kullanmayın, normal mesajlar da gönderin
   - Gece yarısı davet göndermekten kaçının
   - Haftada bir gün ara verin

3. **Limitlere Dikkat Edin**
   - Günlük limiti aşmayın
   - Saatte 20-25 davetten fazla göndermeyin
   - Aynı kişiye tekrar davet göndermeyin

4. **Grup Ayarları**
   - Grubun "Herkes ekleyebilir" ayarını kapatın
   - Sadece adminlerin mesaj göndermesine izin verin
   - Grup kuralları ekleyin

5. **Hesap Güvenliği**
   - 2 faktörlü doğrulamayı aktif edin
   - İş numarası kullanmayın (mümkünse)
   - VPN kullanmayın (WhatsApp şüphelenir)

## 📊 API Endpoints

Yeni eklenen endpoint'ler:

### Toplu Numara Ekleme
```bash
POST /api/numbers/add-bulk
Content-Type: application/json

{
  "numbers": "905321234567\n905329876543\n905331111111"
}
```

### İstatistikleri Görüntüleme
```bash
GET /api/invite-stats
```

Yanıt:
```json
{
  "success": true,
  "stats": {
    "today": {
      "date": "2026-01-04",
      "count": 15
    },
    "dailyLimit": 50,
    "remainingToday": 35,
    "totalNumbers": 120,
    "inviteHistory": { ... }
  }
}
```

### Güvenlik Ayarlarını Güncelleme
```bash
POST /api/safety-settings
Content-Type: application/json

{
  "minDelay": 5000,
  "maxDelay": 10000,
  "dailyLimit": 40
}
```

### Davet Geçmişini Temizleme
```bash
POST /api/invite-history/clear
```

## 🔧 Sorun Giderme

### Davet gönderilmiyor
- WhatsApp bağlantısının aktif olduğunu kontrol edin
- Günlük limitin dolmadığını kontrol edin
- Logları kontrol edin (Loglar sekmesi)

### Numara formatı hatalı
- Numaralar otomatik temizlenir
- 5XXXXXXXXX formatındaki numaralara 90 eklenir
- Tüm boşluk ve özel karakterler temizlenir

### Günlük limit doldu
- Bir sonraki gün otomatik sıfırlanır
- `config.json`'dan limiti artırabilirsiniz (dikkatli olun!)
- `/api/invite-history/clear` ile manuel sıfırlama yapabilirsiniz

## 📝 Loglar

Tüm işlemler **Loglar** sekmesinde gerçek zamanlı olarak izlenebilir:
- ✓ Başarılı davetler (yeşil)
- ✗ Başarısız davetler (kırmızı)
- ⚠ Uyarılar (sarı)
- ℹ Bilgilendirme mesajları (mavi)

## ⚠️ Önemli Uyarılar

1. Bu bot WhatsApp'ın resmi API'sini kullanmaz
2. WhatsApp kullanım şartlarını ihlal edebilir
3. Hesabınızın yasaklanma riski vardır
4. Kendi sorumluluğunuzda kullanın
5. Ticari kullanım önerilmez

## 📞 Destek

Sorun yaşıyorsanız:
1. Bu dosyayı dikkatlice okuyun
2. Logları kontrol edin
3. `config.json` ayarlarını gözden geçirin
4. Gerekirse sunucuyu yeniden başlatın

---

**Son Güncelleme:** 2026-01-04
**Versiyon:** 2.0 - Güvenli Toplu Davet Sistemi
