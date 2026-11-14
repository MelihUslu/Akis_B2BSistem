import prisma from '../utils/prisma.js';
import { adjustStock, StockError } from '../services/stockService.js';
import { emitEvent } from '../services/webhookService.js';

const clean = (b) => ({
  name: String(b.name || '').trim().slice(0, 60),
  code: String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12),
  city: String(b.city || '').trim().slice(0, 40) || null
});

const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const text = (v, max = 300) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

// Stok değişince ERP / dış depo yazılımına bildir (iki yönlü akış: dışarı). Hata asıl işlemi bozmaz.
const emitStock = (req, { productId, sku, warehouseId, quantity, delta, type, reason }) =>
  emitEvent(req.tenant.id, 'stock.changed', { productId, sku, warehouseId: warehouseId ?? null, quantity, delta, type, reason: reason || null });

// ─── Depolar (CRUD) ──────────────────────────────────────────────────────────

export const listWarehouses = async (req, res) => {
  const warehouses = await prisma.warehouse.findMany({ orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });
  const totals = await prisma.warehouseStock.groupBy({ by: ['warehouseId'], _sum: { quantity: true }, _count: { _all: true } });
  const byId = new Map(totals.map((t) => [t.warehouseId, t]));
  res.json(warehouses.map((w) => ({ ...w, totalQuantity: byId.get(w.id)?._sum.quantity || 0, productCount: byId.get(w.id)?._count._all || 0 })));
};

/** İlk depo eklenince ürünlerin mevcut stoku bu depoya aktarılır (toplam değişmez) */
export const createWarehouse = async (req, res) => {
  const data = clean(req.body);
  if (!data.name || !data.code) return res.status(400).json({ message: 'Depo adı ve kodu zorunlu.' });
  try {
    const warehouse = await prisma.$transaction(async (tx) => {
      const isFirst = (await tx.warehouse.count()) === 0;
      if (req.body.isDefault && !isFirst) await tx.warehouse.updateMany({ data: { isDefault: false } });
      const w = await tx.warehouse.create({ data: { ...data, isDefault: isFirst || Boolean(req.body.isDefault) } });
      if (isFirst) {
        const products = await tx.product.findMany({ where: { stock: { not: 0 } }, select: { id: true, stock: true } });
        if (products.length) await tx.warehouseStock.createMany({ data: products.map((p) => ({ warehouseId: w.id, productId: p.id, quantity: p.stock })) });
      }
      return w;
    }, { timeout: 60000 });
    res.status(201).json({ message: 'Depo eklendi.', warehouse });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ message: 'Bu depo kodu zaten kullanılıyor.' });
    throw error;
  }
};

export const updateWarehouse = async (req, res) => {
  const existing = await prisma.warehouse.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!existing) return res.status(404).json({ message: 'Depo bulunamadı.' });
  const data = clean({ ...existing, ...req.body });
  try {
    const warehouse = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault === true) await tx.warehouse.updateMany({ data: { isDefault: false } });
      return tx.warehouse.update({ where: { id: existing.id }, data: { ...data, ...(req.body.isDefault === true && { isDefault: true }) } });
    });
    res.json({ message: 'Depo güncellendi.', warehouse });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ message: 'Bu depo kodu zaten kullanılıyor.' });
    throw error;
  }
};

/** Depo silinir; stoğu varsayılan (ya da kalan ilk) depoya taşınır. Son depo silinirse stok ürünlerde toplam olarak kalır. */
export const deleteWarehouse = async (req, res) => {
  const existing = await prisma.warehouse.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!existing) return res.status(404).json({ message: 'Depo bulunamadı.' });
  await prisma.$transaction(async (tx) => {
    const target = await tx.warehouse.findFirst({ where: { id: { not: existing.id } }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });
    if (target) {
      const rows = await tx.warehouseStock.findMany({ where: { warehouseId: existing.id, quantity: { not: 0 } } });
      for (const r of rows) {
        await tx.warehouseStock.upsert({
          where: { warehouseId_productId: { warehouseId: target.id, productId: r.productId } },
          create: { warehouseId: target.id, productId: r.productId, quantity: r.quantity },
          update: { quantity: { increment: r.quantity } }
        });
      }
      if (existing.isDefault) await tx.warehouse.update({ where: { id: target.id }, data: { isDefault: true } });
    }
    // Rafları ve raf stoklarını temizle
    const bins = await tx.warehouseBin.findMany({ where: { warehouseId: existing.id }, select: { id: true } });
    if (bins.length) await tx.binStock.deleteMany({ where: { binId: { in: bins.map((b) => b.id) } } });
    await tx.warehouseBin.deleteMany({ where: { warehouseId: existing.id } });
    await tx.warehouseStock.deleteMany({ where: { warehouseId: existing.id } });
    await tx.order.updateMany({ where: { warehouseId: existing.id }, data: { warehouseId: target?.id ?? null } });
    await tx.orderItem.updateMany({ where: { stockWarehouseId: existing.id }, data: { stockWarehouseId: target?.id ?? null } });
    await tx.warehouse.delete({ where: { id: existing.id } });
  }, { timeout: 60000 });
  res.json({ message: 'Depo silindi; stoğu diğer depoya taşındı.' });
};

// ─── Ürün stoğu ──────────────────────────────────────────────────────────────

// Ürünün depo bazında stoğu (+ raf yerleşimi)
export const productStocks = async (req, res) => {
  const productId = parseInt(req.params.productId);
  const [rows, bins] = await Promise.all([
    prisma.warehouseStock.findMany({ where: { productId }, select: { warehouseId: true, quantity: true } }),
    prisma.binStock.findMany({ where: { productId, quantity: { not: 0 } }, select: { quantity: true, bin: { select: { id: true, code: true, name: true, warehouseId: true } } } })
  ]);
  res.json({ warehouses: rows, bins: bins.map((b) => ({ binId: b.bin.id, code: b.bin.code, name: b.bin.name, warehouseId: b.bin.warehouseId, quantity: b.quantity })) });
};

/**
 * Elle stok girişi / çıkışı (mal kabul, fire, düzeltme). direction: IN | OUT. Depo seçilmezse varsayılan depo.
 * Hareket defterine yazılır; raf (binId) verilirse giriş o rafa yerleştirilir / çıkış o raftan düşülür.
 */
export const manualAdjust = async (req, res) => {
  const productId = int(req.body.productId);
  const quantity = int(req.body.quantity);
  const warehouseId = int(req.body.warehouseId);
  const binId = int(req.body.binId);
  const direction = req.body.direction === 'OUT' ? 'OUT' : 'IN';
  const reason = text(req.body.reason);
  if (!productId || !(quantity > 0)) return res.status(400).json({ message: 'Ürün ve pozitif miktar girin.' });
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sku: true, name: true } });
  if (!product) return res.status(404).json({ message: 'Ürün bulunamadı.' });
  const delta = direction === 'OUT' ? -quantity : quantity;
  try {
    const usedWarehouseId = await prisma.$transaction(async (tx) => {
      if (binId) {
        const bin = await tx.warehouseBin.findUnique({ where: { id: binId } });
        if (!bin) throw new Error('Raf bulunamadı.');
        if (warehouseId && bin.warehouseId !== warehouseId) throw new Error('Seçilen raf bu depoya ait değil.');
      }
      const used = await adjustStock(tx, productId, delta, warehouseId, {
        type: direction === 'OUT' ? 'OUT' : 'IN', refType: 'MANUAL', reason,
        userId: req.user.id, createdByName: req.user.name, binId: binId || null
      });
      // Raf yerleşimi (opsiyonel): giriş rafa eklenir, çıkış raftan düşülür
      if (binId) {
        if (direction === 'IN') {
          await tx.binStock.upsert({ where: { binId_productId: { binId, productId } }, create: { binId, productId, quantity }, update: { quantity: { increment: quantity } } });
        } else {
          const bs = await tx.binStock.findUnique({ where: { binId_productId: { binId, productId } } });
          await tx.binStock.updateMany({ where: { binId, productId, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
          if ((bs?.quantity || 0) < quantity) throw new Error(`Rafta yeterli ürün yok (mevcut: ${bs?.quantity || 0}).`);
        }
      }
      return used;
    });
    const row = usedWarehouseId ? await prisma.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: usedWarehouseId, productId } }, select: { quantity: true } }) : null;
    emitStock(req, { productId, sku: product.sku, warehouseId: usedWarehouseId, quantity: row?.quantity ?? null, delta, type: direction, reason });
    res.json({ message: direction === 'OUT' ? `${quantity} adet çıkış işlendi.` : `${quantity} adet giriş işlendi.`, warehouseId: usedWarehouseId });
  } catch (error) {
    if (error instanceof StockError) return res.status(400).json({ message: `Yeterli stok yok (mevcut: ${error.available}).` });
    res.status(400).json({ message: error.message || 'Stok işlenemedi.' });
  }
};

/**
 * Sayım: depodaki fiili miktar girilir, fark (counted − mevcut) hareket defterine COUNT olarak yazılır.
 * Depolu olmayan firmada toplam stok sayımı yapılır.
 */
export const stockCount = async (req, res) => {
  const productId = int(req.body.productId);
  const warehouseId = int(req.body.warehouseId);
  const counted = int(req.body.counted);
  const reason = text(req.body.reason) || 'Sayım düzeltmesi';
  if (!productId || counted === null || counted < 0) return res.status(400).json({ message: 'Ürün ve sayılan miktar (0 veya üzeri) girin.' });
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, sku: true, stock: true } });
  if (!product) return res.status(404).json({ message: 'Ürün bulunamadı.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      let current;
      if (warehouseId) {
        const row = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId, productId } }, select: { quantity: true } });
        current = row?.quantity || 0;
      } else {
        current = product.stock;
      }
      const delta = counted - current;
      if (delta !== 0) await adjustStock(tx, productId, delta, warehouseId, { type: 'COUNT', refType: 'COUNT', reason, userId: req.user.id, createdByName: req.user.name });
      return { delta, current };
    });
    if (result.delta !== 0) emitStock(req, { productId, sku: product.sku, warehouseId, quantity: counted, delta: result.delta, type: 'COUNT', reason });
    res.json({ message: result.delta === 0 ? 'Sayım farkı yok; stok zaten doğru.' : `Sayım işlendi: ${result.delta > 0 ? '+' : ''}${result.delta} düzeltme.`, delta: result.delta });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Sayım işlenemedi.' });
  }
};

// Depolar arası transfer (toplam stok değişmez); her iki bacak da hareket defterine yazılır
export const transferStock = async (req, res) => {
  const quantity = int(req.body.quantity);
  const productId = int(req.body.productId);
  const fromId = int(req.body.fromWarehouseId);
  const toId = int(req.body.toWarehouseId);
  const reason = text(req.body.reason);
  if (!(quantity > 0) || !productId || !fromId || !toId || fromId === toId) return res.status(400).json({ message: 'Ürün, iki farklı depo ve pozitif miktar girin.' });
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { sku: true } });
  try {
    await prisma.$transaction(async (tx) => {
      const from = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: fromId, productId } } });
      if ((from?.quantity || 0) < quantity) throw new Error(`Çıkış deposunda yeterli stok yok (mevcut: ${from?.quantity || 0}).`);
      const meta = { refType: 'TRANSFER', reason, userId: req.user.id, createdByName: req.user.name };
      await adjustStock(tx, productId, -quantity, fromId, { ...meta, type: 'TRANSFER_OUT' });
      await adjustStock(tx, productId, quantity, toId, { ...meta, type: 'TRANSFER_IN' });
    });
    emitStock(req, { productId, sku: product?.sku, warehouseId: fromId, quantity: null, delta: -quantity, type: 'TRANSFER_OUT', reason });
    emitStock(req, { productId, sku: product?.sku, warehouseId: toId, quantity: null, delta: quantity, type: 'TRANSFER_IN', reason });
    res.json({ message: `${quantity} adet transfer edildi.` });
  } catch (error) {
    if (error instanceof StockError) return res.status(400).json({ message: `Çıkış deposunda yeterli stok yok (mevcut: ${error.available}).` });
    res.status(400).json({ message: error.message });
  }
};

// ─── Hareket defteri ───────────────────────────────────────────────────────────

const TYPE_LABEL = {
  IN: 'Giriş', OUT: 'Çıkış', ADJUST: 'Düzeltme', COUNT: 'Sayım', TRANSFER_IN: 'Transfer (gelen)', TRANSFER_OUT: 'Transfer (giden)',
  ORDER_OUT: 'Sipariş çıkışı', ORDER_CANCEL_IN: 'Sipariş iptali (geri)', RETURN_IN: 'İade (geri)', ERP_SET: 'ERP senkron', INITIAL: 'Açılış'
};

/** Stok hareketleri: ürün / depo / tip / tarih / arama süzgeci. */
export const listMovements = async (req, res) => {
  const productId = int(req.query.productId);
  const warehouseId = int(req.query.warehouseId);
  const type = typeof req.query.type === 'string' && TYPE_LABEL[req.query.type] ? req.query.type : null;
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
  const from = date(req.query.from);
  const to = date(req.query.to);
  const q = String(req.query.q || '').trim().slice(0, 80);
  const where = {
    ...(productId && { productId }),
    ...(warehouseId && { warehouseId }),
    ...(type && { type }),
    ...((from || to) && { createdAt: { ...(from && { gte: new Date(`${from}T00:00:00`) }), ...(to && { lte: new Date(`${to}T23:59:59`) }) } }),
    ...(q && { product: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: { contains: q, mode: 'insensitive' } }] } })
  };
  const rows = await prisma.stockMovement.findMany({
    where,
    include: { product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, name: true, code: true } }, bin: { select: { id: true, code: true } } },
    orderBy: { id: 'desc' },
    take: 500
  });
  res.json(rows.map((m) => ({
    id: m.id, productId: m.productId, product: m.product, warehouse: m.warehouse, bin: m.bin,
    delta: m.delta, balanceAfter: m.balanceAfter, type: m.type, typeLabel: TYPE_LABEL[m.type] || m.type,
    reason: m.reason, refType: m.refType, refId: m.refId, by: m.createdByName, createdAt: m.createdAt
  })));
};

/** Düşük stok: eşik (below) ve altındaki aktif ürünler. Varsayılan eşik 5. */
export const lowStock = async (req, res) => {
  const below = Math.max(0, int(req.query.below) ?? 5);
  const rows = await prisma.product.findMany({
    where: { isActive: true, stock: { lte: below } },
    select: { id: true, sku: true, name: true, stock: true, unit: true },
    orderBy: { stock: 'asc' },
    take: 500
  });
  res.json({ below, products: rows });
};

// ─── Raf / göz (bin) ───────────────────────────────────────────────────────────

const binView = (b) => ({ id: b.id, warehouseId: b.warehouseId, code: b.code, name: b.name, isDefault: b.isDefault });

export const listBins = async (req, res) => {
  const warehouseId = int(req.query.warehouseId);
  const bins = await prisma.warehouseBin.findMany({ where: { ...(warehouseId && { warehouseId }) }, orderBy: [{ warehouseId: 'asc' }, { code: 'asc' }] });
  const counts = await prisma.binStock.groupBy({ by: ['binId'], where: { quantity: { not: 0 } }, _sum: { quantity: true }, _count: { _all: true } });
  const byBin = new Map(counts.map((c) => [c.binId, c]));
  res.json(bins.map((b) => ({ ...binView(b), totalQuantity: byBin.get(b.id)?._sum.quantity || 0, productCount: byBin.get(b.id)?._count._all || 0 })));
};

export const createBin = async (req, res) => {
  const warehouseId = int(req.body.warehouseId);
  const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_\-.]/g, '').slice(0, 24);
  const name = text(req.body.name, 80);
  if (!warehouseId || !code) return res.status(400).json({ message: 'Depo ve raf kodu zorunlu.' });
  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse) return res.status(404).json({ message: 'Depo bulunamadı.' });
  try {
    const bin = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault === true) await tx.warehouseBin.updateMany({ where: { warehouseId }, data: { isDefault: false } });
      return tx.warehouseBin.create({ data: { warehouseId, code, name, isDefault: Boolean(req.body.isDefault) } });
    });
    res.status(201).json({ message: 'Raf eklendi.', bin: binView(bin) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ message: 'Bu depoda aynı raf kodu var.' });
    throw error;
  }
};

export const updateBin = async (req, res) => {
  const bin = await prisma.warehouseBin.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!bin) return res.status(404).json({ message: 'Raf bulunamadı.' });
  const name = req.body.name !== undefined ? text(req.body.name, 80) : bin.name;
  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault === true) await tx.warehouseBin.updateMany({ where: { warehouseId: bin.warehouseId }, data: { isDefault: false } });
      return tx.warehouseBin.update({ where: { id: bin.id }, data: { name, ...(req.body.isDefault !== undefined && { isDefault: Boolean(req.body.isDefault) }) } });
    });
    res.json({ message: 'Raf güncellendi.', bin: binView(updated) });
  } catch (error) {
    throw error;
  }
};

export const deleteBin = async (req, res) => {
  const bin = await prisma.warehouseBin.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!bin) return res.status(404).json({ message: 'Raf bulunamadı.' });
  const placed = await prisma.binStock.aggregate({ where: { binId: bin.id }, _sum: { quantity: true } });
  if ((placed._sum.quantity || 0) > 0) return res.status(400).json({ message: 'Rafta ürün var; önce başka rafa taşıyın ya da çıkarın.' });
  await prisma.$transaction(async (tx) => {
    await tx.binStock.deleteMany({ where: { binId: bin.id } });
    await tx.warehouseBin.delete({ where: { id: bin.id } });
  });
  res.json({ message: 'Raf silindi.' });
};

// Rafın içeriği (hangi üründen kaç adet)
export const binContents = async (req, res) => {
  const binId = parseInt(req.params.id);
  const rows = await prisma.binStock.findMany({
    where: { binId, quantity: { not: 0 } },
    include: { product: { select: { id: true, sku: true, name: true, barcode: true } } },
    orderBy: { quantity: 'desc' }
  });
  res.json(rows.map((r) => ({ productId: r.productId, product: r.product, quantity: r.quantity })));
};

/** Yerleştirme: depoda yerleştirilmemiş stoğu bir rafa koyar (depo toplamı değişmez). */
export const putAway = async (req, res) => {
  const binId = int(req.body.binId);
  const productId = int(req.body.productId);
  const quantity = int(req.body.quantity);
  if (!binId || !productId || !(quantity > 0)) return res.status(400).json({ message: 'Raf, ürün ve pozitif miktar girin.' });
  try {
    await prisma.$transaction(async (tx) => {
      const bin = await tx.warehouseBin.findUnique({ where: { id: binId } });
      if (!bin) throw new Error('Raf bulunamadı.');
      const ws = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: bin.warehouseId, productId } }, select: { quantity: true } });
      const placedAgg = await tx.binStock.aggregate({ where: { productId, bin: { warehouseId: bin.warehouseId } }, _sum: { quantity: true } });
      const unplaced = (ws?.quantity || 0) - (placedAgg._sum.quantity || 0);
      if (quantity > unplaced) throw new Error(`Yerleştirilecek stok yetersiz (yerleştirilmemiş: ${unplaced}).`);
      await tx.binStock.upsert({ where: { binId_productId: { binId, productId } }, create: { binId, productId, quantity }, update: { quantity: { increment: quantity } } });
    });
    res.json({ message: `${quantity} adet rafa yerleştirildi.` });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Yerleştirilemedi.' });
  }
};

/** Raf → raf taşıma (aynı depo içinde; depo toplamı değişmez). */
export const relocate = async (req, res) => {
  const fromBinId = int(req.body.fromBinId);
  const toBinId = int(req.body.toBinId);
  const productId = int(req.body.productId);
  const quantity = int(req.body.quantity);
  if (!fromBinId || !toBinId || !productId || !(quantity > 0) || fromBinId === toBinId) return res.status(400).json({ message: 'İki farklı raf, ürün ve pozitif miktar girin.' });
  try {
    await prisma.$transaction(async (tx) => {
      const [from, to] = await Promise.all([tx.warehouseBin.findUnique({ where: { id: fromBinId } }), tx.warehouseBin.findUnique({ where: { id: toBinId } })]);
      if (!from || !to) throw new Error('Raf bulunamadı.');
      if (from.warehouseId !== to.warehouseId) throw new Error('Raflar farklı depolarda; depolar arası için transfer kullanın.');
      const src = await tx.binStock.findUnique({ where: { binId_productId: { binId: fromBinId, productId } } });
      if ((src?.quantity || 0) < quantity) throw new Error(`Kaynak rafta yeterli ürün yok (mevcut: ${src?.quantity || 0}).`);
      await tx.binStock.update({ where: { binId_productId: { binId: fromBinId, productId } }, data: { quantity: { decrement: quantity } } });
      await tx.binStock.upsert({ where: { binId_productId: { binId: toBinId, productId } }, create: { binId: toBinId, productId, quantity }, update: { quantity: { increment: quantity } } });
    });
    res.json({ message: `${quantity} adet rafa taşındı.` });
  } catch (error) {
    res.status(400).json({ message: error.message || 'Taşınamadı.' });
  }
};

// ─── Barkod ────────────────────────────────────────────────────────────────────

/** Barkod / stok kodu / raf kodu okutma: ürünse stok + raf yerleşimi, rafsa içeriği döner. */
export const barcodeLookup = async (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return res.status(400).json({ message: 'Kod girin.' });
  const product = await prisma.product.findFirst({
    where: { OR: [{ barcode: code }, { sku: code }] },
    select: { id: true, sku: true, name: true, barcode: true, stock: true, unit: true }
  });
  if (product) {
    const [stocks, bins] = await Promise.all([
      prisma.warehouseStock.findMany({ where: { productId: product.id }, select: { quantity: true, warehouse: { select: { id: true, name: true, code: true } } } }),
      prisma.binStock.findMany({ where: { productId: product.id, quantity: { not: 0 } }, select: { quantity: true, bin: { select: { id: true, code: true, name: true, warehouseId: true } } } })
    ]);
    return res.json({ kind: 'PRODUCT', product, stocks, bins: bins.map((b) => ({ ...b.bin, quantity: b.quantity })) });
  }
  const bin = await prisma.warehouseBin.findFirst({ where: { code: code.toUpperCase() }, include: { warehouse: { select: { id: true, name: true, code: true } } } });
  if (bin) {
    const contents = await prisma.binStock.findMany({ where: { binId: bin.id, quantity: { not: 0 } }, include: { product: { select: { id: true, sku: true, name: true, barcode: true } } }, orderBy: { quantity: 'desc' } });
    return res.json({ kind: 'BIN', bin: { ...binView(bin), warehouse: bin.warehouse }, contents: contents.map((c) => ({ product: c.product, quantity: c.quantity })) });
  }
  res.status(404).json({ message: 'Bu koda ait ürün ya da raf bulunamadı.' });
};

// ─── Sipariş toplama (fulfillment) ───────────────────────────────────────────────

/**
 * Hazırlanacak siparişler: onaylanmış, henüz tamamı sevk edilmemiş kalemler. Toplayıcıya ürün, miktar, hangi depo
 * ve (varsa) hangi rafta durduğu gösterilir. Salt okunur liste (sevkiyat mevcut akışıyla sürer).
 */
export const pickList = async (req, res) => {
  const warehouseId = int(req.query.warehouseId);
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'READY_FOR_PICKUP'] },
      ...(warehouseId && { warehouseId }),
      items: { some: { status: 'APPROVED', isStockDeducted: true } }
    },
    select: {
      id: true, status: true, createdAt: true, deliveryMethod: true, warehouseId: true,
      company: { select: { id: true, name: true } },
      warehouse: { select: { id: true, name: true, code: true } },
      items: {
        where: { status: 'APPROVED', isStockDeducted: true },
        select: { id: true, quantity: true, shippedQty: true, variantLabel: true, stockWarehouseId: true, product: { select: { id: true, sku: true, name: true, barcode: true } } }
      }
    },
    orderBy: { createdAt: 'asc' },
    take: 200
  });
  // Toplanacak kalemlerin raf yerleşimleri (tek sorguda)
  const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.product.id)))];
  const binRows = productIds.length
    ? await prisma.binStock.findMany({ where: { productId: { in: productIds }, quantity: { not: 0 } }, select: { productId: true, quantity: true, bin: { select: { code: true, warehouseId: true } } } })
    : [];
  const binsByProduct = new Map();
  for (const r of binRows) {
    if (!binsByProduct.has(r.productId)) binsByProduct.set(r.productId, []);
    binsByProduct.get(r.productId).push({ code: r.bin.code, warehouseId: r.bin.warehouseId, quantity: r.quantity });
  }
  const result = orders
    .map((o) => ({
      id: o.id, status: o.status, createdAt: o.createdAt, deliveryMethod: o.deliveryMethod,
      company: o.company, warehouse: o.warehouse,
      items: o.items
        .filter((i) => i.shippedQty < i.quantity)
        .map((i) => ({
          id: i.id, product: i.product, quantity: i.quantity, remaining: i.quantity - i.shippedQty, variantLabel: i.variantLabel,
          stockWarehouseId: i.stockWarehouseId,
          bins: (binsByProduct.get(i.product.id) || []).filter((b) => !o.warehouseId || b.warehouseId === o.warehouseId)
        }))
    }))
    .filter((o) => o.items.length);
  res.json({ orders: result });
};
