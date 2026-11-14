// Sunucu veritabanının günlük yedeği (SADECE online sürüm; telefondaki yerel sürüme dokunmaz).
// Her gece 00:00'da (TZ: Europe/Istanbul) data/backups/uchair-YYYY-MM-DD.db üretir, son N yedeği tutar.
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const pad = (n) => String(n).padStart(2, '0');
export const backupName = (d) => `uchair-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.db`;
const NAME = /^uchair-\d{4}-\d{2}-\d{2}\.db$/;

/** Bir yedek alır ve eskileri temizler. Aynı gün ikinci kez çalışırsa dosyanın üstüne yazar. */
export function runBackup(store, dir, { now = new Date(), keep = 30 } = {}) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, backupName(now));
  if (existsSync(file)) rmSync(file);   // VACUUM INTO var olan dosyaya yazmaz
  store.backupTo(file);                 // tutarlı anlık kopya (WAL açıkken de güvenli)
  const old = readdirSync(dir).filter((f) => NAME.test(f)).sort().slice(0, -keep);
  for (const f of old) rmSync(join(dir, f), { force: true });
  return file;
}

/** Bir sonraki gece yarısına kadar kaç ms */
export const msUntilMidnight = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

/** Her gece yarısı yedek alır. Dönen fonksiyon zamanlayıcıyı durdurur. */
export function scheduleNightly(store, dir, { log = console, keep = 30 } = {}) {
  let timer;
  const arm = () => {
    timer = setTimeout(() => {
      try { log.log('Yedek alındı:', runBackup(store, dir, { keep })); } catch (e) { log.error('YEDEK ALINAMADI:', e.message); }
      arm();
    }, msUntilMidnight() + 1000);
    timer.unref?.();
  };
  arm();
  return () => clearTimeout(timer);
}
