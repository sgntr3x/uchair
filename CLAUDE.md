# uChair: tasarım kuralları

Düz HTML/CSS/JS PWA. Derleme yok, çerçeve yok. UI `src/ui.js` içindeki `h()` ile kurulur.
İkonlar `src/icons.js` içinde 24x24 stroke SVG. Tüm tasarım değerleri `src/style.css` `:root` içinde.

## Yön
Vintage berber dükkânı: krem kâğıt, mürekkep siyahı, direk kırmızısı/mavisi.
Kalın 2px çizgi, sert ofset gölge, küçük yarıçap. Düz, basılı, el yapımı hissi.

## Zorunlu
- Hex renk, px font-size, px boşluk veya px radius'u bileşende ASLA yazma. Sadece `var(--...)`.
  Yeni değer gerekiyorsa önce `:root`'a ekle, sonra kullan.
- Başlık, saat ve büyük sayılar `--display`. Gövde `--body`. Fiyat ve slot saatleri `--mono`.
- Ana aksiyon (Randevu al) = kırmızı dolgu + `--bw` çizgi + `--shadow`. Ekranda tek ana buton.
- İkincil vurgu mavi. Kırmızı ve mavi yan yana sadece direk motifinde (şerit, rozet).
- Basılma durumu: `transform: translate(3px,3px); box-shadow: var(--shadow-press)`.
- Dokunma hedefi en az `--tap`. Alt navigasyon `padding-bottom: var(--safe-b)`.
- Sadece `icons.js` içindeki ikonlar. Yeni ikon gerekirse oraya 24x24, stroke-width 1.75, `currentColor` ile ekle.
- `prefers-reduced-motion` altında animasyonları kapat.
- Boş durumlar ve metinler berber ağzıyla ve Türkçe ("Koltuk boş", "Sıra sende").
- Fontlar `/fonts/` içinde woff2, `sw.js` önbelleğinde. Google Fonts linki YOK (PWA offline'da düşer).

## Yasak
- Gradient (özellikle mor/mavi), glassmorphism, blur, neon. Şerit/tarama desenleri inline SVG pattern ile yapılır.
- Inter, Roboto, Arial, sistem fontu başlıkta.
- Emoji ikon.
- Her şeyi gölgeli yuvarlak beyaz karta sarma. Çizgi, boşluk ve tipografiyle grupla.
- Ortalanmış "Hoş geldin 👋" tarzı jenerik başlıklar.
- Tek tip kart grid'i. Hiyerarşi için ölçek farkı kullan (büyük saat, küçük etiket).
- Stok görsel veya placeholder gradient avatar.

## Çalışma şekli
- Bir seferde tek ekran. Bitince 390x844 viewport'ta screenshot al, kendini eleştir, düzelt.
- Değişiklik sonunda hangi `var()`'lar eklendi/kullanıldı kısaca yaz.

## uChair'e özel notlar
- Bu, berberin kendi kullandığı iç araç: dolu saatlerde müşteri adı ve işlemler okunur kalmalı (soluk/üstü çizili yapma).
- Gün sayfasında saat kutuları 2 sütun (3 sütunda isimler sığmıyor).
- Veri sadece telefonda (IndexedDB). Sunucu/hesap yok. 1 aydan eski randevular açılışta silinir.
- Test: `npm test` (çekirdek mantık). Arayüz: `npm start` → http://localhost:5173
