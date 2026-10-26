/**
 * Ürün formundaki varyant durumunu yönetir.
 *  options:  [{ key, id?, name, values: [{ key, id?, value }] }]
 *  variants: [{ key, id?, selections: { [optionKey]: valueKey }, variantName?, sku, barcode, price, stock, isActive }]
 * Seçimler anahtarla tutulur; özellik / seçenek adı değişse de varyantların seçimi kopmaz.
 */
let seq = 0;
export const newKey = (prefix) => `${prefix}-new-${++seq}`;

export const fromProduct = (product) => {
  const options = (product.options || []).map(o => ({
    key: `o${o.id}`, id: o.id, name: o.name,
    values: (o.values || []).map(v => ({ key: `v${v.id}`, id: v.id, value: v.value }))
  }));
  const valueToOption = new Map();
  options.forEach(o => o.values.forEach(v => valueToOption.set(v.id, { optionKey: o.key, valueKey: v.key })));

  const variants = (product.variants || []).map(v => {
    const selections = {};
    (v.variantValues || []).forEach(vv => {
      const hit = valueToOption.get(vv.optionValueId);
      if (hit) selections[hit.optionKey] = hit.valueKey;
    });
    return {
      key: `p${v.id}`, id: v.id, selections,
      variantName: v.name.startsWith(`${product.name} - `) ? v.name.slice(product.name.length + 3) : v.name,
      sku: v.sku, barcode: v.barcode || '', price: v.price, stock: v.stock, isActive: v.isActive
    };
  });
  return { options, variants };
};

const slug = (s) => String(s).toLocaleUpperCase('tr-TR')
  .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/İ/g, 'I').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
  .replace(/[^A-Z0-9]+/g, '').slice(0, 10);

// Tüm seçenek kombinasyonlarını üretir; mevcut kombinasyonlara dokunmaz
export const generateCombinations = (options, variants, masterSku) => {
  const usable = options.filter(o => o.name.trim() && o.values.some(v => v.value.trim()));
  if (usable.length === 0) return variants;
  let combos = [{}];
  for (const o of usable) {
    combos = combos.flatMap(c => o.values.filter(v => v.value.trim()).map(v => ({ ...c, [o.key]: v.key })));
  }
  const signature = (sel) => usable.map(o => sel[o.key] || '').join('|');
  const existing = new Set(variants.map(v => signature(v.selections)));
  const added = combos
    .filter(c => !existing.has(signature(c)))
    .map(c => ({
      key: newKey('var'),
      selections: c,
      sku: [masterSku || 'SKU', ...usable.map(o => slug(o.values.find(v => v.key === c[o.key]).value))].join('-'),
      barcode: '', price: '', stock: 0, isActive: true
    }));
  return [...variants, ...added];
};

export const variantLabel = (options, variant) =>
  options.map(o => o.values.find(v => v.key === variant.selections[o.key])?.value).filter(Boolean).join(' / ');

// API'ye gönderilecek biçim: seçimler özellik adı → seçenek değeri
export const toPayload = (options, variants) => ({
  options: options.map(o => ({
    ...(o.id && { id: o.id }),
    name: o.name.trim(),
    values: o.values.filter(v => v.value.trim()).map(v => ({ ...(v.id && { id: v.id }), value: v.value.trim() }))
  })),
  variants: variants.map(v => ({
    ...(v.id && { id: v.id }),
    sku: v.sku, barcode: v.barcode, price: v.price, stock: v.stock, isActive: v.isActive !== false,
    ...(options.length > 0
      ? { selections: Object.fromEntries(options.map(o => [o.name.trim(), o.values.find(x => x.key === v.selections[o.key])?.value?.trim() || ''])) }
      : { variantName: v.variantName })
  }))
});

// Kaydetmeden önce kullanıcıya gösterilecek hata
export const validate = (options, variants) => {
  for (const o of options) {
    if (!o.name.trim()) return 'Özellik adı boş olamaz.';
    if (!o.values.some(v => v.value.trim())) return `"${o.name}" için en az bir seçenek girin.`;
  }
  for (const v of variants) {
    if (!String(v.sku || '').trim()) return 'Her varyantın SKU kodu olmalı.';
    if (options.length > 0 && options.some(o => !o.values.some(x => x.key === v.selections[o.key]))) {
      return `${v.sku}: Her özellik için bir seçenek seçin.`;
    }
    if (options.length === 0 && !String(v.variantName || '').trim()) return `${v.sku}: Varyant adı girin.`;
  }
  return null;
};
