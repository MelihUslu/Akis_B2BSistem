import { test } from 'node:test';
import assert from 'node:assert/strict';
import xlsx from 'xlsx';
import { readSheetRows, ExcelImportError, DEFAULT_MAX_ROWS } from '../../src/utils/excelImport.js';

// Verilen satırlardan bellek içi bir .xlsx tamponu üretir
const bookOf = (rows) => {
  const ws = xlsx.utils.json_to_sheet(rows);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Sayfa1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

test('geçerli Excel: satırları okur ve değerleri korur', () => {
  const buf = bookOf([
    { SKU: 'A1', Fiyat: 10 },
    { SKU: 'A2', Fiyat: 20.5 }
  ]);
  const rows = readSheetRows(buf);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].SKU, 'A1');
  assert.equal(rows[1].Fiyat, 20.5);
});

test('satır sınırı aşılınca ExcelImportError (parse öncesi aralık denetimi)', () => {
  const data = Array.from({ length: 10 }, (_, i) => ({ SKU: `S${i}`, Fiyat: i }));
  const buf = bookOf(data);
  assert.throws(() => readSheetRows(buf, { maxRows: 5 }), ExcelImportError);
});

test('varsayılan sınır tanımlı ve makul', () => {
  assert.equal(DEFAULT_MAX_ROWS, 5000);
});

test('Excel olmayan metin dosyası çökertmeden işlenir (dizi döner; satırlar ileride SKU yokluğuyla elenir)', () => {
  // SheetJS hoşgörülüdür: düz metni de ayrıştırır. Güvenlik garantisi dosyayı reddetmek değil,
  // satır/aralık sınırı + süreç dayanıklılığıdır. Burada yalnızca 500'e düşmediğini doğruluyoruz.
  const buf = Buffer.from('bu bir excel dosyası değil, sadece düz metin');
  const rows = readSheetRows(buf);
  assert.ok(Array.isArray(rows));
});

test('sheetToJson seçenekleri geçer (defval boş hücreleri doldurur)', () => {
  const buf = bookOf([{ SKU: 'A1', Ad: 'Ürün' }, { SKU: 'A2' }]);
  const rows = readSheetRows(buf, { sheetToJson: { defval: '' } });
  assert.equal(rows[1].Ad, '');
});
