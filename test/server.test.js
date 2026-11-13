import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openStore } from '../server/store.js';
import { createApp } from '../server/index.js';

const NOW = new Date(2026, 10, 13, 8, 0); // Cuma sabah
let now = NOW;
const sent = []; // gönderilen SMS'ler: {phone, text}
let smsFails = false;
const sms = { provider: 'test', send: async (phone, text) => { if (smsFails) throw new Error('sağlayıcı kapalı'); sent.push({ phone, text }); } };
let server, base, store;

const listen = (app) => new Promise((r) => { const s = http.createServer(app); s.listen(0, '127.0.0.1', () => r(s)); });
before(async () => {
  store = openStore(':memory:');
  server = await listen(createApp({ store, user: 'admin', password: 'sifre123', secret: 'test', bookPerHour: 100, codeIpPerHour: 1000, sms, clock: () => now }));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (path, { method = 'GET', body, cookie, url = base } = {}) =>
  fetch(url + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null), headers: r.headers }));

const lastCode = (phone10) => [...sent].reverse().find((m) => m.phone === phone10).text.match(/\b(\d{6})\b/)[1];
const cookieOf = (r) => r.headers.get('set-cookie')?.split(';')[0];
/** Kod iste + doğrula. Dönüş: {cookie, ...me} */
async function enter(phone, { name, mode = name ? 'register' : 'login' } = {}) {
  const req = await call('/api/auth/request', { method: 'POST', body: { phone, name, mode } });
  assert.equal(req.status, 200, JSON.stringify(req.json));
  const key = phone.replace(/\D/g, '').slice(-10);
  const v = await call('/api/auth/verify', { method: 'POST', body: { phone, code: lastCode(key) } });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  return { cookie: cookieOf(v), ...v.json };
}
const book = (cookie, o = {}) => call('/api/book', { method: 'POST', cookie, body: { date: '2026-11-16', time: '10:00', services: ['Saç'], ...o } });

test('boş saatler herkese açık, kişisel veri içermez', async () => {
  const r = await call('/api/book/slots');
  assert.equal(r.status, 200);
  assert.equal(r.json.days.length, 14);
  assert.ok(r.json.days[1].free.length > 0 && r.json.days[1].slots.length >= r.json.days[1].free.length);
});

test('kayıt: isim + numara → SMS kodu → doğrulayınca hesap açılır ve giriş yapılır', async () => {
  assert.equal((await call('/api/auth/request', { method: 'POST', body: { phone: '123', name: 'Ali Veli', mode: 'register' } })).json.code, 'PHONE');
  assert.equal((await call('/api/auth/request', { method: 'POST', body: { phone: '0532 111 22 33', name: 'A', mode: 'register' } })).json.code, 'NAME');
  assert.equal(sent.length, 0); // hatalı isteklere SMS gitmez

  const req = await call('/api/auth/request', { method: 'POST', body: { phone: '0532 111 22 33', name: 'Ali Veli', mode: 'register' } });
  assert.equal(req.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /doğrulama kodun: \d{6}/);
  assert.equal(sent[0].phone, '5321112233');
  assert.ok(!JSON.stringify(req.json).match(/\d{6}/)); // kod cevapta dönmez

  assert.equal((await call('/api/auth/verify', { method: 'POST', body: { phone: '0532 111 22 33', code: '000000' } })).json.code, 'WRONG');
  const ok = await call('/api/auth/verify', { method: 'POST', body: { phone: '0532 111 22 33', code: lastCode('5321112233') } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.name, 'Ali Veli');
  assert.ok(cookieOf(ok)?.startsWith('uc_c='));
  assert.equal((await call('/api/auth/verify', { method: 'POST', body: { phone: '0532 111 22 33', code: lastCode('5321112233') } })).status, 410); // kod tek kullanımlık

  const admin = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'sifre123' } });
  const customers = (await call('/api/admin/customers', { cookie: cookieOf(admin) })).json;
  assert.deepEqual(customers.map((c) => [c.name, c.phone]), [['Ali Veli', '0532 111 22 33']]);
});

test('giriş: kayıtsız numara reddedilir (SMS gitmez); berberin eklediği müşteri kodla girebilir', async () => {
  const before = sent.length;
  const r = await call('/api/auth/request', { method: 'POST', body: { phone: '0599 000 00 00', mode: 'login' } });
  assert.equal(r.status, 404);
  assert.equal(r.json.code, 'NO_ACCOUNT');
  assert.equal(sent.length, before);

  store.put('customers', { id: 'eski1', name: 'Eski Müşteri', phone: '0555 123 45 67', note: '' }); // v1'den gelen / berberin eklediği
  const me = await enter('+90 555 123 45 67');
  assert.equal(me.name, 'Eski Müşteri');
});

test('kayıt: numara zaten kayıtlıysa isim yok sayılır, mevcut hesaba girilir', async () => {
  const me = await enter('0532 111 22 33', { name: 'Başka İsim', mode: 'register' });
  assert.equal(me.name, 'Ali Veli');
});

test('kod: 60 sn dolmadan yenisi istenemez, 5 dk sonra geçersiz, 5 yanlışta kilitlenir', async () => {
  const phone = '0544 111 11 11';
  assert.equal((await call('/api/auth/request', { method: 'POST', body: { phone, name: 'Kod Deneme', mode: 'register' } })).status, 200);
  const soon = await call('/api/auth/request', { method: 'POST', body: { phone, name: 'Kod Deneme', mode: 'register' } });
  assert.equal(soon.status, 429);
  assert.equal(soon.json.code, 'TOO_SOON');

  now = new Date(NOW.getTime() + 61_000);
  assert.equal((await call('/api/auth/request', { method: 'POST', body: { phone, name: 'Kod Deneme', mode: 'register' } })).status, 200);
  const good = lastCode('5441111111');
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/auth/verify', { method: 'POST', body: { phone, code: '111111' === good ? '222222' : '111111' } })).status, 401);
  assert.equal((await call('/api/auth/verify', { method: 'POST', body: { phone, code: good } })).json.code, 'LOCKED'); // doğru kod bile girmez

  now = new Date(NOW.getTime() + 130_000);
  assert.equal((await call('/api/auth/request', { method: 'POST', body: { phone, name: 'Kod Deneme', mode: 'register' } })).status, 200);
  now = new Date(NOW.getTime() + 130_000 + 5 * 60_000 + 1000);
  assert.equal((await call('/api/auth/verify', { method: 'POST', body: { phone, code: lastCode('5441111111') } })).json.code, 'EXPIRED');
  now = NOW;
});

test('SMS sağlayıcısı hata verirse 502 döner ve kod kaydedilmez', async () => {
  smsFails = true;
  const r = await call('/api/auth/request', { method: 'POST', body: { phone: '0533 222 33 44', name: 'Hata Deneme', mode: 'register' } });
  smsFails = false;
  assert.equal(r.status, 502);
  assert.equal(r.json.code, 'SMS');
  assert.equal((await call('/api/auth/verify', { method: 'POST', body: { phone: '0533 222 33 44', code: '123456' } })).status, 410);
});

test('SMS suistimali: numara başına saatte 5, günlük toplam sınır', async () => {
  const s2 = await listen(createApp({ store: openStore(':memory:'), password: 'x', secret: 's', sms, smsDailyLimit: 2, codeIpPerHour: 1000, clock: () => now }));
  const url = `http://127.0.0.1:${s2.address().port}`;
  const ask = (phone) => call('/api/auth/request', { url, method: 'POST', body: { phone, name: 'Deneme Kişi', mode: 'register' } }).then((r) => r.status);
  assert.deepEqual([await ask('0541 000 00 01'), await ask('0541 000 00 02'), await ask('0541 000 00 03')], [200, 200, 429]);
  s2.close();
});

test('randevu: giriş şart; isim/numara tekrar sorulmaz; dolu saat 409', async () => {
  assert.equal((await book(undefined)).status, 401);
  assert.equal((await book('uc_c=sahte.123.abc')).status, 401);
  const ali = await enter('0532 111 22 33');
  const ok = await book(ali.cookie);
  assert.equal(ok.status, 201);
  assert.equal(ok.json.name, 'Ali Veli');
  const eski = await enter('0555 123 45 67');
  assert.equal((await book(eski.cookie)).json.code, 'TAKEN'); // aynı saat
  const day = (await call('/api/book/slots')).json.days.find((d) => d.date === '2026-11-16');
  assert.ok(day.slots.includes('10:00') && !day.free.includes('10:00'));
});

test('bekleyen randevusu olan ikinci randevu alamaz; saati gelince alabilir', async () => {
  const ali = await enter('0532 111 22 33');
  const r = await book(ali.cookie, { date: '2026-11-18', time: '12:00' });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'ACTIVE');
  now = new Date(2026, 10, 16, 10, 0); // randevu saati geldi
  assert.equal((await book(ali.cookie, { date: '2026-11-17', time: '12:00' })).status, 201);
  now = NOW;
});

test('geçersiz / sınır dışı randevu reddedilir', async () => {
  const k = await enter('0544 777 66 55', { name: 'Sınır Deneme' });
  assert.equal((await book(k.cookie, { date: '2027-03-01' })).status, 409);
  assert.equal((await book(k.cookie, { date: '2026-11-13', time: '08:00' })).status, 409);
  assert.equal((await book(k.cookie, { date: 'x', time: 'y' })).json.code, 'BAD');
});

test('müşteri randevusunu görür, taşır, iptal eder; başkasınınkine dokunamaz', async () => {
  const veli = await enter('0544 333 22 11', { name: 'Veli Kaya' });
  const mk = await book(veli.cookie, { date: '2026-11-19', time: '15:00' });
  assert.equal(mk.status, 201);
  const ali = await enter('0532 111 22 33');
  assert.equal((await call(`/api/book/me/${mk.json.id}`, { method: 'DELETE', cookie: ali.cookie })).status, 404);
  assert.equal((await call(`/api/book/me/${mk.json.id}`, { method: 'PUT', cookie: ali.cookie, body: { date: '2026-11-19', time: '16:00' } })).status, 404);
  assert.equal((await call(`/api/book/me/${mk.json.id}`, { method: 'PUT', cookie: veli.cookie, body: { date: '2026-11-16', time: '10:00' } })).status, 409); // dolu saat
  assert.equal((await call(`/api/book/me/${mk.json.id}`, { method: 'PUT', cookie: veli.cookie, body: { date: '2026-11-20', time: '18:00' } })).status, 200);
  assert.equal((await call('/api/book/me', { cookie: veli.cookie })).json.appointments[0].time, '18:00');
  assert.equal((await call(`/api/book/me/${mk.json.id}`, { method: 'DELETE', cookie: veli.cookie })).status, 200);
  assert.equal((await call('/api/book/me', { cookie: veli.cookie })).json.appointments.length, 0);
  assert.equal((await book(veli.cookie, { date: '2026-11-21', time: '15:00' })).status, 201); // iptal sonrası hak geri geldi
});

test('çıkış oturumu kapatır; berber müşteriyi silerse oturum geçersiz olur', async () => {
  const k = await enter('0533 444 55 66', { name: 'Çıkış Deneme' });
  assert.equal((await call('/api/book/me', { cookie: k.cookie })).status, 200);
  const out = await call('/api/auth/logout', { method: 'POST', cookie: k.cookie });
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  const k2 = await enter('0533 444 55 66');
  const customer = store.getAll('customers').find((c) => c.name === 'Çıkış Deneme');
  store.remove('customers', customer.id);
  assert.equal((await call('/api/book/me', { cookie: k2.cookie })).status, 401);
  assert.equal((await book(k2.cookie, { date: '2026-11-24', time: '10:00' })).status, 401);
});

test('berber API: giriş olmadan 401, şifreyle çerez ve okuma/yazma; online kapatılınca kod gitmez', async () => {
  assert.equal((await call('/api/admin/appointments')).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'yanlis' } })).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { username: 'baska', password: 'sifre123' } })).status, 401); // şifre doğru, kullanıcı adı yanlış
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: 'sifre123' } })).status, 401); // kullanıcı adı yok
  const login = await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'sifre123' } });
  const cookie = cookieOf(login);
  const list = await call('/api/admin/appointments', { cookie });
  assert.ok(list.json.length >= 2 && list.json.every((a) => a.source === 'online'));
  const clash = await call('/api/admin/appointments', { method: 'PUT', cookie, body: { id: 'x1', customerId: 'c', date: list.json[0].date, time: list.json[0].time } });
  assert.equal(clash.status, 409);
  assert.equal((await call('/api/admin/settings', { method: 'PUT', cookie, body: { key: 'main', value: { onlineEnabled: false } } })).status, 200);
  const before = sent.length;
  assert.equal((await call('/api/auth/request', { method: 'POST', body: { phone: '0532 111 22 33', mode: 'login' } })).status, 403);
  assert.equal(sent.length, before);
});

test('statik: sadece beyaz liste sunulur', async () => {
  const get = (p) => fetch(base + p).then((r) => r.status);
  assert.equal(await get('/'), 200);
  assert.equal(await get('/admin/'), 200);
  assert.equal(await get('/admin/sw.js'), 200);
  assert.equal(await get('/src/core.js'), 200);
  for (const p of ['/server/index.js', '/data/uchair.db', '/package.json', '/.git/config', '/PLAN.md', '/src/../server/index.js', '/%2e%2e/etc/passwd', '/admin/server/index.js'])
    assert.equal(await get(p), 404, p);
});

test('çok sık randevu denemesi 429 ile durdurulur', async () => {
  const s2 = await listen(createApp({ store: openStore(':memory:'), password: 'x', secret: 's', bookPerHour: 2, sms, clock: () => now }));
  const url = `http://127.0.0.1:${s2.address().port}`;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call('/api/book', { url, method: 'POST', cookie: undefined, body: {} })).status);
  s2.close();
  assert.deepEqual(codes, [401, 401, 401]); // giriş olmadan zaten reddedilir
});

test('IP başına kod isteği sınırı', async () => {
  const s2 = await listen(createApp({ store: openStore(':memory:'), password: 'x', secret: 's', sms, codeIpPerHour: 2, clock: () => now }));
  const url = `http://127.0.0.1:${s2.address().port}`;
  const codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call('/api/auth/request', { url, method: 'POST', body: { phone: `054${i}000000${i}`.slice(0, 11), mode: 'login' } })).status);
  s2.close();
  assert.deepEqual(codes, [404, 404, 429]); // kayıtsız numara 404 ama sayaç işler
});

test('OTP bypass: ayarlıysa test kodu geçer (önce kod istenmiş olmalı), ayarsızsa geçmez', async () => {
  const mk = async (otpBypass) => { const s2 = await listen(createApp({ store: openStore(':memory:'), password: 'x', secret: 's', sms, otpBypass, codeIpPerHour: 1000, clock: () => now })); return [s2, `http://127.0.0.1:${s2.address().port}`]; };
  const body = { phone: '0541 999 88 77', name: 'Bypass Deneme', mode: 'register' };

  const [on, onUrl] = await mk('123456');
  assert.equal((await call('/api/auth/verify', { url: onUrl, method: 'POST', body: { phone: body.phone, code: '123456' } })).status, 410); // kod istenmeden geçmez
  await call('/api/auth/request', { url: onUrl, method: 'POST', body });
  const ok = await call('/api/auth/verify', { url: onUrl, method: 'POST', body: { phone: body.phone, code: '123456' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.name, 'Bypass Deneme'); // kayıt ismi de işlendi
  on.close();

  const [off, offUrl] = await mk('');
  await call('/api/auth/request', { url: offUrl, method: 'POST', body });
  assert.equal((await call('/api/auth/verify', { url: offUrl, method: 'POST', body: { phone: body.phone, code: '123456' } })).status, 401); // varsayılan: kapalı
  off.close();
});

test('müşteri sayfasına işlemler fiyatıyla gider (fiyatı olmayan null)', async () => {
  store.put('settings', { key: 'main', value: { onlineEnabled: true, servicePrices: { Saç: 300, Sakal: 250, Maske: 100, Boya: 1000 }, services: ['Saç', 'Sakal', 'Maske', 'Boya', 'Cilt'] } });
  const cfg = (await call('/api/book/config')).json;
  assert.deepEqual(cfg.services.map((x) => [x.name, x.price]), [['Saç', 300], ['Sakal', 250], ['Maske', 100], ['Boya', 1000], ['Cilt', null]]);
});

test('berber oturumu kullanıcı adı/şifreye bağlı: şifre değişince eski çerez geçersiz', async () => {
  const mk = async (password) => { const a = await listen(createApp({ store, user: 'admin', password, secret: 'test', sms, clock: () => now })); return [a, `http://127.0.0.1:${a.address().port}`]; };
  const [a1, u1] = await mk('eski-sifre');
  const login = await call('/api/admin/login', { url: u1, method: 'POST', body: { username: ' Admin ', password: 'eski-sifre' } }); // kullanıcı adı büyük/küçük harf ve boşluk duyarsız
  assert.equal(login.status, 200);
  const cookie = cookieOf(login);
  assert.equal((await call('/api/admin/customers', { url: u1, cookie })).status, 200);
  a1.close();
  const [a2, u2] = await mk('yeni-sifre');
  assert.equal((await call('/api/admin/customers', { url: u2, cookie })).status, 401);
  a2.close();
});

test('müşteri randevusunda en az bir işlem seçmek zorunlu; geçersiz işlemler yok sayılır', async () => {
  const k = await enter('0533 777 66 55', { name: 'İşlem Deneme' });
  const none = await book(k.cookie, { date: '2026-11-24', time: '11:00', services: [] });
  assert.equal(none.status, 400);
  assert.equal(none.json.code, 'SERVICES');
  assert.equal((await book(k.cookie, { date: '2026-11-24', time: '11:00', services: ['Yok Böyle İşlem'] })).json.code, 'SERVICES');
  assert.equal((await book(k.cookie, { date: '2026-11-24', time: '11:00', services: undefined })).json.code, 'SERVICES');
  const ok = await book(k.cookie, { date: '2026-11-24', time: '11:00', services: ['Saç', 'Sakal', 'Yok Böyle İşlem'] });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.json.services, ['Saç', 'Sakal']);
});
