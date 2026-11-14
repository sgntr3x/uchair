import { icon } from '../icons.js';
import { h, go, toast, render, confirmSheet, sheet } from '../ui.js';
import { state, saveSettings, reloadAfterImport, saveCustomer } from '../store.js';
import { toMinutes, fromMinutes, trDate, trShort, trMonth, monthMatrix, dayStatus, formatDate, BAN_OPTIONS, makeBan, banStatus, banLabel, noShowStats } from '../core.js';
import { importAll, isRemote, logout } from '../db.js';
import { runBackup, readBackupFile } from '../backup.js';

const TIMES = Array.from({ length: 49 }, (_, i) => fromMinutes(i * 30));
const DAYS = [[1, 'Pazartesi'], [2, 'Salı'], [3, 'Çarşamba'], [4, 'Perşembe'], [5, 'Cuma'], [6, 'Cumartesi'], [0, 'Pazar']];

const select = (options, value, onchange) =>
  h('select', { class: 'input sel', onchange: (e) => onchange(e.target.value), value }, ...options.map((o) => h('option', { value: o.v ?? o }, o.l ?? o)));

const nowD = new Date();
let closedView = { y: nowD.getFullYear(), m: nowD.getMonth() }; // tatil takviminde görünen ay
let openTab = null; // açık ayar başlığı (render'lar arasında hatırlanır)

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

  // Tatil günleri: takvimden dokunarak kapat/aç
  const todayStr = formatDate(new Date());
  const shiftM = (n) => { const d = new Date(closedView.y, closedView.m + n, 1); closedView = { y: d.getFullYear(), m: d.getMonth() }; render(); };
  const toggleClosed = async (d, st) => {
    if (st.manualClosed) { await saveSettings({ closedDates: s.closedDates.filter((x) => x !== d) }); toast('Gün tekrar açıldı'); render(); return; }
    if (st.closed) { toast('Haftalık programda bu gün zaten kapalı'); return; }
    const n = state.appointments.filter((a) => a.date === d).length;
    if (n && !(await confirmSheet({ title: 'Bu günde randevu var', ok: 'Yine de kapat', cancel: 'Vazgeç',
      lines: [`${trDate(d)} günü için ${n} randevu kayıtlı.`, 'Günü kapatırsan randevular silinmez ama yeni randevu önerilmez.'] }))) return;
    await saveSettings({ closedDates: [...s.closedDates, d].sort() }); toast('Gün kapatıldı (tatil)'); render();
  };
  const closedCells = monthMatrix(closedView.y, closedView.m).flat().map((d) => {
    if (!d) return h('div', { class: 'mc empty' });
    const st = dayStatus(d, state.appointments, s, new Date());
    const past = d < todayStr;
    return h('button', { class: `mc ${past ? 'past' : st.closed ? 'closed' : ''}${d === todayStr ? ' today' : ''}`, disabled: past, 'aria-label': trDate(d) + (st.manualClosed ? ' kapalı' : ''),
      onclick: () => toggleClosed(d, st) }, h('span', {}, String(+d.slice(8))));
  });
  const closed = h('section', { class: 'card' }, h('h2', {}, 'Kapalı günler (tatil / izin)'),
    h('p', { class: 'muted small' }, 'Güne dokun: kapanır (taramalı). Kapalı güne tekrar dokunursan açılır.'),
    h('div', { class: 'mnav' },
      h('button', { class: 'iconbtn', 'aria-label': 'Önceki ay', onclick: () => shiftM(-1) }, icon('left', 20)),
      h('b', { class: 'grow center' }, trMonth(closedView.y, closedView.m)),
      h('button', { class: 'iconbtn', 'aria-label': 'Sonraki ay', onclick: () => shiftM(1) }, icon('right', 20))),
    h('div', { class: 'mgrid wd' }, ...['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((x) => h('div', {}, x))),
    h('div', { class: 'mgrid' }, ...closedCells),
    h('h3', {}, 'Kapalı günler'),
    s.closedDates.length === 0 && h('p', { class: 'muted' }, 'Kapalı gün yok.'),
    ...s.closedDates.map((d) => h('div', { class: 'srow' }, h('span', { class: 'grow' }, trDate(d) + ' ' + d.slice(0, 4)),
      h('button', { class: 'ghost', onclick: async () => { await saveSettings({ closedDates: s.closedDates.filter((x) => x !== d) }); render(); } }, 'Aç'))));

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

  // Ceza: gelmeyenler listesi, dokununca ceza seçenekleri
  const stats = noShowStats(state.appointments);
  const offenders = state.customers
    .map((c) => ({ c, ns: stats.get(c.id), ban: banStatus(c) }))
    .filter((x) => x.ns || x.ban)
    .sort((a, b) => (!!b.ban - !!a.ban) || (b.ns?.last || '').localeCompare(a.ns?.last || ''));
  const banSheet = ({ c, ns, ban }) => sheet(c.name, (close) => {
    const apply = async (b, msg) => { const { ban: _old, ...rest } = c; await saveCustomer(b ? { ...rest, ban: b } : rest); toast(msg); close(); render(); };
    return h('div', { class: 'form' },
      c.phone && h('div', { class: 'muted' }, c.phone),
      ns && h('p', {}, `${ns.count} kez gelmedi · son: ${trShort(ns.last)}`),
      ban && h('div', { class: 'warn' }, banLabel(ban)),
      h('h3', {}, ban ? 'Cezayı değiştir' : 'Ceza ver'),
      ...BAN_OPTIONS.map((o) => h('button', { class: o.days === null ? 'danger' : '', onclick: () => apply(makeBan(o.key), `${c.name}: ${o.label} ceza verildi`) }, o.label)),
      ban && h('button', { class: 'ghost', onclick: () => apply(null, 'Ceza kaldırıldı') }, icon('unlock', 20), 'Cezayı kaldır'),
      h('p', { class: 'muted small' }, 'Cezalı müşteri bu süre boyunca online randevu alamaz. Elle randevu ekleyebilirsin; seni uyarır.'));
  });
  const penalties = h('section', { class: 'card' }, h('h2', {}, 'Ceza'),
    offenders.length === 0
      ? h('p', { class: 'muted' }, 'Gelmeyen yok. Randevuda “Randevuya gelmedi” dersen isim burada çıkar.')
      : h('div', { class: 'list' }, ...offenders.map((x) => h('button', { class: 'row', onclick: () => banSheet(x) },
          h('span', { class: 'grow' }, h('span', { class: 'name' }, x.c.name), h('br'), h('span', { class: 'muted small' }, x.ns ? `${x.ns.count} kez gelmedi · son ${trShort(x.ns.last)}` : 'cezalı')),
          x.ban && h('span', { class: 'warn small' }, x.ban.forever ? 'Süresiz' : 'Bitiş ' + trShort(x.ban.until))))),
    h('p', { class: 'muted small' }, 'Gelmedi kayıtları, randevularla birlikte 1 ay sonra silinir; verilen ceza silinmez.'));

  const shop = h('input', { class: 'input', value: s.shopName || '', placeholder: 'Dükkân adı', onchange: async (e) => { await saveSettings({ shopName: e.target.value.trim() || 'uChair' }); toast('Kaydedildi'); render(); } });

  const panels = {
    genel: h('section', { class: 'card' }, h('h2', {}, 'Dükkân adı'), shop),
    saat: h('div', {},
      h('section', { class: 'card' }, h('h2', {}, 'Çalışma saatleri'), ...hoursRows,
        h('div', { class: 'srow' }, h('span', { class: 'grow' }, 'Randevu süresi'), slotSel)),
      breaks),
    tatil: closed,
    islem: services,
    ceza: penalties,
    online,
    yedek: h('section', { class: 'card' }, h('h2', {}, 'Yedek'),
      h('p', { class: 'muted' }, isRemote() ? 'Veriler sunucuda duruyor. Telefondaki eski (v1) yedeği buradan yükleyebilirsin.' : `Son yedek: ${last}. Haftada bir yedek istenir.`),
      h('button', { class: 'primary', onclick: async () => { if (await runBackup()) { toast('Yedek alındı'); render(); } } }, icon('upload', 20), 'Şimdi yedekle'),
      h('button', { onclick: () => fileIn.click() }, icon('download', 20), 'Yedekten yükle'), fileIn,
      h('button', { onclick: () => go('/import') }, icon('paste', 20), 'Notlar’dan içe aktar'),
      h('p', {}, storage),
      h('p', { class: 'muted small' }, '1 aydan eski randevular uygulama açılırken otomatik silinir. Müşteri kayıtları silinmez.')),
  };
  const tabs = [['genel', 'Dükkân', 'sliders'], ['saat', 'Saatler', 'clock'], ['tatil', 'Kapalı günler', 'calendar'],
    ['islem', 'İşlemler', 'scissors'], ['ceza', 'Ceza', 'lock'], ['online', 'Online randevu', 'phone'], ['yedek', 'Yedek', 'download']].filter(([k]) => panels[k]);
  if (!panels[openTab]) openTab = null;

  return h('div', {},
    h('div', { class: 'svcs' }, ...tabs.map(([k, label, ic]) =>
      h('button', { class: 'svc' + (openTab === k ? ' on' : ''), 'aria-expanded': String(openTab === k), onclick: () => { openTab = openTab === k ? null : k; render(); } }, icon(ic, 20), h('span', {}, label)))),
    openTab ? panels[openTab] : h('p', { class: 'muted' }, 'Bir başlığa dokun, ayarları aşağıda açılsın.'),
    isRemote() && h('button', { class: 'ghost', onclick: async () => { await logout(); location.reload(); } }, 'Çıkış yap'));
}
