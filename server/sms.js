// SMS gönderici: sağlayıcıdan bağımsız arayüz. SMS_PROVIDER ortam değişkeniyle seçilir.
//   console  (varsayılan) kodu sunucu loguna yazar, gerçek SMS gitmez: sadece geliştirme için
//   netgsm   NETGSM_USER, NETGSM_PASS, NETGSM_HEADER (onaylı gönderici başlığı)
//   twilio   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
//   webhook  SMS_WEBHOOK_URL, (ops.) SMS_WEBHOOK_TOKEN: herhangi bir sağlayıcıya köprü için
// send(phone10, text): phone10 = 10 haneli cep numarası (5XXXXXXXXX). Hata olursa Error fırlatır.

const need = (env, ...names) => {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error(`SMS_PROVIDER için eksik ayar: ${missing.join(', ')}`);
};

const adapters = {
  console: () => ({ send: async (phone, text) => { console.log(`[SMS:console] 0${phone} → ${text}`); } }),

  // Netgsm REST v2 (Basic auth). Canlı hesapla doğrulanmadı: ayrıntı için Netgsm API dokümanına bak.
  netgsm: (env, fetchFn) => {
    need(env, 'NETGSM_USER', 'NETGSM_PASS', 'NETGSM_HEADER');
    const auth = 'Basic ' + Buffer.from(`${env.NETGSM_USER}:${env.NETGSM_PASS}`).toString('base64');
    return {
      send: async (phone, text) => {
        const res = await fetchFn('https://api.netgsm.com.tr/sms/rest/v2/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: auth },
          body: JSON.stringify({ msgheader: env.NETGSM_HEADER, encoding: 'TR', messages: [{ msg: text, no: phone }] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || String(data.code) !== '00') throw new Error(`Netgsm hatası: ${res.status} ${JSON.stringify(data)}`);
      },
    };
  },

  // Twilio Messages API. Canlı hesapla doğrulanmadı.
  twilio: (env, fetchFn) => {
    need(env, 'TWILIO_SID', 'TWILIO_TOKEN', 'TWILIO_FROM');
    const auth = 'Basic ' + Buffer.from(`${env.TWILIO_SID}:${env.TWILIO_TOKEN}`).toString('base64');
    return {
      send: async (phone, text) => {
        const res = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: auth },
          body: new URLSearchParams({ To: `+90${phone}`, From: env.TWILIO_FROM, Body: text }),
        });
        if (!res.ok) throw new Error(`Twilio hatası: ${res.status} ${await res.text().catch(() => '')}`);
      },
    };
  },

  // Kendi köprün: POST {to:'+905XXXXXXXXX', text:'...'} (Authorization: Bearer <token>). 2xx = gönderildi.
  webhook: (env, fetchFn) => {
    need(env, 'SMS_WEBHOOK_URL');
    return {
      send: async (phone, text) => {
        const res = await fetchFn(env.SMS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(env.SMS_WEBHOOK_TOKEN ? { authorization: `Bearer ${env.SMS_WEBHOOK_TOKEN}` } : {}) },
          body: JSON.stringify({ to: `+90${phone}`, text }),
        });
        if (!res.ok) throw new Error(`SMS webhook hatası: ${res.status}`);
      },
    };
  },
};

export function createSms(env = process.env, fetchFn = fetch) {
  const provider = (env.SMS_PROVIDER || 'console').toLowerCase();
  if (!adapters[provider]) throw new Error(`Bilinmeyen SMS_PROVIDER: ${provider} (${Object.keys(adapters).join(', ')})`);
  return { provider, ...adapters[provider](env, fetchFn) };
}
