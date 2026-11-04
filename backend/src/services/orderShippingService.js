import prisma from '../utils/prisma.js';
import { emitEvent } from './webhookService.js';
import { notifyCompany, safeNotify } from './notificationService.js';
import { autoInvoice } from './invoiceService.js';

export const orderEvent = (o) => ({ id: o.id, number: `AK-${o.id}`, status: o.status, companyId: o.companyId, total: o.totalAmount, trackingNumber: o.trackingNumber, cargoCompany: o.cargoCompany, deliveryMethod: o.deliveryMethod || 'SHIPPING', pickupAt: o.pickupAt || null });

/**
 * Siparişi kargoya verildi yapar: bayiye bildirim, webhook ve (ayarlıysa) otomatik fatura.
 * Elle girilen takip numarasında ve kargo firmasından gelen otomatik güncellemede kullanılır.
 */
export const markShipped = async (tenant, existing, { trackingNumber, cargoCompany, extra = {} }) => {
  const order = await prisma.$transaction(async (tx) => {
    // Henüz gönderilmemiş onaylı miktarlar bu takip numarasıyla gönderilmiş sayılır (kısmi sevkiyatın son parçası
    // ya da siparişin tek seferde kargoya verilmesi)
    const items = await tx.orderItem.findMany({ where: { orderId: existing.id, status: 'APPROVED' }, select: { id: true, quantity: true, shippedQty: true } });
    const rest = items.filter((it) => it.quantity > it.shippedQty);
    if (rest.length) {
      await tx.orderShipment.create({ data: { orderId: existing.id, trackingNumber, cargoCompany: cargoCompany || null, items: rest.map((it) => ({ orderItemId: it.id, quantity: it.quantity - it.shippedQty })) } });
      for (const it of rest) await tx.orderItem.update({ where: { id: it.id }, data: { shippedQty: it.quantity } });
    }
    return tx.order.update({
      where: { id: existing.id },
      data: { status: 'SHIPPED', trackingNumber, cargoCompany: cargoCompany || null, shippedAt: existing.shippedAt || new Date(), ...extra }
    });
  });
  if (existing.status !== 'SHIPPED' || existing.trackingNumber !== trackingNumber) {
    safeNotify(notifyCompany(order.companyId, {
      type: 'ORDER',
      title: 'Siparişiniz kargoya verildi',
      message: `#AK-${order.id} numaralı siparişiniz yola çıktı. Takip No: ${order.trackingNumber}`,
      link: `/bayi/orders/${order.id}`
    }));
  }
  emitEvent(tenant.id, 'order.updated', orderEvent(order));
  autoInvoice(tenant, order.id, 'SHIPPED');
  return order;
};

export const markDelivered = async (tenant, existing, extra = {}) => {
  const order = await prisma.order.update({ where: { id: existing.id }, data: { status: 'COMPLETED', ...extra } });
  const pickup = order.deliveryMethod === 'PICKUP';
  safeNotify(notifyCompany(order.companyId, {
    type: 'ORDER',
    title: pickup ? 'Siparişinizi teslim aldınız' : 'Siparişiniz teslim edildi',
    message: pickup ? `#AK-${order.id} numaralı Gel-Al siparişiniz teslim edildi.` : `#AK-${order.id} numaralı siparişiniz teslim edildi.`,
    link: `/bayi/orders/${order.id}`
  }));
  emitEvent(tenant.id, 'order.updated', orderEvent(order));
  return order;
};

// Gel-Al: sipariş hazır; bayiye bildirim, webhook ve (kargoya verilince kesilecek şekilde ayarlıysa) otomatik fatura
export const markReadyForPickup = async (tenant, existing) => {
  const order = await prisma.order.update({ where: { id: existing.id }, data: { status: 'READY_FOR_PICKUP', readyAt: new Date() } });
  const when = order.pickupAt ? ` Planlanan teslim alma: ${order.pickupAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}.` : '';
  safeNotify(notifyCompany(order.companyId, {
    type: 'ORDER',
    title: 'Siparişiniz teslim almaya hazır',
    message: `#AK-${order.id} numaralı Gel-Al siparişiniz hazırlandı.${when}`,
    link: `/bayi/orders/${order.id}`
  }));
  emitEvent(tenant.id, 'order.updated', orderEvent(order));
  autoInvoice(tenant, order.id, 'SHIPPED');
  return order;
};
