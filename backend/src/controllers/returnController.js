import { adjustStock } from '../services/stockService.js';
import prisma from '../utils/prisma.js';
import { round2 } from '../services/pricingService.js';
import { notifyAdmins, notifyCompany, notifyRestocked, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';

const RETURNABLE_ORDER_STATUSES = ['SHIPPED', 'COMPLETED'];

const include = {
  company: { select: { id: true, name: true } },
  user: { select: { name: true, email: true } },
  product: { select: { id: true, name: true, sku: true, images: true } },
  orderItem: { select: { id: true, quantity: true, price: true, vatRate: true } }
};

export const getReturns = async (req, res) => {
  try {
    const { status } = req.query;
    const returns = await prisma.returnRequest.findMany({
      where: {
        ...(req.user.role === 'BAYI' && { companyId: req.user.companyId }),
        ...(status && { status })
      },
      include,
      orderBy: { createdAt: 'desc' }
    });
    res.json(returns.map(r => ({ ...r, photos: JSON.parse(r.photos || '[]') })));
  } catch (error) {
    res.status(500).json({ message: 'İade talepleri getirilemedi.' });
  }
};

export const createReturn = async (req, res) => {
  try {
    const { orderItemId, quantity, type, reason, photos } = req.body;
    const qty = parseInt(quantity);

    if (!['RETURN', 'EXCHANGE'].includes(type)) return res.status(400).json({ message: 'Talep tipi İade veya Değişim olmalıdır.' });
    if (!reason || reason.trim().length < 10) return res.status(400).json({ message: 'Lütfen iade nedenini en az 10 karakterle açıklayın.' });
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ message: 'Geçersiz miktar.' });

    const item = await prisma.orderItem.findUnique({
      where: { id: parseInt(orderItemId) },
      include: { order: true, product: { select: { name: true, sku: true } } }
    });

    if (!item || item.order.companyId !== req.user.companyId) {
      return res.status(404).json({ message: 'Sipariş kalemi bulunamadı.' });
    }
    if (item.status !== 'APPROVED' || !RETURNABLE_ORDER_STATUSES.includes(item.order.status)) {
      return res.status(400).json({ message: 'Sadece kargoya verilmiş veya teslim edilmiş siparişler için iade talebi oluşturulabilir.' });
    }

    const alreadyRequested = await prisma.returnRequest.aggregate({
      where: { orderItemId: item.id, status: { not: 'REJECTED' } },
      _sum: { quantity: true }
    });
    const remaining = item.quantity - (alreadyRequested._sum.quantity || 0);
    if (qty > remaining) {
      return res.status(400).json({ message: `Bu kalem için en fazla ${remaining} adet iade talebi oluşturabilirsiniz.` });
    }

    const photoList = Array.isArray(photos) ? photos.filter(p => typeof p === 'string').slice(0, 6) : [];

    const request = await prisma.returnRequest.create({
      data: {
        companyId: req.user.companyId,
        userId: req.user.id,
        orderId: item.orderId,
        orderItemId: item.id,
        productId: item.productId,
        quantity: qty,
        type,
        reason: reason.trim(),
        photos: JSON.stringify(photoList)
      }
    });

    safeNotify(notifyAdmins({
      type: 'RETURN',
      title: type === 'RETURN' ? 'Yeni iade talebi' : 'Yeni değişim talebi',
      message: `#AK-${item.orderId} · ${item.product.name} · ${qty} adet`,
      link: '/admin/returns'
    }));

    emitEvent(req.tenant.id, 'return.created', { id: request.id, orderId: item.orderId, sku: item.product?.sku, quantity: qty, type });
    res.status(201).json({ message: 'Talebiniz alındı. Sonuç size bildirim olarak iletilecek.', request });
  } catch (error) {
    console.error('createReturn error:', error);
    res.status(400).json({ message: 'İade talebi oluşturulamadı.' });
  }
};

/**
 * Admin kararı. İade onaylanırsa kalem tutarı (KDV dahil) bayinin cari hesabına alacak yazılır.
 * restock=true ise ürün stoğa geri eklenir.
 */
export const updateReturn = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, adminNote, restock } = req.body;

    if (!['APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ message: 'Geçersiz durum.' });
    }

    const existing = await prisma.returnRequest.findUnique({ where: { id }, include: { orderItem: true, product: true } });
    if (!existing) return res.status(404).json({ message: 'Talep bulunamadı.' });
    if (existing.status === 'REJECTED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ message: 'Sonuçlanmış talepler değiştirilemez.' });
    }
    if (existing.status === 'APPROVED' && status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Onaylanan talep sadece tamamlandı olarak işaretlenebilir.' });
    }

    const firstApproval = existing.status === 'PENDING' && status === 'APPROVED';

    const updated = await prisma.$transaction(async (tx) => {
      if (firstApproval && existing.type === 'RETURN') {
        const amount = round2(existing.orderItem.price * existing.quantity * (1 + existing.orderItem.vatRate / 100));
        await tx.financialTransaction.create({
          data: {
            companyId: existing.companyId,
            orderId: existing.orderId,
            source: 'RETURN',
            type: 'CREDIT',
            amount,
            description: `İade #RMA-${id} · ${existing.product.name} × ${existing.quantity}`
          }
        });
        await tx.company.update({ where: { id: existing.companyId }, data: { currentBalance: { increment: amount } } });
      }
      if (firstApproval && (restock === true || restock === 'true')) {
        await adjustStock(tx, existing.productId, existing.quantity, existing.orderItem?.stockWarehouseId);
      }
      return tx.returnRequest.update({ where: { id }, data: { status, adminNote: adminNote ?? existing.adminNote } });
    });

    if (firstApproval && (restock === true || restock === 'true')) safeNotify(notifyRestocked([existing.productId]));

    const statusText = { APPROVED: 'onaylandı', REJECTED: 'reddedildi', COMPLETED: 'tamamlandı' }[status];
    safeNotify(notifyCompany(existing.companyId, {
      type: 'RETURN',
      title: `#RMA-${id} talebiniz ${statusText}`,
      message: `${existing.product.name} için ${existing.type === 'RETURN' ? 'iade' : 'değişim'} talebiniz ${statusText}.${adminNote ? ` Not: ${adminNote}` : ''}`,
      link: '/bayi/returns'
    }));

    res.json({ message: `Talep ${statusText}.`, request: updated });
  } catch (error) {
    console.error('updateReturn error:', error);
    res.status(400).json({ message: 'Talep güncellenemedi.' });
  }
};
