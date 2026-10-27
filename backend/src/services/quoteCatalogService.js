import prisma from '../utils/prisma.js';
import { VARIANT_VALUES_INCLUDE, variantLabelOf, effectiveProduct } from './pricingService.js';

/**
 * Teklif için katalog araması. Sonuçlar sipariş verilebilir kalemlerdir: varyantlı üründe varyantlar,
 * varyantsız üründe ürünün kendisi. Firma izolasyonu Prisma kiracı filtresiyle sağlanır.
 * Eşleştirme alanları: ad, ana ürün adı, SKU, barkod, marka, kategori, kısa açıklama ve varyant değerleri
 * (adminin tanımladığı tüm özellikler: hacim, çap, malzeme, paket tipi…).
 */
export const norm = (s = '') => String(s).toLocaleLowerCase('tr-TR').normalize('NFC');
const STOP = new Set(['ve', 'ile', 'bir', 'için', 'de', 'da', 'olarak', 'adet', 'koli', 'kutu', 'paket', 'tane', 'uyumlu', 'ekonomik', 'uygun']);

// Arama kelimeleri: Türkçe ekler için kelime kökü (ilk 5 harf) ile eşleşir ("bardaklar" → "barda")
export const termsOf = (list) => [...new Set(list.flatMap((t) => norm(t).split(/[^\p{L}\p{N}]+/u))
  .filter((w) => w.length >= 2 && !STOP.has(w)))].slice(0, 12);
const root = (w) => (w.length > 5 && /^\p{L}+$/u.test(w) ? w.slice(0, 5) : w);
const hits = (text, w) => {
  const r = root(w);
  return text.split(/[^\p{L}\p{N}]+/u).filter((x) => x && x.startsWith(r)).length;
};
const compact = (s) => norm(s).replace(/\s+/g, '');

const ORDERABLE = {
  isActive: true,
  OR: [
    { parentId: { not: null }, parent: { isActive: true } },
    { parentId: null, variants: { none: { isActive: true } } }
  ]
};

const INCLUDE = {
  parent: { include: { category: { select: { name: true } } } },
  category: { select: { name: true } },
  ...VARIANT_VALUES_INCLUDE
};

const fieldMatch = (t) => {
  const c = { contains: t, mode: 'insensitive' };
  return [
    { name: c }, { sku: c }, { barcode: { equals: t } }, { brand: c }, { shortDesc: c },
    { category: { name: c } },
    { parent: { OR: [{ name: c }, { brand: c }, { shortDesc: c }, { category: { name: c } }] } },
    { variantValues: { some: { optionValue: { value: c } } } }
  ];
};

const textOf = (p) => ({
  name: norm([p.parent?.name, p.name].filter(Boolean).join(' ')),
  attrs: norm(variantLabelOf(p) || ''),
  brand: norm(p.brand || p.parent?.brand || ''),
  category: norm(p.category?.name || p.parent?.category?.name || ''),
  desc: norm(p.shortDesc || p.parent?.shortDesc || ''),
  code: norm([p.sku, p.barcode].filter(Boolean).join(' '))
});

export const scoreProduct = (p, { words, phrases = [], codes = new Set(), brand = '' }) => {
  const t = textOf(p);
  const exact = codes.has(norm(p.sku)) || (p.barcode && codes.has(norm(p.barcode)));
  let score = exact ? 100 : 0;
  let matched = 0;
  for (const w of words) {
    const s = hits(t.name, w) * 5 + hits(t.attrs, w) * 4 + hits(t.brand, w) * 3 + hits(t.category, w) * 2 + hits(t.code, w) * 3 + Math.min(hits(t.desc, w), 2);
    if (s) matched++;
    score += s;
  }
  // Özellik değeri birebir geçiyorsa ("8 oz" ↔ "Hacim: 8 oz") güçlü sinyal
  for (const ph of phrases) {
    const c = compact(ph);
    if (c.length >= 2 && (compact(t.attrs).includes(c) || compact(t.name).includes(c) || compact(t.desc).includes(c))) score += 8;
  }
  if (brand && t.brand && t.brand === norm(brand)) score += 6;
  const coverage = words.length ? matched / words.length : 1;
  return { score: exact ? score : score * coverage, exact };
};

/**
 * Katalogda arar ve puana göre sıralı aday listesi döndürür.
 * query: { text, terms[], phrases[], brand, inStockOnly, limit, excludeIds[] }
 */
export const searchCatalog = async ({ text = '', terms = [], phrases = [], brand = '', inStockOnly = false, limit = 12, excludeIds = [] } = {}) => {
  const words = termsOf([text, ...terms, ...phrases, brand].filter(Boolean));
  // Talepte ürün kodu birebir geçtiyse (büyük/küçük harf duyarsız) o ürün en üstte gelir
  const tokens = [...new Set(norm([text, ...terms].join(' ')).split(/[\s,;]+/).filter((x) => x.length >= 3))].slice(0, 30);
  const codes = new Set(tokens);
  if (words.length === 0 && tokens.length === 0) return [];

  const dbTerms = [...new Set([...words.map(root), ...tokens])].slice(0, 16);
  const rows = await prisma.product.findMany({
    where: {
      AND: [
        ORDERABLE,
        ...(inStockOnly ? [{ stock: { gt: 0 } }] : []),
        ...(excludeIds.length ? [{ id: { notIn: excludeIds } }] : []),
        { OR: [...dbTerms.flatMap(fieldMatch), { sku: { in: [...new Set(tokens.flatMap((x) => [x, x.toUpperCase(), x.toLocaleUpperCase('tr-TR')]))] } }] }
      ]
    },
    include: INCLUDE,
    take: 400
  });

  return rows
    .map((p) => ({ product: p, ...scoreProduct(p, { words, phrases, codes, brand }) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id)
    .slice(0, limit);
};

// Belirli ürünleri (sipariş verilebilir olsun olmasın) arama sonucu biçiminde yükler
export const loadCatalogProducts = (ids) => prisma.product.findMany({ where: { id: { in: ids } }, include: INCLUDE });

/**
 * Ürünlerle uyumlu tanımlanmış ürün kimlikleri. Varyant ise ana ürününe tanımlı ilişkiler de geçerlidir.
 * Döner: Map<productId, Set<uyumlu productId>> (ilişkinin her iki yönü)
 */
export const compatibilityMap = async (products) => {
  const ids = [...new Set(products.flatMap((p) => [p.id, p.parentId]).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const rows = await prisma.productCompatibility.findMany({
    where: { OR: [{ productId: { in: ids } }, { compatibleId: { in: ids } }] },
    select: { productId: true, compatibleId: true }
  });
  const add = (a, b) => { if (!map.has(a)) map.set(a, new Set()); map.get(a).add(b); };
  for (const r of rows) { add(r.productId, r.compatibleId); add(r.compatibleId, r.productId); }
  return map;
};

// İki ürün (veya ana ürünleri) katalogda uyumlu olarak tanımlı mı?
export const areCompatible = (map, a, b) => {
  const left = [a.id, a.parentId].filter(Boolean);
  const right = new Set([b.id, b.parentId].filter(Boolean));
  return left.some((id) => [...(map.get(id) || [])].some((x) => right.has(x)));
};

// Bir ürünle uyumlu tanımlı, sipariş verilebilir kalemler (ana ürün tanımlıysa varyantları da)
export const compatibleOrderables = async (map, product, { inStockOnly = false } = {}) => {
  const linked = [...new Set([product.id, product.parentId].filter(Boolean).flatMap((id) => [...(map.get(id) || [])]))];
  if (!linked.length) return [];
  return prisma.product.findMany({
    where: { AND: [ORDERABLE, ...(inStockOnly ? [{ stock: { gt: 0 } }] : []), { OR: [{ id: { in: linked } }, { parentId: { in: linked } }] }] },
    include: INCLUDE,
    take: 30
  });
};

// Ekranda ve yapay zekâya gönderilen kısa ürün özeti (maliyet içermez)
export const productSummary = (raw) => {
  const p = effectiveProduct(raw, raw.parent);
  return {
    id: raw.id,
    sku: raw.sku,
    name: raw.parent?.name || raw.name,
    variantLabel: variantLabelOf(raw),
    brand: raw.brand || raw.parent?.brand || null,
    category: raw.category?.name || raw.parent?.category?.name || null,
    unit: p.unit,
    packInfo: packInfo(p),
    stock: raw.stock,
    isActive: p.isActive
  };
};

export const packInfo = (p) => (p.packUnit && p.packSize > 0 ? `1 ${p.packUnit} = ${p.packSize} ${p.unit}` : null);

// Birim adı karşılaştırması: büyük/küçük harf, noktalama ve çoğul eki (-ler/-lar) yok sayılır
const unitKey = (u) => norm(u).replace(/[^\p{L}]/gu, '').replace(/(ler|lar)$/u, '');

/**
 * Talep edilen birimdeki miktarı ürünün satış birimine çevirir. Yalnızca üründe kayıtlı paket dönüşümü
 * (packUnit / packSize) kullanılır; kayıt yoksa tahmin yapılmaz, hata döner.
 * product: effectiveProduct sonucu (varyant, ana ürünün dönüşümünü kullanır)
 */
export const convertQuantity = (product, qty, requestedUnit) => {
  if (!requestedUnit || unitKey(requestedUnit) === unitKey(product.unit)) return { quantity: qty };
  if (product.packUnit && product.packSize > 0 && unitKey(requestedUnit) === unitKey(product.packUnit)) {
    const quantity = qty * product.packSize;
    return { quantity, note: `${qty} ${product.packUnit} × ${product.packSize} = ${quantity} ${product.unit}` };
  }
  const pack = packInfo(product);
  return { error: `“${requestedUnit}” biriminden ${product.unit} birimine kayıtlı dönüşüm yok${pack ? ` (kayıtlı: ${pack})` : ''}. Miktarı ${product.unit} olarak girin.` };
};
