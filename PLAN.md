# uChair – Berber Randevu Uygulaması: Proje Planı

## Teknoloji kararı
**PWA (Progressive Web App)** – düz HTML/CSS/JS, derleme adımı yok.
- iPhone 11'de Safari ile açılır → "Ana Ekrana Ekle" → normal uygulama gibi çalışır.
- App Store, Apple Developer hesabı (99$/yıl) gerekmez.
- Offline çalışır (Service Worker), veri telefonda (IndexedDB) tutulur.
- Hızlı arayüz: telefonda tek elle, telefon konuşurken kullanılacak.

## Veri modeli
- `customers`: id, name, phone, note
- `appointments`: id, customerId, date (YYYY-MM-DD), time (HH:MM), note, createdAt
- `settings`: çalışma saatleri (gün bazlı), randevu süresi (60 dk), kapalı günler, tatil günleri

## Fazlar

### Faz 0 – Temel ✅
- Proje iskeleti, PWA kabuğu (manifest, service worker, ikon)
- Veri katmanı (IndexedDB) + ayarlar
- Çekirdek mantık (saf fonksiyonlar, testli): boş slot bulma, en yakın boş yer, bir tarihe en yakın önce/sonra günler
- Testler: `node --test`

### Faz 1 – Ana sayfa: "En yakın boş saatler" ✅
- Alt kısımda en yakın boş saatlerin listesi (gün + saat)
- Bir saate tek dokunuş → müşteri seç → randevu kaydedilir
- Müşteri arama (isim/numara), seçince randevuya işlenir

### Faz 2 – Müşteriler ✅
- Müşteri ekle/düzenle/sil (isim + numara)
- Randevu sırasında yerinde "yeni müşteri ekle" (aramada bulunamazsa)
- Müşteri geçmişi (son randevuları)

### Faz 3 – Takvim ve tarih sorgusu ✅
- Aylık takvim görünümü (dolu/boş yoğunluk işaretli)
- Tarihe dokun → o günün saat listesi (dolu: müşteri adı, boş: dokun ve ekle)
- **Günü kapat (tatil/izin):** tarihe dokun → "Bu günü kapat" → o gün hiç önerilmez; tekrar açılabilir (closedDates)
- Gün doluysa: seçilen tarihe en yakın **önceki/sonraki** boş günler listelenir (±, mesafe "1 gün önce / 2 gün sonra")

### Faz 4 – Randevu yönetimi ✅
- Randevu iptal / taşıma / not düzenleme
- Geri al (yanlışlıkla silmeye karşı)
- Müşteriyi ara butonu (`tel:`), WhatsApp mesaj butonu

### Faz 5 – Ayarlar ve güvenlik ✅
- Çalışma saatleri, kapalı gün (ör. pazar), öğle arası, özel tatil/izin günleri
- 1 aydan eski randevular açılışta otomatik silinir (müşteriler kalır) – Faz 0'da yapıldı
- Yedekleme: JSON dışa/içe aktar (paylaş menüsüyle iCloud/WhatsApp'a)
- Eski Notlar uygulamasındaki randevuları içe aktarma (yapıştır → ayrıştır)

### Faz 6 – Yayın ve cilâ (karar bekliyor)
- Ücretsiz hosting (GitHub Pages / Cloudflare Pages), HTTPS
- Ana ekrana ekleme rehberi, ikon, açılış ekranı
- iPhone 11 üzerinde gerçek test, büyük dokunma alanları, koyu mod

### Faz 7 – Online randevu (v2) ✅ (VPS'e kurulum bekliyor)
- Aynı repo: `server/` (Node, bağımlılıksız, SQLite) + `book/` (müşteri sayfası). `src/` ve fontlar ortak.
- `/` müşteri sayfası, `/admin/` berber uygulaması (şifreli), veri sunucuda. `npm start` hâlâ v1 (yerel).
- Kurallar (`src/core.js`, testli): telefon zorunlu (TR cep), bir numaranın aynı anda en fazla 1 bekleyen randevusu (saati gelince hak döner), en fazla 14 gün ilerisi, en az X dk önceden.
- Müşteri girişi: açılışta numara ekranı → SMS kodu → takvim. Yeni müşteri "Müşteri kaydı" ile isim + numara + kod. Randevusu varsa "Randevum" ekranı (saat değiştir / iptal), yoksa takvim. Randevu alırken tekrar doğrulama yok.
- SMS sağlayıcısı takılabilir (`server/sms.js`: console, netgsm, twilio, webhook). Canlı SMS için sağlayıcı hesabı gerekir.
- Kurulum: `server/README.md`.

### Faz 8 – Yönetim ✅
- Ayarlar başlık butonlarıyla açılır; kapalı günler takvimden seçilir.
- Randevuda "Randevuya gelmedi" işareti. Ayarlar → Ceza: gelmeyenler listesi; 1 hafta / 1 ay / 3 ay / süresiz ceza. Cezalı numara online randevu alamaz ve saat taşıyamaz (sunucu zorlar); berber elle eklerken uyarılır.
- Sunucu (sadece online): her gece 00:00'da `data/backups/` altına SQLite yedeği, son 30 tutulur. Yerel (offline) sürüm etkilenmez.

## Notlar / eksikler / öneriler
1. **Veri kaybı riski**: iOS, tarayıcı verisini silebilir (Safari verisini temizleme, uzun süre kullanmama). Ana ekrana eklenmiş PWA daha güvenli ama yine de **otomatik yedek hatırlatması** şart (Faz 5). `navigator.storage.persist()` istenecek.
2. **Eşzamanlı çift rezervasyon**: Tek kullanıcı olduğu için sorun yok; ama aynı slota iki kez kayıt engellenecek.
3. **Çalışma saatleri**: Kullanıcıya sorulacak – kaçta açıyor/kapatıyor, öğle arası, hangi gün kapalı? Şimdilik varsayılan 09:00–24:00 (15 slot/gün), her gün açık (ayarlanabilir).
4. **Geçmiş saatler**: Bugün için saati geçmiş slotlar "boş" gösterilmemeli.
5. **Hızlı müşteri arama**: Türkçe karakter duyarsız arama (ş/s, ı/i, ğ/g) ve numaranın son 4 hanesiyle arama.
6. **İleride (opsiyonel)**: Randevu hatırlatma mesajı (WhatsApp linki), müşteriye "gelmedi" işareti, farklı hizmet süreleri (saç 1 saat, sakal 30 dk), gün sonu özet, birden fazla cihaz senkronu (bulut gerekir).
7. **Bildirim**: iOS PWA push destekliyor (iOS 16.4+) ama sunucu gerekir; ilk sürümde kapsam dışı.
8. **Sorular**: Randevu süresi hep 1 saat mi? Berber haftada kaç gün çalışıyor? Randevusu olan biri gelmeyince ne oluyor (no-show takibi)?
