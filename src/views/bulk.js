import { h, go, toast, fill } from '../ui.js';
import { icon } from '../icons.js';
import { state, saveCustomer } from '../store.js';
import { parseCustomers, splitNewAndDuplicate } from '../customersImport.js';

export function bulkView() {
  const ta = h('textarea', { class: 'input', rows: 10, placeholder: 'Ahmet Yılmaz 0532 111 22 33\nMehmet Öztürk 0555 444 33 22\nAli Veli' });
  const out = h('div');

  const preview = () => {
    if (!ta.value.trim()) { fill(out); return; }
    const { items, skipped } = parseCustomers(ta.value);
    const { fresh, dup } = splitNewAndDuplicate(items, state.customers);
    fill(out,
      h('h3', {}, `${fresh.length} yeni müşteri eklenecek`),
      h('div', { class: 'list' }, ...fresh.slice(0, 80).map((c) => h('div', { class: 'row static' },
        h('span', { class: 'grow name' }, c.name), h('span', { class: 'muted' }, c.phone || 'numara yok')))),
      fresh.length > 80 && h('p', { class: 'muted small' }, `…ve ${fresh.length - 80} kişi daha`),
      dup.length > 0 && h('p', { class: 'muted' }, `${dup.length} kişi zaten kayıtlı, atlanacak.`),
      skipped.length > 0 && h('details', {}, h('summary', {}, `${skipped.length} satır anlaşılamadı`),
        ...skipped.slice(0, 40).map((s) => h('div', { class: 'muted small' }, `“${s.line}” — ${s.reason}`))),
      fresh.length > 0 && h('button', { class: 'primary', onclick: async () => {
        for (const c of fresh) await saveCustomer({ name: c.name, phone: c.phone });
        toast(`${fresh.length} müşteri eklendi`); go('/customers');
      } }, icon('check', 20), `${fresh.length} müşteriyi ekle`));
  };
  ta.addEventListener('input', preview);

  return h('div', {},
    h('button', { class: 'ghost', onclick: () => go('/customers') }, icon('left', 20), 'Geri'),
    h('h2', {}, 'Toplu müşteri ekle'),
    h('p', { class: 'muted' }, 'Her satıra bir müşteri yaz ya da yapıştır: isim ve telefon numarası. Numara başta ya da sonda olabilir. Önce önizleme gösterilir, onaylayınca eklenir.'),
    ta, out);
}
