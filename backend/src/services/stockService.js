import prisma from '../utils/prisma.js';

/**
 * Stok değişikliklerinin tek giriş noktası.
 * Firma depo tanımlamadıysa yalnızca Product.stock değişir (eski davranış).
 * Depo varsa ilgili deponun miktarı değişir ve Product.stock tüm depoların toplamı olarak güncellenir.
 * Fonksiyonlar bir işlem (tx) içinde çağrılabilir; verilmezse varsayılan istemci kullanılır.
 */
export const defaultWarehouse = (tx = prisma) =>
  tx.warehouse.findFirst({ orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });

const syncTotal = async (tx, productId) => {
  const agg = await tx.warehouseStock.aggregate({ where: { productId }, _sum: { quantity: true } });
  return tx.product.update({ where: { id: productId }, data: { stock: agg._sum.quantity || 0 } });
};

// Depo seçimi: verilen depo, yoksa varsayılan depo; firmada depo yoksa null
const targetWarehouse = async (tx, warehouseId) => {
  if (warehouseId) {
    const w = await tx.warehouse.findUnique({ where: { id: parseInt(warehouseId) } });
    if (w) return w;
  }
  return defaultWarehouse(tx);
};

/** Stoğu artırır / azaltır (delta). Kullanılan deponun id'sini döndürür (depo yoksa null). */
export const adjustStock = async (tx, productId, delta, warehouseId = null) => {
  const w = await targetWarehouse(tx, warehouseId);
  if (!w) {
    await tx.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });
    return null;
  }
  await tx.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: w.id, productId } },
    create: { warehouseId: w.id, productId, quantity: delta },
    update: { quantity: { increment: delta } }
  });
  await syncTotal(tx, productId);
  return w.id;
};

/**
 * Stoğu belirli bir değere ayarlar. Depo verilirse o deponun miktarı, verilmezse toplam stok ayarlanır:
 * depolu firmada fark varsayılan depoya yazılır (ERP / Excel depo belirtmeden toplam gönderdiğinde).
 */
export const setStock = async (tx, productId, quantity, warehouseId = null) => {
  const qty = parseInt(quantity) || 0;
  const def = await defaultWarehouse(tx);
  if (!def) return tx.product.update({ where: { id: productId }, data: { stock: qty } });
  let w = def;
  if (warehouseId) {
    w = await tx.warehouse.findUnique({ where: { id: parseInt(warehouseId) } });
    if (!w) throw new Error('Depo bulunamadı.');
  } else {
    const others = await tx.warehouseStock.aggregate({ where: { productId, warehouseId: { not: def.id } }, _sum: { quantity: true } });
    return setStock(tx, productId, qty - (others._sum.quantity || 0), def.id);
  }
  await tx.warehouseStock.upsert({
    where: { warehouseId_productId: { warehouseId: w.id, productId } },
    create: { warehouseId: w.id, productId, quantity: qty },
    update: { quantity: qty }
  });
  return syncTotal(tx, productId);
};

/** Depo bazında stokları toplu ayarlar: [{ warehouseId, quantity }] */
export const setWarehouseStocks = async (tx, productId, rows) => {
  for (const r of rows || []) {
    if (!r.warehouseId) continue;
    await tx.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: parseInt(r.warehouseId), productId } },
      create: { warehouseId: parseInt(r.warehouseId), productId, quantity: parseInt(r.quantity) || 0 },
      update: { quantity: parseInt(r.quantity) || 0 }
    });
  }
  return syncTotal(tx, productId);
};

/** Satılabilir miktar: depo verilirse o depodaki, yoksa toplam */
export const availableStock = async (tx, product, warehouseId) => {
  if (!warehouseId) return product.stock;
  const row = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId, productId: product.id } } });
  return row?.quantity ?? 0;
};

/**
 * Product.stock alanına doğrudan yazan eski akışlardan sonra çağrılır (ürün formu, Excel, ERP, varyantlar).
 * Firmada depo yoksa bir şey yapmaz; varsa yazılan toplamı depolara yansıtır (fark varsayılan depoya).
 */
export const reconcileStock = async (tx, productId, total) => {
  if (total === undefined || total === null || Number.isNaN(total)) return;
  if (!(await defaultWarehouse(tx))) return;
  await setStock(tx, productId, total);
};
