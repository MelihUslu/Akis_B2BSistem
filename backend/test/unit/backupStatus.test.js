import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { backupRuns, driveStatus, backupOverview } from '../../src/services/backupStatus.js';

const hoursAgo = (h) => new Date(Date.now() - h * 36e5).toISOString();
const run = (h, drive, extra = {}) => ({ start: hoursAgo(h), end: hoursAgo(h), ok: drive.status !== 'hata', drive: { error: '', folderLink: '', ...drive }, ...extra });

test('yedek geçmişi: en yeni önce, bozuk satır atlanır, dosya yoksa boş', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yedek-'));
  process.env.BACKUP_DIR = dir;
  assert.deepEqual(await backupRuns(), []);
  await fs.writeFile(path.join(dir, '.yedek-gecmisi.jsonl'), `${JSON.stringify(run(48, { status: 'ok' }))}\n{bozuk\n${JSON.stringify(run(24, { status: 'kapali' }))}\n`);
  const runs = await backupRuns();
  assert.equal(runs.length, 2);
  assert.ok(new Date(runs[0].start) > new Date(runs[1].start));
  await fs.writeFile(path.join(dir, 'db-20261106-030000.dump'), 'x');
  const overview = await backupOverview();
  assert.equal(overview.backup.file, 'db-20261106-030000.dump');
  assert.equal(overview.runs.length, 2);
  await fs.rm(dir, { recursive: true });
  delete process.env.BACKUP_DIR;
});

test('Drive durumu: kurulmamış, başarılı, son deneme hatalı, son başarılı kopya eski', () => {
  assert.equal(driveStatus([run(2, { status: 'kapali' })]).configured, false);

  const ok = driveStatus([run(2, { status: 'ok', folderLink: 'https://drive.google.com/drive/folders/abc' }), run(26, { status: 'ok' })]);
  assert.equal(ok.ok, true);
  assert.equal(ok.ageHours, 2);
  assert.equal(ok.folderLink, 'https://drive.google.com/drive/folders/abc');

  const failed = driveStatus([run(2, { status: 'hata', error: 'kota doldu' }), run(26, { status: 'ok' })]);
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'kota doldu');
  assert.equal(failed.ageHours, 26);

  // Yerel yedek başarısız olunca Drive adımına gelinmez: hata yerel yedeğin hatasıdır
  const skipped = driveStatus([run(2, { status: 'atlandi' }, { error: 'Veritabanı yedeği başarısız' }), run(30, { status: 'ok' })]);
  assert.equal(skipped.ok, false);
  assert.equal(skipped.error, 'Veritabanı yedeği başarısız');

  assert.equal(driveStatus([run(30, { status: 'ok' })]).ok, false, '26 saatten eski kopya uyarı verir');
});
