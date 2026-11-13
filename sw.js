const CACHE = 'uchair-v9';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'src/style.css', 'src/icons.js', 'icons/icon-180.png', 'icons/icon-512.png', 'fonts/fraunces-latin-600-normal.woff2', 'fonts/fraunces-latin-ext-600-normal.woff2', 'fonts/fraunces-latin-700-normal.woff2', 'fonts/fraunces-latin-ext-700-normal.woff2', 'fonts/instrument-sans-latin-400-normal.woff2', 'fonts/instrument-sans-latin-ext-400-normal.woff2', 'fonts/instrument-sans-latin-500-normal.woff2', 'fonts/instrument-sans-latin-ext-500-normal.woff2', 'fonts/instrument-sans-latin-600-normal.woff2', 'fonts/instrument-sans-latin-ext-600-normal.woff2', 'fonts/instrument-sans-latin-700-normal.woff2', 'fonts/instrument-sans-latin-ext-700-normal.woff2', 'src/app.js', 'src/core.js', 'src/db.js', 'src/store.js', 'src/ui.js', 'src/flows.js', 'src/backup.js', 'src/notesImport.js',
  'src/views/day.js', 'src/views/calendar.js', 'src/views/customers.js', 'src/views/settings.js', 'src/views/import.js', 'src/views/bulk.js', 'src/customersImport.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Önce ağ, olmazsa önbellek (güncellemeler hemen gelsin, offline da çalışsın)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
