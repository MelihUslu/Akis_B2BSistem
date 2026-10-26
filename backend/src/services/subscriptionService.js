import { queueSubscriptionInvoice } from './platformInvoiceService.js';
import prisma from '../utils/prisma.js';
import { invalidateTenantCache } from '../middlewares/tenantMiddleware.js';

export const addPeriod = (from, cycle) => {
  const d = new Date(from);
  if (cycle === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

export const planPrice = (plan, cycle) => (cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly);

/**
 * Başarılı bir ödemeyi kaydeder ve aboneliği aktifleştirir / uzatır.
 * `reference` benzersizdir: aynı ödeme (ör. tekrar gelen webhook) iki kez işlenmez.
 * Platform bağlamında çağrılmalıdır.
 */
export const recordSuccessfulPayment = async ({
  tenant, plan, cycle, amount, method, reference, periodStart, periodEnd, note, subscriptionRef, customerRef
}) => {
  if (reference) {
    const existing = await prisma.subscriptionPayment.findUnique({ where: { reference } });
    if (existing) return { duplicate: true, payment: existing };
  }

  const start = periodStart || (tenant.currentPeriodEnd && tenant.currentPeriodEnd > new Date() ? tenant.currentPeriodEnd : new Date());
  const end = periodEnd || addPeriod(start, cycle);

  const [payment] = await prisma.$transaction([
    prisma.subscriptionPayment.create({
      data: {
        tenantId: tenant.id, planCode: plan.code, billingCycle: cycle, amount,
        method, reference, periodStart: start, periodEnd: end, note, status: 'SUCCESS'
      }
    }),
    prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: 'ACTIVE',
        planId: plan.id,
        billingCycle: cycle,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: false,
        ...(subscriptionRef && { iyzicoSubscriptionRef: subscriptionRef }),
        ...(customerRef && { iyzicoCustomerRef: customerRef })
      }
    })
  ]);

  invalidateTenantCache(tenant.slug);
  queueSubscriptionInvoice(payment.id);
  return { duplicate: false, payment };
};

export const recordFailedPayment = async ({ tenant, plan, cycle, amount, reference, note }) => {
  if (reference && (await prisma.subscriptionPayment.findUnique({ where: { reference } }))) return;
  await prisma.$transaction([
    prisma.subscriptionPayment.create({
      data: {
        tenantId: tenant.id, planCode: plan.code, billingCycle: cycle, amount, method: 'IYZICO',
        reference, periodStart: new Date(), periodEnd: new Date(), note, status: 'FAILED'
      }
    }),
    prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'PAST_DUE' } })
  ]);
  invalidateTenantCache(tenant.slug);
};
