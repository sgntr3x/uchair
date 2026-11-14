import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.js';
import { runBackup, backupName, msUntilMidnight } from '../server/backup.js';

test('yedek: dosya açılır ve veriyi içerir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uc-'));
  const store = openStore(join(dir, 'uchair.db'));
  store.put('customers', { id: 'c1', name: 'Ali' });
  const file = runBackup(store, join(dir, 'backups'), { now: new Date(2026, 10, 15, 0, 0, 5) });
  assert.ok(file.endsWith('uchair-2026-11-15.db'));
  const copy = openStore(file);
  assert.deepEqual(copy.getAll('customers'), [{ id: 'c1', name: 'Ali' }]);
  copy.close();
  runBackup(store, join(dir, 'backups'), { now: new Date(2026, 10, 15, 3) }); // aynı gün tekrar: hata vermez
  store.close();
});

test('yedek: sadece son N tutulur, başka dosyalara dokunulmaz', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uc-'));
  const store = openStore(join(dir, 'uchair.db'));
  const b = join(dir, 'backups');
  runBackup(store, b, { now: new Date(2026, 10, 1) });
  writeFileSync(join(b, 'not.txt'), 'x');
  for (let d = 2; d <= 5; d++) runBackup(store, b, { now: new Date(2026, 10, d), keep: 3 });
  assert.deepEqual(readdirSync(b).sort(), ['not.txt', backupName(new Date(2026, 10, 3)), backupName(new Date(2026, 10, 4)), backupName(new Date(2026, 10, 5))]);
  store.close();
});

test('gece yarısına kalan süre', () => {
  assert.equal(msUntilMidnight(new Date(2026, 10, 14, 23, 0, 0)), 3600000);
  assert.equal(msUntilMidnight(new Date(2026, 10, 14, 0, 0, 0)), 86400000);
});
