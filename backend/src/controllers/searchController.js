import prisma from '../utils/prisma.js';

/**
 * Admin üst bar araması: ürün (ad/SKU/barkod), bayi (unvan/vergi no/cari kodu), sipariş (no / bayi adı).
 */
export const globalSearch = async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ products: [], companies: [], orders: [] });
  const ci = { contains: q, mode: 'insensitive' };
  const orderNo = parseInt(q.replace(/^#?AK-?/i, ''));

  const [products, companies, orders] = await Promise.all([
    prisma.product.findMany({
      where: { OR: [{ name: ci }, { sku: ci }, { barcode: ci }] },
      select: { id: true, name: true, sku: true, isMaster: true, parent: { select: { id: true, name: true } } },
      take: 6
    }),
    prisma.company.findMany({
      where: { OR: [{ name: ci }, { taxNumber: ci }, { externalCode: ci }, { authorizedPerson: ci }] },
      select: { id: true, name: true, taxNumber: true, status: true },
      take: 5
    }),
    prisma.order.findMany({
      where: { OR: [...(Number.isInteger(orderNo) ? [{ id: orderNo }] : []), { company: { name: ci } }] },
      select: { id: true, status: true, totalAmount: true, createdAt: true, company: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ]);

  res.json({ products, companies, orders });
};
