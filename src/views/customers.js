import { icon } from '../icons.js';
import { h, go, toast, render, fill, confirmSheet } from '../ui.js';
import { state, saveCustomer, deleteCustomer, restoreCustomer, apptsOf } from '../store.js';
import { searchCustomers, formatDate, trShort, waNumber, banStatus } from '../core.js';
import { bookForCustomer, appointmentSheet } from '../flows.js';

let query = '';
let editMode = false;
const selected = new Set();

export function customersView() {
  const today = formatDate(new Date());
  const list = h('div', { class: 'list' });
  const bar = h('div', { class: 'fab-wrap' });
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Müşteri ara…', value: query });
  const visible = () => searchCustomers(state.customers, query);

  function drawBar() {
    fill(bar, editMode && selected.size > 0 && h('button', { class: 'primary fab', onclick: removeSelected }, icon('trash', 22), `Sil (${selected.size})`));
    bar.hidden = !(editMode && selected.size > 0);
    root.dataset.fab = bar.hidden ? '' : '1';
    document.getElementById('view')?.classList.toggle('with-fab', !bar.hidden); // alttaki butonun altında içerik kalmasın
  }

  function draw() {
    query = input.value;
    const res = visible();
    fill(list,
      res.length === 0 && h('p', { class: 'muted' }, state.customers.length ? 'Sonuç yok.' : 'Koltuk boş, defter de. “Yeni” ile ilk müşteriyi ekle.'),
      ...res.map((c) => {
        if (editMode) {
          const on = selected.has(c.id);
          return h('button', { class: 'row', 'aria-pressed': String(on), onclick: () => { on ? selected.delete(c.id) : selected.add(c.id); draw(); } },
            h('span', { class: 'grow' }, c.name), h('span', { class: 'muted' }, c.phone || ''),
            h('span', { class: 'cbx' + (on ? ' on' : '') }, on && icon('check', 18)));
        }
        const next = apptsOf(c.id).filter((a) => a.date >= today).pop();
        return h('button', { class: 'row two-line', onclick: () => go('/customer/' + c.id) },
          h('span', { class: 'grow' },
            h('span', { class: 'name' }, c.name, banStatus(c) && h('span', { class: 'warn small' }, ' · cezalı')),
            h('span', { class: 'sub' }, c.phone || 'numara yok')),
          next && h('span', { class: 'next' }, h('small', {}, 'Sıradaki'), h('span', {}, h('b', {}, trShort(next.date) + ' '), h('span', { class: 'mono' }, next.time))));
      }));
    drawBar();
  }

  async function removeSelected() {
    const ids = [...selected].filter((id) => state.customers.some((c) => c.id === id));
    if (!ids.length) return;
    const names = ids.map((id) => state.customers.find((c) => c.id === id).name);
    const apptCount = ids.reduce((n, id) => n + apptsOf(id).length, 0);
    const ok = await confirmSheet({
      title: `${ids.length} müşteri silinsin mi?`, ok: 'Evet, sil', cancel: 'Vazgeç',
      lines: [{ text: names.slice(0, 5).join(', ') + (names.length > 5 ? ` ve ${names.length - 5} kişi daha` : ''), strong: true },
        apptCount ? `${apptCount} randevu da silinir.` : 'Kayıtlı randevuları yok.'],
    });
    if (!ok) return;
    const snaps = [];
    for (const id of ids) snaps.push(await deleteCustomer(id));
    selected.clear(); editMode = false;
    render();
    toast(`${ids.length} müşteri silindi`, { action: 'Geri al', onAction: async () => { for (const sn of snaps) await restoreCustomer(sn); render(); } });
  }

  const toggle = h('button', { onclick: () => { editMode = !editMode; selected.clear(); render(); } }, editMode ? 'Bitti' : 'Düzenle');
  const controls = editMode
    ? h('div', { class: 'two' },
        h('button', { onclick: () => { const v = visible(); const all = v.every((c) => selected.has(c.id)); v.forEach((c) => (all ? selected.delete(c.id) : selected.add(c.id))); draw(); } }, 'Tümünü seç'),
        toggle)
    : h('div', { class: 'two' }, h('button', { onclick: () => go('/bulk') }, icon('paste', 20), 'Toplu ekle'),
        state.customers.length > 0 && toggle);

  input.addEventListener('input', draw);
  const root = h('div', {}, h('div', { class: 'two' }, input, h('button', { class: 'blue', onclick: () => go('/customer/new') }, icon('plus', 20), 'Yeni')),
    controls, state.customers.length > 0 && h('p', { class: 'muted small count-line' }, `${state.customers.length} müşteri defterde`), list, bar);
  draw();
  return root;
}

export function customerView(id) {
  const isNew = id === 'new';
  const c = isNew ? { name: '', phone: '', note: '' } : state.customers.find((x) => x.id === id);
  if (!c) return h('p', { class: 'muted' }, 'Müşteri bulunamadı.');

  const name = h('input', { class: 'input', placeholder: 'İsim Soyisim', value: c.name });
  const phone = h('input', { class: 'input', placeholder: 'Telefon', type: 'tel', value: c.phone || '' });
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Not', value: c.note || '' });

  const save = h('button', { class: isNew ? 'primary' : 'blue', onclick: async () => {
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
        if (!(await confirmSheet({ title: 'Müşteri silinsin mi?', ok: 'Evet, sil', cancel: 'Vazgeç',
          lines: [{ text: c.name, strong: true }, hist.length ? `${hist.length} randevusu da silinir.` : 'Kayıtlı randevusu yok.'] }))) return;
        const snap = await deleteCustomer(c.id);
        go('/customers');
        toast('Müşteri silindi', { action: 'Geri al', onAction: async () => { await restoreCustomer(snap); render(); } });
      } }, icon('trash', 20), 'Müşteriyi sil'));
  }
  return h('div', {}, ...parts);
}
const today0 = () => formatDate(new Date());
