import { icon } from '../icons.js';
import { h, go, toast, render, fill } from '../ui.js';
import { state, saveCustomer, deleteCustomer, restoreCustomer, apptsOf } from '../store.js';
import { searchCustomers, formatDate, trShort, waNumber } from '../core.js';
import { bookForCustomer, appointmentSheet } from '../flows.js';

let query = '';

export function customersView() {
  const today = formatDate(new Date());
  const list = h('div', { class: 'list' });
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Müşteri ara…', value: query });
  function draw() {
    query = input.value;
    const res = searchCustomers(state.customers, query);
    fill(list, 
      res.length === 0 && h('p', { class: 'muted' }, state.customers.length ? 'Sonuç yok.' : 'Koltuk boş, defter de. “Yeni” ile ilk müşteriyi ekle.'),
      ...res.map((c) => {
        const next = apptsOf(c.id).filter((a) => a.date >= today).pop();
        return h('button', { class: 'row', onclick: () => go('/customer/' + c.id) },
          h('span', { class: 'grow' }, c.name),
          h('span', { class: 'muted' }, next ? `${trShort(next.date)} ${next.time}` : c.phone || ''));
      }));
  }
  input.addEventListener('input', draw);
  draw();
  return h('div', {}, h('div', { class: 'two' }, input, h('button', { class: 'primary', onclick: () => go('/customer/new') }, icon('plus', 20), 'Yeni')), list);
}

export function customerView(id) {
  const isNew = id === 'new';
  const c = isNew ? { name: '', phone: '', note: '' } : state.customers.find((x) => x.id === id);
  if (!c) return h('p', { class: 'muted' }, 'Müşteri bulunamadı.');

  const name = h('input', { class: 'input', placeholder: 'İsim Soyisim', value: c.name });
  const phone = h('input', { class: 'input', placeholder: 'Telefon', type: 'tel', value: c.phone || '' });
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Not', value: c.note || '' });

  const save = h('button', { class: 'primary', onclick: async () => {
    if (!name.value.trim()) { toast('İsim gerekli'); return; }
    await saveCustomer({ ...c, name: name.value, phone: phone.value, note: note.value });
    toast('Kaydedildi');
    go('/customers');
  } }, 'Kaydet');

  const parts = [h('button', { class: 'ghost', onclick: () => history.back() }, icon('left', 20), 'Geri'), h('div', { class: 'form' }, name, phone, note, save)];
  if (!isNew) {
    const hist = apptsOf(c.id);
    parts.push(
      c.phone && h('div', { class: 'two' },
        h('a', { class: 'btn', href: 'tel:' + c.phone.replace(/\s/g, '') }, icon('phone', 20), 'Ara'),
        h('a', { class: 'btn', href: 'https://wa.me/' + waNumber(c.phone), target: '_blank', rel: 'noopener' }, icon('chat', 20), 'WhatsApp')),
      h('button', { class: 'primary', onclick: () => bookForCustomer(c) }, icon('plus', 20), 'Bu müşteriye randevu ver'),
      h('h2', {}, 'Randevular'),
      hist.length === 0 && h('p', { class: 'muted' }, 'Kayıtlı randevu yok (1 aydan eskiler otomatik silinir).'),
      h('div', { class: 'list' }, ...hist.map((a) => h('button', { class: 'row' + (a.date < today0() ? ' dim' : ''), onclick: () => appointmentSheet(a) },
        h('span', { class: 'grow' }, `${trShort(a.date)} ${a.date.slice(0, 4)}`), h('b', {}, a.time)))),
      h('div', { class: 'spacer' }),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm(`${c.name} silinsin mi? ${hist.length} randevusu da silinir.`)) return;
        const snap = await deleteCustomer(c.id);
        go('/customers');
        toast('Müşteri silindi', { action: 'Geri al', onAction: async () => { await restoreCustomer(snap); render(); } });
      } }, icon('trash', 20), 'Müşteriyi sil'));
  }
  return h('div', {}, ...parts);
}
const today0 = () => formatDate(new Date());
