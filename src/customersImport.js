// Yapıştırılan listeden müşteri çıkarır. Satır başına bir müşteri:
//   Ahmet Yılmaz 0532 111 22 33   |   Ahmet Yılmaz - 0532...   |   0532... Ahmet   |   Ahmet,0532...
import { normalize } from './core.js';

/** 0532 111 22 33 biçimine getirir; tanımsız uzunlukta ham rakamı döner */
export function normalizePhone(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('0090')) d = '0' + d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = '0' + d.slice(2);
  else if (d.length === 10 && d.startsWith('5')) d = '0' + d;
  if (d.length === 11 && d.startsWith('0')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  return d;
}

const PHONE_RE = /(\+?\d[\d\s().\-]{8,}\d)/;

export function parseCustomers(text) {
  const items = []; const skipped = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^\s*\d+\s*[.)]\s+/, ''); // "1. Ahmet" -> "Ahmet"
    let phone = '';
    const m = line.match(PHONE_RE);
    if (m && m[1].replace(/\D/g, '').length >= 10) {
      phone = normalizePhone(m[1]);
      line = line.replace(m[1], ' ');
    }
    const name = line.replace(/[\t,;|]+/g, ' ').replace(/^[\s\-–:()]+|[\s\-–:()]+$/g, '').replace(/\s+/g, ' ');
    if (!/\p{L}{2}/u.test(name)) { skipped.push({ line: raw.trim(), reason: 'isim bulunamadı' }); continue; }
    items.push({ name, phone });
  }
  return { items, skipped };
}

/** Mevcut müşterilerle ve liste içinde tekrar edenleri ayırır */
export function splitNewAndDuplicate(items, existing) {
  const byPhone = new Set(existing.map((c) => (c.phone || '').replace(/\D/g, '')).filter(Boolean));
  const byName = new Set(existing.map((c) => normalize(c.name)));
  const fresh = []; const dup = [];
  for (const it of items) {
    const p = it.phone.replace(/\D/g, ''); const n = normalize(it.name);
    const isDup = (p && byPhone.has(p)) || (!p && byName.has(n));
    if (isDup) { dup.push(it); continue; }
    if (p) byPhone.add(p); else byName.add(n);
    fresh.push(it);
  }
  return { fresh, dup };
}
