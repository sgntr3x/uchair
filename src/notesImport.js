// Notlar uygulamasından yapıştırılan metni randevulara çevirir.
// Beklenen format (esnek):
//   28 Kasım            (veya 28.11 / 28.11.2026 / "Cuma 28 Kasım")
//   13.00 Ahmet 0532...
//   14:00-15:00 Mehmet
import { formatDate, normalize } from './core.js';

const MONTHS = ['oca', 'sub', 'mar', 'nis', 'may', 'haz', 'tem', 'agu', 'eyl', 'eki', 'kas', 'ara'];
const WEEKDAYS = /\b(pazartesi|sali|carsamba|persembe|cuma|cumartesi|pazar|pzt|sal|car|per|cmt|paz)\b/g;

function monthFromWord(w) {
  const i = MONTHS.indexOf(normalize(w).slice(0, 3));
  return i; // -1 değilse geçerli
}

function resolveYear(day, month, year, now) {
  if (year) return year < 100 ? 2000 + year : year;
  let y = now.getFullYear();
  const cand = new Date(y, month, day);
  const limit = new Date(now); limit.setDate(limit.getDate() - 30);
  if (cand < limit) y += 1;
  return y;
}

function validDate(y, m, d) {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
}

/** Satır sadece bir tarihse 'YYYY-MM-DD' döner, değilse null */
function parseDateLine(line, now) {
  const s = normalize(line).replace(WEEKDAYS, ' ').replace(/[,:]/g, ' ').trim();
  let m = s.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (m) {
    const mo = monthFromWord(m[2]);
    if (mo >= 0) {
      const d = +m[1]; const y = resolveYear(d, mo, m[3] ? +m[3] : 0, now);
      return validDate(y, mo, d) ? formatDate(new Date(y, mo, d)) : null;
    }
  }
  m = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (m) {
    const d = +m[1]; const mo = +m[2] - 1;
    const y = resolveYear(d, mo, m[3] ? +m[3] : 0, now);
    return validDate(y, mo, d) ? formatDate(new Date(y, mo, d)) : null;
  }
  return null;
}

const TIME_RE = /^\s*(\d{1,2})(?:[.:](\d{2}))?\s*(?:[-–]\s*\d{1,2}(?:[.:]\d{2})?)?\s*[-–:)]*\s*(.*)$/;

function parseTimeLine(line) {
  const m = line.match(TIME_RE);
  if (!m) return null;
  const h = +m[1]; const min = m[2] ? +m[2] : 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  let rest = m[3].trim();
  if (!rest) return null;
  let phone = '';
  const pm = rest.match(/(\+?\d[\d\s]{8,}\d)/);
  if (pm) { phone = pm[1].replace(/\s+/g, ''); rest = rest.replace(pm[1], '').trim(); }
  rest = rest.replace(/^[-–:)\s]+|[-–:(\s]+$/g, '');
  if (!rest) return null;
  const time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  return { time, name: rest, phone };
}

export function parseNotes(text, { now = new Date() } = {}) {
  const items = []; const skipped = [];
  const cutoff = formatDate(addDays0(now, -30));
  let date = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const d = parseDateLine(line, now);
    if (d) { date = d; continue; }
    const t = parseTimeLine(line);
    if (t && date) {
      if (date < cutoff) { skipped.push({ line, reason: 'çok eski (1 aydan önce)' }); continue; }
      items.push({ date, ...t, line });
    } else if (t && !date) skipped.push({ line, reason: 'üstünde tarih yok' });
    else skipped.push({ line, reason: 'anlaşılamadı' });
  }
  return { items, skipped };
}

function addDays0(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
