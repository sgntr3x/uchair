import { icon } from '../icons.js';
import { h, go, toast, render, confirmSheet } from '../ui.js';
import { state, saveSettings, reloadAfterImport } from '../store.js';
import { toMinutes, fromMinutes, trDate } from '../core.js';
import { importAll, isRemote, logout } from '../db.js';
import { runBackup, readBackupFile } from '../backup.js';

const TIMES = Array.from({ length: 49 }, (_, i) => fromMinutes(i * 30));
const DAYS = [[1, 'Pazartesi'], [2, 'Salı'], [3, 'Çarşamba'], [4, 'Perşembe'], [5, 'Cuma'], [6, 'Cumartesi'], [0, 'Pazar']];

const select = (options, value, onchange) =>
  h('select', { class: 'input sel', onchange: (e) => onchange(e.target.value), value }, ...options.map((o) => h('option', { value: o.v ?? o }, o.l ?? o)));

export function settingsView() {
  const s = state.settings;

  const hoursRows = DAYS.map(([dow, label]) => {
    const cur = s.hours[dow];
    const set = async (patch) => {
      const next = patch === null ? null : { ...(cur || { open: '09:00', close: '24:00' }), ...patch };
      if (next && toMinutes(next.open) >= toMinutes(next.close)) { toast('Açılış saati kapanıştan önce olmalı'); render(); return; }
      await saveSettings({ hours: { ...s.hours, [dow]: next } });
      render();
    };
    return h('div', { class: 'srow' },
      h('label', { class: 'grow' }, h('input', { type: 'checkbox', checked: !!cur, onchange: (e) => set(e.target.checked ? {} : null) }), ' ' + label),
      cur ? [select(TIMES.slice(0, 48), cur.open, (v) => set({ open: v })), '–', select(TIMES.slice(1), cur.close, (v) => set({ close: v }))] : h('span', { class: 'muted' }, 'Kapalı'));
  });

  // Mola
  const bS = select(TIMES, '13:00', () => {}), bE = select(TIMES, '14:00', () => {});
  const breaks = h('section', { class: 'card' }, h('h2', {}, 'Mola (öğle arası)'),
    s.breaks.length === 0 && h('p', { class: 'muted' }, 'Mola yok.'),
    ...s.breaks.map((b, i) => h('div', { class: 'srow' }, h('span', { class: 'grow' }, `${b.start}–${b.end}`),
      h('button', { class: 'ghost', onclick: async () => { await saveSettings({ breaks: s.breaks.filter((_, j) => j !== i) }); render(); } }, 'Sil'))),
    h('div', { class: 'srow' }, bS, '–', bE, h('button', { onclick: async () => {
      if (toMinutes(bS.value) >= toMinutes(bE.value)) { toast('Başlangıç bitişten önce olmalı'); return; }
      await saveSettings({ breaks: [...s.breaks, { start: bS.value, end: bE.value }] }); render();
    } }, 'Ekle')));

  // Tatil günleri
  const dateIn = h('input', { class: 'input', type: 'date' });
  const closed = h('section', { class: 'card' }, h('h2', {}, 'Kapalı günler (tatil / izin)'),
    s.closedDates.length === 0 && h('p', { class: 'muted' }, 'Kapalı gün yok. Takvimde güne dokunup da kapatabilirsin.'),
    ...s.closedDates.map((d) => h('div', { class: 'srow' }, h('span', { class: 'grow' }, trDate(d) + ' ' + d.slice(0, 4)),
      h('button', { class: 'ghost', onclick: async () => { await saveSettings({ closedDates: s.closedDates.filter((x) => x !== d) }); render(); } }, 'Aç'))),
    h('div', { class: 'srow' }, dateIn, h('button', { onclick: async () => {
      if (!dateIn.value || s.closedDates.includes(dateIn.value)) return;
      await saveSettings({ closedDates: [...s.closedDates, dateIn.value].sort() }); render();
    } }, 'Kapat')));

  // İşlemler + fiyatlar. Fiyat boş bırakılırsa müşteriye fiyatsız gösterilir.
  const prices = s.servicePrices || {}; // sadece ilk çizim için; kayıtlarda HER ZAMAN güncel değer okunur (çizim sonrası yapılan değişiklikleri ezmesin)
  const curPrices = () => state.settings.servicePrices || {};
  const curServices = () => state.settings.services;
  const parsePrice = (v) => { const n = Math.round(Number(String(v).replace(',', '.'))); return String(v).trim() !== '' && n >= 0 ? n : null; };
  const priceBox = (value, onchange) => h('label', { class: 'pricebox' },
    h('input', { class: 'input price', type: 'number', inputMode: 'numeric', min: 0, step: 10, placeholder: '—', 'aria-label': 'Fiyat (TL)', value: value ?? '', onchange }), h('span', { class: 'muted' }, '₺'));
  const svcIn = h('input', { class: 'input', placeholder: 'Yeni işlem (örn. Cilt bakımı)' });
  const newPrice = h('input', { class: 'input price', type: 'number', inputMode: 'numeric', min: 0, step: 10, placeholder: '—', 'aria-label': 'Fiyat (TL)' });
  const services = h('section', { class: 'card' }, h('h2', {}, 'İşlemler ve fiyatlar'),
    s.services.length === 0 && h('p', { class: 'muted' }, 'İşlem yok.'),
    ...s.services.map((n) => h('div', { class: 'srow' }, h('span', { class: 'grow' }, n),
      priceBox(prices[n], async (e) => {
        const p = parsePrice(e.target.value); const next = { ...curPrices() };
        if (p === null) delete next[n]; else next[n] = p;
        await saveSettings({ servicePrices: next }); toast(p === null ? 'Fiyat kaldırıldı' : 'Fiyat kaydedildi');
      }),
      h('button', { class: 'ghost', onclick: async () => {
        const { [n]: _gone, ...rest } = curPrices();
        await saveSettings({ services: curServices().filter((x) => x !== n), servicePrices: rest }); render();
      } }, 'Sil'))),
    h('div', { class: 'srow' }, svcIn, h('label', { class: 'pricebox' }, newPrice, h('span', { class: 'muted' }, '₺')), h('button', { onclick: async () => {
      const v = svcIn.value.trim(); if (!v || curServices().includes(v)) return;
      const p = parsePrice(newPrice.value);
      await saveSettings({ services: [...curServices(), v], servicePrices: p === null ? curPrices() : { ...curPrices(), [v]: p } }); render();
    } }, 'Ekle')),
    h('p', { class: 'muted small' }, 'Fiyatlar müşteri randevu alırken işlemin yanında görünür. Boş bırakılırsa fiyat yazılmaz.'));

  const lengths = [30, 45, 60, 75, 90, 120].map((m) => ({ v: m, l: m + ' dk' }));
  const slotSel = select(lengths, s.slotMinutes, async (v) => { await saveSettings({ slotMinutes: +v }); toast('Güncellendi. Mevcut randevular yerinde kalır.'); render(); });

  const fileIn = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = await readBackupFile(f);
      if (!(await confirmSheet({ title: 'Yedek yüklensin mi?', ok: 'Evet, yükle', cancel: 'Vazgeç',
        lines: [`Yedekte ${data.customers.length} müşteri ve ${data.appointments.length} randevu var.`, 'Mevcut verilerin üstüne eklenir, hiçbir şey silinmez.'] }))) { e.target.value = ''; return; }
      await importAll(data); await reloadAfterImport(); toast('Yedek yüklendi'); render();
    } catch (err) { toast(err.message); }
    e.target.value = '';
  } });

  const last = s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString('tr-TR') : 'hiç yedeklenmedi';
  const storage = h('span', { class: 'muted' }, '…');
  navigator.storage?.estimate?.().then((e) => { storage.textContent = `${Math.max(1, Math.round((e.usage || 0) / 1024))} KB kullanılıyor`; });

  // Online randevu (sadece sunucu modunda)
  const link = location.origin + '/';
  const online = isRemote() && h('section', { class: 'card' }, h('h2', {}, 'Online randevu'),
    h('div', { class: 'srow' },
      h('label', { class: 'grow' }, h('input', { type: 'checkbox', checked: s.onlineEnabled, onchange: async (e) => { await saveSettings({ onlineEnabled: e.target.checked }); toast(e.target.checked ? 'Online randevu açık' : 'Online randevu kapalı'); render(); } }), ' Müşteriler link üzerinden randevu alabilsin')),
    s.onlineEnabled && [
      h('div', { class: 'srow' }, h('span', { class: 'grow' }, 'En fazla kaç gün ilerisi'),
        select([3, 7, 10, 14].map((n) => ({ v: n, l: n + ' gün' })), s.onlineDays, async (v) => { await saveSettings({ onlineDays: +v }); render(); })),
      h('div', { class: 'srow' }, h('span', { class: 'grow' }, 'En az kaç dk önceden'),
        select([0, 30, 60, 120, 180].map((n) => ({ v: n, l: n + ' dk' })), s.onlineLeadMinutes, async (v) => { await saveSettings({ onlineLeadMinutes: +v }); render(); })),
      h('p', { class: 'muted small' }, 'Bir numara, randevu saati gelmeden ikinci online randevu alamaz. Sen elle ekleyebilirsin; müşterinin bekleyen randevusu varsa sana uyarı çıkar.'),
      h('p', { class: 'mono' }, link),
      h('button', { onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link kopyalandı'); } catch { toast(link); } } }, icon('note', 20), 'Linki kopyala'),
    ]);

  const shop = h('input', { class: 'input', value: s.shopName || '', placeholder: 'Dükkân adı', onchange: async (e) => { await saveSettings({ shopName: e.target.value.trim() || 'uChair' }); toast('Kaydedildi'); render(); } });
  return h('div', {},
    h('section', { class: 'card' }, h('h2', {}, 'Dükkân adı'), shop),
    online,
    h('section', { class: 'card' }, h('h2', {}, 'Çalışma saatleri'), ...hoursRows,
      h('div', { class: 'srow' }, h('span', { class: 'grow' }, 'Randevu süresi'), slotSel)),
    breaks, closed, services,
    h('section', { class: 'card' }, h('h2', {}, 'Yedek'),
      h('p', { class: 'muted' }, isRemote() ? 'Veriler sunucuda duruyor. Telefondaki eski (v1) yedeği buradan yükleyebilirsin.' : `Son yedek: ${last}. Haftada bir yedek istenir.`),
      h('button', { class: 'primary', onclick: async () => { if (await runBackup()) { toast('Yedek alındı'); render(); } } }, icon('upload', 20), 'Şimdi yedekle'),
      h('button', { onclick: () => fileIn.click() }, icon('download', 20), 'Yedekten yükle'), fileIn,
      h('button', { onclick: () => go('/import') }, icon('paste', 20), 'Notlar’dan içe aktar'),
      h('p', {}, storage)),
    isRemote() && h('button', { class: 'ghost', onclick: async () => { await logout(); location.reload(); } }, 'Çıkış yap'),
    h('p', { class: 'muted small' }, '1 aydan eski randevular uygulama açılırken otomatik silinir. Müşteri kayıtları silinmez.'));
}
