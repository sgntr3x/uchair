// IndexedDB veri katmanı. Store'lar: customers, appointments, settings
import { DEFAULT_SETTINGS } from './core.js';

const DB_NAME = 'uchair';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('customers', { keyPath: 'id' });
        const ap = db.createObjectStore('appointments', { keyPath: 'id' });
        ap.createIndex('date', 'date');
        db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result.result !== undefined ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// crypto.randomUUID sadece HTTPS'te var; http (yerel test) için yedek üretici
export const uid = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
export const remove = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));

export async function getSettings() {
  const row = await tx('settings', 'readonly', (s) => s.get('main'));
  return row ? { ...DEFAULT_SETTINGS, ...row.value } : DEFAULT_SETTINGS;
}
export const saveSettings = (value) => put('settings', { key: 'main', value });

export async function exportAll() {
  return {
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    customers: await getAll('customers'),
    appointments: await getAll('appointments'),
    settings: await getSettings(),
  };
}

export async function importAll(data) {
  for (const c of data.customers || []) await put('customers', c);
  for (const a of data.appointments || []) await put('appointments', a);
  if (data.settings) await saveSettings(data.settings);
}

// iOS'un veriyi silmesine karşı kalıcı depolama iste
export async function requestPersistence() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}

// 1 aydan eski randevuları sil (müşteriler silinmez). Uygulama açılışında çağrılır.
export async function purgeOldAppointments(now = new Date(), days = 30) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const pad = (n) => String(n).padStart(2, '0');
  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
  const all = await getAll('appointments');
  const old = all.filter((a) => a.date < cutoffStr);
  for (const a of old) await remove('appointments', a.id);
  return old.length;
}
