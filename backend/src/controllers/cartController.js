import prisma from '../utils/prisma.js';

/**
 * Bayinin sepeti sunucuda da saklanır: telefonda başlanan sepet bilgisayarda kaldığı yerden devam eder.
 * Saklanan bilgi yalnızca sepet satırının gösterimi içindir; fiyat ve stok siparişte her zaman sunucuda yeniden hesaplanır.
 */
const MAX_ITEMS = 300;
const FIELDS = ['name', 'variantLabel', 'sku', 'images', 'unit'];

const clean = (items) => (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS).map((i) => {
  const row = { id: parseInt(i.id), quantity: parseInt(i.quantity), price: Number(i.price) || 0, vatRate: Number(i.vatRate ?? 20), moq: parseInt(i.moq) || 1, stepQuantity: parseInt(i.stepQuantity) || 1 };
  for (const f of FIELDS) if (i[f] !== undefined && i[f] !== null) row[f] = String(i[f]).slice(0, 2000);
  return row;
}).filter((i) => i.id > 0 && i.quantity > 0);

export const getCart = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { cart: true, cartUpdatedAt: true } });
  res.json({ items: Array.isArray(user?.cart) ? user.cart : [], updatedAt: user?.cartUpdatedAt || null });
};

export const saveCart = async (req, res) => {
  try {
    const items = clean(req.body.items);
    const updatedAt = new Date();
    await prisma.user.update({ where: { id: req.user.id }, data: { cart: items, cartUpdatedAt: updatedAt } });
    res.json({ ok: true, count: items.length, updatedAt });
  } catch (error) {
    res.status(400).json({ message: 'Sepet kaydedilemedi.' });
  }
};
