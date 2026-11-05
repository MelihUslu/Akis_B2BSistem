import fs from 'node:fs';
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { Writable } from 'node:stream';

/**
 * Akışla Excel (xlsx) yazıcı: satırlar geldikçe sıkıştırılıp dosyaya yazılır, bellekte birikmez.
 * SheetJS bütün çalışma kitabını bellekte kurar: büyük firmanın tüm verisi (60 bin sipariş) 1 GB tutuyordu, on katı
 * işçi süreci düşürürdü (yük testi, 5 Kasım 2026). Yalnızca düz tablo yazar (metin, sayı, mantıksal); biçim yok.
 *
 *   const book = openXlsx('/tmp/x.xlsx');   // dosya yolu ya da yazılabilir akış
 *   const s = await book.sheet('Siparişler', { widths: [8, 14] }); await s.row(['id', 'tutar']); await s.row([1, 99.5]); await s.end();
 *   await book.close();   // hata olursa: await book.abort() (dosyayı siler)
 *
 * Küçük / orta Excel'ler için workbookBuffer(): SheetJS'teki json_to_sheet + write yerine. Yazım parça parça olduğu için
 * işçi süreç bloklanmaz; SheetJS on kat veride satış raporu Excel'inde süreci ~1 sn kilitliyordu (o sırada aynı
 * süreçteki bütün istekler bekliyordu).
 *
 * Sayfalar sırayla yazılır (aynı anda tek sayfa açık). Bir sayfa en fazla 1.048.576 satır alır; bölmek çağıranın işi.
 * ZIP64 yok: dosya ve içindeki her parça 4 GB'ın altında kalmalı.
 */

const MAX_ROWS = 1_048_576;
const MAX_CELL = 32_767; // Excel hücre metni sınırı
const LIMIT_32 = 0xffffffff;
const FLAGS = 0x0808; // bit 3: boyutlar veriden sonra, bit 11: UTF-8 dosya adı

let crcTable = null;
const crc32 = zlib.crc32 || ((buf, crc = 0) => {
  crcTable ||= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let c = (crc ^ LIMIT_32) >>> 0;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ LIMIT_32) >>> 0;
});

// Kontrol karakterleri XML'de geçersiz (sekme ve satır sonu hariç)
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g; // eslint-disable-line no-control-regex
const escapeXml = (s) => s.replace(INVALID_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const columnName = (i) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

const cellXml = (ref, v) => {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === 'bigint') return `<c r="${ref}"><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`;
  if (v instanceof Date) v = Number.isNaN(v.getTime()) ? '' : v.toLocaleString('tr-TR');
  const text = escapeXml(String(v).slice(0, MAX_CELL));
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
};

const dosStamp = (d) => ({
  time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
});

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const STYLES = `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>`
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

export const openXlsx = (target) => {
  const file = typeof target === 'string' ? target : null;
  const out = file ? fs.createWriteStream(file) : target;
  let failure = null;
  out.on('error', (e) => { failure ||= e; });
  const stamp = dosStamp(new Date());
  const entries = [];
  const sheets = [];
  let offset = 0;
  let open = false;

  const put = async (buf) => {
    if (failure) throw failure;
    offset += buf.length;
    if (offset > LIMIT_32) throw new Error('Dışa aktarım dosyası 4 GB sınırını aştı.');
    if (!out.write(buf)) await once(out, 'drain'); // akış hata verirse once() reddeder
  };

  // ZIP parçası: yerel başlık, sıkıştırılmış veri, sonra CRC ve boyutlar (veri tanımlayıcı)
  const begin = async (name) => {
    if (open) throw new Error('Önceki sayfa kapatılmadan yeni parça açılamaz.');
    open = true;
    const nameBuf = Buffer.from(name, 'utf8');
    const start = offset;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(FLAGS, 6);
    h.writeUInt16LE(8, 8); // deflate
    h.writeUInt16LE(stamp.time, 10);
    h.writeUInt16LE(stamp.date, 12);
    h.writeUInt16LE(nameBuf.length, 26);
    await put(Buffer.concat([h, nameBuf]));
    let crc = 0;
    let size = 0;
    let csize = 0;
    const deflate = zlib.createDeflateRaw({ level: 6 });
    const pumped = (async () => { for await (const chunk of deflate) { csize += chunk.length; await put(chunk); } })();
    pumped.catch(() => {}); // hata end() içinde yeniden fırlatılır
    return {
      write: async (str) => {
        const buf = Buffer.from(str, 'utf8');
        crc = crc32(buf, crc);
        size += buf.length;
        if (size > LIMIT_32) throw new Error('Dışa aktarım sayfası 4 GB sınırını aştı.');
        if (!deflate.write(buf)) await Promise.race([once(deflate, 'drain'), pumped]);
      },
      end: async () => {
        deflate.end();
        await pumped;
        const d = Buffer.alloc(16);
        d.writeUInt32LE(0x08074b50, 0);
        d.writeUInt32LE(crc >>> 0, 4);
        d.writeUInt32LE(csize, 8);
        d.writeUInt32LE(size, 12);
        await put(d);
        entries.push({ nameBuf, start, crc: crc >>> 0, csize, size });
        open = false;
      },
      destroy: () => deflate.destroy()
    };
  };

  const file1 = async (name, content) => {
    const e = await begin(name);
    await e.write(content);
    await e.end();
  };

  let current = null;
  return {
    /** Yeni sayfa açar; row(dizi) ile satır ekler, end() ile kapatır. widths: sütun genişlikleri (karakter) */
    sheet: async (title, { widths } = {}) => {
      const name = String(title).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || `Sayfa ${sheets.length + 1}`;
      sheets.push(name);
      const e = await begin(`xl/worksheets/sheet${sheets.length}.xml`);
      current = e;
      const colsXml = widths?.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(w) + 0.7}" customWidth="1"/>`).join('')}</cols>` : '';
      await e.write(`${XML_HEAD}<worksheet xmlns="${NS_MAIN}">${colsXml}<sheetData>`);
      let rows = 0;
      let buf = '';
      const cols = [];
      const flush = async () => { if (buf) { const s = buf; buf = ''; await e.write(s); } };
      return {
        get rows() { return rows; },
        row: async (values) => {
          if (rows >= MAX_ROWS) throw new Error(`"${name}" sayfası Excel satır sınırını aştı.`);
          rows++;
          let xml = `<row r="${rows}">`;
          values.forEach((v, i) => { xml += cellXml(`${cols[i] ||= columnName(i)}${rows}`, v); });
          buf += `${xml}</row>`;
          if (buf.length > 1 << 16) await flush();
        },
        end: async () => {
          await flush();
          await e.write('</sheetData></worksheet>');
          await e.end();
          current = null;
        }
      };
    },

    /** Çalışma kitabı parçalarını ve ZIP dizinini yazar, dosyayı kapatır. */
    close: async () => {
      if (!sheets.length) throw new Error('Çalışma kitabında sayfa yok.');
      const list = sheets.map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
      await file1('xl/workbook.xml', `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${list}</sheets></workbook>`);
      const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
      await file1('xl/_rels/workbook.xml.rels', `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">${rels}<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`);
      await file1('xl/styles.xml', STYLES);
      await file1('_rels/.rels', `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
      const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('');
      await file1('[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + `<Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/>${overrides}</Types>`);

      const dirStart = offset;
      for (const e of entries) {
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(20, 4);
        c.writeUInt16LE(20, 6);
        c.writeUInt16LE(FLAGS, 8);
        c.writeUInt16LE(8, 10);
        c.writeUInt16LE(stamp.time, 12);
        c.writeUInt16LE(stamp.date, 14);
        c.writeUInt32LE(e.crc, 16);
        c.writeUInt32LE(e.csize, 20);
        c.writeUInt32LE(e.size, 24);
        c.writeUInt16LE(e.nameBuf.length, 28);
        c.writeUInt32LE(e.start, 42);
        await put(Buffer.concat([c, e.nameBuf]));
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(entries.length, 8);
      end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(offset - dirStart, 12);
      end.writeUInt32LE(dirStart, 16);
      await put(end);
      out.end();
      await once(out, 'finish');
    },

    /** Yarım kalan dosyayı kapatıp siler. */
    abort: async () => {
      current?.destroy();
      out.destroy();
      if (file) await fsp.rm(file, { force: true });
    }
  };
};

/**
 * [{ name, rows: [{ başlık: değer }], widths }] → xlsx Buffer. Başlıklar SheetJS json_to_sheet'teki gibi satırlardaki
 * anahtarların ilk görülme sırasıdır; boş satır listesi boş sayfa olur.
 */
export const workbookBuffer = async (sheets) => {
  const chunks = [];
  const book = openXlsx(new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb(); } }));
  for (const { name, rows, widths } of sheets) {
    const keys = new Set();
    for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
    const cols = [...keys];
    const s = await book.sheet(name, { widths });
    if (cols.length) await s.row(cols);
    for (const r of rows) await s.row(cols.map((k) => r[k]));
    await s.end();
  }
  await book.close();
  return Buffer.concat(chunks);
};
