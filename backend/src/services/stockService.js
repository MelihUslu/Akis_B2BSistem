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

/** Stok yetmediği için düşülemedi (eşzamanlı onay / transfer). */
export class StockError extends Error {
  constructor(productId, quantity, available) {
    super(`Yetersiz stok (ürün #${productId}: istenen ${quantity}, mevcut ${available ?? 0}).`);
    this.productId = productId;
    this.quantity = quantity;
    this.available = available ?? 0;
  }
}

/**
 * Stok hareket defterine (StockMovement) tek satır yazar. adjustStock içinden çağrılır; depo yönetimi (WMS) için
 * her giriş / çıkış / transfer / sipariş / iade burada izlenir. meta: { type, reason, refType, refId, userId,
 * createdByName, binId }. delta 0 ise kayıt atılmaz. İşlem (tx) içinde çalışır; stok değişimiyle aynı anda yazılır.
 */
const recordMovement = async (tx, { productId, warehouseId, delta, balanceAfter, meta }) => {
  if (!delta) return;
  await tx.stockMovement.create({
    data: {
      productId,
      warehouseId: warehouseId ?? null,
      binId: meta?.binId ?? null,
      delta,
      balanceAfter: balanceAfter ?? null,
      type: meta?.type || (delta >= 0 ? 'IN' : 'OUT'),
      reason: meta?.reason || null,
      refType: meta?.refType || null,
      refId: meta?.refId ?? null,
      userId: meta?.userId ?? null,
      createdByName: meta?.createdByName || null
    }
  });
};

/**
 * Stoğu artırır / azaltır (delta). Kullanılan deponun id'sini döndürür (depo yoksa null).
 * Azaltma koşulludur: "stok >= miktar" değilse hiç düşülmez ve StockError atılır. Koşul UPDATE içinde
 * değerlendirildiği için (satır kilitlenir) aynı anda gelen iki onay aynı stoğu ikisi birden harcayamaz.
 * Depolu firmada önce ürün satırı güncellenir (kilit sırası hep ürün → depo), böylece eşzamanlı transferler
 * birbirini kilitlemez. Birden fazla ürün işlenecekse çağıran taraf ürün id sırasıyla çağırmalıdır.
 * meta verilirse hareket defterine kayıt düşülür (tip, sebep, referans); verilmezse tipi delta yönünden belirlenir.
 */
export const adjustStock = async (tx, productId, delta, warehouseId = null, meta = null) => {
  const qty = Math.abs(delta);
  const w = await targetWarehouse(tx, warehouseId);
  let balanceAfter = null;
  if (!w) {
    if (delta >= 0) {
      const p = await tx.product.update({ where: { id: productId }, data: { stock: { increment: qty } }, select: { stock: true } });
      balanceAfter = p.stock;
    } else {
      const res = await tx.product.updateMany({ where: { id: productId, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
      if (res.count === 0) {
        const p = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
        throw new StockError(productId, qty, p?.stock);
      }
      const p = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
      balanceAfter = p?.stock ?? null;
    }
    await recordMovement(tx, { productId, warehouseId: null, delta, balanceAfter, meta });
    return null;
  }
  await tx.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });
  if (delta >= 0) {
    const row = await tx.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: w.id, productId } },
      create: { warehouseId: w.id, productId, quantity: qty },
      update: { quantity: { increment: qty } },
      select: { quantity: true }
    });
    balanceAfter = row.quantity;
  } else {
    const res = await tx.warehouseStock.updateMany({ where: { warehouseId: w.id, productId, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } });
    if (res.count === 0) {
      const row = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: w.id, productId } } });
      throw new StockError(productId, qty, row?.quantity);
    }
    const row = await tx.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId: w.id, productId } }, select: { quantity: true } });
    balanceAfter = row?.quantity ?? null;
  }
  await recordMovement(tx, { productId, warehouseId: w.id, delta, balanceAfter, meta });
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
