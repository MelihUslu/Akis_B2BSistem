import prisma from '../utils/prisma.js';
import { quoteCart } from '../services/pricingService.js';
import { notifyUser, safeNotify } from '../services/notificationService.js';
import { placeDealerOrder, OrderError } from './orderController.js';

/**
 * Bayi içinde sipariş onayı (Siparişlerim → Onay talepleri).
 * Ana kullanıcı firmasının bütün taleplerini görür, onaylar ya da reddeder; diğer kullanıcılar kendi taleplerini görür
 * ve bekleyeni geri çeker. Onayda sipariş, talebi açan kullanıcı adına o anki fiyat, stok ve limitle oluşur.
 */
const PENDING_PREVIEW = 30; // güncel tutarı hesaplanan bekleyen talep sayısı

const linesOf = async (requests) => {
  const ids = [...new Set(requests.flatMap((r) => (r.payload.items || []).map((i) => parseInt(i.productId))).filter(Boolean))];
  const products = new Map((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true, unit: true } })).map((p) => [p.id, p]));
  return (r) => (r.payload.items || []).map((i) => {
    const p = products.get(parseInt(i.productId));
    return { productId: parseInt(i.productId), quantity: parseInt(i.quantity), name: p?.name || 'Silinmiş ürün', sku: p?.sku || null, unit: p?.unit || 'adet' };
  });
};

export const listOrderRequests = async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
  // Onay sırasında sunucu kapandıysa "işleniyor"da kalan talep yeniden beklemeye döner
  await prisma.orderRequest.updateMany({ where: { companyId: company.id, status: 'APPROVING', updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } }, data: { status: 'PENDING' } });
  const requests = await prisma.orderRequest.findMany({
    where: { companyId: company.id, ...(!req.user.isOwner && { userId: req.user.id }) },
    include: { user: { select: { id: true, name: true } }, decidedBy: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }],
    take: 100
  });
  const lines = await linesOf(requests);
  let previewed = 0;
  const out = [];
  for (const r of requests) {
    // Bekleyen talepte güncel tutar ve sepet kuralları (fiyat / stok değişmiş olabilir)
    let current = null;
    if (r.status === 'PENDING' && previewed++ < PENDING_PREVIEW) {
      const q = await quoteCart(prisma, company, r.payload.items, { couponCode: r.payload.couponCode, delivery: r.payload.deliveryMethod });
      current = { total: q.total, errors: q.errors };
    }
    out.push({
      id: r.id, status: r.status, total: r.total, itemCount: r.itemCount, createdAt: r.createdAt, decidedAt: r.decidedAt, reason: r.reason,
      orderId: r.orderId, user: r.user, decidedBy: r.decidedBy?.name || null, mine: r.userId === req.user.id,
      paymentMethod: r.payload.paymentMethod, deliveryMethod: r.payload.deliveryMethod, note: r.payload.note || null,
      lines: lines(r), current
    });
  }
  res.json({ isOwner: Boolean(req.user.isOwner), requests: out, pending: out.filter((r) => r.status === 'PENDING').length });
};

const ownerOnly = (req, res) => {
  if (req.user.isOwner) return true;
  res.status(403).json({ message: 'Siparişleri firmanızın ana kullanıcısı onaylar.' });
  return false;
};
const findPending = (req) => prisma.orderRequest.findFirst({ where: { id: parseInt(req.params.id) || 0, companyId: req.user.companyId, status: 'PENDING' } });

export const approveOrderRequest = async (req, res) => {
  if (!ownerOnly(req, res)) return;
  const request = await findPending(req);
  if (!request) return res.status(404).json({ message: 'Bekleyen talep bulunamadı.' });
  // Aynı talep iki kez onaylanmasın: önce talep alınır, sipariş olmazsa geri bırakılır
  const claimed = await prisma.orderRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: 'APPROVING' } });
  if (claimed.count !== 1) return res.status(409).json({ message: 'Bu talep şu an işleniyor ya da karara bağlandı.' });
  try {
    const company = await prisma.company.findUnique({ where: { id: request.companyId } });
    const order = await placeDealerOrder({ tenant: req.tenant, company, user: { id: request.userId }, body: request.payload, channel: 'PORTAL' });
    await prisma.orderRequest.update({ where: { id: request.id }, data: { status: 'APPROVED', orderId: order.id, decidedById: req.user.id, decidedAt: new Date() } });
    safeNotify(notifyUser(request.userId, {
      type: 'ORDER', title: 'Siparişiniz onaylandı',
      message: `Talebiniz onaylandı ve #AK-${order.id} numaralı sipariş olarak firmaya iletildi.`, link: `/bayi/orders/${order.id}`
    }));
    res.json({ message: `Onaylandı; #AK-${order.id} numaralı sipariş firmaya iletildi.`, orderId: order.id });
  } catch (error) {
    await prisma.orderRequest.updateMany({ where: { id: request.id, status: 'APPROVING' }, data: { status: 'PENDING' } });
    if (error instanceof OrderError) return res.status(400).json({ message: `Sipariş oluşturulamadı: ${error.message}`, ...(error.errors && { errors: error.errors }) });
    console.error('approveOrderRequest error:', error);
    res.status(500).json({ message: 'Talep onaylanamadı.' });
  }
};

export const rejectOrderRequest = async (req, res) => {
  if (!ownerOnly(req, res)) return;
  const request = await findPending(req);
  if (!request) return res.status(404).json({ message: 'Bekleyen talep bulunamadı.' });
  const reason = String(req.body.reason || '').trim().slice(0, 300) || null;
  const done = await prisma.orderRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: 'REJECTED', reason, decidedById: req.user.id, decidedAt: new Date() } });
  if (done.count !== 1) return res.status(409).json({ message: 'Bu talep karara bağlanmış.' });
  safeNotify(notifyUser(request.userId, {
    type: 'ORDER', title: 'Sipariş talebiniz reddedildi',
    message: reason ? `Neden: ${reason}` : 'Ayrıntı için firmanızın ana kullanıcısıyla görüşün.', link: '/bayi/orders?tab=requests'
  }));
  res.json({ message: 'Talep reddedildi.' });
};

// Talebi açan kullanıcı bekleyen talebini geri çeker
export const cancelOrderRequest = async (req, res) => {
  const request = await findPending(req);
  if (!request || request.userId !== req.user.id) return res.status(404).json({ message: 'Bekleyen talep bulunamadı.' });
  const done = await prisma.orderRequest.updateMany({ where: { id: request.id, status: 'PENDING' }, data: { status: 'CANCELLED', decidedAt: new Date() } });
  if (done.count !== 1) return res.status(409).json({ message: 'Bu talep karara bağlanmış.' });
  res.json({ message: 'Talep geri çekildi.' });
};
