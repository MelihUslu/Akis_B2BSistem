import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xlsx from 'xlsx';
import { openXlsx } from '../../src/utils/xlsxStream.js';

const tmp = () => path.join(os.tmpdir(), `xlsx-akis-test-${process.pid}-${Math.random().toString(36).slice(2)}.xlsx`);

test('akışlı Excel: SheetJS ile geri okunur; metin, sayı, mantıksal, boş hücre ve özel karakterler korunur', async () => {
  const file = tmp();
  const book = openXlsx(file);
  const s = await book.sheet('Siparişler');
  await s.row(['id', 'ad', 'tutar', 'aktif', 'not']);
  await s.row([1, 'Çağrı & Şükrü <A.Ş.> "özel"', 1234.56, true, null]);
  await s.row([2, '  boşluklu  ', -0.5, false, 'satır\nsonu\u0001kontrol']);
  await s.end();
  const t = await book.sheet('Boş: sayfa/adı?');
  await t.row(['bilgi']);
  await t.row(['Kayıt yok']);
  await t.end();
  await book.close();

  const wb = xlsx.read(fs.readFileSync(file));
  fs.rmSync(file);
  assert.deepEqual(wb.SheetNames, ['Siparişler', 'Boş  sayfa adı ']);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets['Siparişler'], { defval: null });
  assert.deepEqual(rows, [
    { id: 1, ad: 'Çağrı & Şükrü <A.Ş.> "özel"', tutar: 1234.56, aktif: true, not: null },
    { id: 2, ad: '  boşluklu  ', tutar: -0.5, aktif: false, not: 'satır\nsonukontrol' }
  ]);
  assert.deepEqual(xlsx.utils.sheet_to_json(wb.Sheets['Boş  sayfa adı ']), [{ bilgi: 'Kayıt yok' }]);
});

test('akışlı Excel: çok satırlı sayfa (27+ sütun harfi) ve yarıda bırakılan dosya silinir', async () => {
  const file = tmp();
  const book = openXlsx(file);
  const s = await book.sheet('Büyük');
  const cols = Array.from({ length: 30 }, (_, i) => `k${i}`);
  await s.row(cols);
  for (let r = 0; r < 20000; r++) await s.row(cols.map((_, i) => r * 100 + i));
  await s.end();
  await book.close();
  const wb = xlsx.read(fs.readFileSync(file));
  fs.rmSync(file);
  const sheet = wb.Sheets['Büyük'];
  assert.equal(sheet['!ref'], 'A1:AD20001');
  assert.equal(sheet.AD20001.v, 19999 * 100 + 29);

  const broken = tmp();
  const half = openXlsx(broken);
  const h = await half.sheet('Yarım');
  await h.row(['a']);
  await half.abort();
  assert.equal(fs.existsSync(broken), false);
});
