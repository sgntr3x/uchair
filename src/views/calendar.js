import { icon } from '../icons.js';
import { h, go, chip, render } from '../ui.js';
import { state } from '../store.js';
import { monthMatrix, dayStatus, trMonth, formatDate, nearestFree, relDay, trDate } from '../core.js';
import { bookSlot, slotPicker } from '../flows.js';

const now0 = new Date();
let cal = { y: now0.getFullYear(), m: now0.getMonth() };
let daysShown = 3;

export function calendarView() {
  const now = new Date();
  const today = formatDate(now);
  const shift = (n) => { const d = new Date(cal.y, cal.m + n, 1); cal = { y: d.getFullYear(), m: d.getMonth() }; window.dispatchEvent(new Event('uc:render')); };

  const head = h('div', { class: 'daynav' },
    h('button', { onclick: () => shift(-1) }, icon('left')),
    h('div', { class: 'grow center' }, h('b', {}, trMonth(cal.y, cal.m))),
    h('button', { onclick: () => shift(1) }, icon('right')));

  const weekdays = h('div', { class: 'grid wd' }, ...['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => h('div', {}, d)));

  const cells = monthMatrix(cal.y, cal.m).flat().map((date) => {
    if (!date) return h('div', { class: 'cell empty' });
    const st = dayStatus(date, state.appointments, state.settings, now);
    let cls = 'free', sub = st.free + ' boş';
    if (st.closed) { cls = 'closed'; sub = st.manualClosed ? 'tatil' : 'kapalı'; }
    else if (st.past) { cls = 'past'; sub = st.taken ? st.taken + ' rnd' : ''; }
    else if (st.free === 0) { cls = 'full'; sub = 'dolu'; }
    else if (st.taken > 0) cls = 'partial';
    return h('button', { class: `cell ${cls} ${date === today ? 'today' : ''}`, onclick: () => go('/day/' + date) },
      h('span', { class: 'dn' }, String(+date.slice(8))), h('span', { class: 'sub' }, sub), st.total > 0 && !st.past && h('span', { class: 'bar' }, h('i', { style: `width:${Math.round(100 * st.taken / st.total)}%` })));
  });

  // En yakın boş saatler (güne göre gruplu)
  const free = nearestFree(state.appointments, { settings: state.settings, now, limit: 600, maxDays: 90 });
  const groups = [];
  for (const s of free) {
    const g = groups[groups.length - 1];
    if (g && g.date === s.date) g.times.push(s.time); else groups.push({ date: s.date, times: [s.time] });
  }
  const nearest = h('section', { class: 'card' }, h('h2', {}, 'En yakın boş saatler'),
    groups.length === 0 && h('p', { class: 'muted' }, 'Önümüzdeki 90 günde koltuk boş değil.'),
    ...groups.slice(0, daysShown).map((g) => h('div', { class: 'daygroup' },
      h('button', { class: 'dayhead', onclick: () => go('/day/' + g.date) },
        h('b', {}, relDay(g.date, today)), h('span', { class: 'muted' }, trDate(g.date)),
        h('span', { class: 'count' }, g.times.length + ' boş')),
      h('div', { class: 'chips' }, ...g.times.map((t) => chip(t, () => bookSlot(g.date, t)))))),
    groups.length > daysShown && h('button', { onclick: () => { daysShown += 3; render(); } }, 'Sonraki günleri göster'));

  return h('div', {}, head, weekdays, h('div', { class: 'grid' }, ...cells),
    h('div', { class: 'legend' }, ...[['free', 'boş yer var'], ['partial', 'kısmen dolu'], ['full', 'dolu'], ['closed', 'kapalı / tatil']].map(([k, l]) => h('span', {}, h('i', { class: 'sw ' + k }), l))),
    h('button', { class: 'ghost', onclick: () => { const n = new Date(); cal = { y: n.getFullYear(), m: n.getMonth() }; window.dispatchEvent(new Event('uc:render')); } }, 'Bu aya dön'),
    h('div', { class: 'spacer' }), nearest,
    h('div', { class: 'fab-wrap' }, h('button', { class: 'primary fab', onclick: () => slotPicker({ title: 'Randevu al', startDate: today, onPick: (d, t) => bookSlot(d, t) }) }, icon('plus', 24), 'Randevu al')));
}
