import prisma from '../utils/prisma.js';
import { adjustStock } from '../services/stockService.js';

const clean = (b) => ({
  name: String(b.name || '').trim().slice(0, 60),
  code: String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12),
  city: String(b.city || '').trim().slice(0, 40) || null
});

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
    await tx.warehouseStock.deleteMany({ where: { warehouseId: existing.id } });
    await tx.order.updateMany({ where: { warehouseId: existing.id }, data: { warehouseId: target?.id ?? null } });
    await tx.orderItem.updateMany({ where: { stockWarehouseId: existing.id }, data: { stockWarehouseId: target?.id ?? null } });
    await tx.warehouse.delete({ where: { id: existing.id } });
  }, { timeout: 60000 });
  res.json({ message: 'Depo silindi; stoğu diğer depoya taşındı.' });
};

// Ürünün depo bazında stoğu
export const productStocks = async (req, res) => {
  const rows = await prisma.warehouseStock.findMany({ where: { productId: parseInt(req.params.productId) }, select: { warehouseId: true, quantity: true } });
  res.json(rows);
};

// Depolar arası transfer (toplam stok değişmez)
export const transferStock = async (req, res) => {
  const quantity = parseInt(req.body.quantity);
  const productId = parseInt(req.body.productId);
  const fromId = parseInt(req.body.fromWarehouseId);
  const toId = parseInt(req.body.toWarehouseId);
  if (!(quantity > 0) || !productId || !fromId || !toId || fromId === toId) return res.status(400).json({ message: 'Ürün, iki farklı depo ve pozitif miktar girin.' });
  try {
    await prisma.$transaction(async (tx) => {
      const from = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: fromId, productId } } });
      if ((from?.quantity || 0) < quantity) throw new Error(`Çıkış deposunda yeterli stok yok (mevcut: ${from?.quantity || 0}).`);
      await adjustStock(tx, productId, -quantity, fromId);
      await adjustStock(tx, productId, quantity, toId);
    });
    res.json({ message: `${quantity} adet transfer edildi.` });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
