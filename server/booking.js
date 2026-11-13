// Müşteri tarafı (herkese açık) iş kuralları. Store, saat ve sınırlayıcı dışarıdan verilir.
// Kimlik: telefon numarasına giden SMS doğrulama kodu (giriş ve kayıt).
import { randomBytes, randomInt, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_SETTINGS, onlineFreeSlots, upcomingFor, phoneKey, addDays, formatDate, daySlots, trDate,
} from '../src/core.js';

export class BookingError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

export function getSettings(store) {
  const row = store.getAll('settings').find((r) => r.key === 'main');
  const merged = row ? { ...DEFAULT_SETTINGS, ...row.value } : DEFAULT_SETTINGS;
  return { ...merged, onlineDays: Math.min(14, Math.max(1, merged.onlineDays)) }; // en fazla 2 hafta
}

/** Müşteriye gösterilecek ayarlar (kişisel veri yok) */
export function publicConfig(store) {
  const s = getSettings(store);
  return { shopName: s.shopName, services: s.services.map((name) => ({ name, price: Number.isFinite(s.servicePrices?.[name]) ? s.servicePrices[name] : null })), enabled: s.onlineEnabled, daysAhead: s.onlineDays, slotMinutes: s.slotMinutes };
}

/** Önümüzdeki günlerin saatleri: slots = günün tüm saatleri, free = alınabilenler. İsim/numara asla dönmez. */
export function publicSlots(store, now = new Date()) {
  const s = getSettings(store);
  const appts = store.getAll('appointments');
  const today = formatDate(now);
  const days = [];
  for (let i = 0; i < s.onlineDays; i++) {
    const date = addDays(today, i);
    const slots = daySlots(date, s);
    days.push({ date, closed: slots.length === 0, slots, free: onlineFreeSlots(date, appts, s, now) });
  }
  return { days };
}

// ---------- SMS doğrulama (giriş ve kayıt) ----------
export const OTP_TTL_MS = 5 * 60 * 1000; // kod 5 dakika geçerli
export const OTP_RESEND_MS = 60 * 1000; // aynı numaraya en sık dakikada 1 SMS
const OTP_MAX_ATTEMPTS = 5;
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim();
const hashCode = (code, salt) => createHash('sha256').update(`${salt}:${code}`).digest('hex');
const maskPhone = (key) => `0${key.slice(0, 3)} *** ** ${key.slice(8)}`;
/** Müşteri kaydındaki yazım: 05XX XXX XX XX */
const formatPhone = (key) => `0${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6, 8)} ${key.slice(8)}`;
const customerByKey = (store, key) => store.getAll('customers').find((c) => phoneKey(c.phone) === key);

/**
 * Numaraya 6 haneli kod gönderir.
 * mode 'login': numara kayıtlı olmalı. mode 'register': isim şart (numara zaten kayıtlıysa isim yok sayılır, giriş olur).
 * ctx: {sms, limits:{perPhone, daily}}
 */
export async function requestCode(store, { phone, name, mode }, now = new Date(), ctx) {
  const key = phoneKey(phone);
  if (!key) throw new BookingError('PHONE', 'Geçerli bir cep numarası yaz (05XX XXX XX XX).');
  if (!getSettings(store).onlineEnabled) throw new BookingError('OFF', 'Online randevu şu an kapalı. Dükkânı ara.', 403);
  const exists = !!customerByKey(store, key);
  let cleaned = '';
  if (mode === 'register') {
    cleaned = cleanName(name);
    if (!exists && (cleaned.length < 2 || cleaned.length > 60)) throw new BookingError('NAME', 'İsmini ve soyismini yaz.');
  } else if (!exists) {
    throw new BookingError('NO_ACCOUNT', 'Bu numarayla kayıt bulunamadı. Müşteri kaydı oluşturabilirsin.', 404);
  }

  const prev = store.getOtp(key);
  const wait = prev ? prev.sent_at + OTP_RESEND_MS - now.getTime() : 0;
  if (wait > 0) throw Object.assign(new BookingError('TOO_SOON', `Yeni kod için ${Math.ceil(wait / 1000)} saniye bekle.`, 429), { retryAfter: Math.ceil(wait / 1000) });
  if (!ctx.limits.perPhone.take(key)) throw new BookingError('LIMIT', 'Bu numara için çok fazla kod istendi. Bir saat sonra tekrar dene.', 429);
  if (!ctx.limits.daily.take('all')) throw new BookingError('LIMIT', 'Şu an kod gönderilemiyor. Dükkânı ara.', 429);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  try { await ctx.sms.send(key, `${getSettings(store).shopName} doğrulama kodun: ${code}. 5 dakika geçerli, kimseyle paylaşma.`); }
  catch (e) { console.error('SMS gönderilemedi:', e.message); throw new BookingError('SMS', 'Kod gönderilemedi. Biraz sonra tekrar dene.', 502); }
  const salt = randomBytes(8).toString('hex');
  store.setOtp({ phone: key, salt, hash: hashCode(code, salt), expires: now.getTime() + OTP_TTL_MS, name: cleaned, sent_at: now.getTime() });
  return { ok: true, phone: maskPhone(key), resendIn: OTP_RESEND_MS / 1000, existing: exists };
}

/** Kodu doğrular. Doğruysa (gerekirse müşteri kaydını da açar) numara anahtarını döner. */
export function verifyCode(store, { phone, code }, now = new Date(), { bypass = '' } = {}) {
  const key = phoneKey(phone);
  if (!key) throw new BookingError('PHONE', 'Geçerli bir cep numarası yaz.');
  const row = store.getOtp(key);
  if (!row || row.expires < now.getTime()) { if (row) store.delOtp(key); throw new BookingError('EXPIRED', 'Kodun süresi doldu. Yeni kod iste.', 410); }
  if (row.attempts >= OTP_MAX_ATTEMPTS) { store.delOtp(key); throw new BookingError('LOCKED', 'Çok fazla yanlış kod. Yeni kod iste.', 429); }
  const want = Buffer.from(row.hash, 'hex'), got = Buffer.from(hashCode(String(code ?? '').trim(), row.salt), 'hex');
  const bypassed = bypass && String(code ?? '').trim() === bypass; // sadece test: OTP_BYPASS ayarlıysa bu kod geçer (önce kod istenmiş olmalı)
  if (!bypassed && (want.length !== got.length || !timingSafeEqual(want, got))) {
    store.bumpOtp(key);
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    throw new BookingError('WRONG', left > 0 ? `Kod yanlış. ${left} hakkın kaldı.` : 'Kod yanlış. Yeni kod iste.', 401);
  }
  return store.transaction(() => {
    store.delOtp(key); // kod tek kullanımlık
    let customer = customerByKey(store, key);
    if (!customer) {
      if (!row.name) throw new BookingError('NO_ACCOUNT', 'Kayıt bulunamadı. Müşteri kaydı oluştur.', 404);
      customer = { id: randomUUID(), name: row.name, phone: formatPhone(key), note: 'Online kayıt' };
      store.put('customers', customer);
    }
    return key;
  });
}

// ---------- Müşterinin kendi randevuları ----------
function myAppointments(store, key, now) {
  const customers = store.getAll('customers');
  const ids = customers.filter((c) => phoneKey(c.phone) === key).map((c) => c.id);
  return { customers, list: upcomingFor(store.getAll('appointments'), customers, { id: ids[0], phone: key }, { now }) };
}

export function me(store, key, now = new Date()) {
  const { customers, list } = myAppointments(store, key, now);
  const owner = customers.find((c) => phoneKey(c.phone) === key);
  if (!owner) throw new BookingError('NO_ACCOUNT', 'Giriş gerekli', 401); // berber müşteriyi silmiş olabilir
  const name = owner.name;
  return { name, phone: key, appointments: list.map((a) => ({ id: a.id, date: a.date, time: a.time, services: a.services || [] })) };
}

function ownAppointment(store, key, id, now) {
  const ap = myAppointments(store, key, now).list.find((a) => a.id === id);
  if (!ap) throw new BookingError('NOT_FOUND', 'Randevu bulunamadı ya da saati geçmiş.', 404);
  return ap;
}

export function cancelMine(store, key, id, now = new Date()) {
  ownAppointment(store, key, id, now);
  store.remove('appointments', id);
  return { ok: true };
}

export function moveMine(store, key, id, { date, time }, now = new Date()) {
  return store.transaction(() => {
    const ap = ownAppointment(store, key, id, now);
    const settings = getSettings(store);
    if (!settings.onlineEnabled) throw new BookingError('OFF', 'Online randevu şu an kapalı. Dükkânı ara.', 403);
    if (!onlineFreeSlots(date, store.getAll('appointments'), settings, now).includes(time)) throw new BookingError('TAKEN', 'Bu saat dolu. Başka bir saat seç.', 409);
    try { store.put('appointments', { ...ap, date, time }); }
    catch (e) { if (e.message === 'SLOT_TAKEN') throw new BookingError('TAKEN', 'Bu saat az önce doldu. Başka bir saat seç.', 409); throw e; }
    return { id, date, time };
  });
}

// ---------- Randevu alma ----------
/** key: oturum açmış müşterinin numarası. İsim/numara tekrar sorulmaz. */
export function book(store, key, { date, time, services }, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) throw new BookingError('BAD', 'Gün ya da saat geçersiz.');
  return store.transaction(() => {
    const customer = customerByKey(store, key);
    if (!customer) throw new BookingError('NO_ACCOUNT', 'Giriş gerekli', 401);
    const settings = getSettings(store);
    if (!settings.onlineEnabled) throw new BookingError('OFF', 'Online randevu şu an kapalı. Dükkânı ara.', 403);
    const appts = store.getAll('appointments');
    if (!onlineFreeSlots(date, appts, settings, now).includes(time)) throw new BookingError('TAKEN', 'Bu saat az önce doldu. Başka bir saat seç.', 409);

    const [clash] = upcomingFor(appts, store.getAll('customers'), { phone: key }, { now });
    if (clash) throw new BookingError('ACTIVE', `Zaten bir randevun var: ${trDate(clash.date)}, ${clash.time}. Saatini değiştirebilir ya da iptal edebilirsin; randevu saatin geçince yenisini alabilirsin.`, 409);

    const allowed = new Set(settings.services);
    const chosen = [...new Set(Array.isArray(services) ? services : [])].filter((x) => allowed.has(x));
    if (allowed.size > 0 && chosen.length === 0) throw new BookingError('SERVICES', 'Ne yaptıracağını seç (en az bir işlem).');
    const ap = {
      id: randomUUID(), customerId: customer.id, date, time, note: '',
      services: chosen,
      createdAt: now.toISOString(), source: 'online',
    };
    try { store.put('appointments', ap); }
    catch (e) { if (e.message === 'SLOT_TAKEN') throw new BookingError('TAKEN', 'Bu saat az önce doldu. Başka bir saat seç.', 409); throw e; }
    return { id: ap.id, date, time, name: customer.name, services: ap.services };
  });
}
