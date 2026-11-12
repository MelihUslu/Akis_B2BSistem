import xlsx from 'xlsx';

/**
 * Yüklenen Excel dosyasını güvenli biçimde satırlara çeviren ortak yardımcı.
 *
 * Neden ayrı bir koruma: ürün ve cari Excel içe aktarımını, firmanın yöneticisi yükler.
 * Sitede herkese açık firma kaydı (deneme) olduğu için kötü niyetli biri yönetici olup
 * çok büyük ya da bozuk bir dosyayla aynı süreçteki diğer firmaları (ortak Node süreci)
 * yormaya çalışabilir. Bu yüzden:
 *   - Satır sayısı sınırlanır (sheet_to_json ÖNCESİ bildirilen aralık da denetlenir; kötü niyetli
 *     dosya milyonlarca satır bildirip belleği parse sırasında şişiremesin).
 *   - Okunamayan dosya ExcelImportError ile reddedilir (çağıran katman 400 döndürür).
 */
export class ExcelImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExcelImportError';
    this.status = 400;
  }
}

export const DEFAULT_MAX_ROWS = 5000;

export const readSheetRows = (buffer, { maxRows = DEFAULT_MAX_ROWS, sheetToJson = {} } = {}) => {
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch {
    throw new ExcelImportError('Dosya okunamadı. Geçerli bir Excel (.xlsx) dosyası yükleyin.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ExcelImportError('Dosyada sayfa bulunamadı.');
  const sheet = workbook.Sheets[sheetName];

  // Belleği şişirmeden önce: dosyanın BİLDİRDİĞİ satır sayısını denetle (başlık için +1 tolerans)
  const ref = sheet['!ref'];
  if (ref) {
    const range = xlsx.utils.decode_range(ref);
    const declaredRows = range.e.r - range.s.r + 1;
    if (declaredRows > maxRows + 1) {
      throw new ExcelImportError(`Tek seferde en fazla ${maxRows} satır aktarılabilir. Dosyayı bölün.`);
    }
  }

  const rows = xlsx.utils.sheet_to_json(sheet, sheetToJson);
  if (rows.length > maxRows) {
    throw new ExcelImportError(`Tek seferde en fazla ${maxRows} satır aktarılabilir. Dosyayı bölün.`);
  }
  return rows;
};
