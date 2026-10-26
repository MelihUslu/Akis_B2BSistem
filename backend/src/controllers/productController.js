import { setWarehouseStocks, reconcileStock, setStock } from '../services/stockService.js';
import prisma from '../utils/prisma.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import xlsx from 'xlsx';
import {
  buildPricingContext, presentProductForDealer, loadSpecialPrices, VARIANT_VALUES_INCLUDE
} from '../services/pricingService.js';
import { syncOptionsAndVariants, VariantError } from '../services/variantService.js';
import { notifyRestocked, safeNotify } from '../services/notificationService.js';

const isTrue = (v) => v === true || v === 'true';

const loadCompany = (req) =>
  req.user.companyId ? prisma.company.findUnique({ where: { id: req.user.companyId } }) : null;

const OPTIONS_INCLUDE = { options: { include: { values: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } };

// Bayi görünümü için ürünleri fiyatlandırır (özel fiyatlar dahil) ve kullanıcıya özel bayrakları ekler
const presentForDealer = async (req, products, extraFor = () => ({})) => {
  const company = await loadCompany(req);
  const ids = products.flatMap(p => [p.id, p.parentId, ...(p.variants || []).map(v => v.id)]);
  const ctx = await buildPricingContext(company, await loadSpecialPrices(prisma, company, ids));
  const favorites = await prisma.favorite.findMany({ where: { userId: req.user.id, productId: { in: products.map(p => p.id) } }, select: { productId: true } });
  const favSet = new Set(favorites.map(f => f.productId));
  return {
    ctx,
    data: products.map(p => presentProductForDealer(p, ctx, {
      isFavorite: favSet.has(p.id),
      requiresVariant: p.isMaster && (p.variants?.length > 0 || p._count?.variants > 0),
      ...extraFor(p)
    }, p.parent || null))
  };
};

// ?options={"Gramaj":["1 kg"],"Ambalaj":["Kutu"]} → aynı varyantta tüm seçimleri sağlayan ana ürünler
const optionFilter = (raw) => {
  let selections;
  try { selections = JSON.parse(raw || '{}'); } catch { return {}; }
  const conditions = Object.entries(selections)
    .filter(([, values]) => Array.isArray(values) && values.length)
    .map(([name, values]) => ({ variantValues: { some: { optionValue: { value: { in: values }, option: { name } } } } }));
  return conditions.length ? { variants: { some: { isActive: true, AND: conditions } } } : {};
};

export const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      categoryId,
      brand,
      minPrice,
      maxPrice
    } = req.query;

    // Yönetici görünümü sadece ADMIN rolüne açıktır (query parametresiyle açılamaz)
    const isAdmin = req.user.role === 'ADMIN' && isTrue(req.query.isAdmin);
    const take = Math.min(Math.max(parseInt(limit) || 12, 1), 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const favoriteIds = isTrue(req.query.favorites)
      ? (await prisma.favorite.findMany({ where: { userId: req.user.id }, select: { productId: true } })).map(f => f.productId)
      : null;

    const where = {
      isMaster: true,
      ...(favoriteIds && { id: { in: favoriteIds } }),
      ...(isAdmin ? {} : { isActive: true }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
          { brand: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(categoryId && { categoryId: parseInt(categoryId) }),
      ...(brand && { brand }),
      ...optionFilter(req.query.options),
      ...((minPrice || maxPrice) && {
        price: {
          ...(minPrice && { gte: parseFloat(minPrice) }),
          ...(maxPrice && { lte: parseFloat(maxPrice) })
        }
      })
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          ...OPTIONS_INCLUDE,
          variants: { where: isAdmin ? {} : { isActive: true }, include: VARIANT_VALUES_INCLUDE, orderBy: { id: 'asc' } },
          alternatives: isAdmin ? true : { where: { isActive: true } },
        },
        orderBy: [
          { sortOrder: 'asc' },
          { createdAt: 'desc' }
        ]
      }),
      prisma.product.count({ where })
    ]);

    let data = products;
    let rules;
    if (!isAdmin) {
      const alerts = await prisma.stockAlert.findMany({
        where: { userId: req.user.id, notifiedAt: null, productId: { in: products.map(p => p.id) } },
        select: { productId: true }
      });
      const alertSet = new Set(alerts.map(a => a.productId));
      const presented = await presentForDealer(req, products, (p) => ({ hasStockAlert: alertSet.has(p.id) }));
      data = presented.data;
      rules = { qtyThreshold: presented.ctx.qtyThreshold, qtyRate: presented.ctx.qtyRate };
    }

    res.json({
      data,
      rules,
      pagination: {
        total,
        page: parseInt(page) || 1,
        pages: Math.ceil(total / take)
      }
    });
  } catch (error) {
    console.error('getProducts error:', error);
    res.status(500).json({ message: 'Ürünler listelenirken hata oluştu.' });
  }
};

// Hızlı sipariş: SKU listesini bayi fiyatlarıyla ürünlere çözer
export const resolveSkus = async (req, res) => {
  try {
    const skus = [...new Set((req.body.skus || []).map(s => String(s).trim()).filter(Boolean))].slice(0, 500);
    if (skus.length === 0) return res.json({ found: [], notFound: [] });

    const products = await prisma.product.findMany({
      where: { isActive: true, OR: [{ sku: { in: skus } }, { barcode: { in: skus } }] },
      include: { parent: true, ...VARIANT_VALUES_INCLUDE, _count: { select: { variants: { where: { isActive: true } } } } }
    });

    const { data: found } = await presentForDealer(req, products);
    const matched = new Set(products.flatMap(p => [p.sku, p.barcode]).filter(Boolean));

    res.json({ found, notFound: skus.filter(s => !matched.has(s)) });
  } catch (error) {
    console.error('resolveSkus error:', error);
    res.status(500).json({ message: 'SKU listesi çözümlenemedi.' });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name, sku, barcode, brand, price, costPrice, currency, vatRate,
      stock, unit, moq, stepQuantity, shortDesc, longDesc, categoryId,
      images, pdfUrl, videoUrl, variants, hidePrice, alternativeToId
    } = req.body;

    await assertWithinLimit(req.tenant, 'products');

    const product = await prisma.product.create({
      data: {
        name, sku, barcode: barcode || null, brand,
        price: parseFloat(price),
        costPrice: costPrice ? parseFloat(costPrice) : null,
        currency: currency === 'TL' ? 'TRY' : (currency || 'TRY'),
        vatRate: parseFloat(vatRate) || 20,
        stock: parseInt(stock) || 0,
        unit,
        moq: parseInt(moq) || 1,
        stepQuantity: parseInt(stepQuantity) || 1,
        shortDesc,
        longDesc,
        images: JSON.stringify(images || []),
        pdfUrl,
        videoUrl,
        categoryId: categoryId ? parseInt(categoryId) : null,
        alternativeToId: alternativeToId ? parseInt(alternativeToId) : null,
        isMaster: true,
        isActive: true,
        hidePrice: isTrue(hidePrice)
      }
    });

    if (Array.isArray(req.body.options) || Array.isArray(variants)) {
      await prisma.$transaction((tx) => syncOptionsAndVariants(tx, product, { options: req.body.options, variants }));
    }
    // Depolu firmada stok depo bazında (formdan) ya da toplam olarak varsayılan depoya yazılır
    if (Array.isArray(req.body.warehouseStocks) && req.body.warehouseStocks.length) await setWarehouseStocks(prisma, product.id, req.body.warehouseStocks);
    else await reconcileStock(prisma, product.id, product.stock);

    res.status(201).json(product);
  } catch (error) {
    if (error instanceof LimitError) return res.status(error.status).json({ message: error.message, code: error.code });
    if (error instanceof VariantError) return res.status(400).json({ message: error.message });
    console.error(error);
    res.status(400).json({ message: 'Ürün oluşturulamadı. SKU (ürün ve varyantlarda) benzersiz olmalıdır.' });
  }
};

// Güncellenebilir alanlar ve dönüştürücüleri (istemciden gelen diğer alanlar yok sayılır)
const UPDATABLE = {
  name: String, sku: String, barcode: (v) => v || null, brand: (v) => v || null,
  shortDesc: (v) => v ?? null, longDesc: (v) => v ?? null,
  price: parseFloat, costPrice: (v) => (v === '' || v === null ? null : parseFloat(v)),
  currency: (v) => (v === 'TL' ? 'TRY' : v), vatRate: parseFloat,
  stock: (v) => parseInt(v) || 0, unit: String,
  moq: (v) => parseInt(v) || 1, stepQuantity: (v) => parseInt(v) || 1,
  images: (v) => (typeof v === 'string' ? v : JSON.stringify(v || [])),
  pdfUrl: (v) => v || null, videoUrl: (v) => v || null,
  categoryId: (v) => (v ? parseInt(v) : null),
  alternativeToId: (v) => (v ? parseInt(v) : null),
  hidePrice: isTrue, isActive: isTrue
};

// Excel stok satırı: depo kodu verilmişse o deponun, yoksa toplam stoğun değeri
const applyExcelStock = async (productId, stock, warehouseCode) => {
  if (warehouseCode) {
    const w = await prisma.warehouse.findFirst({ where: { code: String(warehouseCode).trim().toUpperCase() } });
    if (w) return setStock(prisma, productId, stock, w.id);
  }
  return reconcileStock(prisma, productId, stock);
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const data = {};
    for (const [key, convert] of Object.entries(UPDATABLE)) {
      if (req.body[key] !== undefined) data[key] = convert(req.body[key]);
    }

    const product = await prisma.$transaction(async (tx) => {
      const master = await tx.product.update({ where: { id: parseInt(id) }, data });
      await syncOptionsAndVariants(tx, master, { options: req.body.options, variants: req.body.variants });
      if (Array.isArray(req.body.warehouseStocks) && req.body.warehouseStocks.length) await setWarehouseStocks(tx, master.id, req.body.warehouseStocks);
      else if (data.stock !== undefined) await reconcileStock(tx, master.id, data.stock);
      return master;
    });

    const variantIds = Array.isArray(req.body.variants) ? req.body.variants.filter(v => v.id && parseInt(v.stock) > 0).map(v => parseInt(v.id)) : [];
    safeNotify(notifyRestocked([...(data.stock > 0 ? [product.id] : []), ...variantIds]));
    res.json(product);
  } catch (error) {
    if (error instanceof VariantError) return res.status(400).json({ message: error.message });
    // Kayıt yok ya da başka firmaya ait (kiracı filtresi nedeniyle bulunamaz)
    if (error.code === 'P2025') return res.status(404).json({ message: 'Ürün bulunamadı.' });
    console.error(error);
    res.status(400).json({ message: error.code === 'P2002' ? 'Ürün güncellenemedi: SKU başka bir üründe kullanılıyor.' : 'Ürün güncellenemedi.' });
  }
};

// Sipariş geçmişi olan ürünler silinmez, pasife alınır
export const deleteProduct = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({ where: { id }, include: { variants: { select: { id: true } } } });
    if (!product) return res.status(404).json({ message: 'Ürün bulunamadı.' });

    const ids = [id, ...product.variants.map(v => v.id)];
    const [orderRefs, returnRefs, quoteRefs] = await Promise.all([
      prisma.orderItem.count({ where: { productId: { in: ids } } }),
      prisma.returnRequest.count({ where: { productId: { in: ids } } }),
      prisma.quoteRequestItem.count({ where: { productId: { in: ids } } })
    ]);

    if (orderRefs + returnRefs + quoteRefs > 0) {
      await prisma.product.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
      return res.json({ message: 'Ürünün sipariş geçmişi olduğu için silinmedi, pasife alındı.', archived: true });
    }

    await prisma.$transaction([
      prisma.stockAlert.deleteMany({ where: { productId: { in: ids } } }),
      prisma.product.updateMany({ where: { alternativeToId: { in: ids } }, data: { alternativeToId: null } }),
      prisma.product.deleteMany({ where: { parentId: id } }),
      prisma.product.delete({ where: { id } })
    ]);
    res.json({ message: 'Ürün silindi.' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Ürün silinemedi.' });
  }
};

const cell = (row, ...keys) => {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k];
  return undefined;
};

/**
 * Excel/CSV ile toplu işlem.
 *  - price:    SKU, Price (veya Fiyat)
 *  - stock:    SKU, Stock (veya Stok)
 *  - products: SKU, Name/Ad, Price/Fiyat, Currency/Döviz, VatRate/KDV, Stock/Stok, Unit/Birim, Brand/Marka, Barcode/Barkod
 *              (SKU varsa günceller, yoksa yeni ürün oluşturur)
 */
export const bulkUpdate = async (req, res) => {
  const { type } = req.params;
  if (!['price', 'stock', 'products'].includes(type)) return res.status(400).json({ message: 'Geçersiz işlem tipi.' });
  if (!req.file) return res.status(400).json({ message: 'Dosya yüklenmedi.' });

  try {
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const summary = { updated: 0, created: 0, notFound: [], errors: [] };
    const restocked = [];

    for (const [index, row] of rows.entries()) {
      const sku = cell(row, 'SKU', 'Sku', 'sku', 'Stok Kodu');
      if (!sku) continue;

      try {
        const priceVal = cell(row, 'Price', 'Fiyat');
        const stockVal = cell(row, 'Stock', 'Stok');

        if (type === 'price' || type === 'stock') {
          const data = {};
          if (type === 'price' && priceVal !== undefined) data.price = parseFloat(priceVal);
          if (type === 'stock' && stockVal !== undefined) data.stock = parseInt(stockVal);
          if (Object.keys(data).length === 0) continue;

          const existing = await prisma.product.findFirst({ where: { sku: String(sku) } });
          if (!existing) { summary.notFound.push(String(sku)); continue; }
          await prisma.product.update({ where: { id: existing.id }, data });
          // "Depo" sütunu varsa o depoya, yoksa toplam stok olarak yazılır
          if (data.stock !== undefined) await applyExcelStock(existing.id, data.stock, cell(row, 'Warehouse', 'Depo'));
          if (data.stock > 0) restocked.push(existing.id);
          summary.updated++;
          continue;
        }

        // type === 'products'
        const data = {
          name: cell(row, 'Name', 'Ad', 'Ürün Adı'),
          brand: cell(row, 'Brand', 'Marka'),
          barcode: cell(row, 'Barcode', 'Barkod')?.toString(),
          currency: cell(row, 'Currency', 'Döviz'),
          unit: cell(row, 'Unit', 'Birim'),
          shortDesc: cell(row, 'ShortDesc', 'Kısa Açıklama'),
          ...(priceVal !== undefined && { price: parseFloat(priceVal) }),
          ...(stockVal !== undefined && { stock: parseInt(stockVal) }),
          ...(cell(row, 'VatRate', 'KDV') !== undefined && { vatRate: parseFloat(cell(row, 'VatRate', 'KDV')) })
        };
        Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
        if (data.currency === 'TL') data.currency = 'TRY';

        const existing = await prisma.product.findFirst({ where: { sku: String(sku) } });
        if (existing) {
          await prisma.product.update({ where: { id: existing.id }, data });
          if (data.stock !== undefined) await applyExcelStock(existing.id, data.stock, cell(row, 'Warehouse', 'Depo'));
          if (data.stock > 0) restocked.push(existing.id);
          summary.updated++;
        } else {
          if (!data.name || data.price === undefined) {
            summary.errors.push(`Satır ${index + 2}: Yeni ürün için Ad ve Fiyat zorunlu.`);
            continue;
          }
          await assertWithinLimit(req.tenant, 'products');
          await prisma.product.create({ data: { ...data, sku: String(sku), images: '[]' } });
          summary.created++;
        }
      } catch (err) {
        summary.errors.push(`Satır ${index + 2} (${sku}): ${err.message.split('\n').pop()}`);
      }
    }

    safeNotify(notifyRestocked(restocked));
    res.json({ message: 'Toplu işlem tamamlandı.', ...summary });
  } catch (error) {
    res.status(500).json({ message: 'Excel işleme hatası. Dosya formatını kontrol edin.' });
  }
};

export const linkAlternative = async (req, res) => {
  try {
    const { productId, alternativeId } = req.body;
    await prisma.product.update({
      where: { id: parseInt(productId) },
      data: { alternativeToId: parseInt(alternativeId) }
    });
    res.json({ message: 'Alternatif ürün başarıyla bağlandı.' });
  } catch (error) {
    res.status(400).json({ message: 'Bağlama işlemi başarısız.' });
  }
};

export const getFilters = async (req, res) => {
  try {
    const brands = await prisma.product.findMany({
      select: { brand: true },
      distinct: ['brand'],
      where: { brand: { not: null }, isActive: true }
    });

    // Varyant özellikleri (aynı adlı özellikler birleştirilir): [{ name, values: [...] }]
    const options = await prisma.productOption.findMany({
      where: { product: { isActive: true, isMaster: true } },
      include: { values: { where: { variants: { some: { variant: { isActive: true } } } }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' }
    });
    const facets = new Map();
    for (const o of options) {
      if (!facets.has(o.name)) facets.set(o.name, new Set());
      o.values.forEach(v => facets.get(o.name).add(v.value));
    }

    res.json({
      brands: brands.map(b => b.brand),
      options: [...facets.entries()]
        .filter(([, values]) => values.size > 0)
        .map(([name, values]) => ({ name, values: [...values] })), // Admin'in tanımladığı sıra korunur
      vatRates: [1, 10, 20],
      units: ['Adet', 'Kutu', 'Koli', 'Metre', 'Kg']
    });
  } catch (error) {
    res.status(500).json({ message: 'Filtreler alınamadı.' });
  }
};

export const reorderProducts = async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({ message: 'Geçersiz veri formatı.' });
    }

    const updates = products.map(p =>
      prisma.product.update({
        where: { id: parseInt(p.id) },
        data: { sortOrder: parseInt(p.sortOrder) }
      })
    );

    await prisma.$transaction(updates);
    res.json({ message: 'Sıralama güncellendi.' });
  } catch (error) {
    console.error('Product reorder error:', error);
    res.status(500).json({ message: 'Sıralama güncellenirken hata oluştu.' });
  }
};

// "Gelince Haber Ver"
export const subscribeStockAlert = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    await prisma.stockAlert.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      update: { notifiedAt: null },
      create: { userId: req.user.id, productId }
    });
    res.json({ message: 'Ürün stoğa girdiğinde size bildirim göndereceğiz.' });
  } catch (error) {
    res.status(400).json({ message: 'Stok bildirimi oluşturulamadı.' });
  }
};

export const unsubscribeStockAlert = async (req, res) => {
  try {
    await prisma.stockAlert.deleteMany({ where: { userId: req.user.id, productId: parseInt(req.params.id) } });
    res.json({ message: 'Stok bildirimi kaldırıldı.' });
  } catch (error) {
    res.status(400).json({ message: 'Stok bildirimi kaldırılamadı.' });
  }
};

// ─── Özel / kademeli fiyatlar (admin) ────────────────────────────────────────

export const getSpecialPrices = async (req, res) => {
  const rows = await prisma.specialPrice.findMany({
    where: { productId: parseInt(req.params.id) },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ companyId: 'asc' }, { dealerGroup: 'asc' }, { minQty: 'asc' }]
  });
  res.json(rows);
};

// Ürünün tüm özel fiyatlarını gönderilen listeyle değiştirir
export const replaceSpecialPrices = async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const rows = Array.isArray(req.body.prices) ? req.body.prices : [];
    const data = rows.map((r) => {
      const price = parseFloat(r.price);
      const minQty = parseInt(r.minQty) || 1;
      if (!Number.isFinite(price) || price < 0) throw new VariantError('Özel fiyat geçerli bir sayı olmalıdır.');
      if (minQty < 1) throw new VariantError('Minimum miktar en az 1 olmalıdır.');
      return {
        productId,
        companyId: r.companyId ? parseInt(r.companyId) : null,
        dealerGroup: !r.companyId && r.dealerGroup ? r.dealerGroup : null,
        minQty,
        price
      };
    });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ message: 'Ürün bulunamadı.' });

    await prisma.$transaction([
      prisma.specialPrice.deleteMany({ where: { productId } }),
      prisma.specialPrice.createMany({ data })
    ]);
    res.json({ message: `${data.length} özel fiyat kaydedildi.` });
  } catch (error) {
    if (error instanceof VariantError) return res.status(400).json({ message: error.message });
    res.status(400).json({ message: 'Özel fiyatlar kaydedilemedi.' });
  }
};

// ─── Sık aldıklarım (bayi) ───────────────────────────────────────────────────

export const getFrequentProducts = async (req, res) => {
  try {
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const top = await prisma.orderItem.groupBy({
      by: ['productId'],
      where: { status: 'APPROVED', order: { companyId: req.user.companyId, createdAt: { gte: since }, status: { not: 'CANCELLED' } } },
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 24
    });

    const products = await prisma.product.findMany({
      where: { id: { in: top.map(t => t.productId) }, isActive: true },
      include: { parent: true, ...VARIANT_VALUES_INCLUDE }
    });
    const byId = new Map(products.map(p => [p.id, p]));
    const ordered = top.map(t => byId.get(t.productId)).filter(Boolean);
    const stats = new Map(top.map(t => [t.productId, { orderCount: t._count._all, totalQuantity: t._sum.quantity }]));

    const { data } = await presentForDealer(req, ordered, (p) => stats.get(p.id));
    res.json(data);
  } catch (error) {
    console.error('getFrequentProducts error:', error);
    res.status(500).json({ message: 'Sık alınan ürünler getirilemedi.' });
  }
};
