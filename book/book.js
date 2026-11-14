import { h, fill, toast, confirmSheet, sheet } from '/src/ui.js';
import { poleMark, icon, serviceIconName } from '/src/icons.js';
import { trDate, relDay, formatDate, slotEnd, monthMatrix, trMonth, formatPrice } from '/src/core.js';

const WD = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const view = document.getElementById('view');
const today = () => formatDate(new Date());
const lastForm = () => { try { return JSON.parse(localStorage.getItem('uc-who')) || {}; } catch { return {}; } };
const rememberForm = (v) => { try { localStorage.setItem('uc-who', JSON.stringify(v)); } catch { /* özel pencere: sorun değil */ } };

async function api(path, init) {
  let res;
  try { res = await fetch('/api/' + path, { cache: 'no-store', headers: { 'content-type': 'application/json' }, ...init }); }
  catch { throw new Error('Bağlantı yok. İnterneti kontrol edip tekrar dene.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Bir şey ters gitti.'), { code: data.code, status: res.status, retryAfter: data.retryAfter });
  return data;
}

// me: giriş yapmış müşteri {name, phone, appointments}; yoksa numara ekranı (auth) görünür
const ui = {
  cfg: null, days: [], date: null, time: null, month: null, services: new Set(), error: '', me: null, changing: null, done: null,
  auth: { mode: 'login', step: 'phone', phone: lastForm().phone || '', name: lastForm().name || '', masked: '', resendAt: 0, error: '', noAccount: false },
};
let timer = null; // "kodu tekrar gönder" geri sayımı

async function loadMe() {
  try { ui.me = await api('book/me'); } catch { ui.me = null; }
}

async function start() {
  document.getElementById('pole').replaceChildren(poleMark());
  ui.cfg = await api('book/config');
  document.getElementById('title').textContent = ui.cfg.shopName || 'Randevu';
  document.title = (ui.cfg.shopName || 'uChair') + ' · Randevu al';
  if (!ui.cfg.enabled) { fill(view, h('p', { class: 'lead' }, 'Defter şu an kapalı.'), h('p', { class: 'muted' }, 'Online randevu şimdilik alınmıyor. Dükkânı arayabilirsin.')); return; }
  await loadMe();
  if (ui.me) await loadSlots();
  draw();
}

async function loadSlots() {
  ui.days = (await api('book/slots')).days;
  const cur = ui.days.find((d) => d.date === ui.date);
  if (!cur || cur.free.length === 0) ui.date = null; // gün artık dolduysa seçimi bırak
  if (ui.time && !cur?.free.includes(ui.time)) ui.time = null;
  if (!ui.month) ui.month = { y: +ui.days[0].date.slice(0, 4), m: +ui.days[0].date.slice(5, 7) - 1 };
}

// ---------- Giriş / kayıt: numara → SMS kodu ----------
function authScreen() {
  const a = ui.auth;
  clearInterval(timer);
  return a.step === 'code' ? codeStep() : phoneStep();
}

function phoneStep() {
  const a = ui.auth;
  const reg = a.mode === 'register';
  const name = h('input', { class: 'input', placeholder: 'İsim Soyisim', autocomplete: 'name', maxLength: 60, value: a.name });
  const phone = h('input', { class: 'input', placeholder: '05XX XXX XX XX', type: 'tel', inputMode: 'tel', autocomplete: 'tel', value: a.phone });
  const err = h('div', { class: 'err', hidden: !a.error }, a.error);
  const btn = h('button', { class: 'primary' }, 'Kod gönder');
  const fail = (msg, el) => { err.hidden = false; err.textContent = msg; el?.focus(); };
  const submit = async () => {
    a.name = name.value; a.phone = phone.value; a.noAccount = false;
    if (reg && a.name.trim().length < 2) return fail('İsmini ve soyismini yaz.', name);
    if (!a.phone.trim()) return fail('Telefon numarası şart. Kodu bu numaraya göndereceğiz.', phone);
    btn.disabled = true; btn.textContent = 'Gönderiliyor…';
    try {
      const r = await api('auth/request', { method: 'POST', body: JSON.stringify({ phone: a.phone, name: a.name, mode: a.mode }) });
      Object.assign(a, { step: 'code', masked: r.phone, resendAt: Date.now() + r.resendIn * 1000, error: '' });
      draw();
    } catch (e) {
      a.error = e.message; a.noAccount = e.code === 'NO_ACCOUNT';
      if (e.code === 'TOO_SOON') { Object.assign(a, { step: 'code', masked: '', resendAt: Date.now() + (e.retryAfter || 60) * 1000 }); }
      draw();
    }
  };
  btn.onclick = submit;
  for (const el of [name, phone]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const switchMode = (mode) => { Object.assign(a, { mode, error: '', noAccount: false, phone: phone.value, name: name.value }); draw(); };
  return h('div', { class: 'auth' },
    h('p', { class: 'hero' }, reg ? 'Deftere yazılalım.' : 'Koltuğunu ayırtalım.'),
    h('p', { class: 'muted' }, reg ? 'İsmini ve numaranı yaz, SMS ile doğrulayalım.' : 'Numaranı yaz, SMS ile gelen 6 haneli kodla gir.'),
    reg && h('label', { class: 'field' }, h('span', {}, 'İsim Soyisim'), name),
    h('label', { class: 'field' }, h('span', {}, 'Cep telefonu'), phone),
    err,
    a.noAccount && h('button', { onclick: () => switchMode('register') }, 'Müşteri kaydı oluştur'),
    btn,
    h('button', { class: 'ghost', onclick: () => switchMode(reg ? 'login' : 'register') }, reg ? 'Zaten kayıtlıyım, giriş yap' : 'İlk kez mi geliyorsun? Müşteri kaydı'),
    infoTable());
}

// Fiyat listesi | çalışma saatleri: 2 sütun, 1 satır, hep açık
function infoTable() {
  const priced = ui.cfg.services.filter((x) => x.price !== null);
  const hours = ui.cfg.hours ? ui.cfg.hours.split(' · ') : [];
  if (!priced.length && !hours.length) return null;
  return h('section', { class: 'info' },
    h('div', { class: 'info-col' }, h('h3', {}, 'Fiyat listesi'),
      ...priced.map(({ name, price }) => h('div', { class: 'info-row' }, h('span', {}, name), h('span', { class: 'price' }, formatPrice(price))))),
    h('div', { class: 'info-col' }, h('h3', {}, 'Çalışma saatleri'),
      ...hours.map((t) => h('div', { class: 'info-row hrs' }, h('span', {}, t)))));
}

function codeStep() {
  const a = ui.auth;
  const code = h('input', { class: 'input code', type: 'text', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, placeholder: '••••••', 'aria-label': 'Doğrulama kodu' });
  const err = h('div', { class: 'err', hidden: !a.error }, a.error);
  const btn = h('button', { class: 'primary' }, 'Doğrula');
  const resend = h('button', { class: 'ghost' });
  let busy = false;
  const verify = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code.value)) { err.hidden = false; err.textContent = 'Kod 6 haneli.'; code.focus(); return; }
    busy = true; btn.disabled = true; btn.textContent = 'Kontrol ediliyor…';
    try {
      ui.me = await api('auth/verify', { method: 'POST', body: JSON.stringify({ phone: a.phone, code: code.value }) });
      rememberForm({ name: ui.me.name, phone: a.phone.trim() });
      a.step = 'phone'; a.error = '';
      await loadSlots();
      draw();
    } catch (e) {
      busy = false; a.error = e.message;
      if (e.code === 'EXPIRED' || e.code === 'LOCKED') a.resendAt = 0; // yeni kod isteyebilsin
      draw();
    }
  };
  btn.onclick = verify;
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, ''); if (code.value.length === 6) verify(); });
  const tick = () => {
    const left = Math.ceil((a.resendAt - Date.now()) / 1000);
    resend.disabled = left > 0;
    resend.textContent = left > 0 ? `Kodu tekrar gönder (${left} sn)` : 'Kodu tekrar gönder';
  };
  resend.onclick = async () => {
    resend.disabled = true;
    try {
      const r = await api('auth/request', { method: 'POST', body: JSON.stringify({ phone: a.phone, name: a.name, mode: a.mode }) });
      Object.assign(a, { masked: r.phone, resendAt: Date.now() + r.resendIn * 1000, error: '' });
      toast('Yeni kod gönderildi');
    } catch (e) { a.error = e.message; }
    draw();
  };
  tick(); timer = setInterval(tick, 500);
  setTimeout(() => code.focus(), 50);
  return h('div', { class: 'auth' },
    h('p', { class: 'lead' }, 'Kodu yaz.'),
    h('p', { class: 'muted' }, a.masked ? `${a.masked} numarasına 6 haneli bir kod gönderdik.` : 'Numarana gönderilen 6 haneli kodu yaz.'),
    code, err, btn, resend,
    h('button', { class: 'ghost', onclick: () => { Object.assign(a, { step: 'phone', error: '' }); draw(); } }, 'Numarayı değiştir'));
}

async function logout() {
  try { await api('auth/logout', { method: 'POST' }); } catch { /* */ }
  Object.assign(ui, { me: null, changing: null, date: null, time: null, done: null });
  Object.assign(ui.auth, { step: 'phone', error: '', mode: 'login' });
  draw();
}

/** Oturum süresi dolmuşsa numara ekranına döner */
function handleAuthError(e) {
  if (e.status === 401) { Object.assign(ui, { me: null, changing: null }); ui.auth.step = 'phone'; toast('Oturum bitti, tekrar gir'); draw(); return true; }
  return false;
}

async function refreshAfterChange() {
  await Promise.all([loadSlots(), loadMe()]);
  ui.time = null; ui.date = null; ui.changing = null; ui.error = '';
  draw();
}

async function cancelAppt(a) {
  const ok = await confirmSheet({ title: 'Randevu iptal edilsin mi?', ok: 'Evet, iptal et', cancel: 'Vazgeç', lines: [{ text: `${trDate(a.date)}, ${a.time}`, strong: true }, 'İptal edince yerine yeni randevu alabilirsin.'] });
  if (!ok) return;
  try { await api(`book/me/${a.id}`, { method: 'DELETE' }); toast('Randevu iptal edildi'); await refreshAfterChange(); }
  catch (e) { if (!handleAuthError(e)) { toast(e.message); await refreshAfterChange(); } }
}

function myBlock() {
  const list = ui.me.appointments;
  return h('section', { class: 'mine' },
    h('div', { class: 'minehead' }, h('h2', {}, list.length ? 'Randevum' : ui.me.name), h('span', { class: 'muted grow' }, list.length ? ui.me.name : ''),
      h('button', { class: 'ghost', onclick: logout }, 'Çıkış')),
    ...list.map((a) => h('div', { class: 'appt' },
      h('p', { class: 'big' }, trDate(a.date)),
      h('p', { class: 'at' }, `${a.time}–${slotEnd(a.time, { slotMinutes: ui.cfg.slotMinutes })}`),
      h('p', { class: 'muted' }, [relDay(a.date, today()), ...a.services].join(' · ')),
      h('div', { class: 'two' },
        h('button', { class: ui.changing?.id === a.id ? 'on' : '', onclick: () => { ui.changing = a; ui.date = null; ui.time = null; ui.error = ''; draw(); document.getElementById('scroll').scrollTop = 0; } }, 'Saati değiştir'),
        h('button', { class: 'danger', onclick: () => cancelAppt(a) }, 'İptal et')))));
}

function calendar() {
  const byDate = Object.fromEntries(ui.days.map((d) => [d.date, d]));
  const first = ui.days[0].date, last = ui.days.at(-1).date;
  const idx = (y, m) => y * 12 + m;
  const lo = idx(+first.slice(0, 4), +first.slice(5, 7) - 1), hi = idx(+last.slice(0, 4), +last.slice(5, 7) - 1);
  const cur = idx(ui.month.y, ui.month.m);
  const shift = (n) => { const d = new Date(ui.month.y, ui.month.m + n, 1); ui.month = { y: d.getFullYear(), m: d.getMonth() }; draw(true); };
  const cells = monthMatrix(ui.month.y, ui.month.m).flat().map((date) => {
    if (!date) return h('div', { class: 'mc empty' });
    const info = byDate[date];
    const free = info?.free.length > 0;
    const cls = !info ? 'past' : !free ? 'closed' : '';
    return h('button', { class: `mc ${cls}${date === ui.date ? ' sel' : ''}${date === today() ? ' today' : ''}`, disabled: !free,
      'aria-label': trDate(date) + (info && !free ? (info.closed ? ', kapalı' : ', dolu') : ''),
      onclick: () => { ui.date = date; ui.time = null; ui.error = ''; draw(true); } }, String(+date.slice(8)));
  });
  return h('div', {},
    h('div', { class: 'mnav' },
      h('button', { class: 'iconbtn', disabled: cur <= lo, 'aria-label': 'Önceki ay', onclick: () => shift(-1) }, icon('left', 20)),
      h('b', { class: 'grow center' }, trMonth(ui.month.y, ui.month.m)),
      h('button', { class: 'iconbtn', disabled: cur >= hi, 'aria-label': 'Sonraki ay', onclick: () => shift(1) }, icon('right', 20))),
    h('div', { class: 'mgrid wd' }, ...WD.map((x) => h('div', {}, x))),
    h('div', { class: 'mgrid' }, ...cells),
    h('p', { class: 'fine' }, 'Taralı günler dolu ya da kapalı. En fazla ' + ui.cfg.daysAhead + ' gün ilerisine bakılır.'));
}

function slotStep() {
  const day = ui.days.find((d) => d.date === ui.date);
  return h('section', { class: 'step' },
    h('h2', {}, '1 · Gün ve saat'),
    calendar(),
    day && [
      h('div', { class: 'pick' }, h('b', {}, trDate(ui.date)), h('small', { class: 'muted' }, relDay(ui.date, today()))),
      h('div', { class: 'chips' }, ...day.slots.map((t) => {
        const free = day.free.includes(t);
        return h('button', { class: 'chip' + (t === ui.time ? ' on' : '') + (free ? '' : ' taken'), disabled: !free, 'aria-label': t + (free ? '' : ', dolu'),
          onclick: () => { ui.time = t; ui.error = ''; draw(true); document.getElementById('form-step').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } }, t);
      })),
      h('p', { class: 'fine' }, 'Gri saatler dolu.')]);
}

function changeStep() {
  const a = ui.changing;
  const err = h('div', { class: 'err', hidden: !ui.error }, ui.error);
  const btn = h('button', { class: 'primary' }, 'Saati değiştir');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = 'Yazılıyor…';
    try {
      await api(`book/me/${a.id}`, { method: 'PUT', body: JSON.stringify({ date: ui.date, time: ui.time }) });
      toast('Saat değişti'); await refreshAfterChange(); document.getElementById('scroll').scrollTop = 0;
    } catch (e) {
      if (handleAuthError(e)) return;
      ui.error = e.message;
      if (e.code === 'TAKEN') { try { await loadSlots(); } catch { /* */ } }
      draw(true);
    }
  };
  return h('section', { class: 'step', id: 'form-step' },
    h('h2', {}, '2 · Yeni saat'),
    h('p', { class: 'muted' }, `Eski: ${trDate(a.date)}, ${a.time}`),
    h('div', { class: 'pick' }, h('b', {}, trDate(ui.date)), h('span', {}, ui.time)),
    err, btn,
    h('button', { class: 'ghost', onclick: () => { ui.changing = null; ui.time = null; ui.error = ''; draw(); } }, 'Vazgeç'));
}

function priceList() {
  sheet('Fiyat listesi', () => h('div', { class: 'list' },
    ...ui.cfg.services.map(({ name, price }) => h('div', { class: 'row static' },
      h('span', { class: 'grow name' }, name), h('span', { class: 'price' }, price !== null ? formatPrice(price) : '—')))));
}

function bookStep() {
  const err = h('div', { class: 'err', hidden: !ui.error }, ui.error);
  const btn = h('button', { class: 'primary' }, 'Randevu al');
  const hasServices = ui.cfg.services.length > 0;
  const hasPrices = ui.cfg.services.some((x) => x.price !== null);
  btn.onclick = async () => {
    if (hasServices && ui.services.size === 0) { ui.error = 'Ne yaptıracağını seç (en az bir işlem).'; draw(true); return; }
    btn.disabled = true; btn.textContent = 'Yazılıyor…';
    try {
      const r = await api('book', { method: 'POST', body: JSON.stringify({ date: ui.date, time: ui.time, services: [...ui.services] }) });
      await loadMe();
      Object.assign(ui, { done: r, time: null, date: null, error: '' }); ui.services.clear();
      draw();
    } catch (e) {
      if (handleAuthError(e)) return;
      ui.error = e.message;
      if (e.code === 'TAKEN' || e.code === 'ACTIVE') { try { await Promise.all([loadSlots(), loadMe()]); } catch { /* */ } }
      draw(true);
    }
  };
  return h('section', { class: 'step', id: 'form-step' },
    h('h2', {}, '2 · Onay'),
    h('div', { class: 'pick' }, h('b', {}, trDate(ui.date)), h('span', {}, ui.time)),
    hasServices && [
      h('div', { class: 'askrow' }, h('p', { class: 'muted grow' }, 'Ne yaptıracaksın?'),
        hasPrices && h('button', { class: 'ghost', onclick: priceList }, 'Fiyat listesi')),
      h('div', { class: 'chips two-col' }, ...ui.cfg.services.map(({ name }) => h('button', { class: 'chip svc' + (ui.services.has(name) ? ' on' : ''),
        onclick: () => { ui.services.has(name) ? ui.services.delete(name) : ui.services.add(name); ui.error = ''; draw(true); } }, name)))],
    err, btn,
    h('p', { class: 'fine' }, 'Aynı anda 1 randevu tutulabilir; randevu saatin geçince yenisini alabilirsin.'));
}

function doneView() {
  const r = ui.done;
  return h('div', {},
    h('p', { class: 'lead' }, 'Koltuk senin.'),
    h('div', { class: 'ticket' },
      h('p', { class: 'when' }, trDate(r.date)),
      h('p', { class: 'at' }, `${r.time}–${slotEnd(r.time, { slotMinutes: ui.cfg.slotMinutes })}`),
      h('p', { class: 'meta' }, [r.name, ...r.services].join(' · '))),
    h('p', { class: 'muted' }, 'Saatini değiştirmek ya da iptal etmek için bu sayfaya numaranla gir. Gelemeyeceksen iptal et ki başkası oturabilsin.'),
    h('button', { class: 'ghost', onclick: () => { ui.done = null; draw(); } }, 'Randevuma git'));
}

function draw(keepScroll = false) {
  const sc = document.getElementById('scroll');
  const y = sc.scrollTop;
  clearInterval(timer);
  if (!ui.me) { fill(view, authScreen()); sc.scrollTop = 0; return; }
  if (ui.done) { fill(view, doneView()); sc.scrollTop = 0; return; }
  const hasActive = ui.me.appointments.length > 0 && !ui.changing;
  fill(view,
    myBlock(),
    ui.me.ban ? h('div', { class: 'err' }, ui.me.ban.message)
    : hasActive
      ? h('p', { class: 'muted' }, 'Bekleyen randevun varken yenisini alamazsın. Saatini değiştirebilir ya da iptal edebilirsin; randevu saatin geçince yenisini alırsın.')
      : [h('p', { class: 'lead' }, ui.changing ? 'Yeni saatini seç.' : 'Koltuğunu ayırt.'), slotStep(), ui.time && (ui.changing ? changeStep() : bookStep())]);
  if (keepScroll) sc.scrollTop = y;
}

window.addEventListener('unhandledrejection', (e) => toast(e.reason?.message || 'Hata'));
start().catch((e) => { fill(view, h('p', { class: 'lead' }, 'Defter açılamadı.'), h('p', { class: 'muted' }, e.message), h('button', { onclick: () => location.reload() }, 'Tekrar dene')); });
