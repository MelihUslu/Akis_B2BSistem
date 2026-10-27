import { t } from '../i18n';

// Bayi kataloğu yardımcıları

// Varyantlı ürün kartı özeti: en düşük fiyat, stok durumu, seçenek sayısı
export const variantSummary = (p) => {
  if (!p.requiresVariant || !p.variants?.length) return null;
  const priced = p.variants.filter((v) => !v.priceHidden);
  return {
    minPrice: priced.length ? Math.min(...priced.map((v) => v.netPrice)) : null,
    inStock: p.variants.some((v) => v.inStock),
    count: p.variants.length
  };
};

// Sepetteki miktar (varyantlı üründe tüm varyantların toplamı)
export const cartQtyFor = (product, cart) => {
  const ids = new Set([product.id, ...(product.variants || []).map((v) => v.id)]);
  return cart.filter((i) => ids.has(i.id)).reduce((s, i) => s + i.quantity, 0);
};

export const CATALOG_SORTS = [
  { value: 'default', label: 'Önerilen' },
  { value: 'price_asc', label: 'Fiyat (artan)' },
  { value: 'price_desc', label: 'Fiyat (azalan)' },
  { value: 'name', label: 'Ada göre (A-Z)' },
  { value: 'newest', label: 'En yeni' }
];

export const EMPTY_CATALOG_FILTERS = { category: '', brand: '', min: '', max: '', options: {}, favorites: false, inStock: false, sort: 'default' };

export const findCategory = (categories, id) => categories.flatMap((c) => [c, ...(c.children || [])]).find((c) => c.id === id);

// Toplu seçime uygun satır: stokta ve fiyatı açık
export const canSelect = (item) => item.inStock && !item.priceHidden;

// "SKU · Marka · Koli: 50 Adet · Min 10"
export const itemMeta = (item, withBrand = true) => [
  item.sku,
  withBrand && item.brand,
  item.packUnit && item.packSize > 1 && `${item.packUnit}: ${item.packSize} ${item.unit}`,
  item.moq > 1 && `${t('Min')} ${item.moq}`,
  item.stepQuantity > 1 && t('{n} ve katları', { n: item.stepQuantity })
].filter(Boolean).join(' · ');

// Kategoriye sabit renk (görseli olmayan kategorilerin ikon kutusu ve başlık şeridi için)
const CATEGORY_COLORS = [
  { tile: 'bg-indigo-100 text-indigo-600', bar: 'from-indigo-50 border-indigo-100', accent: 'text-indigo-700 dark:text-indigo-300' },
  { tile: 'bg-emerald-100 text-emerald-600', bar: 'from-emerald-50 border-emerald-100', accent: 'text-emerald-700 dark:text-emerald-300' },
  { tile: 'bg-amber-100 text-amber-600', bar: 'from-amber-50 border-amber-100', accent: 'text-amber-700 dark:text-amber-300' },
  { tile: 'bg-sky-100 text-sky-600', bar: 'from-sky-50 border-sky-100', accent: 'text-sky-700 dark:text-sky-300' },
  { tile: 'bg-rose-100 text-rose-600', bar: 'from-rose-50 border-rose-100', accent: 'text-rose-700 dark:text-rose-300' },
  { tile: 'bg-violet-100 text-violet-600', bar: 'from-violet-50 border-violet-100', accent: 'text-violet-700 dark:text-violet-300' },
  { tile: 'bg-teal-100 text-teal-600', bar: 'from-teal-50 border-teal-100', accent: 'text-teal-700 dark:text-teal-300' },
  { tile: 'bg-orange-100 text-orange-600', bar: 'from-orange-50 border-orange-100', accent: 'text-orange-700 dark:text-orange-300' }
];
export const categoryColor = (id) => CATEGORY_COLORS[(Number(id) || 0) % CATEGORY_COLORS.length];

export const categoryTotal = (c) => (c._count?.products || 0) + (c.children || []).reduce((s, ch) => s + (ch._count?.products || 0), 0);
export const parentCategory = (categories, id) => categories.find((c) => c.children?.some((ch) => ch.id === id)) || null;
