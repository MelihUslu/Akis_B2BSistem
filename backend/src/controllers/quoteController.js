import { resolveShippingAddress } from './addressController.js';
import prisma from '../utils/prisma.js';
import { loadOrderableProducts, effectiveProduct, variantLabelOf, availableCredit, computeTotals, round2 } from '../services/pricingService.js';
import { createOrderRecord, OrderError } from './orderController.js';
import { notifyAdmins, notifyCompany, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';

const include = {
  company: { select: { id: true, name: true } },
  user: { select: { name: true, email: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true, images: true, vatRate: true, parent: { select: { name: true, images: true, vatRate: true } } } } } },
  order: { select: { id: true, status: true } }
};

// Süresi geçen teklifler okunurken kapatılır
const expireIfNeeded = async (quote) => {
  if (quote.status === 'QUOTED' && quote.validUntil && quote.validUntil < new Date()) {
    await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'EXPIRED' } });
    return { ...quote, status: 'EXPIRED' };
  }
  return quote;
};

const totalsOf = (quote) => {
  const priced = quote.items.filter(i => i.quotedPrice !== null);
  if (priced.length !== quote.items.length) return null;
  return computeTotals(priced.map(i => ({
    unitPrice: i.quotedPrice,
    quantity: i.quantity,
    vatRate: i.product.parent?.vatRate ?? i.product.vatRate
  })), null);
};

export const listQuotes = async (req, res) => {
  const { status } = req.query;
  const quotes = await prisma.quoteRequest.findMany({
    where: {
      ...(req.user.role === 'BAYI' && { companyId: req.user.companyId }),
      ...(status && { status })
    },
    include,
    orderBy: { createdAt: 'desc' }
  });
  const result = await Promise.all(quotes.map(expireIfNeeded));
  res.json(result.map(q => ({ ...q, totals: totalsOf(q) })));
};

export const getQuote = async (req, res) => {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) }, include });
  if (!quote || (req.user.role === 'BAYI' && quote.companyId !== req.user.companyId)) {
    return res.status(404).json({ message: 'Teklif bulunamadı.' });
  }
  const q = await expireIfNeeded(quote);
  res.json({ ...q, totals: totalsOf(q) });
};

// Bayi teklif ister (fiyatı gizli ürünler dahil)
export const createQuote = async (req, res) => {
  try {
    const items = (Array.isArray(req.body.items) ? req.body.items : [])
      .map(i => ({ productId: parseInt(i.productId), quantity: parseInt(i.quantity) }))
      .filter(i => i.productId && i.quantity > 0);
    if (items.length === 0) return res.status(400).json({ message: 'Teklif için en az bir ürün ve miktar girin.' });

    const products = await loadOrderableProducts(prisma, items.map(i => i.productId));
    for (const item of items) {
      const raw = products.get(item.productId);
      if (!raw || !effectiveProduct(raw, raw.parent).isActive) return res.status(400).json({ message: 'Ürün bulunamadı veya satışa kapalı.' });
      if (raw.isMaster && raw._count.variants > 0) return res.status(400).json({ message: `${raw.name}: Lütfen bir varyant seçin.` });
    }

    const quote = await prisma.$transaction(async (tx) => {
      const q = await tx.quoteRequest.create({
        data: { companyId: req.user.companyId, userId: req.user.id, note: String(req.body.note || '').trim() || null }
      });
      await tx.quoteRequestItem.createMany({
        data: items.map(i => ({ quoteRequestId: q.id, productId: i.productId, quantity: i.quantity, variantLabel: variantLabelOf(products.get(i.productId)) }))
      });
      return q;
    });

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    safeNotify(notifyAdmins({ type: 'ORDER', title: 'Yeni teklif talebi', message: `${company.name} ${items.length} kalem için teklif istedi (#TK-${quote.id}).`, link: '/admin/quotes' }));
    emitEvent(req.tenant.id, 'quote.created', { id: quote.id, companyId: req.user.companyId, items: items.length });
    res.status(201).json({ message: 'Teklif talebiniz alındı. Fiyatlandırıldığında size bildirim göndereceğiz.', quote });
  } catch (error) {
    console.error('createQuote error:', error);
    res.status(400).json({ message: 'Teklif talebi oluşturulamadı.' });
  }
};

// Admin teklifi fiyatlandırır
export const respondQuote = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const quote = await prisma.quoteRequest.findUnique({ where: { id }, include: { items: true } });
    if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    if (!['PENDING', 'QUOTED', 'EXPIRED'].includes(quote.status)) return res.status(400).json({ message: 'Bu teklif artık güncellenemez.' });

    const prices = new Map((req.body.items || []).map(i => [parseInt(i.id), parseFloat(i.quotedPrice)]));
    for (const item of quote.items) {
      const price = prices.get(item.id);
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Tüm kalemler için geçerli bir birim fiyat girin.' });
    }
    const validUntil = req.body.validUntil ? new Date(`${req.body.validUntil}T23:59:59`) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      ...quote.items.map(item => prisma.quoteRequestItem.update({ where: { id: item.id }, data: { quotedPrice: round2(prices.get(item.id)) } })),
      prisma.quoteRequest.update({ where: { id }, data: { status: 'QUOTED', adminNote: req.body.adminNote ?? quote.adminNote, validUntil } })
    ]);

    safeNotify(notifyCompany(quote.companyId, {
      type: 'ORDER',
      title: 'Teklifiniz hazır',
      message: `#TK-${id} numaralı teklif talebiniz fiyatlandırıldı. Geçerlilik: ${validUntil.toLocaleDateString('tr-TR')}.`,
      link: '/bayi/quotes'
    }));
    res.json({ message: 'Teklif bayiye gönderildi.' });
  } catch (error) {
    console.error('respondQuote error:', error);
    res.status(400).json({ message: 'Teklif kaydedilemedi.' });
  }
};

export const rejectQuote = async (req, res) => {
  const id = parseInt(req.params.id);
  const quote = await prisma.quoteRequest.findUnique({ where: { id } });
  if (!quote || !['PENDING', 'QUOTED'].includes(quote.status)) return res.status(400).json({ message: 'Bu teklif reddedilemez.' });
  await prisma.quoteRequest.update({ where: { id }, data: { status: 'REJECTED', adminNote: req.body.adminNote ?? quote.adminNote } });
  safeNotify(notifyCompany(quote.companyId, { type: 'ORDER', title: 'Teklif talebiniz yanıtlandı', message: `#TK-${id} için teklif verilemedi.${req.body.adminNote ? ` Not: ${req.body.adminNote}` : ''}`, link: '/bayi/quotes' }));
  res.json({ message: 'Teklif reddedildi.' });
};

export const cancelQuote = async (req, res) => {
  const id = parseInt(req.params.id);
  const updated = await prisma.quoteRequest.updateMany({
    where: { id, companyId: req.user.companyId, status: { in: ['PENDING', 'QUOTED'] } },
    data: { status: 'CANCELLED' }
  });
  if (updated.count === 0) return res.status(400).json({ message: 'Bu teklif iptal edilemez.' });
  res.json({ message: 'Teklif talebi iptal edildi.' });
};

// Bayi teklifi onaylar → teklif fiyatlarıyla sipariş oluşur (admin onayına düşer)
export const acceptQuote = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const paymentMethod = req.body.paymentMethod === 'WIRE_TRANSFER' ? 'WIRE_TRANSFER' : 'CURRENT_ACCOUNT';
    let quote = await prisma.quoteRequest.findUnique({ where: { id }, include });
    if (!quote || quote.companyId !== req.user.companyId) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    quote = await expireIfNeeded(quote);
    if (quote.status === 'EXPIRED') return res.status(400).json({ message: 'Teklifin geçerlilik süresi dolmuş. Yeniden teklif isteyebilirsiniz.' });
    if (quote.status !== 'QUOTED') return res.status(400).json({ message: 'Bu teklif onaylanamaz.' });

    const lines = quote.items.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: i.quotedPrice,
      vatRate: i.product.parent?.vatRate ?? i.product.vatRate,
      variantLabel: i.variantLabel
    }));
    const totals = computeTotals(lines, null);
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });

    if (paymentMethod === 'CURRENT_ACCOUNT') {
      const { available } = await availableCredit(prisma, company);
      if (totals.total > available) {
        return res.status(400).json({ message: `Risk limitiniz yetersiz. Kullanılabilir limit: ₺${Math.max(0, available).toLocaleString('tr-TR')}. Havale/EFT seçebilirsiniz.` });
      }
    }

    // Aynı teklif iki kez siparişe dönüşmesin
    const claimed = await prisma.quoteRequest.updateMany({ where: { id, status: 'QUOTED' }, data: { status: 'ACCEPTED' } });
    if (claimed.count === 0) return res.status(400).json({ message: 'Bu teklif zaten işleme alınmış.' });

    let order;
    try {
      const ship = await resolveShippingAddress(company, req.body.addressId);
      order = await createOrderRecord({ company, userId: req.user.id, paymentMethod, lines, totals, coupon: null, shippingAddress: ship.address });
    } catch (error) {
      await prisma.quoteRequest.update({ where: { id }, data: { status: 'QUOTED' } }); // Teklif tekrar onaylanabilsin
      throw error;
    }
    await prisma.quoteRequest.update({ where: { id }, data: { orderId: order.id } });

    safeNotify(notifyAdmins({ type: 'ORDER', title: 'Teklif onaylandı', message: `${company.name} #TK-${id} teklifini onayladı; #AK-${order.id} siparişi oluştu.`, link: '/admin/orders' }));
    res.status(201).json({ message: 'Teklif onaylandı, siparişiniz oluşturuldu.', orderId: order.id });
  } catch (error) {
    if (error instanceof OrderError) return res.status(400).json({ message: error.message });
    console.error('acceptQuote error:', error);
    res.status(400).json({ message: 'Teklif onaylanamadı.' });
  }
};
