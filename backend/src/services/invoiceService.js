import { SHIPPING_VAT_RATE } from './pricingService.js';
import prisma, { runWithTenant } from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/secretBox.js';
import { emitEvent } from './webhookService.js';
import { notifyCompany, safeNotify } from './notificationService.js';
import * as parasut from './einvoice/parasut.js';

export const INVOICE_PROVIDERS = ['PARASUT'];
export const AUTO_ON = ['MANUAL', 'APPROVED', 'SHIPPED'];

// Firmanın e-fatura anahtarları (çözülmüş) veya null
export const invoiceCreds = (tenant) => {
  if (tenant?.invoiceProvider !== 'PARASUT' || !tenant.invoiceConfigEnc) return null;
  try { return JSON.parse(decrypt(tenant.invoiceConfigEnc)); } catch { return null; }
};

export const encryptConfig = (config) => encrypt(JSON.stringify(config));

// Platformun kendi Paraşüt hesabı (abonelik faturaları için, ortam değişkenlerinden)
export const platformCreds = () => {
  const { PARASUT_CLIENT_ID, PARASUT_CLIENT_SECRET, PARASUT_USERNAME, PARASUT_PASSWORD, PARASUT_COMPANY_ID } = process.env;
  return PARASUT_CLIENT_ID && PARASUT_USERNAME && PARASUT_COMPANY_ID
    ? { clientId: PARASUT_CLIENT_ID, clientSecret: PARASUT_CLIENT_SECRET, username: PARASUT_USERNAME, password: PARASUT_PASSWORD, companyId: PARASUT_COMPANY_ID }
    : null;
};

// Siparişten fatura verisi (iptal edilen kalemler hariç, tutarlar KDV hariç)
const orderInvoiceData = (order) => {
  const owner = order.company.users?.find((u) => u.isOwner) || order.company.users?.[0];
  return {
    buyer: {
      name: order.company.name, taxNumber: order.company.taxNumber, taxOffice: order.company.taxOffice,
      address: order.company.address, phone: order.company.phone, email: owner?.email
    },
    lines: order.items.filter((i) => i.status !== 'CANCELLED').map((i) => ({
      code: i.product.sku,
      name: `${i.product.parent?.name || i.product.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`,
      quantity: i.quantity, unitPrice: i.price, vatRate: i.vatRate, unit: i.product.unit
    })).concat(order.shippingFee > 0 ? [{ code: 'KARGO', name: 'Kargo ücreti', quantity: 1, unitPrice: order.shippingFee, vatRate: SHIPPING_VAT_RATE, unit: 'Adet' }] : []),
    discount: order.discountAmount || 0,
    description: `B2B sipariş AK-${order.id}`,
    dueDays: order.company.paymentTermDays || 0
  };
};

const loadOrder = (orderId) => prisma.order.findUnique({
  where: { id: orderId },
  include: {
    company: { include: { users: { where: { role: 'BAYI' }, select: { email: true, isOwner: true } } } },
    items: { include: { product: { select: { sku: true, name: true, unit: true, parent: { select: { name: true } } } } } }
  }
});

/**
 * Siparişin faturasını sağlayıcıda keser. Firma bağlamında çağrılmalıdır.
 * Önceden kesilmiş fatura tekrar kesilmez; başarısız olan yeniden denenebilir.
 */
export const issueOrderInvoice = async (tenant, orderId) => {
  const creds = invoiceCreds(tenant);
  if (!creds) throw new Error('E-fatura sağlayıcısı bağlı değil (Ayarlar → E-Fatura).');
  const existing = await prisma.invoice.findUnique({ where: { orderId } });
  if (existing?.status === 'ISSUED') return existing;
  if (existing?.status === 'PENDING' && existing.updatedAt > new Date(Date.now() - 5 * 60_000)) return existing;

  const order = await loadOrder(orderId);
  if (!order) throw new Error('Sipariş bulunamadı.');
  if (!['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'].includes(order.status)) throw new Error('Yalnızca onaylanmış siparişin faturası kesilebilir.');
  const data = orderInvoiceData(order);
  if (!data.lines.length) throw new Error('Faturalanacak kalem yok.');

  const invoice = await prisma.invoice.upsert({
    where: { orderId },
    create: { orderId, provider: 'PARASUT', status: 'PENDING', amount: order.totalAmount },
    update: { provider: 'PARASUT', status: 'PENDING', errorMessage: null, amount: order.totalAmount }
  });
  try {
    const result = await parasut.issueInvoice(creds, data);
    const done = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'ISSUED', externalId: result.externalId, number: result.number, documentType: result.documentType, issuedAt: new Date() }
    });
    afterIssued(tenant.id, order, done);
    return done;
  } catch (error) {
    return prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'FAILED', errorMessage: String(error.message).slice(0, 500) } });
  }
};

// Bayiye bildirim + ERP'ye webhook
export const afterIssued = (tenantId, order, invoice) => {
  safeNotify(notifyCompany(order.companyId, {
    type: 'ORDER', title: `Faturanız kesildi (AK-${order.id})`,
    message: `${invoice.number ? `${invoice.number} numaralı ` : ''}${invoice.documentType === 'E_FATURA' ? 'e-fatura' : invoice.documentType === 'E_ARSIV' ? 'e-arşiv fatura' : 'fatura'} sipariş detayında görüntülenebilir.`,
    link: `/bayi/orders/${order.id}`
  }));
  emitEvent(tenantId, 'invoice.issued', { orderId: order.id, number: invoice.number, documentType: invoice.documentType, provider: invoice.provider, issuedAt: invoice.issuedAt });
};

// Arka planda kes (istek beklemez). Sipariş durum değişikliklerinden çağrılır.
export const queueOrderInvoice = (tenant, orderId) => {
  setImmediate(() => runWithTenant(tenant.id, () => issueOrderInvoice(tenant, orderId))
    .catch((err) => console.error(`[E-fatura] AK-${orderId}:`, err.message)));
};

// Sipariş onaylanınca / kargolanınca otomatik fatura (firma ayarına göre)
export const autoInvoice = (tenant, orderId, event) => {
  if (tenant?.invoiceAutoOn === event && invoiceCreds(tenant)) queueOrderInvoice(tenant, orderId);
};

export const invoicePdf = async (tenant, invoice) => {
  if (invoice.pdfUrl) return invoice.pdfUrl;
  if (invoice.provider === 'PARASUT' && invoice.externalId) {
    const creds = invoiceCreds(tenant);
    if (!creds) throw new Error('E-fatura sağlayıcısı bağlı değil.');
    return parasut.invoicePdfUrl(creds, invoice.externalId);
  }
  throw new Error('Bu faturanın PDF dosyası yok.');
};
