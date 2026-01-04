# 🚀 WhatsApp Grup Davet Botu - Kullanım Kılavuzu

## ✨ Basitleştirilmiş Sistem

Sistem tamamen yenilendi! Artık **tek bir yerden** tüm işlemleri yapabilirsiniz.

---

## 📋 Hızlı Başlangıç

### 1. Sunucuyu Başlatın
```bash
cd /home/tugmirk/Downloads/Kayra_wp_bot-main\(1\)/Kayra_wp_bot-main/
npm start
```

### 2. Web Arayüzünü Açın
```
http://localhost:3000
```

### 3. WhatsApp'a Bağlanın
- **QR Kod** sekmesine git
- Telefonunuzla QR kodu tara
- Bağlantı kurulana kadar bekle
- Dashboard'da bağlı numara görünecek

---

## 🎯 Tek Tuşla Grup Oluştur

### **Grup Oluştur** Sekmesinde:

1. **Grup Adı** girin
   ```
   Örnek: IDA Eğitim Grubu
   ```

2. **Numaraları** yapıştırın (Her satıra bir numara veya virgülle):
   ```
   905321234567
   905329876543
   905331111111
   ```

   veya

   ```
   905321234567, 905329876543, 905331111111
   ```

   **Desteklenen formatlar:**
   - `905321234567` ✅
   - `5321234567` ✅ (otomatik 90 eklenir)
   - `+90 532 123 45 67` ✅ (otomatik temizlenir)
   - `0532 123 45 67` ✅ (otomatik temizlenir)

3. **"🚀 Grup Oluştur ve Davet Gönder"** butonuna tıkla

4. İşlem otomatik başlar:
   - ✅ Numaralar işlenir ve kaydedilir
   - ✅ Grup oluşturulur
   - ✅ Güvenli mod ile davetler gönderilir
   - ✅ Her işlem loglanır

5. **Loglar** sekmesinden ilerlemeyi takip edin

---

## 📊 Dashboard

Dashboard'da görebilecekleriniz:

### WhatsApp Bağlantı Bilgileri
- Bağlı WhatsApp numarası
- Hesap adı

### İstatistikler
- **Bugün Gönderilen**: Bugün kaç davet gönderildi
- **Kalan Limit**: Bugün için kalan davet hakkı
- **Günlük Limit**: Maksimum günlük davet sayısı

---

## ⚙️ Güvenlik Özellikleri (Otomatik Aktif)

Sistem **WhatsApp ban'ı engellemek** için şu önlemleri otomatik alır:

✅ **Rastgele Gecikme**: Her mesaj arası 3-8 saniye
✅ **Progresif Gecikme**: Her 10 mesajda gecikme 1 saniye artırılır
✅ **Günlük Limit**: Varsayılan 50 davet/gün
✅ **4 Farklı Mesaj**: Spam algılamasını engeller
✅ **Otomatik Takip**: Tüm davetler kaydedilir

---

## 🔧 Ek İşlemler

**Grup Oluştur** sekmesinin altında:

### 🧹 Grubu Temizle
- Gruptan tüm üyeleri çıkarır (siz hariç)
- Hafta sonları grup yenilemek için kullanılır

### 🔗 Davet Linki Al
- Grubun davet linkini kopyalar
- Manuel paylaşım için kullanılır

---

## 📝 Loglar

**Loglar** sekmesinde tüm işlemler gerçek zamanlı izlenir:

- ✅ **Yeşil**: Başarılı işlemler
- ❌ **Kırmızı**: Hatalar
- ⚠️ **Sarı**: Uyarılar
- ℹ️ **Mavi**: Bilgilendirme

---

## 💡 İpuçları

### Ban Riskini Azaltma

✅ **Yapılması Gerekenler:**
- Günlük 30-50 davet ile başla
- Normal saatlerde (09:00-21:00) gönder
- Hesabı normal kullanımda da kullan
- Gruplara katılan kişileri kaldırma

❌ **Yapılmaması Gerekenler:**
- Günde 100+ davet gönderme
- Gece yarısı toplu davet
- Aynı kişiye tekrar davet
- Yeni hesaplarda yüksek limit

### Numara Formatları

Tüm formatlar kabul edilir ve otomatik düzeltilir:
- `905321234567` → `905321234567` ✅
- `5321234567` → `905321234567` ✅
- `+90 532 123 45 67` → `905321234567` ✅
- `0532 123 45 67` → `905321234567` ✅

### Günlük Limit Ayarlama

[config.json](config.json) dosyasından değiştirebilirsiniz:

```json
"safetySettings": {
  "minDelay": 3000,
  "maxDelay": 8000,
  "dailyLimit": 50,
  "messageVariations": true
}
```

**Önerilen limitler:**
- Yeni hesap: 20-30 davet/gün
- Normal hesap: 40-50 davet/gün
- Eski hesap: 50-70 davet/gün

---

## 🚨 Sorun Giderme

### Davet gönderilmiyor
1. WhatsApp bağlantısını kontrol edin (Dashboard)
2. Günlük limitin dolmadığını kontrol edin
3. Logları kontrol edin

### QR kod görünmüyor
1. Sunucuyu yeniden başlatın
2. `.wwebjs_auth` klasörünü silin
3. Tekrar QR kodu tarayın

### Grup oluşturulamıyor
1. WhatsApp bağlantısının aktif olduğunu kontrol edin
2. İnternet bağlantınızı kontrol edin
3. Loglardan hata mesajını kontrol edin

---

## 📞 Özellikler

### ✅ Yapabilecekleriniz
- Tek tuşla grup oluştur ve davet gönder
- Toplu numara ekle (satır satır veya virgülle)
- Güvenli mod ile ban koruması
- Gerçek zamanlı log takibi
- İstatistik izleme
- Grubu temizleme

### ❌ Kaldırılan Özellikler
- ~~Numara yönetimi sekmesi~~ (artık gerekli değil)
- ~~Mesaj gönderme sekmesi~~ (gereksiz)
- ~~Zamanlama sekmesi~~ (gereksiz)

Tüm işlemler **Grup Oluştur** sekmesinde tek yerden yapılıyor!

---

## 🎬 Kullanım Senaryosu

```
1. QR Kod sekmesi → WhatsApp'a bağlan
2. Dashboard → Bağlantıyı kontrol et
3. Grup Oluştur sekmesi:
   - Grup adı: "IDA Eğitim"
   - Numaralar: 50 kişi yapıştır
   - Buton: "Grup Oluştur ve Davet Gönder"
4. Loglar sekmesi → İlerlemeyi izle
5. İşlem tamamlandı! ✅
```

**Süre:** Yaklaşık 3-5 dakika (50 kişi için)

---

## ⚠️ Önemli Uyarılar

1. Bu bot WhatsApp'ın resmi API'sini kullanmaz
2. Hesabınızın yasaklanma riski vardır
3. Kendi sorumluluğunuzda kullanın
4. Ticari kullanım önerilmez
5. WhatsApp kullanım şartlarını ihlal edebilir

---

## 📄 Dosya Yapısı

```
├── server.js           # Ana sunucu (güvenlik özellikleri dahil)
├── config.json         # Ayarlar ve güvenlik parametreleri
├── public/
│   ├── index.html      # Web arayüzü (sadece 3 sekme)
│   └── app.js          # Frontend mantığı
└── .wwebjs_auth/       # WhatsApp oturum verileri
```

---

**Versiyon:** 3.0 - Basitleştirilmiş Tek Tuş Sistemi
**Son Güncelleme:** 2026-01-04

**Hazır! Artık tek bir yerden tüm işlemlerinizi yapabilirsiniz.** 🎉
