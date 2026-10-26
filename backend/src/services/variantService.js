export class VariantError extends Error {}

const clean = (s) => String(s ?? '').trim();
const key = (optionName, value) => `${optionName.toLocaleLowerCase('tr-TR')}\u0000${value.toLocaleLowerCase('tr-TR')}`;

// Ana üründen varyantlara aktarılan operasyonel alanlar
const INHERITED = ['currency', 'vatRate', 'unit', 'moq', 'stepQuantity', 'categoryId', 'hidePrice'];

const validateOptions = (options) => {
  const names = new Set();
  for (const o of options) {
    const name = clean(o.name);
    if (!name) throw new VariantError('Özellik adı boş olamaz (örn. Gramaj, Ambalaj Türü).');
    if (names.has(name.toLocaleLowerCase('tr-TR'))) throw new VariantError(`"${name}" özelliği iki kez tanımlanmış.`);
    names.add(name.toLocaleLowerCase('tr-TR'));
    const values = (o.values || []).map(v => clean(typeof v === 'string' ? v : v.value)).filter(Boolean);
    if (values.length === 0) throw new VariantError(`"${name}" özelliği için en az bir seçenek girin.`);
    if (new Set(values.map(v => v.toLocaleLowerCase('tr-TR'))).size !== values.length) {
      throw new VariantError(`"${name}" özelliğinde aynı seçenek iki kez yazılmış.`);
    }
  }
};

/**
 * Ana ürünün varyant özelliklerini (options) ve varyantlarını (variants) istekle eşitler.
 *
 * options:  [{ id?, name: 'Gramaj', values: [{ id?, value: '500 g' }, ...] }]
 * variants: [{ id?, selections: { Gramaj: '500 g', ... }, sku, barcode, price, stock }]
 *           (özellik tanımlı değilse eski usul { variantName } kabul edilir)
 *
 * Listede olmayan varyantlar: sipariş / iade / teklif geçmişi varsa pasife alınır, yoksa silinir.
 * Transaction içinde (tx) ve kiracı bağlamında çağrılmalıdır.
 */
export const syncOptionsAndVariants = async (tx, master, { options, variants }) => {
  // 1. Özellikler ve seçenekler
  if (Array.isArray(options)) {
    validateOptions(options);
    const existing = await tx.productOption.findMany({ where: { productId: master.id }, include: { values: true } });
    const keepOptionIds = [];

    for (const [i, o] of options.entries()) {
      const name = clean(o.name);
      const current = o.id ? existing.find(e => e.id === parseInt(o.id)) : null;
      const option = current
        ? await tx.productOption.update({ where: { id: current.id }, data: { name, sortOrder: i } })
        : await tx.productOption.create({ data: { productId: master.id, name, sortOrder: i } });
      keepOptionIds.push(option.id);

      const keepValueIds = [];
      for (const [j, v] of (o.values || []).entries()) {
        const value = clean(typeof v === 'string' ? v : v.value);
        if (!value) continue;
        const currentValue = v.id ? current?.values.find(e => e.id === parseInt(v.id)) : null;
        const saved = currentValue
          ? await tx.productOptionValue.update({ where: { id: currentValue.id }, data: { value, sortOrder: j } })
          : await tx.productOptionValue.create({ data: { optionId: option.id, value, sortOrder: j } });
        keepValueIds.push(saved.id);
      }
      await tx.productOptionValue.deleteMany({ where: { optionId: option.id, id: { notIn: keepValueIds } } });
    }
    await tx.productOption.deleteMany({ where: { productId: master.id, id: { notIn: keepOptionIds } } });
  }

  // Güncel özellik → seçenek haritası
  const currentOptions = await tx.productOption.findMany({
    where: { productId: master.id },
    include: { values: true },
    orderBy: { sortOrder: 'asc' }
  });
  const valueIdByKey = new Map();
  for (const o of currentOptions) for (const v of o.values) valueIdByKey.set(key(o.name, v.value), v.id);

  // 2. Varyantlar
  if (Array.isArray(variants)) {
    const existingVariants = await tx.product.findMany({ where: { parentId: master.id }, select: { id: true } });
    const keep = [];
    const combos = new Set();

    for (const v of variants) {
      const sku = clean(v.sku);
      if (!sku) throw new VariantError('Her varyantın bir SKU kodu olmalıdır.');

      let valueIds = [];
      let labelParts = [];
      if (currentOptions.length > 0) {
        const selections = v.selections || {};
        for (const o of currentOptions) {
          const selected = clean(selections[o.name]);
          const id = selected && valueIdByKey.get(key(o.name, selected));
          if (!id) throw new VariantError(`${sku}: "${o.name}" için geçerli bir seçenek seçin.`);
          valueIds.push(id);
          labelParts.push(selected);
        }
        const combo = [...valueIds].sort((a, b) => a - b).join('-');
        if (combos.has(combo)) throw new VariantError(`"${labelParts.join(' / ')}" kombinasyonu iki kez tanımlanmış.`);
        combos.add(combo);
      } else {
        const name = clean(v.variantName);
        if (!name) throw new VariantError(`${sku}: Varyant adı girin veya önce özellik tanımlayın.`);
        labelParts = [name];
      }

      const data = {
        name: `${master.name} - ${labelParts.join(' / ')}`,
        sku,
        barcode: clean(v.barcode) || null,
        price: v.price !== '' && v.price !== undefined && v.price !== null ? parseFloat(v.price) : master.price,
        stock: parseInt(v.stock) || 0,
        isActive: v.isActive === undefined ? true : v.isActive === true || v.isActive === 'true',
        ...Object.fromEntries(INHERITED.map(f => [f, master[f]]))
      };

      const variant = v.id
        ? await tx.product.update({ where: { id: parseInt(v.id), parentId: master.id }, data })
        : await tx.product.create({ data: { ...data, parentId: master.id, isMaster: false, images: '[]' } });
      keep.push(variant.id);

      await tx.productVariantValue.deleteMany({ where: { variantId: variant.id } });
      if (valueIds.length) {
        await tx.productVariantValue.createMany({ data: valueIds.map(optionValueId => ({ variantId: variant.id, optionValueId })) });
      }
    }

    // Listeden çıkarılan varyantlar
    for (const { id } of existingVariants.filter(e => !keep.includes(e.id))) {
      const [orders, returns, quotes] = await Promise.all([
        tx.orderItem.count({ where: { productId: id } }),
        tx.returnRequest.count({ where: { productId: id } }),
        tx.quoteRequestItem.count({ where: { productId: id } })
      ]);
      if (orders + returns + quotes > 0) {
        await tx.product.update({ where: { id }, data: { isActive: false } });
      } else {
        await tx.stockAlert.deleteMany({ where: { productId: id } });
        await tx.product.delete({ where: { id } });
      }
    }
  }

  // Ana ürünün operasyonel alanları varyantlara aktarılır
  await tx.product.updateMany({
    where: { parentId: master.id },
    data: Object.fromEntries(INHERITED.map(f => [f, master[f]]))
  });
};
