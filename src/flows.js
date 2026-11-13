// Birden fazla ekranda kullanılan akışlar: müşteri seç, saat seç, randevu ekle/detay.
import { icon, serviceIconName } from './icons.js';
import { h, sheet, toast, render, chip, fill, confirmSheet } from './ui.js';
import { state, customerById, saveCustomer, addAppointment, updateAppointment, moveAppointment, removeAppointment, restoreAppointment } from './store.js';
import { searchCustomers, nearbyAppointments, freeSlots, nearbyFreeDays, formatDate, trDate, trShort, trMonth, waNumber, slotEnd, monthMatrix, dayStatus, daySlots } from './core.js';

const opts = () => ({ settings: state.settings, now: new Date() });

/** Müşteri arama + yeni müşteri ekleme penceresi */
export function customerPicker({ title, onPick, step2 }) {
  return sheet(title, (close) => {
    const root = h('div');
    const input = h('input', { class: 'input', type: 'search', placeholder: 'İsim veya numara yaz…', autocomplete: 'off' });
    const list = h('div', { class: 'list' });

    const pick = async (c) => {
      if (step2) { root.replaceChildren(step2(c, close)); return; } // 2. adım: hizmet seçimi
      close(); await onPick(c);
    };

    function newForm(q) {
      const m = q.trim().match(/^(.*?)\s*(\+?\d[\d\s]{6,})$/); // sondaki numarayı ayır
      const nm = m ? m[1] : q.trim(); const ph = m ? m[2].trim() : '';
      const name = h('input', { class: 'input', placeholder: 'İsim Soyisim', value: nm });
      const phone = h('input', { class: 'input', placeholder: 'Telefon (isteğe bağlı)', type: 'tel', value: ph });
      root.replaceChildren(
        h('div', { class: 'form' }, name, phone,
          h('button', { class: 'primary', onclick: async () => {
            if (!name.value.trim()) { toast('İsim gerekli'); return; }
            const c = await saveCustomer({ name: name.value, phone: phone.value });
            pick(c);
          } }, 'Kaydet ve randevuya ekle'),
          h('button', { class: 'ghost', onclick: () => { root.replaceChildren(input, list); draw(); } }, 'Geri')));
      setTimeout(() => (nm ? phone : name).focus(), 50);
    }

    function draw() {
      const q = input.value;
      const res = searchCustomers(state.customers, q).slice(0, 40);
      fill(list, 
        h('button', { class: 'row add', onclick: () => newForm(q) }, icon('plus', 20), 'Yeni müşteri' + (q.trim() ? `: “${q.trim()}”` : '')),
        ...res.map((c) => h('button', { class: 'row', onclick: () => pick(c) },
          h('span', { class: 'grow' }, c.name), h('span', { class: 'muted' }, c.phone || ''))));
    }
    input.addEventListener('input', draw);
    root.append(input, list);
    draw();
    setTimeout(() => input.focus(), 50);
    return root;
  });
}

/** Mini takvim + seçili günün boş saatleri; gün doluysa yakın boş günler */
export function slotPicker({ title, startDate, onPick }) {
  return sheet(title, (close) => {
    const today = formatDate(new Date());
    let sel = startDate < today ? today : startDate;
    let view = { y: +sel.slice(0, 4), m: +sel.slice(5, 7) - 1 };
    const calBox = h('div');
    const out = h('div');
    const pick = (d, t) => { close(); onPick(d, t); };
    const chips = (d, slots) => h('div', { class: 'chips' }, ...slots.map((t) => chip(t, () => pick(d, t))));
    const shift = (n) => { const d = new Date(view.y, view.m + n, 1); view = { y: d.getFullYear(), m: d.getMonth() }; drawCal(); };
    const curMonth = () => view.y === +today.slice(0, 4) && view.m === +today.slice(5, 7) - 1;

    function drawCal() {
      const now = new Date();
      const cells = monthMatrix(view.y, view.m).flat().map((d) => {
        if (!d) return h('div', { class: 'mc empty' });
        const st = dayStatus(d, state.appointments, state.settings, now);
        const cls = st.past ? 'past' : st.closed ? 'closed' : st.free === 0 ? 'full' : '';
        return h('button', { class: `mc ${cls}${d === sel ? ' sel' : ''}${d === today ? ' today' : ''}`, disabled: st.past, 'aria-label': trDate(d),
          onclick: () => { sel = d; drawCal(); drawOut(); } },
          h('span', {}, String(+d.slice(8))),
          st.total > 0 && !st.past && h('i', { class: 'mbar' }, h('i', { style: `width:${Math.round(100 * st.taken / st.total)}%` })));
      });
      fill(calBox,
        h('div', { class: 'mnav' },
          h('button', { class: 'iconbtn', disabled: curMonth(), 'aria-label': 'Önceki ay', onclick: () => shift(-1) }, icon('left', 20)),
          h('b', { class: 'grow center' }, trMonth(view.y, view.m)),
          h('button', { class: 'iconbtn', 'aria-label': 'Sonraki ay', onclick: () => shift(1) }, icon('right', 20))),
        h('div', { class: 'mgrid wd' }, ...['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((x) => h('div', {}, x))),
        h('div', { class: 'mgrid' }, ...cells));
    }

    function drawOut() {
      const o = opts();
      const free = freeSlots(sel, state.appointments, o.settings, o.now);
      if (free.length) { fill(out, h('h3', {}, trDate(sel)), chips(sel, free)); return; }
      const closedDay = daySlots(sel, o.settings).length === 0;
      const near = nearbyFreeDays(sel, state.appointments, { ...o, limit: 5 });
      fill(out,
        h('p', { class: 'warn' }, closedDay ? `${trDate(sel)} kapalı.` : `${trDate(sel)} için koltuk boş değil.`),
        h('h3', {}, 'Yakın boş günler'),
        ...near.map((n) => h('div', { class: 'near' },
          h('div', { class: 'muted' }, `${Math.abs(n.offset)} gün ${n.offset < 0 ? 'önce' : 'sonra'} · ${trDate(n.date)}`),
          chips(n.date, n.slots))));
    }
    drawCal(); drawOut();
    return h('div', {}, calBox, out);
  });
}

/** Hizmet (saç/sakal/…) işaretleme tuşları. sel: Set, değişince yerinde günceller. */
export function serviceToggles(sel, extra = []) {
  const names = [...new Set([...state.settings.services, ...extra])];
  // Düğmeler bir kez kurulur; seçimde sadece sınıf değişir (yer kaymaz)
  return h('div', { class: 'svcs' }, ...names.map((n) => {
    const b = h('button', { class: 'svc' + (sel.has(n) ? ' on' : ''), 'aria-pressed': String(sel.has(n)),
      onclick: () => { sel.has(n) ? sel.delete(n) : sel.add(n); b.classList.toggle('on', sel.has(n)); b.setAttribute('aria-pressed', String(sel.has(n))); } },
      icon(serviceIconName(n), 24), h('span', { class: 'grow' }, n), h('span', { class: 'tick' }, icon('check', 18)));
    return b;
  }));
}

/** Aynı hafta içinde başka randevusu varsa berbere sorar. true = devam */
async function guardNearby(c, date, excludeId = null) {
  const near = nearbyAppointments(state.appointments, c.id, date, { excludeId });
  if (!near.length) return true;
  return confirmSheet({
    title: 'Bu hafta zaten randevusu var',
    lines: [`${c.name} için şu randevu(lar) kayıtlı:`,
      ...near.map((a) => ({ text: `${trDate(a.date)} · ${a.time}`, strong: true })),
      `Yine de ${trDate(date)} için de randevu oluşturulsun mu? Eski randevu silinmez.`],
    ok: 'Evet, oluştur', cancel: 'Vazgeç',
  });
}

/** Müşteri seçildikten sonra: hizmetleri işaretle ve kaydet */
function servicesStep({ customer, onSave }) {
  const sel = new Set();
  return h('div', { class: 'form' },
    h('div', { class: 'big' }, customer.name),
    customer.phone && h('div', { class: 'muted' }, customer.phone),
    h('h3', {}, 'Yapılacak işlemler'),
    serviceToggles(sel),
    h('button', { class: 'primary', onclick: () => onSave([...sel]) }, icon('check', 20), 'Randevuyu kaydet'));
}

/** Seçilen boş saate müşteri seçtirip randevu oluşturur */
export function bookSlot(date, time) {
  customerPicker({
    title: `${trDate(date)} · ${time}`,
    step2: (c, close) => servicesStep({
      customer: c,
      onSave: async (services) => {
        if (!(await guardNearby(c, date))) return;
        try {
          await addAppointment({ customerId: c.id, date, time, services });
          toast(`${c.name} → ${trShort(date)} ${time} eklendi`);
        } catch (e) { toast(e.message); }
        close(); render();
      },
    }),
  });
}

/** Müşteri sabitken yeni randevu: saat seçtir ve ekle */
export function bookForCustomer(c, startDate = formatDate(new Date())) {
  slotPicker({
    title: `${c.name} için randevu`, startDate,
    onPick: (d, t) => {
      sheet(`${trDate(d)} · ${t}`, (close) => servicesStep({
        customer: c,
        onSave: async (services) => {
          if (!(await guardNearby(c, d))) return;
          try { await addAppointment({ customerId: c.id, date: d, time: t, services }); toast(`${trShort(d)} ${t} eklendi`); }
          catch (e) { toast(e.message); }
          close(); render();
        },
      }));
    },
  });
}

/** Randevu detayı: not, ara, WhatsApp, taşı, iptal */
export function appointmentSheet(ap) {
  const c = customerById(ap.customerId);
  sheet(c ? c.name : 'Silinmiş müşteri', (close) => {
    const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Not', value: ap.note || '' });
    const sel = new Set(ap.services || []);
    return h('div', { class: 'form' },
      h('div', { class: 'big' }, `${trDate(ap.date)} · ${ap.time}–${slotEnd(ap.time, state.settings)}`),
      c?.phone && h('div', { class: 'muted' }, c.phone),
      h('h3', {}, 'Yapılacak işlemler'),
      serviceToggles(sel, ap.services || []),
      note,
      h('button', { class: 'primary', onclick: async () => { await updateAppointment({ ...ap, note: note.value, services: [...sel] }); toast('Kaydedildi'); close(); render(); } }, icon('check', 20), 'Kaydet'),
      c?.phone && h('div', { class: 'two' },
        h('a', { class: 'btn', href: 'tel:' + c.phone.replace(/\s/g, '') }, icon('phone', 20), 'Ara'),
        h('a', { class: 'btn', href: 'https://wa.me/' + waNumber(c.phone), target: '_blank', rel: 'noopener' }, icon('chat', 20), 'WhatsApp')),
      h('button', { onclick: () => {
        close();
        slotPicker({ title: 'Yeni saat seç', startDate: ap.date, onPick: async (d, t) => {
          if (c && !(await guardNearby(c, d, ap.id))) return;
          try { await moveAppointment(ap.id, d, t); toast(`Taşındı → ${trShort(d)} ${t}`); } catch (e) { toast(e.message); }
          render();
        } });
      } }, icon('move', 20), 'Başka saate taşı'),
      h('button', { class: 'danger', onclick: async () => {
        if (!confirm('Randevu iptal edilsin mi?')) return;
        const removed = await removeAppointment(ap.id);
        close(); render();
        toast('Randevu iptal edildi', { action: 'Geri al', onAction: async () => {
          try { await restoreAppointment(removed); render(); toast('Geri alındı'); } catch (e) { toast(e.message); }
        } });
      } }, icon('trash', 20), 'Randevuyu iptal et'));
  });
}
