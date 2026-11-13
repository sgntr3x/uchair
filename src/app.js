import { requestPersistence, purgeOldAppointments } from './db.js';
import { load, state } from './store.js';
import { h, go, sheet, toast } from './ui.js';
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
  view.classList.toggle('with-fab', name === '' || name === 'calendar');
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

async function main() {
  buildTabs();
  document.getElementById('pole').replaceChildren(poleMark());
  // Beklenmeyen hata olursa sessiz kalmasın
  window.addEventListener('error', (e) => toast('Hata: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => toast('Hata: ' + (e.reason?.message || e.reason)));
  requestPersistence();
  try { await purgeOldAppointments(); } catch (e) { console.warn('purge', e); }
  await load();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const toTop = () => { document.getElementById('scroll').scrollTop = 0; };
  window.addEventListener('hashchange', () => { route(); toTop(); });
  window.addEventListener('uc:render', route);
  route();
  maybeForceBackup();
  // Uygulama arka plandan dönünce (gün değişmiş olabilir) tazele
  document.addEventListener('visibilitychange', () => { if (!document.hidden) route(); });
}
main().catch((e) => { document.getElementById('view').textContent = 'Hata: ' + e.message; console.error(e); });
