import prisma from '../utils/prisma.js';
import * as iyzico from './iyzicoService.js';
import { recordSuccessfulPayment, recordFailedPayment } from './subscriptionService.js';
import { invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { sendPlatformAlert } from './mailService.js';

export const findPlanByPricingRef = async (ref) => {
  const plan = await prisma.plan.findFirst({ where: { OR: [{ iyzicoMonthlyPlanRef: ref }, { iyzicoYearlyPlanRef: ref }] } });
  return plan && { plan, cycle: plan.iyzicoYearlyPlanRef === ref ? 'YEARLY' : 'MONTHLY' };
};

const isFailedOrder = (order) => {
  const status = String(order.orderStatus || '').toUpperCase();
  if (['FAILED', 'FAILURE', 'UNPAID'].includes(status)) return true;
  // Dönemi başlamış ama ödeme denemeleri başarısız kalmış sipariş
  const attempts = order.paymentAttempts || [];
  return status === 'WAITING' && attempts.length > 0 && attempts.every(a => String(a.paymentStatus).toUpperCase() !== 'SUCCESS');
};

/**
 * Aboneliğin gerçek durumunu iyzico'dan okuyup kiracıya yansıtır. Ödeme formu geri dönüşü ve
 * webhook bildirimleri bu fonksiyonu kullanır; gelen istekteki verilere güvenilmez.
 * Ödemeler iyzico sipariş referansıyla kaydedildiği için aynı ödeme iki kez işlenmez.
 * Platform bağlamında çağrılmalıdır.
 */
export const syncSubscription = async (tenant, subscriptionRef) => {
  const sub = await iyzico.getSubscription(subscriptionRef);
  const matched = await findPlanByPricingRef(sub.pricingPlanReferenceCode);
  if (!matched) throw new Error(`iyzico fiyat planı eşleşmedi: ${sub.pricingPlanReferenceCode}`);

  const orders = Array.isArray(sub.orders) ? sub.orders : [];
  const paid = orders
    .filter(o => String(o.orderStatus).toUpperCase() === 'SUCCESS')
    .sort((a, b) => Number(a.endPeriod) - Number(b.endPeriod)); // Eskiden yeniye: son kayıt en güncel dönemi yazar

  let recorded = 0;
  for (const order of paid) {
    const { duplicate } = await recordSuccessfulPayment({
      tenant: await prisma.tenant.findUnique({ where: { id: tenant.id } }),
      plan: matched.plan,
      cycle: matched.cycle,
      amount: Number(order.price),
      method: 'IYZICO',
      reference: `ord:${order.referenceCode}`,
      periodStart: iyzico.toDate(order.startPeriod) || undefined,
      periodEnd: iyzico.toDate(order.endPeriod) || undefined,
      subscriptionRef,
      customerRef: sub.customerReferenceCode
    });
    if (!duplicate) recorded++;
  }

  for (const order of orders.filter(isFailedOrder)) {
    await recordFailedPayment({
      tenant, plan: matched.plan, cycle: matched.cycle,
      amount: Number(order.price) || 0,
      reference: `ord:${order.referenceCode}:failed`,
      note: 'iyzico yenileme ödemesi başarısız'
    });
    sendPlatformAlert({ subject: 'Ödeme başarısız', text: `${tenant.name} abonelik yenilemesi başarısız oldu.` }).catch(() => {});
  }

  const status = String(sub.subscriptionStatus || '').toUpperCase();
  if (['CANCELED', 'CANCELLED', 'EXPIRED'].includes(status)) {
    const current = await prisma.tenant.findUnique({ where: { id: tenant.id } });
    if (current.iyzicoSubscriptionRef === subscriptionRef) {
      await prisma.tenant.update({ where: { id: tenant.id }, data: { cancelAtPeriodEnd: true, iyzicoSubscriptionRef: null } });
    }
  } else if (status === 'UNPAID') {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'PAST_DUE' } });
  }

  invalidateTenantCache(tenant.slug);
  return { status, plan: matched.plan, cycle: matched.cycle, recorded };
};
