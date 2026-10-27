/**
 * Örnek (mock) sağlayıcı: YALNIZCA geliştirme ve test ortamı içindir (canlıda aiStatus() bunu kapatır).
 * Gerçek yapay zekâ çağırmaz; metni basit kurallarla böler ve arama sonucunda ilk sıradaki adayı seçer.
 * Ekranda "Geliştirme modu" uyarısıyla gösterilir.
 */
const UNITS = ['adet', 'koli', 'kutu', 'paket', 'kg', 'metre', 'çift', 'takım', 'rulo', 'litre', 'lt', 'ton', 'palet'];
const STOP = new Set(['ve', 'ile', 'için', 'bir', 'de', 'da', 'olarak', 'hazırla', 'teklif', 'ekonomik', 'uygun', 'firmasına', 'firması', 'lütfen', 'uyumlu', 'tane']);
const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR');

const extract = ({ text }) => {
  const segments = norm(text).split(/,|;|\n|\s+ve\s+|\s+ile\s+/u).map((s) => s.trim()).filter(Boolean);
  const items = [];
  const questions = [];
  for (const seg of segments) {
    const m = seg.match(/(\d+(?:[.,]\d+)?)\s*([\p{L}]+)?/u);
    const quantity = m ? parseFloat(m[1].replace(',', '.')) : 0;
    const unit = m && UNITS.includes(m[2]) ? m[2] : '';
    const attributes = [...seg.matchAll(/(\d+(?:[.,]\d+)?)\s?(oz|ml|cl|cm|mm|gr|g|lt|kg|mikron)\b/gu)].map((a) => ({ name: 'ölçü', value: `${a[1]} ${a[2]}` }));
    const words = seg.replace(/\d+(?:[.,]\d+)?/g, ' ').split(/[^\p{L}]+/u).filter((w) => w.length >= 2 && !STOP.has(w) && !UNITS.includes(w) && !/^(oz|ml|cl|cm|mm|gr|lt|kg)$/.test(w));
    if (words.length === 0) continue;
    const index = items.length;
    items.push({
      text: seg, quantity, unit, searchTerms: words.slice(0, 6), attributes, brand: '',
      compatibleWithItem: seg.includes('uyumlu') && index > 0 ? index - 1 : -1
    });
    if (!quantity) questions.push({ itemIndex: index, question: `“${seg}” için miktar nedir?` });
  }
  return { items, questions };
};

const match = ({ items }) => ({
  lines: items.map((item) => {
    const itemIndex = item.index;
    const [first, ...rest] = item.candidates || [];
    if (!first) return { itemIndex, productId: 0, quantity: item.quantity, unit: item.unit, certain: false, reason: 'Katalogda uygun aday bulunamadı.', warnings: [], alternativeIds: [] };
    return {
      itemIndex,
      productId: first.id,
      quantity: item.quantity,
      unit: item.unit,
      certain: Boolean(first.exactCode) || rest.length === 0,
      reason: first.exactCode ? 'Talepte ürün kodu birebir geçiyor.' : 'Örnek eşleştirme: aramada ilk sıradaki ürün.',
      warnings: rest.length && !first.exactCode ? ['Birden fazla aday var; doğru ürünü teyit edin.'] : [],
      alternativeIds: rest.slice(0, 3).map((c) => c.id)
    };
  }),
  questions: []
});

export const createProvider = () => ({
  name: 'mock',
  mock: true,
  generateJson: async ({ task, input }) => (task === 'extract' ? extract(input) : match(input))
});
