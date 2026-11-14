import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { BAN_OPTIONS, makeBan, banStatus, banForPhone, noShowStats } from '../src/core.js';

const D = (y, m, d, hh = 9) => new Date(y, m - 1, d, hh, 0);

// ---------- çekirdek mantık ----------
test('ceza süreleri: 1 hafta / 1 ay / 3 ay / süresiz', () => {
  const now = D(2026, 11, 14);
  assert.deepEqual(BAN_OPTIONS.map((o) => o.key), ['week', 'month', 'quarter', 'forever']);
  assert.equal(makeBan('week', now).until, '2026-11-21');
  assert.equal(makeBan('month', now).until, '2026-12-14');
  assert.equal(makeBan('quarter', now).until, '2027-02-12');
  assert.equal(makeBan('forever', now).forever, true);
  assert.equal(makeBan('forever', now).until, undefined);
  assert.throws(() => makeBan('yok', now));
});

test('ceza durumu: bitiş gününe kadar geçerli, o gün serbest; süresiz hiç bitmez; kayıt yoksa null', () => {
  const c = { ban: makeBan('week', D(2026, 11, 14)) }; // until 2026-11-21
  assert.ok(banStatus(c, D(2026, 11, 14)));
  assert.ok(banStatus(c, D(2026, 11, 20, 23)));
  assert.equal(banStatus(c, D(2026, 11, 21, 0)), null);
  assert.equal(banStatus(c, D(2027, 5, 1)), null);
  assert.ok(banStatus({ ban: makeBan('forever', D(2026, 11, 14)) }, D(2040, 1, 1)).forever);
  assert.equal(banStatus({}, D(2026, 11, 14)), null);
  assert.equal(banStatus(undefined, D(2026, 11, 14)), null);
  assert.equal(banStatus({ ban: { until: 'saçma' } }, D(2026, 11, 14)), null);
});

test('aynı numaralı kayıtlardan biri cezalıysa numara cezalı; en ağır ceza seçilir', () => {
  const now = D(2026, 11, 14);
  const cs = [
    { id: 'a', phone: '0532 111 22 33' },
    { id: 'b', phone: '+90 532 111 22 33', ban: makeBan('week', now) },
    { id: 'c', phone: '0532 111 22 33', ban: makeBan('month', now) },
    { id: 'd', phone: '0555 000 00 00' },
  ];
  assert.equal(banForPhone(cs, '5321112233', now).until, '2026-12-14');
  assert.equal(banForPhone(cs, '5550000000', now), null);
  cs.push({ id: 'e', phone: '0532 111 22 33', ban: makeBan('forever', now) });
  assert.equal(banForPhone(cs, '5321112233', now).forever, true);
});

test('gelmedi istatistiği: müşteri başına sayı ve son tarih', () => {
  const m = noShowStats([
    { customerId: 'a', date: '2026-11-01', noShow: true }, { customerId: 'a', date: '2026-11-09', noShow: true },
    { customerId: 'a', date: '2026-11-10' }, { customerId: 'b', date: '2026-11-05', noShow: false },
  ]);
  assert.deepEqual([...m], [['a', { count: 2, last: '2026-11-09' }]]);
});

// ---------- sunucu: online randevuda uygulanması ----------
let now = D(2026, 11, 13, 8); // Cuma
const sent = [];
const sms = { provider: 'test', send: async (phone, text) => { sent.push({ phone, text }); } };
let server, base, store, adminCookie;
const call = (path, { method = 'GET', body, cookie } = {}) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null), headers: r.headers }));
const cookieOf = (r) => r.headers.get('set-cookie')?.split(';')[0];
async function enter(phone, name) {
  await call('/api/auth/request', { method: 'POST', body: { phone, name, mode: name ? 'register' : 'login' } });
  const key = phone.replace(/\D/g, '').slice(-10);
  const code = [...sent].reverse().find((m) => m.phone === key).text.match(/\b(\d{6})\b/)[1];
  const v = await call('/api/auth/verify', { method: 'POST', body: { phone, code } });
  assert.equal(v.status, 200);
  return { cookie: cookieOf(v), ...v.json };
}
const book = (cookie, o = {}) => call('/api/book', { method: 'POST', cookie, body: { date: '2026-11-16', time: '10:00', services: ['Saç'], ...o } });
const setBan = async (phoneDigits, ban) => {
  const c = store.getAll('customers').find((x) => x.phone.replace(/\D/g, '').endsWith(phoneDigits));
  const { ban: _o, ...rest } = c;
  assert.equal((await call('/api/admin/customers', { method: 'PUT', cookie: adminCookie, body: ban ? { ...rest, ban } : rest })).status, 200);
};

before(async () => {
  store = openStore(':memory:');
  server = await new Promise((r) => { const s = http.createServer(createApp({ store, user: 'admin', password: 'sifre123', secret: 't', bookPerHour: 100, codeIpPerHour: 1000, sms, clock: () => now })); s.listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  adminCookie = cookieOf(await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'sifre123' } }));
});
after(() => server.close());

test('cezalı müşteri randevu alamaz (403 BANNED); ceza kalkınca alabilir', async () => {
  const me = await enter('0532 111 22 33', 'Ali Veli');
  await setBan('5321112233', makeBan('month', now));
  const r = await book(me.cookie);
  assert.equal(r.status, 403);
  assert.equal(r.json.code, 'BANNED');
  assert.match(r.json.error, /tarihine kadar randevu alamazsın/);
  assert.equal(store.getAll('appointments').length, 0); // hiçbir şey yazılmadı
  const info = await call('/api/book/me', { cookie: me.cookie });
  assert.equal(info.json.ban.until, '2026-12-13');
  assert.match(info.json.ban.message, /randevu alamazsın/);
  await setBan('5321112233', null); // berber cezayı kaldırdı
  assert.equal((await call('/api/book/me', { cookie: me.cookie })).json.ban, null);
  assert.equal((await book(me.cookie)).status, 201);
});

test('ceza süresi dolunca (bitiş günü) tekrar randevu alınabilir; öncesinde hayır', async () => {
  const me = await enter('0533 222 33 44', 'Veli Can');
  await setBan('5332223344', { until: '2026-11-20', since: now.toISOString() });
  now = D(2026, 11, 19, 20);
  assert.equal((await book(me.cookie, { date: '2026-11-25', time: '11:00' })).json.code, 'BANNED');
  now = D(2026, 11, 20, 8);
  assert.equal((await book(me.cookie, { date: '2026-11-25', time: '11:00' })).status, 201);
  now = D(2026, 11, 13, 8);
});

test('süresiz ceza: bir daha hiç randevu alamaz, mesaj kalıcı', async () => {
  const me = await enter('0534 333 44 55', 'Kalıcı Ceza');
  await setBan('5343334455', makeBan('forever', now));
  now = D(2027, 6, 1, 8);
  const r = await book(me.cookie, { date: '2027-06-02', time: '12:00' });
  assert.equal(r.status, 403);
  assert.match(r.json.error, /kalıcı olarak kapatıldı/);
  assert.equal((await call('/api/book/me', { cookie: me.cookie })).json.ban.forever, true);
  now = D(2026, 11, 13, 8);
});

test('cezalı müşteri mevcut randevusunu taşıyamaz ama iptal edebilir; diğer müşteriler etkilenmez', async () => {
  const me = await enter('0535 444 55 66', 'Taşıyıcı');
  const made = await book(me.cookie, { date: '2026-11-17', time: '13:00' });
  assert.equal(made.status, 201);
  await setBan('5354445566', makeBan('week', now));
  const mv = await call(`/api/book/me/${made.json.id}`, { method: 'PUT', cookie: me.cookie, body: { date: '2026-11-17', time: '14:00' } });
  assert.equal(mv.status, 403);
  assert.equal(mv.json.code, 'BANNED');
  const other = await enter('0536 555 66 77', 'Masum Kişi');
  assert.equal((await book(other.cookie, { date: '2026-11-17', time: '15:00' })).status, 201); // başkası serbest
  assert.equal((await call(`/api/book/me/${made.json.id}`, { method: 'DELETE', cookie: me.cookie })).status, 200);
});

test('aynı numarayla ikinci müşteri kaydı açılsa da ceza numaraya bağlı kalır', async () => {
  const me = await enter('0537 666 77 88', 'Çift Kayıt');
  await call('/api/admin/customers', { method: 'PUT', cookie: adminCookie, body: { id: 'dup', name: 'Çift Kayıt (eski)', phone: '+90 537 666 77 88', ban: makeBan('quarter', now) } });
  assert.equal((await book(me.cookie, { date: '2026-11-18', time: '10:00' })).json.code, 'BANNED');
});
