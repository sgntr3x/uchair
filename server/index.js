// uChair sunucusu: bağımlılık yok, sadece Node (>= 22.13).
//   /            müşteri randevu sayfası (book/)
//   /admin/      berberin uygulaması (kökteki index.html; giriş şifreli)
//   /api/auth/*  müşteri girişi/kaydı: numaraya SMS kodu gönder, doğrula
//   /api/book/*  müşteri: boş saatler (açık), randevu al/değiştir/iptal (giriş gerekli)
//   /api/admin/* berber: oturum çerezi gerekir
process.env.TZ ||= 'Europe/Istanbul'; // saat hesapları dükkânın saatine göre
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join, extname, normalize, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, STORES } from './store.js';
import * as booking from './booking.js';
import { limiter } from './limiter.js';
import { createSms } from './sms.js';
import { scheduleNightly } from './backup.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const SESSION_DAYS = 30;
const ADMIN_ROOT_FILES = new Set(['index.html', 'sw.js', 'manifest.webmanifest']);
const PUBLIC_DIRS = ['src', 'fonts', 'icons', 'book'];

export function createApp({ store, user = 'admin', password, secret, trustProxy = false, bookPerHour = 10, sms, smsDailyLimit = 300, codeIpPerHour = 10, otpBypass = '', clock = () => new Date() }) {
  const bookLimit = limiter(bookPerHour, 60 * 60 * 1000); // IP başına saatte 10 randevu denemesi
  const loginLimit = limiter(5, 15 * 60 * 1000); // IP başına 15 dakikada 5 yanlış berber şifresi
  const codeIpLimit = limiter(codeIpPerHour, 60 * 60 * 1000); // IP başına saatte 10 kod isteği
  const verifyIpLimit = limiter(30, 15 * 60 * 1000); // IP başına 15 dakikada 30 doğrulama denemesi
  const otpLimits = { perPhone: limiter(5, 60 * 60 * 1000), daily: limiter(smsDailyLimit, 24 * 60 * 60 * 1000) }; // numara başına saatte 5, toplam günde N SMS

  const sign = (v) => createHmac('sha256', secret).update(v).digest('hex');
  // Berber oturumu kullanıcı adı+şifreye bağlı: bunlar değişirse eski oturumlar kendiliğinden geçersiz olur
  const credTag = sign(`cred:${user}:${password}`).slice(0, 16);
  const makeToken = () => { const exp = Date.now() + SESSION_DAYS * 86400000; return `${exp}.${sign(`${exp}:${credTag}`)}`; };
  const validToken = (t) => {
    const [exp, sig] = String(t || '').split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const want = Buffer.from(sign(`${exp}:${credTag}`)), got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  };
  // Müşteri oturumu: numara anahtarı + süre, HMAC'li. Berber token'ından farklı girdiyi imzalar ('c.' öneki).
  const makeCustToken = (key) => { const exp = Date.now() + SESSION_DAYS * 86400000; return `${key}.${exp}.${sign(`c.${key}.${exp}`)}`; };
  const custKey = (req) => {
    const [key, exp, sig] = String(cookieOf(req, 'uc_c') || '').split('.');
    if (!key || !exp || !sig || Number(exp) < Date.now()) return null;
    const want = Buffer.from(sign(`c.${key}.${exp}`)), got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got) ? key : null;
  };
  const cookieOf = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
  const isAdmin = (req) => validToken(cookieOf(req, 'uc_s'));
  const ipOf = (req) => (trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '?';
  const isHttps = (req) => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';

  const send = (res, status, body, headers = {}) => {
    const json = typeof body !== 'string' && !Buffer.isBuffer(body);
    res.writeHead(status, { 'content-type': json ? 'application/json' : 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...headers });
    res.end(json ? JSON.stringify(body) : body);
  };
  const readJson = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1_000_000) { reject(Object.assign(new Error('Çok büyük'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(Object.assign(new Error('Geçersiz JSON'), { status: 400 })); } });
    req.on('error', reject);
  });

  async function api(req, res, url) {
    const path = url.pathname;
    const method = req.method;
    let m;
    if (path === '/api/ping') return send(res, 200, { uchair: true, admin: isAdmin(req) });

    // ---- herkese açık ----
    const custCookie = (req, key) => `uc_c=${key ? makeCustToken(key) : ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${key ? SESSION_DAYS * 86400 : 0}${isHttps(req) ? '; Secure' : ''}`;
    if (path === '/api/book/config' && method === 'GET') return send(res, 200, booking.publicConfig(store));
    if (path === '/api/book/slots' && method === 'GET') return send(res, 200, booking.publicSlots(store, clock()));
    if (path === '/api/book' && method === 'POST') {
      const key = custKey(req);
      if (!key) return send(res, 401, { error: 'Giriş gerekli' });
      if (!bookLimit.take(ipOf(req))) return send(res, 429, { error: 'Çok fazla deneme. Biraz sonra tekrar dene.' });
      return send(res, 201, booking.book(store, key, await readJson(req), clock()));
    }
    if (path === '/api/auth/request' && method === 'POST') {
      if (!codeIpLimit.take(ipOf(req))) return send(res, 429, { error: 'Çok fazla deneme. Biraz sonra tekrar dene.' });
      const r = await booking.requestCode(store, await readJson(req), clock(), { sms, limits: otpLimits });
      return send(res, 200, r);
    }
    if (path === '/api/auth/verify' && method === 'POST') {
      const ip = ipOf(req);
      if (verifyIpLimit.full(ip)) return send(res, 429, { error: 'Çok fazla yanlış deneme. 15 dakika bekle.' });
      try {
        const key = booking.verifyCode(store, await readJson(req), clock(), { bypass: otpBypass });
        return send(res, 200, booking.me(store, key, clock()), { 'set-cookie': custCookie(req, key) });
      } catch (e) { if (e.code === 'WRONG') verifyIpLimit.take(ip); throw e; }
    }
    if (path === '/api/auth/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': custCookie(req, null) });
    if (path === '/api/book/me' && method === 'GET') {
      const key = custKey(req);
      if (!key) return send(res, 401, { error: 'Giriş gerekli' });
      try { return send(res, 200, booking.me(store, key, clock())); } catch (e) { if (e.status === 401) return send(res, 401, { error: e.message }, { 'set-cookie': custCookie(req, null) }); throw e; }
    }
    m = path.match(/^\/api\/book\/me\/([\w-]+)$/);
    if (m && (method === 'DELETE' || method === 'PUT')) {
      const key = custKey(req);
      if (!key) return send(res, 401, { error: 'Giriş gerekli' });
      return send(res, 200, method === 'DELETE' ? booking.cancelMine(store, key, m[1], clock()) : booking.moveMine(store, key, m[1], await readJson(req), clock()));
    }

    // ---- berber ----
    if (path === '/api/admin/login' && method === 'POST') {
      if (!password) return send(res, 503, { error: 'Sunucuda berber şifresi ayarlı değil' });
      const ip = ipOf(req);
      if (loginLimit.full(ip)) return send(res, 429, { error: 'Çok fazla yanlış deneme. 15 dakika bekle.' });
      const { username = '', password: given = '' } = await readJson(req);
      const same = (x, y) => timingSafeEqual(Buffer.from(sign(String(x))), Buffer.from(sign(String(y))));
      const userOk = same(String(username).trim().toLowerCase(), user.toLowerCase()), passOk = same(given, password); // ikisi de hesaplanır: hangisinin yanlış olduğu sızmasın
      if (!(userOk && passOk)) { loginLimit.take(ip); return send(res, 401, { error: 'Kullanıcı adı veya şifre yanlış' }); }
      loginLimit.reset(ip);
      const cookie = `uc_s=${makeToken()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`;
      return send(res, 200, { ok: true }, { 'set-cookie': cookie });
    }
    if (path === '/api/admin/logout' && method === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': 'uc_s=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });

    m = path.match(/^\/api\/admin\/(\w+)(?:\/([\w-]+))?$/);
    if (m && m[1] in STORES) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Giriş gerekli' });
      const [, name, id] = m;
      if (method === 'GET' && !id) return send(res, 200, store.getAll(name));
      if (method === 'PUT' && !id) {
        try { store.put(name, await readJson(req)); } catch (e) {
          if (e.message === 'SLOT_TAKEN') return send(res, 409, { error: 'Bu saat zaten dolu' });
          if (e.message === 'BAD_ID') return send(res, 400, { error: 'Kayıt kimliği yok' });
          throw e;
        }
        return send(res, 200, { ok: true });
      }
      if (method === 'DELETE' && id) { store.remove(name, id); return send(res, 200, { ok: true }); }
    }
    return send(res, 404, { error: 'Yok' });
  }

  /** İstek yolunu diskteki dosyaya çevirir; beyaz liste dışı hiçbir şey sunulmaz (server/, data/, .git/ ...) */
  function resolveStatic(pathname) {
    let p = decodeURIComponent(pathname);
    if (p === '/') p = '/book/index.html';
    let rel = p.replace(/^\/+/, '');
    if (rel.startsWith('admin/')) {
      rel = rel.slice('admin/'.length) || 'index.html';
      if (!ADMIN_ROOT_FILES.has(rel) && !PUBLIC_DIRS.includes(rel.split('/')[0])) return null;
    } else if (!PUBLIC_DIRS.includes(rel.split('/')[0])) return null;
    const file = normalize(join(ROOT, rel));
    return file.startsWith(ROOT + sep) ? file : null;
  }

  async function serveStatic(req, res, url) {
    if (url.pathname === '/admin') return send(res, 301, '', { location: '/admin/' });
    const file = resolveStatic(url.pathname);
    if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) return send(res, 404, 'Yok');
    try {
      if (!(await stat(file)).isFile()) throw 0;
      const body = await readFile(file);
      const ext = extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': ext === '.woff2' || ext === '.png' ? 'public, max-age=86400' : 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { send(res, 404, 'Yok'); }
  }

  return async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      return await serveStatic(req, res, url);
    } catch (e) {
      if (e instanceof booking.BookingError) return send(res, e.status, { error: e.message, code: e.code, retryAfter: e.retryAfter });
      if (e.status) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Sunucu hatası' });
    }
  };
}

function loadSecret(file) {
  if (process.env.UCHAIR_SECRET) return process.env.UCHAIR_SECRET;
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dirname(file), { recursive: true });
  const s = randomBytes(32).toString('hex');
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.UCHAIR_DATA || join(ROOT, 'data');
  const port = Number(process.env.PORT) || 3000;
  const user = process.env.UCHAIR_USER || 'admin';
  const password = process.env.UCHAIR_PASSWORD || 'admin';
  if (!process.env.UCHAIR_PASSWORD) console.warn('UYARI: Berber girişi varsayılan admin / admin ile açık. İnternete açmadan önce UCHAIR_USER ve UCHAIR_PASSWORD ayarla!');
  const store = openStore(join(dataDir, 'uchair.db'));
  const sms = createSms(process.env);
  if (sms.provider === 'console') console.warn('UYARI: SMS_PROVIDER=console. Doğrulama kodları SMS olarak GİTMEZ, sadece bu log\'a yazılır.');
  const otpBypass = process.env.OTP_BYPASS || '';
  if (otpBypass) {
    // Güvenlik: bypass yalnızca gerçek SMS gitmeyen modda açılabilir; canlı sağlayıcıyla birlikte sunucu başlamaz.
    if (sms.provider !== 'console') throw new Error('OTP_BYPASS sadece SMS_PROVIDER=console iken kullanılabilir. Canlıya geçerken OTP_BYPASS değişkenini kaldır.');
    if (!/^\d{6}$/.test(otpBypass)) throw new Error('OTP_BYPASS 6 haneli rakam olmalı (örn. 123456).');
    console.warn(`UYARI: OTP_BYPASS açık: ${otpBypass} kodu HER numara için geçer. Sadece test için!`);
  }
  scheduleNightly(store, join(dataDir, 'backups'));
  const app = createApp({ store, user, password, sms, otpBypass, smsDailyLimit: Number(process.env.SMS_DAILY_LIMIT) || 300, secret: loadSecret(join(dataDir, 'secret')), trustProxy: process.env.TRUST_PROXY === '1' });
  http.createServer(app).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`uChair: http://127.0.0.1:${port}  (berber: /admin/)`));
}
