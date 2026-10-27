import prisma from '../utils/prisma.js';
import { quoteCart, availableCredit, round2, computeTotals } from '../services/pricingService.js';
import { getSettingsMap, num } from '../services/settingsService.js';
import { notifyCompany, notifyAdmins, notifyRestocked, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';
import { autoInvoice, invoiceCreds } from '../services/invoiceService.js';
import { cargoCreds } from '../services/cargoService.js';
import { adjustStock, availableStock, defaultWarehouse } from '../services/stockService.js';
import { orderEvent, markShipped, markDelivered } from '../services/orderShippingService.js';
import { resolveShippingAddress } from './addressController.js';
import xlsx from 'xlsx';
import { currentTenantId } from '../utils/prisma.js';
import { postEntry, orderRate } from '../services/accountPosting.js';
import { getExchangeRates } from '../services/exchangeRateService.js';

// Webhook için siparişin özet hali

const PAYMENT_METHODS = ['CURRENT_ACCOUNT', 'WIRE_TRANSFER'];
const EDITABLE_STATUSES = ['PENDING', 'PARTIAL_APPROVED', 'APPROVED'];

const orderInclude = {
  user: { select: { name: true, email: true } },
  company: { select: { id: true, name: true, taxNumber: true, taxOffice: true, address: true, phone: true, externalCode: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true, images: true, isActive: true, parent: { select: { name: true, images: true } } } } } },
  returnRequests: { select: { id: true, orderItemId: true, quantity: true, status: true } },
  invoice: { select: { status: true, number: true, documentType: true, provider: true, issuedAt: true, errorMessage: true } }
};

export const getOrders = async (req, res) => {
  try {
    const where = orderWhere(req);

    // ?sort=oldest: en eski önce (bekleyenleri sırayla işlemek için) · ?sort=amount: tutara göre
    const orderBy = { oldest: { createdAt: 'asc' }, amount: { totalAmount: 'desc' } }[req.query.sort] || { createdAt: 'desc' };

    // ?page verilirse sayfalı yanıt { data, pagination } döner
    if (req.query.page) {
      const take = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const [data, total] = await Promise.all([
        prisma.order.findMany({ where, include: orderInclude, orderBy, take, skip: (page - 1) * take }),
        prisma.order.count({ where })
      ]);
      return res.json({ data, pagination: { total, page, pages: Math.max(1, Math.ceil(total / take)) } });
    }

    const orders = await prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: 'desc' }
    });

    res.json(orders);
  } catch (error) {
    console.error('getOrders Error:', error);
    res.status(500).json({ message: 'Siparişler getirilirken hata oluştu.' });
  }
};

// Durum sekmelerindeki sayılar: arama ve tarih filtresi uygulanır, durum filtresi uygulanmaz
export const orderStats = async (req, res) => {
  const { status, ...rest } = req.query; // eslint-disable-line no-unused-vars
  const where = orderWhere({ ...req, query: rest });
  const [groups, pendingAgg, oldestPending] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.order.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { totalAmount: true } }),
    prisma.order.findFirst({ where: { ...where, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
  ]);
  const counts = Object.fromEntries(groups.map(g => [g.status, g._count._all]));
  res.json({
    counts,
    total: groups.reduce((sum, g) => sum + g._count._all, 0),
    pendingAmount: pendingAgg._sum.totalAmount || 0,
    oldestPendingAt: oldestPending?.createdAt || null,
    // Sipariş ekranındaki "Yurtiçi gönderisi oluştur" / "Paraşüt ile kes" butonları için
    cargoEnabled: Boolean(cargoCreds(req.tenant)),
    invoiceEnabled: Boolean(invoiceCreds(req.tenant))
  });
};

// Bayi sadece kendi siparişlerini görür. ?status ?q (sipariş no / bayi adı) ?from ?to
const orderWhere = (req) => {
  const { status, q, from, to } = req.query;
  const term = String(q || '').trim();
  const orderNo = parseInt(term.replace(/^#?AK-?/i, ''));
  return {
    ...(req.user.role === 'BAYI' && { companyId: req.user.companyId }),
    ...(status && { status }),
    ...((from || to) && { createdAt: { ...(from && { gte: new Date(`${from}T00:00:00`) }), ...(to && { lte: new Date(`${to}T23:59:59.999`) }) } }),
    ...(term && {
      OR: [
        ...(Number.isInteger(orderNo) ? [{ id: orderNo }] : []),
        { company: { name: { contains: term, mode: 'insensitive' } } }
      ]
    })
  };
};

const STATUS_TR = { PENDING: 'Onay Bekliyor', APPROVED: 'Onaylandı', PARTIAL_APPROVED: 'Kısmen Onaylandı', SHIPPED: 'Kargoda', COMPLETED: 'Teslim Edildi', CANCELLED: 'İptal' };

// Excel: her satır bir sipariş kalemi
export const exportOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({ where: orderWhere(req), include: { ...orderInclude, company: true }, orderBy: { createdAt: 'desc' }, take: 5000 });
    const rows = orders.flatMap(o => o.items.map(i => ({
      'Sipariş No': `AK-${o.id}`,
      'Tarih': o.createdAt.toLocaleString('tr-TR'),
      'Bayi': o.company.name,
      'Cari Kodu': o.company.externalCode || '',
      'Durum': STATUS_TR[o.status] || o.status,
      'SKU': i.product.sku,
      'Ürün': i.product.parent?.name || i.product.name,
      'Varyant': i.variantLabel || '',
      'Miktar': i.quantity,
      'Birim Fiyat (KDV hariç)': i.price,
      'KDV %': i.vatRate,
      'Kalem Tutarı (KDV hariç)': Math.round(i.price * i.quantity * 100) / 100,
      'Kalem Durumu': i.status === 'CANCELLED' ? 'İptal' : 'Onaylı',
      'Kupon': o.couponCode || '',
      'Sipariş Toplamı (KDV dahil)': o.totalAmount,
      'Ödeme': o.paymentMethod === 'WIRE_TRANSFER' ? 'Havale/EFT' : 'Cari',
      'Kargo': o.cargoCompany || '',
      'Takip No': o.trackingNumber || ''
    })));
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows), 'Siparişler');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="siparisler-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  } catch (error) {
    console.error('exportOrders error:', error);
    res.status(500).json({ message: 'Excel oluşturulamadı.' });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(req.params.id) },
      include: orderInclude
    });

    if (!order || (req.user.role === 'BAYI' && order.companyId !== req.user.companyId)) {
      return res.status(404).json({ message: 'Sipariş bulunamadı.' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Sipariş getirilemedi.' });
  }
};

const loadDealerCompany = async (req) => {
  if (req.user.role !== 'BAYI' || !req.user.companyId) return null;
  return prisma.company.findUnique({ where: { id: req.user.companyId } });
};

// Sepet önizleme: bayi fiyatları, miktar indirimi, KDV ve kural ihlalleri
export const quoteOrder = async (req, res) => {
  try {
    const company = await loadDealerCompany(req);
    if (!company) return res.status(403).json({ message: 'Sadece bayi hesapları sipariş verebilir.' });

    const { couponRecord, ...quote } = await quoteCart(prisma, company, req.body.items, { couponCode: req.body.couponCode });
    const credit = await availableCredit(prisma, company);
    // Sepet TL olduğu için kullanılabilir limit TL karşılığıyla verilir; dövizli caride hesap tutarları ayrıca
    res.json({ ...quote, credit: { ...credit, available: credit.availableTRY, availableAccount: credit.available, riskLimit: company.riskLimit, balance: company.currentBalance } });
  } catch (error) {
    console.error('Quote error:', error);
    res.status(500).json({ message: 'Sepet hesaplanamadı.' });
  }
};

export class OrderError extends Error {}

/**
 * Siparişi kalemleriyle birlikte oluşturur; kupon varsa kullanım sayısını eşzamanlılığa dayanıklı şekilde artırır.
 * lines: [{ productId, quantity, unitPrice, vatRate, variantLabel }] · totals: computeTotals çıktısı
 */
export const createOrderRecord = async ({ company, userId, paymentMethod, lines, totals, coupon, shippingAddress, fxRates }) => {
  // Dövizli cariye borç yazılırken kullanılacak kurlar (fiyatlamada kullanılanlar; verilmezse güncel)
  const rates = fxRates || (await getExchangeRates()).rates || {};
  return prisma.$transaction(async (tx) => {
    if (coupon) {
      const claimed = await tx.coupon.updateMany({
        where: { id: coupon.id, isActive: true, ...(coupon.maxUses !== null && { usedCount: { lt: coupon.maxUses } }) },
        data: { usedCount: { increment: 1 } }
      });
      if (claimed.count === 0) throw new OrderError('Bu kuponun kullanım sınırı dolmuş.');
    }

    const order = await tx.order.create({
      data: {
        userId,
        companyId: company.id,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount || 0,
        vatAmount: totals.vatAmount,
        totalAmount: totals.total,
        paymentMethod,
        fxRates: rates,
        shippingAddress: shippingAddress || undefined,
        status: 'PENDING',
        ...(coupon && { couponCode: coupon.code, couponType: coupon.type, couponValue: coupon.value })
      }
    });

    await tx.orderItem.createMany({
      data: lines.map(l => ({
        orderId: order.id,
        productId: l.productId,
        quantity: l.quantity,
        price: l.unitPrice,
        vatRate: l.vatRate,
        variantLabel: l.variantLabel || null,
        status: 'APPROVED'
      }))
    });

    return order;
  }).then((order) => {
    emitEvent(currentTenantId(), 'order.created', orderEvent(order));
    return order;
  });
};

export const createOrder = async (req, res) => {
  try {
    const { items, paymentMethod } = req.body;
    const company = await loadDealerCompany(req);
    if (!company) return res.status(403).json({ message: 'Sadece bayi hesapları sipariş verebilir.' });

    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Geçersiz ödeme yöntemi.' });
    }

    const quote = await quoteCart(prisma, company, items, { couponCode: req.body.couponCode });
    if (quote.errors.length > 0) {
      return res.status(400).json({ message: quote.errors.join(' '), errors: quote.errors });
    }

    if (paymentMethod === 'CURRENT_ACCOUNT') {
      const { availableTRY: available } = await availableCredit(prisma, company);
      if (available === null) return res.status(400).json({ message: 'Cari hesabınızın döviz kuru şu an alınamıyor; lütfen biraz sonra tekrar deneyin veya Havale/EFT seçin.' });
      if (quote.total > available) {
        return res.status(400).json({
          message: `Risk limitiniz bu sipariş için yetersiz. Kullanılabilir limit: ₺${Math.max(0, available).toLocaleString('tr-TR')}. Ödeme yaparak limitinizi açabilir veya Havale/EFT seçebilirsiniz.`
        });
      }
    }

    const ship = await resolveShippingAddress(company, req.body.addressId);
    if (ship.error) return res.status(400).json({ message: ship.error });

    const order = await createOrderRecord({
      company,
      userId: req.user.id,
      paymentMethod,
      lines: quote.lines,
      totals: quote,
      coupon: quote.couponRecord,
      shippingAddress: ship.address,
      fxRates: quote.rates
    });

    safeNotify(notifyAdmins({
      type: 'ORDER',
      title: 'Yeni sipariş',
      message: `${company.name} ₺${quote.total.toLocaleString('tr-TR')} tutarında sipariş verdi (#AK-${order.id}).`,
      link: '/admin/orders'
    }));

    res.status(201).json(order);
  } catch (error) {
    if (error instanceof OrderError) return res.status(400).json({ message: error.message });
    console.error('Order creation error:', error);
    res.status(400).json({ message: 'Sipariş oluşturulamadı.' });
  }
};

class ApprovalError extends Error {}

/**
 * Parçalı onay: kalem bazında onay/iptal. Onaylanan kalemlerin stoğu düşer,
 * sipariş tutarı yeniden hesaplanır ve fark bayinin cari hesabına borç/alacak olarak yazılır.
 */
export const partialApproveOrder = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { itemStatuses } = req.body; // [{ itemId: 1, status: 'APPROVED' | 'CANCELLED' }]

    if (!Array.isArray(itemStatuses) || itemStatuses.some(i => !['APPROVED', 'CANCELLED'].includes(i.status))) {
      return res.status(400).json({ message: 'Geçersiz kalem durumları.' });
    }

    const settings = await getSettingsMap();
    const restockedIds = [];

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } }, company: true }
      });

      if (!order) throw new ApprovalError('Sipariş bulunamadı.');
      if (!EDITABLE_STATUSES.includes(order.status)) {
        throw new ApprovalError('Kargoya verilmiş, tamamlanmış veya iptal edilmiş siparişler değiştirilemez.');
      }

      const statusById = new Map(itemStatuses.map(i => [parseInt(i.itemId), i.status]));

      // Siparişi karşılayacak depo: istekte seçilen, siparişte kayıtlı ya da varsayılan depo
      if (req.body.warehouseId && req.body.warehouseId !== order.warehouseId) {
        const w = await tx.warehouse.findUnique({ where: { id: parseInt(req.body.warehouseId) } });
        if (!w) throw new ApprovalError('Depo bulunamadı.');
        await tx.order.update({ where: { id: order.id }, data: { warehouseId: w.id } });
        order.warehouseId = w.id;
      }
      const warehouseId = order.warehouseId || (await defaultWarehouse(tx))?.id || null;

      // 1. Stok yeterliliği kontrolü (depo varsa o depodaki miktar)
      const shortages = [];
      for (const it of order.items) {
        if (statusById.get(it.id) !== 'APPROVED' || it.isStockDeducted) continue;
        const available = await availableStock(tx, it.product, warehouseId);
        if (available < it.quantity) shortages.push(`${it.product.name} (stok: ${available}, istenen: ${it.quantity})`);
      }
      if (shortages.length) {
        throw new ApprovalError(`Yetersiz stok: ${shortages.join(', ')}. Bu kalemleri iptal edin veya stok girin.`);
      }

      // 2. Kalemleri güncelle, stokları işle
      for (const item of order.items) {
        const status = statusById.get(item.id);
        if (!status) continue;

        if (status === 'APPROVED' && !item.isStockDeducted) {
          const usedWarehouse = await adjustStock(tx, item.productId, -item.quantity, warehouseId);
          await tx.orderItem.update({ where: { id: item.id }, data: { status, isStockDeducted: true, stockWarehouseId: usedWarehouse } });
        } else if (status === 'CANCELLED' && item.isStockDeducted) {
          await adjustStock(tx, item.productId, item.quantity, item.stockWarehouseId);
          await tx.orderItem.update({ where: { id: item.id }, data: { status, isStockDeducted: false, stockWarehouseId: null } });
          restockedIds.push(item.productId);
        } else {
          await tx.orderItem.update({ where: { id: item.id }, data: { status } });
        }
      }

      // 3. Tutarları yeniden hesapla (sadece onaylanan kalemler)
      const approved = await tx.orderItem.findMany({ where: { orderId, status: 'APPROVED' } });
      // Kupon indirimi kalan kalemlere göre aynı kuralla yeniden hesaplanır (tutar kuponu kalan tutarı aşamaz)
      const coupon = order.couponType ? { type: order.couponType, value: order.couponValue } : null;
      const { subtotal, discountAmount, vatAmount, total: totalAmount } = computeTotals(approved, coupon);

      const anyCancelled = order.items.some(it => (statusById.get(it.id) || it.status) === 'CANCELLED');
      const newStatus = approved.length === 0 ? 'CANCELLED' : anyCancelled ? 'PARTIAL_APPROVED' : 'APPROVED';

      // 4. Cari entegrasyon: daha önce borç yazılan tutarla (TL) fark kadar işlem yapılır.
      // Dövizli cariye siparişin oluştuğu andaki kurla çevrilerek yazılır.
      const diff = round2(totalAmount - order.debitedAmount);
      if (diff !== 0) {
        await postEntry(tx, {
          company: order.company,
          type: diff > 0 ? 'DEBT' : 'CREDIT',
          amountTRY: Math.abs(diff),
          rate: await orderRate(order, order.company.currency),
          orderId,
          source: 'ORDER',
          description: diff > 0
            ? `#AK-${orderId} sipariş onayı`
            : `#AK-${orderId} sipariş kalem iptali / düzeltme`
        });
      }

      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          subtotal,
          discountAmount,
          vatAmount,
          totalAmount,
          debitedAmount: totalAmount,
          status: newStatus,
          approvedAt: order.approvedAt || (newStatus !== 'CANCELLED' ? now : null),
          dueDate: newStatus === 'CANCELLED'
            ? null
            : order.dueDate || new Date(now.getTime() + order.company.paymentTermDays * 24 * 60 * 60 * 1000)
        }
      });

      // 5. Plasiyer primi (KDV hariç tutar üzerinden)
      if (order.company.plasiyerId && newStatus !== 'CANCELLED') {
        const points = round2((subtotal - discountAmount) * num(settings.plasiyer_rate, 5) / 100);
        await tx.plasiyerPoint.upsert({
          where: { orderId },
          update: { points, userId: order.company.plasiyerId },
          create: { orderId, userId: order.company.plasiyerId, points }
        });
      } else {
        await tx.plasiyerPoint.deleteMany({ where: { orderId } });
      }

      return { updatedOrder, companyId: order.companyId };
    });

    const { updatedOrder, companyId } = result;
    const statusText = { APPROVED: 'onaylandı', PARTIAL_APPROVED: 'kısmen onaylandı', CANCELLED: 'iptal edildi' }[updatedOrder.status];
    safeNotify(notifyCompany(companyId, {
      type: 'ORDER',
      title: `Siparişiniz ${statusText}`,
      message: `#AK-${orderId} numaralı siparişiniz ${statusText}. Güncel tutar: ₺${updatedOrder.totalAmount.toLocaleString('tr-TR')}.`,
      link: `/bayi/orders/${orderId}`
    }));
    safeNotify(notifyRestocked(restockedIds));
    emitEvent(req.tenant.id, 'order.updated', orderEvent(updatedOrder));
    if (['APPROVED', 'PARTIAL_APPROVED'].includes(updatedOrder.status)) autoInvoice(req.tenant, updatedOrder.id, 'APPROVED');

    res.json({ message: 'Sipariş güncellendi, stok ve cari hesap işlendi.', updatedOrder });
  } catch (error) {
    if (error instanceof ApprovalError) return res.status(400).json({ message: error.message });
    console.error(error);
    res.status(400).json({ message: 'Onay işlemi sırasında hata oluştu.' });
  }
};

export const shipOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const trackingNumber = (req.body.trackingNumber || '').trim();
    const cargoCompany = (req.body.cargoCompany || '').trim().toUpperCase();

    if (!trackingNumber) return res.status(400).json({ message: 'Kargo takip numarası zorunludur.' });

    const existing = await prisma.order.findUnique({ where: { id: parseInt(id) } });
    if (!existing) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
    if (!['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED'].includes(existing.status)) {
      return res.status(400).json({ message: 'Sadece onaylanmış siparişler kargoya verilebilir.' });
    }

    const order = await markShipped(req.tenant, existing, { trackingNumber, cargoCompany });
    res.json({ message: 'Sipariş kargoya verildi.', order });
  } catch (error) {
    res.status(400).json({ message: 'Kargo bilgisi güncellenemedi.' });
  }
};

export const completeOrder = async (req, res) => {
  try {
    const existing = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!existing) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
    if (existing.status !== 'SHIPPED') {
      return res.status(400).json({ message: 'Sadece kargodaki siparişler teslim edildi olarak işaretlenebilir.' });
    }

    const order = await markDelivered(req.tenant, existing);
    res.json({ message: 'Sipariş tamamlandı.', order });
  } catch (error) {
    res.status(400).json({ message: 'Sipariş güncellenemedi.' });
  }
};
