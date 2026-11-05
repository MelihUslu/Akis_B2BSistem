import prisma from '../utils/prisma.js';
import { quoteCart, availableCredit, round2, computeTotals, withShipping } from '../services/pricingService.js';
import { getSettingsMap, num, flag, portalSettings } from '../services/settingsService.js';
import { reservedQuantities } from '../services/catalogAccess.js';
import { notifyCompany, notifyAdmins, notifyRestocked, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';
import { autoInvoice, invoiceCreds } from '../services/invoiceService.js';
import { cargoCreds } from '../services/cargoService.js';
import { adjustStock, availableStock, defaultWarehouse, StockError } from '../services/stockService.js';
import { orderEvent, markShipped, markDelivered, markReadyForPickup } from '../services/orderShippingService.js';
import { resolveShippingAddress } from './addressController.js';
import { workbookBuffer } from '../utils/xlsxStream.js';
import { currentTenantId } from '../utils/prisma.js';
import { postEntry, orderRate } from '../services/accountPosting.js';
import { getExchangeRates } from '../services/exchangeRateService.js';
import { localDay } from '../utils/dates.js';

// Webhook için siparişin özet hali

const PAYMENT_METHODS = ['CURRENT_ACCOUNT', 'WIRE_TRANSFER'];
const EDITABLE_STATUSES = ['PENDING', 'PARTIAL_APPROVED', 'APPROVED'];

const orderInclude = {
  user: { select: { name: true, email: true } },
  company: { select: { id: true, name: true, taxNumber: true, taxOffice: true, address: true, phone: true, externalCode: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: true, images: true, isActive: true, parent: { select: { name: true, images: true } } } } } },
  returnRequests: { select: { id: true, orderItemId: true, quantity: true, status: true } },
  invoice: { select: { status: true, number: true, documentType: true, provider: true, issuedAt: true, errorMessage: true } },
  shipments: { orderBy: { createdAt: 'asc' } }
};

// Siparişi kimin girdiği: bayi kendisi, yönetici ya da plasiyer bayi adına
export const CHANNEL_TR = { PORTAL: 'Bayi', STAFF: 'Yönetici (bayi adına)', PLASIYER: 'Plasiyer (bayi adına)', QUOTE: 'Tekliften' };
const channelOf = (req) => (req.user.actingAs ? (req.user.actingAs.role === 'PLASIYER' ? 'PLASIYER' : 'STAFF') : 'PORTAL');
const cleanText = (v, max) => String(v ?? '').trim().slice(0, max) || null;

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

const STATUS_TR = { PENDING: 'Onay Bekliyor', APPROVED: 'Onaylandı', PARTIAL_APPROVED: 'Kısmen Onaylandı', SHIPPED: 'Kargoda', READY_FOR_PICKUP: 'Teslim Almaya Hazır', COMPLETED: 'Teslim Edildi', CANCELLED: 'İptal' };

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
      'Teslimat': o.deliveryMethod === 'PICKUP' ? 'Gel-Al' : 'Kargo',
      'Teslim Alma Zamanı': o.pickupAt ? o.pickupAt.toLocaleString('tr-TR') : '',
      'Kargo Ücreti (KDV hariç)': o.shippingFee || 0,
      'Kargo': o.cargoCompany || '',
      'Takip No': o.trackingNumber || '',
      'İrsaliye No': o.despatchNumber || '',
      'Bayi Referans No': o.customerRef || '',
      'Sipariş Notu': o.note || '',
      'Giren': CHANNEL_TR[o.channel] || o.channel
    })));
    const buffer = await workbookBuffer([{ name: 'Siparişler', rows }]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="siparisler-${localDay()}.xlsx"`);
    res.send(buffer);
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

    const delivery = req.body.deliveryMethod === 'PICKUP' ? 'PICKUP' : 'SHIPPING';
    const { couponRecord, ...quote } = await quoteCart(prisma, company, req.body.items, { couponCode: req.body.couponCode, delivery });
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
export const createOrderRecord = async ({ company, userId, paymentMethod, lines, totals, coupon, shippingAddress, fxRates, pickupAt, note = null, customerRef = null, channel = 'PORTAL', checkStock = false }) => {
  // Dövizli cariye borç yazılırken kullanılacak kurlar (fiyatlamada kullanılanlar; verilmezse güncel)
  const rates = fxRates || (await getExchangeRates()).rates || {};
  return prisma.$transaction(async (tx) => {
    if (checkStock) {
      // Ürün satırları id sırasıyla kilitlenir: aynı anda gelen iki sipariş son ürünleri ikisi birden ayıramaz
      const ids = [...new Set(lines.map((l) => l.productId))].sort((a, b) => a - b);
      await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${ids}::int[]) AND "tenantId" = ${currentTenantId()} ORDER BY id FOR UPDATE`;
      const [stocks, reserved] = await Promise.all([
        tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, stock: true } }),
        reservedQuantities(tx, ids)
      ]);
      const wanted = new Map();
      for (const l of lines) wanted.set(l.productId, (wanted.get(l.productId) || 0) + l.quantity);
      for (const p of stocks) {
        const available = Math.max(0, p.stock - (reserved.get(p.id) || 0));
        if (wanted.get(p.id) > available) {
          const line = lines.find((l) => l.productId === p.id);
          throw new OrderError(`${line?.name || 'Ürün'}: stokta ${available} ${line?.unit || 'adet'} kaldı (siz sipariş verirken başka bir sipariş ayırdı). Miktarı güncelleyin.`);
        }
      }
    }
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
        shippingFee: totals.shippingFee || 0,
        shippingVat: totals.shippingVat || 0,
        note,
        customerRef,
        channel,
        paymentMethod,
        fxRates: rates,
        shippingAddress: shippingAddress || undefined,
        ...(pickupAt && { deliveryMethod: 'PICKUP', pickupAt }),
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
  }, { maxWait: 10000, timeout: 30000 }).then((order) => { // yoğun yükte stok satırı kilidi beklenirken varsayılan 5 sn yetmiyordu (kampanya testi)
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

    const delivery = req.body.deliveryMethod === 'PICKUP' ? 'PICKUP' : 'SHIPPING';
    const quote = await quoteCart(prisma, company, items, { couponCode: req.body.couponCode, delivery });
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

    // Gel-Al: teslimat adresi yerine bayinin seçtiği teslim alma zamanı (kargo ücreti yok; stok ve ödeme kuralları aynı)
    let ship = { address: null };
    let pickupAt = null;
    const settings = await getSettingsMap();
    if (delivery === 'PICKUP') {
      const check = pickupTimeError(req.body.pickupAt, portalSettings(settings, req.tenant).pickup);
      if (check.error) return res.status(400).json({ message: check.error });
      pickupAt = check.at;
    } else {
      ship = await resolveShippingAddress(company, req.body.addressId);
      if (ship.error) return res.status(400).json({ message: ship.error });
    }

    const order = await createOrderRecord({
      company,
      userId: req.user.id,
      paymentMethod,
      lines: quote.lines,
      totals: quote,
      coupon: quote.couponRecord,
      shippingAddress: ship.address,
      fxRates: quote.rates,
      pickupAt,
      note: cleanText(req.body.note, 500),
      customerRef: cleanText(req.body.customerRef, 60),
      channel: channelOf(req),
      checkStock: true
    });

    // Otomatik onay (ayarlıysa): cari hesaplı, üst sınırın altındaki siparişler. Onaylanamazsa (ör. stok) onay bekler.
    let approved = null;
    const max = num(settings.auto_approve_max, 0);
    if (flag(settings.auto_approve) && paymentMethod === 'CURRENT_ACCOUNT' && (max <= 0 || quote.total <= max)) {
      approved = await decideOrder(req.tenant, order.id, null, { auto: true })
        .then((r) => r.updatedOrder)
        .catch((e) => { if (!(e instanceof ApprovalError)) console.error('Otomatik onay hatası:', e); return null; });
    }

    const acting = req.user.actingAs;
    const by = acting ? `${acting.name} (${acting.role === 'PLASIYER' ? 'plasiyer' : 'yönetici'}), ${company.name} adına` : company.name;
    safeNotify(notifyAdmins({
      type: 'ORDER',
      title: approved ? 'Yeni sipariş (otomatik onaylandı)' : 'Yeni sipariş',
      message: `${by} ₺${quote.total.toLocaleString('tr-TR')} tutarında sipariş verdi (#AK-${order.id})${pickupAt ? `; Gel-Al, teslim alma: ${pickupAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}` : ''}.`,
      link: '/admin/orders'
    }));
    if (acting) {
      safeNotify(notifyCompany(company.id, {
        type: 'ORDER',
        title: 'Adınıza sipariş oluşturuldu',
        message: `${acting.name} sizin adınıza #AK-${order.id} numaralı siparişi oluşturdu (₺${quote.total.toLocaleString('tr-TR')}).`,
        link: `/bayi/orders/${order.id}`
      }));
    }

    res.status(201).json(approved || order);
  } catch (error) {
    if (error instanceof OrderError) return res.status(400).json({ message: error.message });
    console.error('Order creation error:', error);
    res.status(400).json({ message: 'Sipariş oluşturulamadı.' });
  }
};

const MAX_PICKUP_DAYS = 60;
// Gel-Al zamanı: ayar açık olmalı, en erken "pickup_lead_hours" saat sonrası, en geç 60 gün içinde
export const pickupTimeError = (value, pickup) => {
  if (!pickup.enabled) return { error: 'Gel-Al teslimat şu an kullanılamıyor.' };
  const at = new Date(value);
  if (!value || Number.isNaN(at.getTime())) return { error: 'Gel-Al için teslim alma tarih ve saatini seçin.' };
  const earliest = Date.now() + pickup.leadHours * 3600e3 - 5 * 60e3; // form doldurulurken geçen süre için 5 dk tolerans
  if (at.getTime() < earliest) {
    return { error: pickup.leadHours > 0 ? `Teslim alma zamanı en erken ${pickup.leadHours} saat sonrası olabilir.` : 'Teslim alma zamanı geçmiş bir an olamaz.' };
  }
  if (at.getTime() > Date.now() + MAX_PICKUP_DAYS * 864e5) return { error: `Teslim alma zamanı en geç ${MAX_PICKUP_DAYS} gün sonrası olabilir.` };
  return { at };
};

export class ApprovalError extends Error {}

/**
 * Sipariş kararı: kalem bazında onay/iptal. Onaylanan kalemlerin stoğu düşer, sipariş tutarı (kargo ücreti dahil)
 * yeniden hesaplanır ve fark bayinin cari hesabına borç/alacak olarak yazılır. Bildirim, webhook ve otomatik fatura
 * yalnızca gerçekten bir şey değiştiyse tetiklenir.
 * itemStatuses: [{ itemId, status: 'APPROVED' | 'CANCELLED' }] · null: tüm kalemler onaylanır (otomatik onay)
 * opts: { warehouseId, auto (otomatik onay işareti), cancelledBy ('ADMIN' | 'DEALER') }
 */
export const decideOrder = async (tenant, orderId, itemStatuses, { warehouseId: requestedWarehouse, auto = false, cancelledBy = 'ADMIN' } = {}) => {
  const settings = await getSettingsMap();
  const restockedIds = [];

  const result = await prisma.$transaction(async (tx) => {
    // Sipariş satırı kilitlenir: aynı siparişin iki onayı (iki yönetici ya da çift tıklama) sırayla işlenir;
    // ikincisi birincinin sonucunu (düşülmüş stok, yazılmış borç) görür, stok ve cari iki kez işlenmez.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "tenantId" = ${currentTenantId()} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, company: true }
    });

    if (!order) throw new ApprovalError('Sipariş bulunamadı.');
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new ApprovalError('Kargoya verilmiş, tamamlanmış veya iptal edilmiş siparişler değiştirilemez.');
    }
    if (auto && order.status !== 'PENDING') throw new ApprovalError('Sipariş zaten karara bağlanmış.');

    const statusById = new Map((itemStatuses || order.items.map((i) => ({ itemId: i.id, status: 'APPROVED' }))).map(i => [parseInt(i.itemId), i.status]));
    // Kısmen kargoya verilmiş kalem iptal edilemez (gönderilen ürün stoğa geri dönmüş gibi görünürdü)
    const shippedCancelled = order.items.filter((it) => it.shippedQty > 0 && statusById.get(it.id) === 'CANCELLED');
    if (shippedCancelled.length) throw new ApprovalError(`Kargoya verilmiş kalem iptal edilemez: ${shippedCancelled.map((it) => it.product.name).join(', ')}. İade olarak işleyin.`);

    // Siparişi karşılayacak depo: istekte seçilen, siparişte kayıtlı ya da varsayılan depo
    if (requestedWarehouse && requestedWarehouse !== order.warehouseId) {
      const w = await tx.warehouse.findUnique({ where: { id: parseInt(requestedWarehouse) } });
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

    // 2. Kalemleri güncelle, stokları işle. Ürün id sırasıyla: farklı siparişlerin eşzamanlı onayları
    // ürün satırlarını aynı sırada kilitler, birbirini beklerken kilitlenmez (deadlock olmaz).
    for (const item of [...order.items].sort((a, b) => a.productId - b.productId || a.id - b.id)) {
      const status = statusById.get(item.id);
      if (!status) continue;

      if (status === 'APPROVED' && !item.isStockDeducted) {
        // Koşullu düşüş: üstteki kontrolden sonra başka bir onay stoğu harcadıysa burada yakalanır
        const usedWarehouse = await adjustStock(tx, item.productId, -item.quantity, warehouseId).catch((e) => {
          if (e instanceof StockError) throw new ApprovalError(`Yetersiz stok: ${item.product.name} (stok: ${e.available}, istenen: ${item.quantity}). Bu kalemi iptal edin veya stok girin.`);
          throw e;
        });
        await tx.orderItem.update({ where: { id: item.id }, data: { status, isStockDeducted: true, stockWarehouseId: usedWarehouse } });
      } else if (status === 'CANCELLED' && item.isStockDeducted) {
        await adjustStock(tx, item.productId, item.quantity, item.stockWarehouseId);
        await tx.orderItem.update({ where: { id: item.id }, data: { status, isStockDeducted: false, stockWarehouseId: null } });
        restockedIds.push(item.productId);
      } else {
        await tx.orderItem.update({ where: { id: item.id }, data: { status } });
      }
    }

    // 3. Tutarları yeniden hesapla (sadece onaylanan kalemler). Kargo ücreti sipariş anındaki tutarıyla kalır;
    // tüm kalemler iptal edilirse sıfırlanır.
    const approved = await tx.orderItem.findMany({ where: { orderId, status: 'APPROVED' } });
    // Kupon indirimi kalan kalemlere göre aynı kuralla yeniden hesaplanır (tutar kuponu kalan tutarı aşamaz)
    const coupon = order.couponType ? { type: order.couponType, value: order.couponValue } : null;
    const { subtotal, discountAmount, vatAmount, total: totalAmount, shippingFee, shippingVat } = withShipping(computeTotals(approved, coupon), approved.length ? order.shippingFee : 0);

    const anyCancelled = order.items.some(it => (statusById.get(it.id) || it.status) === 'CANCELLED');
    const newStatus = approved.length === 0 ? 'CANCELLED' : anyCancelled ? 'PARTIAL_APPROVED' : 'APPROVED';

    // 4. Cari entegrasyon: daha önce borç yazılan tutarla (TL) fark kadar işlem yapılır.
    // Dövizli cariye siparişin oluştuğu andaki kurla çevrilerek yazılır.
    const diff = round2(totalAmount - order.debitedAmount);
    // Aynı kararın tekrarı (iki yönetici aynı anda onayladı, çift tıklama): bildirim / webhook / fatura yeniden tetiklenmez
    const changed = newStatus !== order.status || diff !== 0 || order.items.some((it) => {
      const s = statusById.get(it.id);
      return s && (s !== it.status || (s === 'APPROVED') !== it.isStockDeducted);
    });
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
        shippingFee,
        shippingVat,
        debitedAmount: totalAmount,
        status: newStatus,
        ...(auto && { autoApproved: true }),
        ...(newStatus === 'CANCELLED' && order.status !== 'CANCELLED' && { cancelledAt: now, cancelledBy }),
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

    // İptal edilen siparişin kuponu kullanılmamış sayılır
    if (newStatus === 'CANCELLED' && order.status !== 'CANCELLED' && order.couponCode) {
      await tx.coupon.updateMany({ where: { code: order.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
    }

    return { updatedOrder, companyId: order.companyId, changed };
  }, { maxWait: 10000, timeout: 30000 }); // kilit beklenirken varsayılan 5 sn'lik işlem süresi yetmeyebilir

  const { updatedOrder, companyId, changed } = result;
  if (!changed) return { updatedOrder, changed };
  const statusText = { APPROVED: 'onaylandı', PARTIAL_APPROVED: 'kısmen onaylandı', CANCELLED: 'iptal edildi' }[updatedOrder.status];
  safeNotify(notifyCompany(companyId, {
    type: 'ORDER',
    title: `Siparişiniz ${statusText}`,
    message: `#AK-${orderId} numaralı siparişiniz ${statusText}. Güncel tutar: ₺${updatedOrder.totalAmount.toLocaleString('tr-TR')}.`,
    link: `/bayi/orders/${orderId}`
  }));
  safeNotify(notifyRestocked(restockedIds));
  emitEvent(tenant.id, 'order.updated', orderEvent(updatedOrder));
  if (['APPROVED', 'PARTIAL_APPROVED'].includes(updatedOrder.status)) autoInvoice(tenant, updatedOrder.id, 'APPROVED');
  return { updatedOrder, changed };
};

/** Yöneticinin kalem bazında onay / iptal kararı. */
export const partialApproveOrder = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { itemStatuses } = req.body; // [{ itemId: 1, status: 'APPROVED' | 'CANCELLED' }]

    if (!Array.isArray(itemStatuses) || itemStatuses.some(i => !['APPROVED', 'CANCELLED'].includes(i.status))) {
      return res.status(400).json({ message: 'Geçersiz kalem durumları.' });
    }
    const { updatedOrder, changed } = await decideOrder(req.tenant, orderId, itemStatuses, { warehouseId: req.body.warehouseId });
    if (!changed) return res.json({ message: 'Sipariş zaten bu durumda, değişiklik yapılmadı.', updatedOrder });
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
    if (existing.deliveryMethod === 'PICKUP') return res.status(400).json({ message: 'Gel-Al siparişi kargoya verilmez; "Teslim almaya hazır" olarak işaretleyin.' });
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
    if (existing.deliveryMethod === 'PICKUP') {
      if (!['APPROVED', 'PARTIAL_APPROVED', 'READY_FOR_PICKUP'].includes(existing.status)) {
        return res.status(400).json({ message: 'Sadece onaylanmış Gel-Al siparişleri teslim edildi olarak işaretlenebilir.' });
      }
    } else if (existing.status !== 'SHIPPED') {
      return res.status(400).json({ message: 'Sadece kargodaki siparişler teslim edildi olarak işaretlenebilir.' });
    }

    const order = await markDelivered(req.tenant, existing);
    res.json({ message: 'Sipariş tamamlandı.', order });
  } catch (error) {
    res.status(400).json({ message: 'Sipariş güncellenemedi.' });
  }
};

// Gel-Al: sipariş hazırlandı, bayi gelip teslim alabilir
export const readyOrder = async (req, res) => {
  try {
    const existing = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!existing) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
    if (existing.deliveryMethod !== 'PICKUP') return res.status(400).json({ message: 'Bu sipariş Gel-Al değil.' });
    if (!['APPROVED', 'PARTIAL_APPROVED'].includes(existing.status)) {
      return res.status(400).json({ message: 'Sadece onaylanmış siparişler teslim almaya hazır yapılabilir.' });
    }
    const order = await markReadyForPickup(req.tenant, existing);
    res.json({ message: 'Sipariş teslim almaya hazır; bayiye bildirim gönderildi.', order });
  } catch (error) {
    res.status(400).json({ message: 'Sipariş güncellenemedi.' });
  }
};

/**
 * Bayi, onay bekleyen siparişini iptal eder. Stok ve cari henüz işlenmediği için yalnızca durum değişir; ayrılan
 * stok ve limit kendiliğinden serbest kalır, kupon kullanılmamış sayılır. Onay ile yarışırsa önce gelen kazanır
 * (koşullu güncelleme: durum hâlâ "onay bekliyor" ise).
 */
export const cancelOrderByDealer = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const order = await prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, companyId: req.user.companyId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'DEALER' }
      });
      if (claimed.count === 0) return null;
      const o = await tx.order.findUnique({ where: { id: orderId } });
      if (o.couponCode) await tx.coupon.updateMany({ where: { code: o.couponCode, usedCount: { gt: 0 } }, data: { usedCount: { decrement: 1 } } });
      return o;
    });
    if (!order) {
      const existing = await prisma.order.findFirst({ where: { id: orderId, companyId: req.user.companyId }, select: { status: true } });
      if (!existing) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
      return res.status(400).json({ message: 'Yalnızca onay bekleyen siparişler iptal edilebilir. Onaylanmış sipariş için firmayla iletişime geçin.' });
    }
    safeNotify(notifyAdmins({
      type: 'ORDER',
      title: 'Bayi siparişi iptal etti',
      message: `#AK-${order.id} numaralı sipariş bayi tarafından iptal edildi (₺${order.totalAmount.toLocaleString('tr-TR')}).`,
      link: '/admin/orders'
    }));
    emitEvent(req.tenant.id, 'order.updated', orderEvent(order));
    res.json({ message: 'Siparişiniz iptal edildi.', order });
  } catch (error) {
    console.error('cancelOrderByDealer error:', error);
    res.status(400).json({ message: 'Sipariş iptal edilemedi.' });
  }
};

/**
 * Kısmi sevkiyat: onaylanan siparişin seçilen kalemleri / miktarları kargoya verilir (her gönderinin kendi takip
 * numarası olur). Tüm onaylı miktar gönderilince sipariş "Kargoda" olur (bildirim, webhook, otomatik fatura).
 * items: [{ itemId, quantity }] · trackingNumber · cargoCompany
 */
export const addPartialShipment = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const trackingNumber = cleanText(req.body.trackingNumber, 60);
    const cargoCompany = cleanText(req.body.cargoCompany, 20)?.toUpperCase() || null;
    const wanted = (Array.isArray(req.body.items) ? req.body.items : [])
      .map((i) => ({ itemId: parseInt(i.itemId), quantity: parseInt(i.quantity) }))
      .filter((i) => i.itemId && i.quantity > 0);
    if (!trackingNumber) return res.status(400).json({ message: 'Kargo takip numarası zorunludur.' });
    if (wanted.length === 0) return res.status(400).json({ message: 'Gönderilecek en az bir kalem ve miktar seçin.' });

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "tenantId" = ${currentTenantId()} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: { select: { name: true } } } } } });
      if (!order) throw new ApprovalError('Sipariş bulunamadı.');
      if (order.deliveryMethod === 'PICKUP') throw new ApprovalError('Gel-Al siparişi kargoya verilmez; "Teslim almaya hazır" olarak işaretleyin.');
      if (!['APPROVED', 'PARTIAL_APPROVED'].includes(order.status)) throw new ApprovalError('Sadece onaylanmış ve henüz tamamı gönderilmemiş siparişler kargoya verilebilir.');
      const byId = new Map(order.items.map((it) => [it.id, it]));
      for (const w of wanted) {
        const it = byId.get(w.itemId);
        if (!it || it.status !== 'APPROVED') throw new ApprovalError('Gönderilecek kalem bu siparişte onaylı değil.');
        const left = it.quantity - it.shippedQty;
        if (w.quantity > left) throw new ApprovalError(`${it.product.name}: en fazla ${left} gönderilebilir.`);
      }
      const shipment = await tx.orderShipment.create({
        data: { orderId, trackingNumber, cargoCompany, createdById: req.user.id, items: wanted.map((w) => ({ orderItemId: w.itemId, quantity: w.quantity })) }
      });
      for (const w of wanted) await tx.orderItem.update({ where: { id: w.itemId }, data: { shippedQty: { increment: w.quantity } } });
      const left = order.items.filter((it) => it.status === 'APPROVED')
        .reduce((sum, it) => sum + it.quantity - it.shippedQty - (wanted.find((w) => w.itemId === it.id)?.quantity || 0), 0);
      return { order, shipment, left };
    });

    if (result.left === 0) {
      const order = await markShipped(req.tenant, result.order, { trackingNumber, cargoCompany });
      return res.json({ message: 'Siparişin tamamı kargoya verildi.', order, shipment: result.shipment });
    }
    safeNotify(notifyCompany(result.order.companyId, {
      type: 'ORDER',
      title: 'Siparişinizin bir kısmı kargoya verildi',
      message: `#AK-${orderId} numaralı siparişinizin bir kısmı yola çıktı. Takip No: ${trackingNumber}. Kalan ürünler ayrıca gönderilecek.`,
      link: `/bayi/orders/${orderId}`
    }));
    emitEvent(req.tenant.id, 'order.updated', { ...orderEvent(result.order), shipment: { trackingNumber, cargoCompany, items: result.shipment.items } });
    res.json({ message: 'Gönderi kaydedildi; kalan ürünler sonra gönderilebilir.', shipment: result.shipment });
  } catch (error) {
    if (error instanceof ApprovalError) return res.status(400).json({ message: error.message });
    console.error('createShipment error:', error);
    res.status(400).json({ message: 'Gönderi kaydedilemedi.' });
  }
};

// İrsaliye numarası ve tarihi (ERP'den ya da elle girilir; yazdırılan irsaliyede ve bayi ekranında görünür)
export const setDespatch = async (req, res) => {
  try {
    const despatchNumber = cleanText(req.body.despatchNumber, 40);
    const despatchDate = despatchNumber
      ? (/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.despatchDate || '')) ? new Date(`${req.body.despatchDate}T12:00:00`) : new Date())
      : null;
    const order = await prisma.order.update({ where: { id: parseInt(req.params.id) }, data: { despatchNumber, despatchDate } });
    res.json({ message: despatchNumber ? 'İrsaliye numarası kaydedildi.' : 'İrsaliye numarası kaldırıldı.', order });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Sipariş bulunamadı.' });
    res.status(400).json({ message: 'İrsaliye bilgisi kaydedilemedi.' });
  }
};
