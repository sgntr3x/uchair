import { icon } from '../icons.js';
import { h, go, chip, toast, render, confirmSheet } from '../ui.js';
import { state, customerById, saveSettings } from '../store.js';
import { daySlots, freeSlots, nearbyFreeDays, addDays, parseDate, formatDate, trDate, relDay, slotEnd, trShort } from '../core.js';
import { bookSlot, appointmentSheet } from '../flows.js';

let showNearby = false;

export function dayView(date) {
  const now = new Date();
  const today = formatDate(now);
  const { settings, appointments } = state;
  const dow = new Date(date + 'T00:00').getDay();
  const manualClosed = settings.closedDates.includes(date);
  const weeklyClosed = !settings.hours[dow];
  const dayAppts = appointments.filter((a) => a.date === date);
  const free = freeSlots(date, appointments, settings, now);
  const freeSet = new Set(free);

  const times = [...new Set([...daySlots(date, settings), ...dayAppts.map((a) => a.time)])].sort();
  const rows = times.map((t) => {
    const ap = dayAppts.find((a) => a.time === t);
    const label = h('span', { class: 't' }, t, h('small', {}, '–' + slotEnd(t, settings)));
    if (ap) {
      const c = customerById(ap.customerId);
      return h('button', { class: 'slot taken', onclick: () => appointmentSheet(ap) },
        label, h('span', { class: 'grow' }, h('span', { class: 'name' }, c?.name || 'Silinmiş müşteri'),
          (ap.services?.length > 0 || ap.source === 'online' || ap.noShow) && h('span', { class: 'svctxt' }, [ap.noShow && 'GELMEDİ', ...(ap.services || []), ap.source === 'online' && 'online'].filter(Boolean).join(' · '))), ap.note && icon('note', 18));
    }
    if (freeSet.has(t)) return h('button', { class: 'slot free', onclick: () => bookSlot(date, t) }, label, h('span', { class: 'grow' }, 'Koltuk boş'), icon('plus', 20));
    return h('div', { class: 'slot past' }, label, h('span', { class: 'grow' }, 'geçti'));
  });

  const nav = h('div', { class: 'daynav' },
    h('button', { onclick: () => go('/day/' + addDays(date, -1)) }, icon('left')),
    h('div', { class: 'grow center' }, h('b', {}, trDate(date)), h('div', { class: 'muted' }, relDay(date, today))),
    h('button', { onclick: () => go('/day/' + addDays(date, 1)) }, icon('right')));

  const closeBtn = manualClosed
    ? h('button', { onclick: async () => {
        await saveSettings({ closedDates: settings.closedDates.filter((d) => d !== date) });
        toast('Gün tekrar açıldı'); render();
      } }, icon('unlock', 20), 'Günü tekrar aç')
    : !weeklyClosed && h('button', { class: 'danger', onclick: async () => {
        if (dayAppts.length && !(await confirmSheet({ title: 'Bu günde randevu var', ok: 'Yine de kapat', cancel: 'Vazgeç',
          lines: [`${trDate(date)} günü için ${dayAppts.length} randevu kayıtlı.`, 'Günü kapatırsan randevular silinmez ama yeni randevu önerilmez.'] }))) return;
        await saveSettings({ closedDates: [...settings.closedDates, date].sort() });
        toast('Gün kapatıldı (tatil)'); render();
      } }, icon('lock', 20), 'Bu günü kapat (tatil / izin)');

  const banner = manualClosed ? h('div', { class: 'banner closed' }, icon('lock', 20), 'Bu gün kapalı (tatil). Randevu önerilmez.')
    : weeklyClosed ? h('div', { class: 'banner closed' }, 'Haftalık programda bu gün kapalı. (Ayarlar’dan değiştirilebilir)')
    : free.length === 0 && date >= today ? h('div', { class: 'banner full' }, 'Koltuklar dolu.') : null;

  const wantNearby = free.length === 0 || showNearby;
  const near = wantNearby ? nearbyFreeDays(date, appointments, { settings, now, limit: 6 }) : [];
  const nearBox = wantNearby && h('section', { class: 'card' },
    h('h2', {}, 'En yakın boş günler'),
    near.length === 0 && h('p', { class: 'muted' }, 'Yakında boş gün bulunamadı.'),
    ...near.map((n) => h('div', { class: 'near' },
      h('button', { class: 'dayhead', onclick: () => go('/day/' + n.date) },
        h('b', {}, `${Math.abs(n.offset)} gün ${n.offset < 0 ? 'önce' : 'sonra'}`), h('span', { class: 'muted' }, trShort(n.date) + ' ' + n.date.slice(0, 4)),
        h('span', { class: 'count' }, n.slots.length + ' boş')),
      h('div', { class: 'chips' }, ...n.slots.slice(0, 8).map((t) => chip(t, () => bookSlot(n.date, t))),
        n.slots.length > 8 && h('button', { class: 'chip ghost', onclick: () => go('/day/' + n.date) }, `+${n.slots.length - 8}`)))));

  // Yatay gün şeridi (seçili gün ortalanır)
  const WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const strip = h('div', { class: 'strip' });
  for (let i = -3; i <= 10; i++) {
    const d = addDays(date, i);
    const closedDay = daySlots(d, settings).length === 0;
    strip.append(h('button', { class: 'sd' + (d === date ? ' sel' : '') + (closedDay ? ' closed' : '') + (d < today ? ' past' : ''), 'aria-label': trDate(d), onclick: () => go('/day/' + d) },
      h('small', {}, WD[parseDate(d).getDay()]), h('b', {}, String(+d.slice(8)))));
  }
  requestAnimationFrame(() => { const s = strip.querySelector('.sel'); if (s) strip.scrollLeft = s.offsetLeft - strip.clientWidth / 2 + s.offsetWidth / 2; });

  const back = h('button', { class: 'ghost', onclick: () => go('/calendar') }, icon('left', 20), 'Takvim');
  return h('div', {}, back, strip, nav, banner,
    h('div', { class: 'slots' }, ...rows),
    free.length > 0 && h('button', { class: 'ghost', onclick: () => { showNearby = !showNearby; render(); } },
      showNearby ? 'Yakın günleri gizle' : 'Önceki / sonraki boş günleri göster'),
    nearBox, h('div', { class: 'spacer' }), closeBtn);
}
