// Çekirdek mantık: saf fonksiyonlar (DOM/DB bağımlılığı yok).
// Tarihler 'YYYY-MM-DD', saatler 'HH:MM' string'leri.

export const DEFAULT_SETTINGS = {
  slotMinutes: 60,
  // 0=Pazar ... 6=Cumartesi; null = kapalı
  hours: {
    0: { open: '09:00', close: '24:00' },
    1: { open: '09:00', close: '24:00' },
    2: { open: '09:00', close: '24:00' },
    3: { open: '09:00', close: '24:00' },
    4: { open: '09:00', close: '24:00' },
    5: { open: '09:00', close: '24:00' },
    6: { open: '09:00', close: '24:00' },
  },
  breaks: [], // [{start:'13:00', end:'14:00'}] her gün geçerli
  closedDates: [], // ['2026-12-25', ...]
  shopName: 'uChair',
  services: ['Saç', 'Sakal', 'Maske', 'Boya'], // randevuda işaretlenecek hizmetler
  servicePrices: {}, // {Saç: 300, ...} TL. Fiyatı olmayan işlem fiyatsız gösterilir
  onlineEnabled: true, // müşteri linkinden randevu alınabilsin mi
  onlineDays: 14, // müşteri en fazla kaç gün ilerisine randevu alabilir (en çok 14)
  onlineLeadMinutes: 60, // müşteri en az kaç dakika önceden alabilir
};

const pad = (n) => String(n).padStart(2, '0');

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
export function fromMinutes(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d); // yerel saat
}
export function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
export function dayDiff(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/** Bir günün tüm slotları (dolu/boş fark etmeksizin). Kapalıysa []. */
export function daySlots(date, settings = DEFAULT_SETTINGS) {
  if (settings.closedDates.includes(date)) return [];
  const h = settings.hours[parseDate(date).getDay()];
  if (!h) return [];
  const step = settings.slotMinutes;
  const out = [];
  for (let t = toMinutes(h.open); t + step <= toMinutes(h.close); t += step) {
    const overlapsBreak = settings.breaks.some(
      (b) => t < toMinutes(b.end) && t + step > toMinutes(b.start)
    );
    if (!overlapsBreak) out.push(fromMinutes(t));
  }
  return out;
}

/**
 * Bir günün boş slotları.
 * appointments: [{date,time}], now: Date (geçmiş saatleri eler)
 */
export function freeSlots(date, appointments, settings = DEFAULT_SETTINGS, now = new Date()) {
  const taken = new Set(appointments.filter((a) => a.date === date).map((a) => a.time));
  const today = formatDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return daySlots(date, settings).filter((t) => {
    if (taken.has(t)) return false;
    if (date < today) return false;
    if (date === today && toMinutes(t) <= nowMin) return false;
    return true;
  });
}

/** Bugünden itibaren en yakın `limit` boş slot. [{date,time}] */
export function nearestFree(appointments, { settings = DEFAULT_SETTINGS, now = new Date(), limit = 10, maxDays = 120 } = {}) {
  const out = [];
  const start = formatDate(now);
  for (let i = 0; i <= maxDays && out.length < limit; i++) {
    const date = addDays(start, i);
    for (const time of freeSlots(date, appointments, settings, now)) {
      out.push({ date, time });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Hedef tarihe en yakın boş günler (önce/sonra), mesafeye göre sıralı.
 * Her eleman: {date, offset (gün farkı, - önce / + sonra), slots:[...]}
 */
export function nearbyFreeDays(target, appointments, { settings = DEFAULT_SETTINGS, now = new Date(), limit = 6, maxRadius = 60 } = {}) {
  const out = [];
  for (let r = 1; r <= maxRadius && out.length < limit; r++) {
    for (const offset of [-r, r]) {
      const date = addDays(target, offset);
      const slots = freeSlots(date, appointments, settings, now);
      if (slots.length) out.push({ date, offset, slots });
    }
  }
  return out.slice(0, limit);
}

/** Randevu çakışma kontrolü */
export function isSlotTaken(appointments, date, time) {
  return appointments.some((a) => a.date === date && a.time === time);
}

/** Türkçe karakter duyarsız normalize (arama için) */
export function normalize(s) {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
}

/** Müşteri arama: isim (Türkçe duyarsız) veya telefon parçası */
export function searchCustomers(customers, query) {
  const q = normalize(query.trim());
  if (!q) return customers;
  const digits = q.replace(/\D/g, '');
  return customers.filter(
    (c) =>
      normalize(c.name).includes(q) ||
      (digits && (c.phone || '').replace(/\D/g, '').includes(digits))
  );
}

// ---------- Faz 1-5 eklemeleri ----------

const TR_DATE = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const TR_SHORT = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
const TR_MONTH = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' });

/** "28 Kasım Cumartesi" */
export const trDate = (str) => TR_DATE.format(parseDate(str));
/** "28 Kas" */
export const trShort = (str) => TR_SHORT.format(parseDate(str));
export const trMonth = (y, m) => TR_MONTH.format(new Date(y, m, 1));

/** Bugüne göre: Bugün / Yarın / 3 gün sonra / Dün / 2 gün önce */
export function relDay(str, today) {
  const n = dayDiff(today, str);
  if (n === 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  if (n === -1) return 'Dün';
  return n > 0 ? `${n} gün sonra` : `${-n} gün önce`;
}

/** Bitiş saati: '13:00' -> '14:00' */
export function slotEnd(time, settings = DEFAULT_SETTINGS) {
  return fromMinutes(toMinutes(time) + settings.slotMinutes);
}

/** Bir günün özeti (takvim hücresi için) */
export function dayStatus(date, appointments, settings = DEFAULT_SETTINGS, now = new Date()) {
  const slots = daySlots(date, settings);
  const taken = appointments.filter((a) => a.date === date).length;
  const free = freeSlots(date, appointments, settings, now).length;
  return {
    closed: slots.length === 0,
    manualClosed: settings.closedDates.includes(date),
    past: date < formatDate(now),
    total: slots.length,
    taken,
    free,
  };
}

/** Ayın haftalık matrisi (Pazartesi başlangıçlı). Boş hücre = null */
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(formatDate(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Haftalık yedek zamanı geldi mi? */
export function backupDue({ lastBackupAt, firstUseAt }, hasData, now = new Date(), days = 7) {
  if (!hasData) return false;
  const base = lastBackupAt || firstUseAt;
  if (!base) return false;
  return now - new Date(base) >= days * 86400000;
}

/** WhatsApp için numara: 0532... -> 90532... */
export function waNumber(phone) {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10) d = '90' + d;
  return d;
}

/** Randevu hatırlatma mesajı (WhatsApp'ta hazır yazılı gelir) */
export function reminderText({ name, date, time }) {
  const first = (name || '').trim().split(/\s+/)[0];
  return `Merhaba ${first}, ${trDate(date)} saat ${time} randevunuzu hatırlatmak istedim. Gelemeyecekseniz haber verir misiniz?`;
}

// ---------- Online randevu kuralları (sunucu ve müşteri sayfası ortak) ----------

/**
 * Telefonu karşılaştırma anahtarına çevirir: 10 haneli Türkiye cep numarası (5XXXXXXXXX).
 * 0532 111 22 33 / +90 532 111 22 33 / 5321112233 hepsi aynı anahtar. Geçersizse null.
 */
export function phoneKey(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? d : null;
}

/**
 * Müşterinin henüz gelmediği (saati geçmemiş) randevuları. Aynı numaralı başka müşteri kayıtları da sayılır.
 * `who`: {id?, phone?}. Kural: bir numaranın aynı anda en fazla 1 bekleyen randevusu olur;
 * randevu saati gelince hak geri döner (ör. 22:00 randevusu 22:00'da biter sayılır).
 */
export function upcomingFor(appointments, customers, who, { excludeId = null, now = new Date() } = {}) {
  const key = phoneKey(who.phone);
  const ids = new Set(customers.filter((c) => (key && phoneKey(c.phone) === key) || c.id === who.id).map((c) => c.id));
  if (who.id) ids.add(who.id);
  const today = formatDate(now);
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return appointments
    .filter((a) => ids.has(a.customerId) && a.id !== excludeId && (a.date > today || (a.date === today && a.time > hhmm)))
    .sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
}

/** Online alınabilen boş saatler: bugünden `onlineDays` gün ve `onlineLeadMinutes` sınırı içinde */
export function onlineFreeSlots(date, appointments, settings = DEFAULT_SETTINGS, now = new Date()) {
  if (!settings.onlineEnabled) return [];
  const today = formatDate(now);
  if (date < today || date > addDays(today, settings.onlineDays - 1)) return [];
  const limit = now.getHours() * 60 + now.getMinutes() + settings.onlineLeadMinutes;
  return freeSlots(date, appointments, settings, now).filter(
    (t) => date > today || toMinutes(t) >= limit
  );
}

/** 300 -> "300 ₺", 1000 -> "1.000 ₺" */
export const formatPrice = (n) => `${Number(n).toLocaleString('tr-TR')} ₺`;

/** Seçilen işlemlerin toplamı (fiyatı olmayanlar sayılmaz). Hiç fiyat yoksa null. */
export function servicesTotal(names, prices = {}) {
  const priced = names.filter((n) => Number.isFinite(prices[n]));
  return priced.length ? priced.reduce((sum, n) => sum + prices[n], 0) : null;
}

// ---------- Ceza (gelmeyen müşteri) ----------
/** Berberin seçebileceği ceza süreleri. days: null → süresiz. */
export const BAN_OPTIONS = [
  { key: 'week', label: '1 hafta', days: 7 },
  { key: 'month', label: '1 ay', days: 30 },
  { key: 'quarter', label: '3 ay', days: 90 },
  { key: 'forever', label: 'Süresiz (bir daha hiç)', days: null },
];

/** Müşteriye yazılacak ceza kaydı: {forever:true} ya da {until:'YYYY-MM-DD'} (o günden itibaren serbest). */
export function makeBan(optionKey, now = new Date()) {
  const o = BAN_OPTIONS.find((x) => x.key === optionKey);
  if (!o) throw new Error('Bilinmeyen ceza');
  const since = now.toISOString();
  return o.days === null ? { forever: true, since } : { until: addDays(formatDate(now), o.days), since };
}

/** Ceza şu an geçerliyse {forever, until} döner, yoksa/bittiyse null. */
export function banStatus(customer, now = new Date()) {
  const b = customer?.ban;
  if (!b) return null;
  if (b.forever) return { forever: true, until: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(b.until || '') && formatDate(now) < b.until) return { forever: false, until: b.until };
  return null;
}

/** Aynı numaralı kayıtlardan herhangi biri cezalıysa en ağır cezayı döner. */
export function banForPhone(customers, key, now = new Date()) {
  let worst = null;
  for (const c of customers) {
    if (phoneKey(c.phone) !== key) continue;
    const s = banStatus(c, now);
    if (s && (!worst || s.forever || (!worst.forever && s.until > worst.until))) worst = s;
  }
  return worst;
}

/** Berber ekranı için kısa etiket */
export const banLabel = (s) => (s.forever ? 'Süresiz ceza' : `${trShort(s.until)} tarihine kadar ceza`);

export const banMessage = (s) => s.forever
  ? 'Online randevu alman kalıcı olarak kapatıldı. Dükkânı arayabilirsin.'
  : `${trDate(s.until)} tarihine kadar randevu alamazsın. Dükkânı arayabilirsin.`;

/** Randevularda "gelmedi" işaretli müşteriler: Map(customerId → {count, last}) */
export function noShowStats(appointments) {
  const m = new Map();
  for (const a of appointments) {
    if (!a.noShow) continue;
    const e = m.get(a.customerId) || { count: 0, last: '' };
    e.count++; if (a.date > e.last) e.last = a.date;
    m.set(a.customerId, e);
  }
  return m;
}
