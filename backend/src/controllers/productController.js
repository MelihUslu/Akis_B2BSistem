import { setWarehouseStocks, reconcileStock, setStock } from '../services/stockService.js';
import prisma from '../utils/prisma.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import xlsx from 'xlsx';
import {
  buildPricingContext, presentProductForDealer, loadSpecialPrices, VARIANT_VALUES_INCLUDE
} from '../services/pricingService.js';
import { syncOptionsAndVariants, VariantError } from '../services/variantService.js';
import { notifyRestocked, safeNotify } from '../services/notificationService.js';
import { accessFor, visibleProductWhere, isVisibleTo, reservedQuantities, findVisibleProduct } from '../services/catalogAccess.js';
import { dealerCan } from '../services/dealerAccess.js';

const isTrue = (v) => v === true || v === 'true';
export const DEALER_GROUPS = ['STANDART', 'GOLD', 'VIP'];
// Görünür bayi grupları: boş liste = tüm bayiler
export const groupList = (v) => [...new Set((Array.isArray(v) ? v : []).map((g) => String(g).toUpperCase()))].filter((g) => DEALER_GROUPS.includes(g));

const loadCompany = (req) =>
  req.user.companyId ? prisma.company.findUnique({ where: { id: req.user.companyId } }) : null;

const OPTIONS_INCLUDE = { options: { include: { values: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } };

// Bayi görünümü için ürünleri fiyatlandırır (özel fiyatlar dahil) ve kullanıcıya özel bayrakları ekler
// Bayinin grubunun göremediği ürünler elenir; gösterilen stok, onay bekleyen siparişlerde ayrılan miktar düşülmüş haldedir
const presentForDealer = async (req, all, extraFor = () => ({})) => {
  const company = await loadCompany(req);
  const access = await accessFor(prisma, company);
  const products = all.filter((p) => isVisibleTo(p, access));
  const ids = products.flatMap(p => [p.id, p.parentId, ...(p.variants || []).map(v => v.id)]);
  const ctx = await buildPricingContext(company, await loadSpecialPrices(prisma, company, ids));
  if (!dealerCan(req.user, 'PRICES')) ctx.globalHide = true; // bayi kullanıcı yetkisi: fiyat göremez
  ctx.reserved = await reservedQuantities(prisma, products.flatMap(p => [p.id, ...(p.variants || []).map(v => v.id)]));
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

// Katalog sıralaması. Fiyat sıralaması liste fiyatına göredir (dövizli ürünler kendi para biriminde karşılaştırılır).
const SORTS = {
  default: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  newest: [{ createdAt: 'desc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'asc' }]
};

const categoryWithDescendants = async (rootId) => {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const ids = new Set([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of all) if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) { ids.add(c.id); added = true; }
  }
  return [...ids];
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
      maxPrice,
      sort
    } = req.query;

    // Yönetici görünümü sadece ADMIN rolüne açıktır (query parametresiyle açılamaz)
    const isAdmin = req.user.role === 'ADMIN' && isTrue(req.query.isAdmin);
    const take = Math.min(Math.max(parseInt(limit) || 12, 1), 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    const favoriteIds = isTrue(req.query.favorites)
      ? (await prisma.favorite.findMany({ where: { userId: req.user.id }, select: { productId: true } })).map(f => f.productId)
      : null;

    // Üst kategori seçilince alt kategorilerin ürünleri de gelir
    const categoryIds = categoryId ? await categoryWithDescendants(parseInt(categoryId)) : null;
    const visibility = isAdmin ? {} : visibleProductWhere(await accessFor(prisma, await loadCompany(req)));

    const where = {
      isMaster: true,
      ...(favoriteIds && { id: { in: favoriteIds } }),
      ...(isAdmin ? {} : { isActive: true }),
      AND: [
        ...(search ? [{
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } }
          ]
        }] : []),
        // Yalnızca stoktakiler: varyantsız üründe kendi stoğu, varyantlıda en az bir aktif varyantın stoğu
        ...(isTrue(req.query.inStock) ? [{ OR: [{ stock: { gt: 0 } }, { variants: { some: { isActive: true, stock: { gt: 0 } } } }] }] : []),
        ...(visibility.AND || [])
      ],
      ...(categoryIds && { categoryId: { in: categoryIds } }),
      ...(brand && { brand }),
      ...optionFilter(req.query.options),
      ...((minPrice || maxPrice) && {
        price: {
          ...(minPrice && { gte: parseFloat(minPrice) }),
          ...(maxPrice && { lte: parseFloat(maxPrice) })
        }
      })
    };

    // Ada göre sıralama Türkçe alfabeyle yapılır (veritabanı sıralaması Ç, Ş, İ… harflerini sona atar):
    // eşleşen ürünlerin yalnızca adları çekilir, sıralanır, sayfanın kimlikleri seçilir
    let pageIds = null;
    if (sort === 'name') {
      const all = await prisma.product.findMany({ where, select: { id: true, name: true } });
      pageIds = all.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }) || a.id - b.id).slice(skip, skip + take).map((p) => p.id);
    }

    const [found, total] = await Promise.all([
      prisma.product.findMany({
        where: pageIds ? { id: { in: pageIds } } : where,
        ...(pageIds ? {} : { skip, take }),
        include: {
          category: true,
          ...OPTIONS_INCLUDE,
          variants: { where: isAdmin ? {} : { isActive: true }, include: VARIANT_VALUES_INCLUDE, orderBy: { id: 'asc' } },
          alternatives: isAdmin ? true : { where: { isActive: true } },
        },
        orderBy: SORTS[sort] || SORTS.default
      }),
      prisma.product.count({ where })
    ]);
    const products = pageIds ? pageIds.map((id) => found.find((p) => p.id === id)).filter(Boolean) : found;

    let data = products;
    let rules;
    if (isAdmin) {
      // Yönetici listesinde onay bekleyen siparişlerde ayrılmış miktar da görünür
      const reserved = await reservedQuantities(prisma, products.flatMap(p => [p.id, ...(p.variants || []).map(v => v.id)]));
      data = products.map(p => ({ ...p, reserved: reserved.get(p.id) || 0, variants: p.variants?.map(v => ({ ...v, reserved: reserved.get(v.id) || 0 })) }));
    } else {
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
    const matched = new Set(found.flatMap(p => [p.sku, p.barcode]).filter(Boolean));

    res.json({ found, notFound: skus.filter(s => !matched.has(s)) });
  } catch (error) {
    console.error('resolveSkus error:', error);
    res.status(500).json({ message: 'SKU listesi çözümlenemedi.' });
  }
};

// Bayiye bağlantı olarak gösterilen alanlar yalnızca http(s): javascript: / data: adresleri tıklanınca çalışmasın
const linkUrl = (value, label) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { url = null; }
  if (!url || !['http:', 'https:'].includes(url.protocol)) throw new VariantError(`${label} adresi http:// ya da https:// ile başlamalıdır.`);
  return raw.slice(0, 1000);
};

export const createProduct = async (req, res) => {
  try {
    const {
      name, sku, barcode, brand, price, costPrice, currency, vatRate,
      stock, unit, moq, stepQuantity, packUnit, packSize, shortDesc, longDesc, categoryId,
      images, pdfUrl, videoUrl, variants, hidePrice, alternativeToId, visibleGroups
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
        packUnit: UPDATABLE.packUnit(packUnit),
        packSize: UPDATABLE.packSize(packSize),
        shortDesc,
        longDesc,
        images: JSON.stringify(images || []),
        pdfUrl: linkUrl(pdfUrl, 'Teknik katalog'),
        videoUrl: linkUrl(videoUrl, 'Video'),
        categoryId: categoryId ? parseInt(categoryId) : null,
        alternativeToId: alternativeToId ? parseInt(alternativeToId) : null,
        isMaster: true,
        isActive: true,
        hidePrice: isTrue(hidePrice),
        visibleGroups: groupList(visibleGroups)
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
  // Paket dönüşümü ikisi birlikte anlamlı: "1 Koli = 50 Adet"
  packUnit: (v) => String(v ?? '').trim().slice(0, 30) || null,
  packSize: (v) => (parseInt(v) > 1 ? parseInt(v) : null),
  images: (v) => (typeof v === 'string' ? v : JSON.stringify(v || [])),
  pdfUrl: (v) => linkUrl(v, 'Teknik katalog'), videoUrl: (v) => linkUrl(v, 'Video'),
  categoryId: (v) => (v ? parseInt(v) : null),
  alternativeToId: (v) => (v ? parseInt(v) : null),
  hidePrice: isTrue, isActive: isTrue, visibleGroups: groupList
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
    const visibility = req.user.role === 'BAYI' ? visibleProductWhere(await accessFor(prisma, await loadCompany(req))) : {};
    // groupBy veritabanında gruplar; findMany + distinct bütün ürünleri çekip bellekte tekilleştiriyordu
    // (50 bin üründe her katalog açılışında 33 ms sunucu işlemcisi — yük testi, 5 Kasım 2026)
    const brands = (await prisma.product.groupBy({
      by: ['brand'],
      where: { brand: { not: null }, isActive: true, ...visibility }
    })).map((b) => b.brand).filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));

    // Varyant özellikleri (aynı adlı özellikler birleştirilir): [{ name, values: [...] }]
    const options = await prisma.productOption.findMany({
      where: { product: { isActive: true, isMaster: true, ...visibility } },
      include: { values: { where: { variants: { some: { variant: { isActive: true } } } }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' }
    });
    const facets = new Map();
    for (const o of options) {
      if (!facets.has(o.name)) facets.set(o.name, new Set());
      o.values.forEach(v => facets.get(o.name).add(v.value));
    }

    res.json({
      brands,
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
    if (!(await findVisibleProduct(prisma, await loadCompany(req), productId))) return res.status(404).json({ message: 'Ürün bulunamadı.' });
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
      // Tarihler gün olarak girilir: başlangıç günün başı, bitiş günün sonu (firma saatiyle)
      const day = (v, end) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T${end ? '23:59:59.999' : '00:00:00'}`) : null);
      const validFrom = day(r.validFrom, false);
      const validUntil = day(r.validUntil, true);
      if (validFrom && validUntil && validFrom > validUntil) throw new VariantError('Özel fiyatın bitiş tarihi başlangıçtan önce olamaz.');
      return {
        productId,
        companyId: r.companyId ? parseInt(r.companyId) : null,
        dealerGroup: !r.companyId && r.dealerGroup ? r.dealerGroup : null,
        minQty,
        price,
        validFrom,
        validUntil
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

// Uyumlu ürünler (örn. bardak ↔ kapak). İlişki iki yönlüdür; teklif hazırlarken uyumluluk yalnızca buradan doğrulanır.
export const getCompatibleProducts = async (req, res) => {
  const id = parseInt(req.params.id);
  const rows = await prisma.productCompatibility.findMany({
    where: { OR: [{ productId: id }, { compatibleId: id }] },
    include: {
      product: { select: { id: true, name: true, sku: true, parent: { select: { name: true } } } },
      compatible: { select: { id: true, name: true, sku: true, parent: { select: { name: true } } } }
    }
  });
  res.json(rows.map((r) => {
    const other = r.productId === id ? r.compatible : r.product;
    return { id: other.id, sku: other.sku, name: other.parent?.name ? `${other.parent.name} · ${other.name}` : other.name };
  }));
};

export const replaceCompatibleProducts = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return res.status(404).json({ message: 'Ürün bulunamadı.' });
    const skus = [...new Set((req.body.skus || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 200);
    const others = skus.length ? await prisma.product.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true } }) : [];
    const notFound = skus.filter((s) => !others.some((o) => o.sku === s));
    if (notFound.length) return res.status(400).json({ message: `Bulunamayan SKU: ${notFound.join(', ')}` });
    const ids = others.map((o) => o.id).filter((x) => x !== id);
    await prisma.$transaction(async (tx) => {
      await tx.productCompatibility.deleteMany({ where: { OR: [{ productId: id }, { compatibleId: id }] } });
      if (ids.length) await tx.productCompatibility.createMany({ data: ids.map((compatibleId) => ({ productId: id, compatibleId })), skipDuplicates: true });
    });
    res.json({ message: ids.length ? `${ids.length} uyumlu ürün kaydedildi.` : 'Uyumlu ürünler temizlendi.' });
  } catch (error) {
    console.error('replaceCompatibleProducts error:', error);
    res.status(400).json({ message: 'Uyumlu ürünler kaydedilemedi.' });
  }
};
