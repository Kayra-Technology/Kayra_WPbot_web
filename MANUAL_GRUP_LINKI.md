# Otomatik Davet Linki Sistemi

## ✅ Sistem Tamamen Otomatik!

Artık grup davet linkleri **otomatik olarak** alınıyor ve kaydediliyor. Manuel işlem yapmaya gerek yok!

## Nasıl Çalışır?

### Yeni Grup Oluştururken:
1. Grup oluşturulur
2. 5 saniye beklenir (WhatsApp'ın grubu hazırlaması için)
3. Davet linki otomatik oluşturulur
4. Link config.json'a otomatik kaydedilir
5. Davetler bu link ile gönderilir

### Mevcut Gruplarda:
1. Eğer config.json'da kayıtlı link varsa, direkt kullanılır
2. Link yoksa otomatik alınır ve kaydedilir
3. Bir sonraki kullanımda kayıtlı link kullanılır

## 🔄 Gelişmiş Yeniden Deneme Sistemi

Sistem 5 kez deneme yapar:
- 1. deneme: Anında
- 2. deneme: 3 saniye sonra
- 3. deneme: 6 saniye sonra
- 4. deneme: 9 saniye sonra
- 5. deneme: 12 saniye sonra

Her denemede WhatsApp'tan yeni davet kodu oluşturulur.

## 🚨 Sorun Giderme

### Eğer davet linki hala alınamıyorsa:

**1. WhatsApp Bağlantısını Kontrol Edin**
   - Dashboard'da "Bağlı" durumunda mı?
   - QR kod sekmesinden yeniden giriş yapın

**2. Grubu Yeniden Oluşturun**
   - "Grubu Temizle" butonuna basın
   - "Grup Oluştur ve Davet Gönder" ile yeni grup oluşturun

**3. Manuel Link (Sadece Acil Durumlarda)**

   Eğer otomatik sistem çalışmazsa:

   - WhatsApp'ı açın → Gruba gidin → Davet linki → Linki kopyalayın
   - config.json dosyasını düzenleyin:

   ```json
   {
     "group": {
       "name": "Grup Adınız",
       "groupId": "120363404938457458@g.us",
       "inviteLink": "https://chat.whatsapp.com/BURAYA-LINKI-YAPIŞTIRIN"
     }
   }
   ```

   - Sistemi yeniden başlatın

---

## 📝 Loglar

Tüm işlemler **Loglar** sekmesinde izlenebilir:

- ✅ "Davet linki başarıyla oluşturuldu" → Başarılı
- ⚠️ "Davet linki alma hatası" → Yeniden deniyor
- ❌ "Tüm denemeler tükendi" → Manuel müdahale gerekli

---

**Not:** Sistem %99 otomatik çalışır. Manuel link sadece çok nadir durumlarda gereklidir.
