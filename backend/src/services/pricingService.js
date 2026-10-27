import { getExchangeRates, toTRY } from './exchangeRateService.js';
import { getSettingsMap, num } from './settingsService.js';

// Kuruşa yuvarlama (yarım yukarı). Kayan nokta hatası (81.2249999… gibi) önce 15 anlamlı basamakta temizlenir.
const round2 = (n) => Math.round(Number((Number(n) * 100).toPrecision(15))) / 100;

const maskStock = (qty) => {
  if (qty > 100) return '100+';
  if (qty > 0 && qty <= 5) return 'Son 5 Ürün';
  if (qty <= 0) return 'Tükendi';
  return qty;
};

// Varyantın etiketi: "Gramaj: 1 kg · Ambalaj: Kutu" (özellik sırasına göre)
export const variantLabelOf = (product) => {
  const values = product?.variantValues || [];
  if (values.length === 0) return null;
  return [...values]
    .sort((a, b) => (a.optionValue.option.sortOrder - b.optionValue.option.sortOrder) || (a.optionValue.option.id - b.optionValue.option.id))
    .map(v => `${v.optionValue.option.name}: ${v.optionValue.value}`)
    .join(' · ');
};

export const VARIANT_VALUES_INCLUDE = { variantValues: { include: { optionValue: { include: { option: true } } } } };

/**
 * Varyantlar operasyonel ayarları (MOQ, koli katsayısı, birim, paket dönüşümü, KDV, döviz, fiyat gizleme) ana üründen alır.
 * Görsel yoksa ana ürünün görselleri kullanılır.
 */
export const effectiveProduct = (product, parent) => {
  if (!parent) return product;
  const hasImages = product.images && product.images !== '[]';
  return {
    ...product,
    moq: parent.moq,
    stepQuantity: parent.stepQuantity,
    unit: parent.unit,
    packUnit: parent.packUnit,
    packSize: parent.packSize,
    vatRate: parent.vatRate,
    currency: parent.currency,
    hidePrice: parent.hidePrice || product.hidePrice,
    images: hasImages ? product.images : parent.images,
    isActive: product.isActive && parent.isActive
  };
};

/**
 * Bayiye geçerli özel fiyatları yükler: Map<productId, [{ minQty, price, rank }]>
 * rank: 3 = bayiye özel, 2 = gruba özel, 1 = herkese (kademeli liste fiyatı)
 */
export const loadSpecialPrices = async (prisma, company, productIds) => {
  const ids = [...new Set(productIds.filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;

  const rows = await prisma.specialPrice.findMany({
    where: {
      productId: { in: ids },
      OR: [
        ...(company ? [{ companyId: company.id }, { dealerGroup: company.dealerGroup, companyId: null }] : []),
        { companyId: null, dealerGroup: null }
      ]
    }
  });
  for (const r of rows) {
    const rank = r.companyId ? 3 : r.dealerGroup ? 2 : 1;
    if (!map.has(r.productId)) map.set(r.productId, []);
    map.get(r.productId).push({ minQty: r.minQty, price: r.price, rank });
  }
  return map;
};

/**
 * Bayiye özel fiyat bağlamı: kurlar, iskonto oranları ve miktar indirimi kuralı.
 * Tek bir istekte bir kez oluşturulup tüm ürünler için kullanılır.
 */
export const buildPricingContext = async (company, specialPrices = new Map()) => {
  const [settings, fx] = await Promise.all([getSettingsMap(), getExchangeRates()]);
  return {
    rates: fx.rates,
    netDiscount: company?.netDiscount || 0,
    groupDiscount: num(settings[`group_discount_${company?.dealerGroup || 'STANDART'}`], 0),
    qtyThreshold: num(settings.qty_discount_threshold, 0),
    qtyRate: num(settings.qty_discount_rate, 0),
    globalHide: settings.global_hide_price === 'true',
    specialPrices
  };
};

// KDV hariç, TL cinsinden, bayi iskontoları uygulanmış birim fiyat (miktar indirimi hariç).
// Kur bilinmiyorsa null döner.
export const netUnitPrice = (product, ctx) => {
  const listTRY = toTRY(product.price, product.currency, ctx.rates);
  if (listTRY === null) return null;
  return listTRY * (1 - ctx.netDiscount / 100) * (1 - ctx.groupDiscount / 100);
};

export const qtyDiscountFor = (quantity, ctx) =>
  ctx.qtyThreshold > 0 && ctx.qtyRate > 0 && quantity >= ctx.qtyThreshold ? ctx.qtyRate : 0;

// Varyantın kendi özel fiyatı yoksa ana ürününki geçerlidir. En yüksek kapsam (bayi > grup > genel) kullanılır.
const specialTiersFor = (product, ctx) => {
  const own = ctx.specialPrices.get(product.id);
  const tiers = own?.length ? own : (product.parentId ? ctx.specialPrices.get(product.parentId) : null);
  if (!tiers?.length) return [];
  const bestRank = Math.max(...tiers.map(t => t.rank));
  return tiers.filter(t => t.rank === bestRank).sort((a, b) => a.minQty - b.minQty);
};

/**
 * Belirli bir miktar için bayiye geçerli birim fiyat (TL, KDV hariç).
 * Özel / kademeli fiyat varsa o kullanılır (diğer iskontolar uygulanmaz); yoksa iskontolu liste fiyatı + miktar indirimi.
 */
export const unitPriceFor = (product, quantity, ctx) => {
  const tier = specialTiersFor(product, ctx).filter(t => t.minQty <= quantity).pop();
  if (tier) {
    const unit = toTRY(tier.price, product.currency, ctx.rates);
    return unit === null ? null : { unit: round2(unit), base: round2(unit), qtyDiscount: 0, source: 'SPECIAL' };
  }
  const base = netUnitPrice(product, ctx);
  if (base === null) return null;
  const qtyDiscount = qtyDiscountFor(quantity, ctx);
  return { unit: round2(base * (1 - qtyDiscount / 100)), base: round2(base), qtyDiscount, source: 'LIST' };
};

// Bayiye gönderilecek ürün görünümü: maliyet ve gerçek stok gizlenir, fiyatlar TL'ye çevrilir
export const presentProductForDealer = (raw, ctx, extra = {}, parent = null) => {
  const p = effectiveProduct(raw, parent);
  const listTRY = toTRY(p.price, p.currency, ctx.rates);
  const rateMissing = listTRY === null;
  const hidden = ctx.globalHide || p.hidePrice || rateMissing;
  const { costPrice, stock, variantValues, options, ...rest } = p;
  const startQty = Math.max(1, p.moq || 1);
  const price = hidden ? null : unitPriceFor(p, startQty, ctx);

  const tiers = hidden ? [] : specialTiersFor(p, ctx)
    .map(t => ({ minQty: t.minQty, price: round2(toTRY(t.price, p.currency, ctx.rates)) }));

  return {
    ...rest,
    ...extra,
    stock: maskStock(stock),
    inStock: stock > 0,
    priceHidden: hidden,
    rateMissing,
    price: hidden ? 0 : p.price,
    listPriceTRY: hidden ? 0 : round2(listTRY),
    netPrice: hidden || !price ? 0 : price.unit,
    hasSpecialPrice: price?.source === 'SPECIAL',
    priceTiers: tiers.length > 1 || (tiers[0] && tiers[0].minQty > 1) ? tiers : [],
    // Varyant ise seçilen değerler ve etiket; ana ürünse tanımlı özellikler
    ...(variantValues && { optionValueIds: variantValues.map(v => v.optionValueId), variantLabel: variantLabelOf(raw) }),
    ...(options && {
      options: [...options].sort((a, b) => a.sortOrder - b.sortOrder).map(o => ({
        id: o.id, name: o.name,
        values: [...(o.values || [])].sort((a, b) => a.sortOrder - b.sortOrder).map(v => ({ id: v.id, value: v.value }))
      }))
    }),
    ...(parent && { parentName: parent.name }),
    variants: raw.variants?.map(v => presentProductForDealer(v, ctx, {}, raw)),
    alternatives: raw.alternatives?.map(a => presentProductForDealer(a, ctx))
  };
};

/**
 * Kupon doğrulama. Hata varsa { error } döner.
 */
export const validateCoupon = async (prisma, company, code, subtotal) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { coupon: null };
  const coupon = await prisma.coupon.findFirst({ where: { code: normalized } });
  const now = new Date();
  if (!coupon || !coupon.isActive) return { error: 'Kupon kodu geçersiz.' };
  if (coupon.startsAt && coupon.startsAt > now) return { error: 'Bu kupon henüz geçerli değil.' };
  if (coupon.endsAt && coupon.endsAt < now) return { error: 'Bu kuponun süresi dolmuş.' };
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return { error: 'Bu kuponun kullanım sınırı dolmuş.' };
  if (coupon.companyId && coupon.companyId !== company?.id) return { error: 'Bu kupon firmanız için geçerli değil.' };
  if (coupon.dealerGroup && coupon.dealerGroup !== company?.dealerGroup) return { error: 'Bu kupon bayi grubunuz için geçerli değil.' };
  if (subtotal < coupon.minSubtotal) {
    return { error: `Bu kupon için minimum sepet tutarı ₺${coupon.minSubtotal.toLocaleString('tr-TR')} (KDV hariç).` };
  }
  return { coupon };
};

/**
 * Kalemlerden sipariş toplamlarını hesaplar. Kupon indirimi KDV öncesi uygulanır ve
 * KDV her kalemde orantılı olarak indirimli tutar üzerinden hesaplanır.
 * lines: [{ price|unitPrice, quantity, vatRate }] · coupon: { type, value } | null
 */
export const computeTotals = (lines, coupon) => {
  const lineTotal = (l) => (l.unitPrice ?? l.price) * l.quantity;
  const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  let discountAmount = 0;
  if (coupon && subtotal > 0) {
    discountAmount = coupon.type === 'PERCENT'
      ? subtotal * Math.min(coupon.value, 100) / 100
      : Math.min(coupon.value, subtotal);
  }
  discountAmount = round2(discountAmount);
  const ratio = subtotal > 0 ? (subtotal - discountAmount) / subtotal : 1;
  const vatAmount = round2(lines.reduce((s, l) => s + lineTotal(l) * ratio * (l.vatRate / 100), 0));
  const total = round2(subtotal - discountAmount + vatAmount);
  return { subtotal, discountAmount, vatAmount, total };
};

// Sipariş / sepet için ürünleri, ana ürünlerini ve varyant değerlerini yükler
export const loadOrderableProducts = async (prisma, ids) => {
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { parent: true, ...VARIANT_VALUES_INCLUDE, _count: { select: { variants: { where: { isActive: true } } } } }
  });
  return new Map(products.map(p => [p.id, p]));
};

/**
 * Sepet tutarını sunucu tarafında hesaplar ve kuralları doğrular.
 * items: [{ productId, quantity }] — istemciden gelen fiyat asla kullanılmaz.
 */
export const quoteCart = async (prisma, company, items, { couponCode } = {}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { errors: ['Sepetiniz boş.'], lines: [], subtotal: 0, discountAmount: 0, vatAmount: 0, total: 0 };
  }

  const ids = [...new Set(items.map(i => parseInt(i.productId)).filter(Boolean))];
  const byId = await loadOrderableProducts(prisma, ids);
  const specialPrices = await loadSpecialPrices(prisma, company, [...ids, ...[...byId.values()].map(p => p.parentId)]);
  const ctx = await buildPricingContext(company, specialPrices);

  const errors = [];
  const lines = [];

  for (const item of items) {
    const raw = byId.get(parseInt(item.productId));
    const quantity = parseInt(item.quantity);
    const product = raw && effectiveProduct(raw, raw.parent);
    const displayName = raw?.parent ? raw.parent.name : raw?.name;

    if (!product || !product.isActive) {
      errors.push(`Ürün bulunamadı veya satışa kapalı (ID: ${item.productId}).`);
      continue;
    }
    if (raw.isMaster && raw._count.variants > 0) {
      errors.push(`${displayName}: Lütfen bir varyant seçin.`);
      continue;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      errors.push(`${displayName}: Geçersiz miktar.`);
      continue;
    }
    if (ctx.globalHide || product.hidePrice) {
      errors.push(`${displayName}: Bu ürün için fiyat teklifi almanız gerekiyor.`);
      continue;
    }
    if (quantity < (product.moq || 1)) {
      errors.push(`${displayName}: Minimum sipariş miktarı ${product.moq} ${product.unit}.`);
    }
    if ((product.stepQuantity || 1) > 1 && quantity % product.stepQuantity !== 0) {
      errors.push(`${displayName}: Sipariş miktarı ${product.stepQuantity}'in katları olmalıdır.`);
    }

    const price = unitPriceFor(product, quantity, ctx);
    if (price === null) {
      errors.push(`${displayName}: ${product.currency} kuru şu an alınamıyor, lütfen daha sonra tekrar deneyin.`);
      continue;
    }
    const lineSubtotal = round2(price.unit * quantity);

    lines.push({
      productId: product.id,
      name: displayName,
      variantLabel: variantLabelOf(raw),
      sku: product.sku,
      unit: product.unit,
      quantity,
      listPriceTRY: round2(toTRY(product.price, product.currency, ctx.rates)),
      baseUnitPrice: price.base,
      qtyDiscount: price.qtyDiscount,
      priceSource: price.source,
      unitPrice: price.unit,
      vatRate: product.vatRate,
      lineSubtotal
    });
  }

  const preliminary = computeTotals(lines, null);
  let coupon = null;
  if (couponCode) {
    const result = await validateCoupon(prisma, company, couponCode, preliminary.subtotal);
    if (result.error) errors.push(result.error);
    else coupon = result.coupon;
  }
  const totals = computeTotals(lines, coupon);

  if (company?.minOrderAmount > 0 && totals.subtotal < company.minOrderAmount) {
    errors.push(`Minimum sipariş tutarı ₺${company.minOrderAmount.toLocaleString('tr-TR')} (KDV hariç). Sepetiniz: ₺${totals.subtotal.toLocaleString('tr-TR')}.`);
  }

  return {
    lines,
    ...totals,
    coupon: coupon && { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description },
    couponRecord: coupon,
    errors,
    rules: { qtyThreshold: ctx.qtyThreshold, qtyRate: ctx.qtyRate }
  };
};

/**
 * Açık hesap kullanılabilir limiti: risk limiti + bakiye − onay bekleyen cari siparişler.
 * (Bakiye eksi ise borçtur.)
 */
export const availableCredit = async (prisma, company) => {
  const pending = await prisma.order.aggregate({
    where: { companyId: company.id, status: 'PENDING', paymentMethod: 'CURRENT_ACCOUNT' },
    _sum: { totalAmount: true }
  });
  const reserved = pending._sum.totalAmount || 0;
  return {
    reserved: round2(reserved),
    available: round2(company.riskLimit + company.currentBalance - reserved)
  };
};

export { round2, maskStock };
