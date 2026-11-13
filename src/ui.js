import { icon } from './icons.js';
// Küçük DOM yardımcıları. Metinler her zaman textContent ile yazılır (XSS yok).
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  const late = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'selected' || k === 'checked') late[k] = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  append(el, kids);
  Object.assign(el, late);
  return el;
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** Elemanın içeriğini değiştirir; false/null çocukları yok sayar */
export function fill(el, ...kids) { el.replaceChildren(); append(el, kids); }

export const render = () => window.dispatchEvent(new Event('uc:render'));
export const go = (path) => { location.hash = '#' + path; };

export function toast(msg, { action, onAction } = {}) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast' }, h('span', {}, msg),
    action && h('button', { onclick: () => { t.remove(); onAction?.(); } }, action));
  document.body.append(t);
  setTimeout(() => t.remove(), action ? 4000 : 2000); // "Geri al" varsa biraz uzun kalır
}

/** Alttan açılan pencere. build(close) bir Node döndürür. */
export function sheet(title, build, { locked = false, onClose } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const close = () => { overlay.remove(); onClose?.(); };
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (!locked && e.target === overlay) close(); } },
    h('div', { class: 'sheet' }, h('div', { class: 'grab' }),
      h('div', { class: 'sheet-head' }, h('strong', {}, title), !locked && h('button', { class: 'iconbtn', 'aria-label': 'Kapat', onclick: close }, icon('close', 22))),
      body));
  body.append(build(close));
  document.body.append(overlay);
  return close;
}

export const chip = (label, onclick, cls = '') => h('button', { class: 'chip ' + cls, onclick }, label);

/** Evet/Vazgeç penceresi. Promise<boolean> döner. lines: açıklama satırları */
export function confirmSheet({ title, lines = [], ok = 'Evet', cancel = 'Vazgeç' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    sheet(title, (close) => h('div', { class: 'form' },
      ...lines.map((l) => h('p', { class: l.strong ? 'big' : '' }, l.text ?? l)),
      h('button', { class: 'primary', onclick: () => { finish(true); close(); } }, ok),
      h('button', { onclick: () => close() }, cancel)), { onClose: () => finish(false) });
  });
}
