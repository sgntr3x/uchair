import { icon } from '../icons.js';
import { h, go, toast, fill } from '../ui.js';
import { state, saveCustomer, addAppointment } from '../store.js';
import { parseNotes } from '../notesImport.js';
import { normalize, isSlotTaken, trShort } from '../core.js';

export function importView() {
  const ta = h('textarea', { class: 'input', rows: 10, placeholder: '28 Kasım\n13.00 Ahmet 0532...\n14.00 Mehmet\n\n29 Kasım\n10.00 Ali' });
  const out = h('div');

  const preview = () => {
    const { items, skipped } = parseNotes(ta.value);
    if (!ta.value.trim()) { fill(out); return; }
    const taken = new Set(state.appointments.map((a) => a.date + a.time));
    const seen = new Set();
    const ok = items.filter((i) => { const k = i.date + i.time; if (taken.has(k) || seen.has(k)) return false; seen.add(k); return true; });
    fill(out, 
      h('h3', {}, `${ok.length} randevu içe aktarılacak`),
      h('div', { class: 'list' }, ...ok.slice(0, 60).map((i) => h('div', { class: 'row static' },
        h('span', { class: 'grow' }, i.name), h('span', { class: 'muted' }, `${trShort(i.date)} ${i.time}`)))),
      items.length - ok.length > 0 && h('p', { class: 'warn' }, `${items.length - ok.length} satır çakıştığı için atlanacak.`),
      skipped.length > 0 && h('details', {}, h('summary', {}, `${skipped.length} satır anlaşılamadı`),
        ...skipped.slice(0, 40).map((s) => h('div', { class: 'muted small' }, `“${s.line}” — ${s.reason}`))),
      ok.length > 0 && h('button', { class: 'primary', onclick: async () => {
        let n = 0;
        for (const i of ok) {
          let c = state.customers.find((x) => normalize(x.name) === normalize(i.name));
          if (!c) c = await saveCustomer({ name: i.name, phone: i.phone });
          else if (!c.phone && i.phone) c = await saveCustomer({ ...c, phone: i.phone });
          if (!isSlotTaken(state.appointments, i.date, i.time)) { await addAppointment({ customerId: c.id, date: i.date, time: i.time }); n++; }
        }
        toast(`${n} randevu eklendi`); go('/');
      } }, 'İçe aktar'));
  };
  ta.addEventListener('input', preview);

  return h('div', {},
    h('button', { class: 'ghost', onclick: () => history.back() }, icon('left', 20), 'Geri'),
    h('h2', {}, 'Notlar’dan içe aktar'),
    h('p', { class: 'muted' }, 'Notlar uygulamasındaki randevu yazılarını buraya yapıştır. Tarih satırı (28 Kasım / 28.11), altında “saat isim” satırları olmalı. Önce önizleme gösterilir.'),
    ta, out);
}
