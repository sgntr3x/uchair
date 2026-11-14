import { requestPersistence, purgeOldAppointments, initData, isRemote, login } from './db.js';
import { load, state } from './store.js';
import { h, go, sheet, toast, closeSheets } from './ui.js';
import { backupDue, formatDate, trDate } from './core.js';
import { icon, poleMark } from './icons.js';
import { runBackup } from './backup.js';
import { dayView } from './views/day.js';
import { calendarView } from './views/calendar.js';
import { customersView, customerView } from './views/customers.js';
import { settingsView } from './views/settings.js';
import { importView } from './views/import.js';
import { bulkView } from './views/bulk.js';

const TABS = [['/calendar', 'calendar', 'Takvim', 'calendar'], ['/customers', 'user', 'Müşteriler', 'customers'], ['/settings', 'sliders', 'Ayarlar', 'settings']];

function route() {
  const [, name = '', arg] = location.hash.slice(1).split('/');
  const view = document.getElementById('view');
  let node, title = 'uChair';
  switch (name) {
    case 'calendar': node = calendarView(); title = state.settings.shopName || 'uChair'; break;
    case 'day': node = dayView(arg || formatDate(new Date())); title = ''; break;
    case 'customers': node = customersView(); title = 'Müşteriler'; break;
    case 'customer': node = customerView(arg); title = 'Müşteri'; break;
    case 'settings': node = settingsView(); title = 'Ayarlar'; break;
    case 'import': node = importView(); title = 'İçe aktar'; break;
    case 'bulk': node = bulkView(); title = 'Müşteriler'; break;
    default: node = calendarView(); title = state.settings.shopName || 'uChair';
  }
  const t = document.getElementById('title'); t.textContent = title; t.parentElement.hidden = !title;
  view.replaceChildren(node);
  view.classList.toggle('with-fab', name === '' || name === 'calendar' || node.dataset?.fab === '1');
  const active = name === 'day' ? 'calendar' : name === 'customer' || name === 'bulk' ? 'customers' : name === 'import' ? 'settings' : name || 'calendar';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.k === active));
}

function buildTabs() {
  document.getElementById('tabs').replaceChildren(...TABS.map(([p, ico, label, k]) =>
    h('a', { href: '#' + p, 'data-k': k }, icon(ico, 24), h('span', {}, label))));
}

function maybeForceBackup() {
  const hasData = state.customers.length + state.appointments.length > 0;
  if (!backupDue(state.settings, hasData)) return;
  sheet('Haftalık yedek zamanı', (close) => h('div', { class: 'form' },
    h('p', {}, 'Verilerin sadece bu telefonda duruyor. Telefon bozulursa kaybolmasın diye yedeği iCloud’a veya WhatsApp’a gönder.'),
    h('p', { class: 'muted' }, 'Aşağıdaki tuşa bas → açılan menüden “Dosyalara Kaydet” (iCloud Drive) ya da WhatsApp’ı seç.'),
    h('button', { class: 'primary', onclick: async () => { if (await runBackup()) { close(); toast('Yedek alındı, teşekkürler'); } } }, icon('upload'), 'Şimdi yedekle')),
  { locked: true });
}

/** Sunucu modunda giriş ekranı (kullanıcı adı + şifre). Giriş olunca resolve eder. */
function loginScreen() {
  return new Promise((resolve) => {
    document.getElementById('tabs').hidden = true;
    const view = document.getElementById('view');
    const user = h('input', { class: 'input', placeholder: 'Kullanıcı adı', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: false, value: localStorage.getItem('uc-user') || '' });
    const pw = h('input', { class: 'input', type: 'password', placeholder: 'Şifre', autocomplete: 'current-password' });
    const err = h('p', { class: 'warn' });
    const btn = h('button', { class: 'primary' }, 'Gir');
    const submit = async () => {
      btn.disabled = true;
      try { await login(user.value, pw.value); localStorage.setItem('uc-user', user.value.trim()); document.getElementById('tabs').hidden = false; resolve(); }
      catch (e) { err.textContent = e.message; pw.select(); btn.disabled = false; }
    };
    btn.onclick = submit;
    for (const el of [user, pw]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    view.replaceChildren(h('div', { class: 'form' },
      h('h2', {}, 'Dükkân kapısı'), h('p', { class: 'muted' }, 'İçeri girmek için kullanıcı adı ve şifreyi yaz.'),
      user, pw, err, btn));
    setTimeout(() => (user.value ? pw : user).focus(), 50);
  });
}

/** Sunucu modunda başka yerden (müşteri online randevusu, başka cihaz) gelenleri çek */
async function refresh() {
  if (!isRemote() || document.hidden || document.querySelector('.overlay') || document.activeElement?.matches('input, textarea')) return;
  try { await load(); route(); } catch { /* bağlantı geçici koptu: sonraki turda dener */ }
}

async function main() {
  buildTabs();
  document.getElementById('pole').replaceChildren(poleMark());
  // Beklenmeyen hata olursa sessiz kalmasın
  window.addEventListener('error', (e) => toast('Hata: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => toast('Hata: ' + (e.reason?.message || e.reason)));
  const mode = await initData();
  if (mode === 'login') await loginScreen();
  if (mode === 'local') requestPersistence();
  try { await purgeOldAppointments(); } catch (e) { console.warn('purge', e); }
  await load();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const toTop = () => { document.getElementById('scroll').scrollTop = 0; };
  window.addEventListener('hashchange', () => { closeSheets(); route(); toTop(); });
  window.addEventListener('uc:render', route);
  route();
  if (!isRemote()) maybeForceBackup(); // sunucuda veri zaten sunucuda yedekli
  // Uygulama arka plandan dönünce (gün değişmiş olabilir, online randevu gelmiş olabilir) tazele
  document.addEventListener('visibilitychange', () => { if (!document.hidden) isRemote() ? refresh() : route(); });
  setInterval(refresh, 30000);
}
main().catch((e) => { document.getElementById('view').textContent = 'Hata: ' + e.message; console.error(e); });
