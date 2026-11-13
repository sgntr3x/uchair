# uChair sunucusu (online sürüm)

Node >= 22.13, bağımlılık yok. Veri: `data/uchair.db` (SQLite). Yedek için bu dosyayı kopyalaman yeter.

```
UCHAIR_USER=kullanici UCHAIR_PASSWORD=güçlü-bir-şifre PORT=3000 node server/index.js
```
- Müşteri linki: `https://alanadin.com/`  · Berber: `https://alanadin.com/admin/` (telefonda "Ana Ekrana Ekle")
- Ortam değişkenleri (SMS ayarları aşağıda): `UCHAIR_USER` ve `UCHAIR_PASSWORD` (berber girişi; ayarlanmazsa **admin / admin** açılır, canlıda mutlaka değiştir), `PORT` (3000), `HOST` (127.0.0.1), `UCHAIR_DATA` (./data), `TRUST_PROXY=1` (nginx arkasında IP için), `UCHAIR_SECRET` (isteğe bağlı; yoksa data/secret üretilir)
- Uygulama sadece 127.0.0.1'i dinler; internete nginx/Caddy + HTTPS ile aç.

## systemd (`/etc/systemd/system/uchair.service`)
```
[Unit]
Description=uChair
After=network.target

[Service]
WorkingDirectory=/srv/uchair
Environment=UCHAIR_USER=BURAYA_KULLANICI
Environment=UCHAIR_PASSWORD=BURAYA_ŞİFRE
Environment=TRUST_PROXY=1
Environment=PORT=3000
ExecStart=/usr/bin/node server/index.js
Restart=always
User=uchair

[Install]
WantedBy=multi-user.target
```

## Caddy (HTTPS otomatik)
```
alanadin.com {
  reverse_proxy 127.0.0.1:3000
}
```

## SMS doğrulama
Müşteri girişi ve kaydı numaraya giden 6 haneli kodla yapılır (kod 5 dk geçerli, 60 sn'de bir yeniden istenir, 5 yanlışta kilitlenir).
Sağlayıcı `SMS_PROVIDER` ile seçilir. Varsayılan `console`: **gerçek SMS gitmez**, kod sadece sunucu loguna yazılır (geliştirme için).

| SMS_PROVIDER | Gerekli değişkenler |
|---|---|
| `console` | yok (kod log'a yazılır) |
| `netgsm` | `NETGSM_USER`, `NETGSM_PASS`, `NETGSM_HEADER` (onaylı gönderici başlığı) |
| `twilio` | `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` |
| `webhook` | `SMS_WEBHOOK_URL`, isteğe bağlı `SMS_WEBHOOK_TOKEN` (POST `{to:'+905XXXXXXXXX', text}`) |

Diğer: `SMS_DAILY_LIMIT` (günlük toplam SMS tavanı, varsayılan 300; maliyet ve kötüye kullanım koruması).
Netgsm ve Twilio bağdaştırıcıları sahte istemciyle test edildi, **canlı hesapla denenmedi**: ilk gerçek SMS'te sağlayıcı dokümanıyla karşılaştır.
Başka bir sağlayıcı (İleti Merkezi, Verimor vb.) için `server/sms.js` içine ~15 satırlık yeni bir adaptör eklemek yeterli.

Servis dosyasına ekle: `Environment=SMS_PROVIDER=netgsm` ve diğer değişkenler.
