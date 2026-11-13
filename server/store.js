// SQLite veri katmanı (node:sqlite, Node 22.13+). Tek dosya: data/uchair.db
// Her kayıt JSON olarak saklanır; randevularda (date,time) UNIQUE: aynı saate iki kayıt veritabanı seviyesinde engellenir.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const STORES = { customers: 'id', appointments: 'id', settings: 'key' };

export function openStore(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    DROP TABLE IF EXISTS pins; -- eski şifre sistemi kaldırıldı
    CREATE TABLE IF NOT EXISTS otps (
      phone TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, name TEXT NOT NULL DEFAULT '', sent_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL, data TEXT NOT NULL,
      UNIQUE (date, time)
    );
  `);
  const q = (sql) => db.prepare(sql);
  const stmt = {
    all: Object.fromEntries(Object.keys(STORES).map((s) => [s, q(`SELECT data FROM ${s}`)])),
    putPlain: (s) => q(`INSERT INTO ${s} (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data`),
    putAppt: q(`INSERT INTO appointments (id, date, time, data) VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET date = excluded.date, time = excluded.time, data = excluded.data`),
    del: (s) => q(`DELETE FROM ${s} WHERE id = ?`),
  };
  const put = { customers: stmt.putPlain('customers'), settings: stmt.putPlain('settings') };
  const del = Object.fromEntries(Object.keys(STORES).map((s) => [s, stmt.del(s)]));

  return {
    getAll: (store) => stmt.all[store].all().map((r) => JSON.parse(r.data)),
    /** Kayıt ekler/günceller. Randevuda saat doluysa Error('SLOT_TAKEN') fırlatır. */
    put(store, value) {
      const id = value[STORES[store]];
      if (typeof id !== 'string' || !id) throw new Error('BAD_ID');
      try {
        if (store === 'appointments') stmt.putAppt.run(id, value.date, value.time, JSON.stringify(value));
        else put[store].run(id, JSON.stringify(value));
      } catch (e) {
        if (/UNIQUE/i.test(e.message)) throw new Error('SLOT_TAKEN');
        throw e;
      }
    },
    remove: (store, id) => { del[store].run(id); },
    /** SMS doğrulama kodu (numara başına tek aktif kod; hash'li) */
    getOtp: (phone) => q('SELECT * FROM otps WHERE phone = ?').get(phone),
    setOtp: (o) => { q(`INSERT INTO otps (phone, salt, hash, expires, attempts, name, sent_at) VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET salt = excluded.salt, hash = excluded.hash, expires = excluded.expires, attempts = 0, name = excluded.name, sent_at = excluded.sent_at`)
      .run(o.phone, o.salt, o.hash, o.expires, o.name || '', o.sent_at); },
    bumpOtp: (phone) => { q('UPDATE otps SET attempts = attempts + 1 WHERE phone = ?').run(phone); },
    delOtp: (phone) => { q('DELETE FROM otps WHERE phone = ?').run(phone); },
    /** Birden fazla yazmayı tek işlemde yapar (hepsi ya da hiçbiri) */
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    close: () => db.close(),
  };
}
