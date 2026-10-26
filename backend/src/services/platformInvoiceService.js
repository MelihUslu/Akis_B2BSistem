import prisma, { runAsPlatform } from '../utils/prisma.js';
import { platformCreds } from './invoiceService.js';
import * as parasut from './einvoice/parasut.js';

const VAT = Number(process.env.SUBSCRIPTION_VAT_RATE || 20); // paket fiyatları KDV dahildir
const CYCLE = { MONTHLY: 'Aylık', YEARLY: 'Yıllık' };

/**
 * Platformun müşterisine (firmaya) abonelik faturası keser. PARASUT_* ortam değişkenleri tanımlı değilse hiçbir şey yapmaz.
 * Sonuç SubscriptionPayment.invoice* alanlarına yazılır; hata olursa platform panelinden yeniden denenebilir.
 */
export const issueSubscriptionInvoice = (paymentId) => runAsPlatform(async () => {
  const creds = platformCreds();
  if (!creds) return null;
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId }, include: { tenant: true } });
  if (!payment || payment.status !== 'SUCCESS' || payment.invoiceStatus === 'ISSUED' || !(payment.amount > 0)) return payment;
  const plan = await prisma.plan.findUnique({ where: { code: payment.planCode } });
  const t = payment.tenant;
  await prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { invoiceStatus: 'PENDING', invoiceError: null } });
  try {
    const result = await parasut.issueInvoice(creds, {
      buyer: { name: t.name, taxNumber: t.taxNumber, taxOffice: t.taxOffice, address: t.address, email: t.contactEmail, phone: t.phone },
      lines: [{
        code: `ABONELIK-${payment.planCode}`,
        name: `${process.env.PLATFORM_NAME || 'Akis B2B'} ${plan?.name || payment.planCode} paketi · ${CYCLE[payment.billingCycle] || ''} abonelik (${payment.periodStart.toLocaleDateString('tr-TR')} – ${payment.periodEnd.toLocaleDateString('tr-TR')})`,
        quantity: 1,
        unitPrice: Math.round((payment.amount / (1 + VAT / 100)) * 100) / 100,
        vatRate: VAT,
        unit: 'Adet'
      }],
      description: `Abonelik ödemesi #${payment.id}`
    });
    return prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { invoiceStatus: 'ISSUED', invoiceNumber: result.number, invoiceExternalId: result.externalId } });
  } catch (error) {
    console.error(`[Abonelik faturası] #${payment.id}:`, error.message);
    return prisma.subscriptionPayment.update({ where: { id: payment.id }, data: { invoiceStatus: 'FAILED', invoiceError: String(error.message).slice(0, 500) } });
  }
});

export const queueSubscriptionInvoice = (paymentId) => {
  if (!platformCreds()) return;
  setImmediate(() => issueSubscriptionInvoice(paymentId).catch((err) => console.error('[Abonelik faturası]', err.message)));
};

export const subscriptionInvoicePdf = (externalId) => {
  const creds = platformCreds();
  if (!creds) throw new Error('Platform Paraşüt hesabı tanımlı değil.');
  return parasut.invoicePdfUrl(creds, externalId);
};
