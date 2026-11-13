import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS, daySlots, freeSlots, nearestFree, nearbyFreeDays, addDays, dayDiff, searchCustomers,
} from '../src/core.js';

const S = DEFAULT_SETTINGS;
// 2026-11-13 Cuma
const MORNING = new Date(2026, 10, 13, 8, 0);

test('gün slotları: 09-24 arası 15 slot, ', () => {
  assert.equal(daySlots('2026-11-13', S).length, 15);
  assert.equal(daySlots('2026-11-15', S).length, 15); // Pazar da açık
});

test('öğle arası slotu çıkarır', () => {
  const s = { ...S, breaks: [{ start: '13:00', end: '14:00' }] };
  assert.ok(!daySlots('2026-11-13', s).includes('13:00'));
  assert.equal(daySlots('2026-11-13', s).length, 14);
});

test('dolu ve geçmiş slotlar boş sayılmaz', () => {
  const now = new Date(2026, 10, 13, 12, 30);
  const free = freeSlots('2026-11-13', [{ date: '2026-11-13', time: '14:00' }], S, now);
  assert.deepEqual(free.slice(0, 2), ['13:00', '15:00']);
  assert.deepEqual(freeSlots('2026-11-12', [], S, now), []);
});

test('en yakın boş: dolu günü atlar', () => {
  const full = daySlots('2026-11-13', S).map((time) => ({ date: '2026-11-13', time }));
  const r = nearestFree(full, { now: MORNING, limit: 2 });
  assert.deepEqual(r[0], { date: '2026-11-14', time: '09:00' });
  assert.equal(r.length, 2);
});

test('tarihe yakın günler: önce/sonra mesafeye göre', () => {
  const full = (d) => daySlots(d, S).map((time) => ({ date: d, time }));
  const apps = [...full('2026-11-28'), ...full('2026-11-29')];
  const r = nearbyFreeDays('2026-11-28', apps, { now: MORNING, limit: 3 });
  assert.deepEqual(r.map((x) => x.offset), [-1, -2, 2]); // 29 dolu: 27, 26, 30
  assert.equal(r[0].date, '2026-11-27');
});

test('tarih yardımcıları', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(dayDiff('2026-11-28', '2026-11-26'), -2);
});

test('müşteri arama: Türkçe duyarsız + telefon', () => {
  const c = [{ name: 'Şükrü Işık', phone: '0532 111 22 33' }, { name: 'Ali', phone: '0555 999 88 77' }];
  assert.equal(searchCustomers(c, 'sukru').length, 1);
  assert.equal(searchCustomers(c, '8877').length, 1);
  assert.equal(searchCustomers(c, '').length, 2);
});

import { dayStatus, monthMatrix, backupDue, waNumber, relDay, slotEnd, trDate } from '../src/core.js';
import { parseNotes } from '../src/notesImport.js';

test('dayStatus ve ay matrisi', () => {
  const st = dayStatus('2026-11-13', [{ date: '2026-11-13', time: '15:00' }], S, MORNING);
  assert.equal(st.total, 15); assert.equal(st.free, 14); assert.equal(st.taken, 1);
  const w = monthMatrix(2026, 10); // Kasım 2026, 1 Kasım Pazar
  assert.equal(w[0][6], '2026-11-01'); assert.equal(w[0][0], null);
  assert.ok(w.every((x) => x.length === 7));
});

test('kapalı gün (closedDates) slot vermez', () => {
  const s = { ...S, closedDates: ['2026-11-28'] };
  assert.deepEqual(daySlots('2026-11-28', s), []);
  const r = nearestFree([], { settings: s, now: new Date(2026, 10, 27, 23, 30), limit: 1 });
  assert.equal(r[0].date, '2026-11-29');
});

test('yedek hatırlatma', () => {
  const now = new Date(2026, 10, 13);
  assert.equal(backupDue({ firstUseAt: '2026-11-01T00:00:00Z' }, true, now), true);
  assert.equal(backupDue({ lastBackupAt: '2026-11-10T00:00:00Z' }, true, now), false);
  assert.equal(backupDue({ firstUseAt: '2026-11-01T00:00:00Z' }, false, now), false);
});

test('yardımcılar', () => {
  assert.equal(waNumber('0532 111 22 33'), '905321112233');
  assert.equal(relDay('2026-11-14', '2026-11-13'), 'Yarın');
  assert.equal(slotEnd('23:00'), '24:00');
  assert.match(trDate('2026-11-28'), /28 Kasım/);
});

test('Notlar içe aktarma ayrıştırıcı', () => {
  const text = `28 Kasım Cumartesi
13.00 Ahmet 0532 111 22 33
14:00-15:00 Mehmet Yılmaz
saçma satır
29.11
10 Ali
`;
  const { items, skipped } = parseNotes(text, { now: new Date(2026, 10, 13) });
  assert.equal(items.length, 3);
  assert.deepEqual([items[0].date, items[0].time, items[0].name, items[0].phone], ['2026-11-28', '13:00', 'Ahmet', '05321112233']);
  assert.deepEqual([items[1].time, items[1].name], ['14:00', 'Mehmet Yılmaz']);
  assert.deepEqual([items[2].date, items[2].time, items[2].name], ['2026-11-29', '10:00', 'Ali']);
  assert.equal(skipped.length, 1);
});

import { nearbyAppointments } from '../src/core.js';
test('aynı hafta içi randevu uyarısı için yakın randevular', () => {
  const apps = [
    { id: 'a', customerId: 'c1', date: '2026-11-13', time: '15:00' },
    { id: 'b', customerId: 'c1', date: '2026-11-25', time: '10:00' },
    { id: 'c', customerId: 'c2', date: '2026-11-14', time: '10:00' },
  ];
  const opt = { today: '2026-11-13' };
  assert.deepEqual(nearbyAppointments(apps, 'c1', '2026-11-15', opt).map((a) => a.id), ['a']);
  assert.deepEqual(nearbyAppointments(apps, 'c1', '2026-11-20', opt).map((a) => a.id), ['b']); // 13'e 7 gün: dışarıda, 25'e 5 gün: içeride
  assert.equal(nearbyAppointments(apps, 'c1', '2026-12-10', opt).length, 0);
  assert.equal(nearbyAppointments(apps, 'c1', '2026-11-15', { ...opt, excludeId: 'a' }).length, 0);
});

import { parseCustomers, normalizePhone, splitNewAndDuplicate } from '../src/customersImport.js';
test('toplu müşteri ayrıştırma', () => {
  const text = `Ahmet Yılmaz 0532 111 22 33
0555 444 33 22 Mehmet Öztürk
3. Şükrü Işık - 5321112244
Ali Veli,+90 532 999 88 77
Sadece İsim
12345
`;
  const { items, skipped } = parseCustomers(text);
  assert.deepEqual(items.map((i) => i.name), ['Ahmet Yılmaz', 'Mehmet Öztürk', 'Şükrü Işık', 'Ali Veli', 'Sadece İsim']);
  assert.deepEqual(items.map((i) => i.phone), ['0532 111 22 33', '0555 444 33 22', '0532 111 22 44', '0532 999 88 77', '']);
  assert.equal(skipped.length, 1);
  assert.equal(normalizePhone('+90 (532) 111-22-33'), '0532 111 22 33');
});
test('toplu ekleme: mevcut ve tekrar edenleri atlar', () => {
  const existing = [{ name: 'Ahmet Yılmaz', phone: '0532 111 22 33' }];
  const { items } = parseCustomers('ahmet y 0532 111 22 33\nYeni Kişi 0544 000 11 22\nYeni Kişi 0544 000 11 22\nİsimsiz Numarasız');
  const { fresh, dup } = splitNewAndDuplicate(items, existing);
  assert.equal(dup.length, 2); // numarası kayıtlı + liste içinde tekrar
  assert.deepEqual(fresh.map((f) => f.name), ['Yeni Kişi', 'İsimsiz Numarasız']);
});
