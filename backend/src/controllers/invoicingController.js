import prisma from '../utils/prisma.js';
import { invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { INVOICE_PROVIDERS, AUTO_ON, invoiceCreds, encryptConfig, issueOrderInvoice, queueOrderInvoice, invoicePdf, afterIssued } from '../services/invoiceService.js';
import { testConnection } from '../services/einvoice/parasut.js';

const mask = (v) => (v ? `${String(v).slice(0, 3)}•••` : '');

// ─── Ayarlar ─────────────────────────────────────────────────────────────────

export const getInvoicingSettings = async (req, res) => {
  const creds = invoiceCreds(req.tenant);
  res.json({
    provider: req.tenant.invoiceProvider || null,
    autoOn: req.tenant.invoiceAutoOn || 'MANUAL',
    configured: Boolean(creds),
    clientId: creds?.clientId || '',
    username: creds?.username || '',
    companyId: creds?.companyId || '',
    hasSecret: Boolean(creds?.clientSecret),
    hasPassword: Boolean(creds?.password),
    secretHint: mask(creds?.clientSecret)
  });
};

// Boş bırakılan gizli alanlar (client secret, şifre) mevcut değerini korur
const mergedCreds = (req) => {
  const old = invoiceCreds(req.tenant) || {};
  const b = req.body;
  return {
    clientId: String(b.clientId ?? old.clientId ?? '').trim(),
    clientSecret: b.clientSecret ? String(b.clientSecret).trim() : old.clientSecret,
    username: String(b.username ?? old.username ?? '').trim(),
    password: b.password ? String(b.password) : old.password,
    companyId: String(b.companyId ?? old.companyId ?? '').trim()
  };
};

export const saveInvoicingSettings = async (req, res) => {
  const provider = req.body.provider || null;
  if (provider && !INVOICE_PROVIDERS.includes(provider)) return res.status(400).json({ message: 'Desteklenmeyen sağlayıcı.' });
  const autoOn = AUTO_ON.includes(req.body.autoOn) ? req.body.autoOn : 'MANUAL';
  const data = { invoiceProvider: provider, invoiceAutoOn: autoOn };
  if (provider === 'PARASUT') {
    const creds = mergedCreds(req);
    if (!creds.clientId || !creds.clientSecret || !creds.username || !creds.password || !creds.companyId) {
      return res.status(400).json({ message: 'Paraşüt için Client ID, Client Secret, kullanıcı adı, şifre ve firma numarası gerekli.' });
    }
    data.invoiceConfigEnc = encryptConfig(creds);
  } else {
    data.invoiceConfigEnc = null;
  }
  await prisma.tenant.update({ where: { id: req.tenant.id }, data });
  invalidateTenantCache(req.tenant.slug);
  res.json({ message: provider ? 'E-fatura ayarları kaydedildi.' : 'E-fatura bağlantısı kaldırıldı. Fatura numaraları ERP\'den veya elle girilebilir.' });
};

// Girilen (veya kayıtlı) anahtarlarla bağlanmayı dener, erişilen şirketleri döndürür
export const testInvoicing = async (req, res) => {
  const creds = mergedCreds(req);
  if (!creds.clientId || !creds.clientSecret || !creds.username || !creds.password) return res.status(400).json({ message: 'Anahtarları ve kullanıcı bilgilerini girin.' });
  try {
    const companies = await testConnection({ ...creds, companyId: creds.companyId || '0' });
    res.json({ message: `Bağlantı başarılı. ${companies.length} şirkete erişiliyor.`, companies });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ─── Sipariş faturası ────────────────────────────────────────────────────────

const findOrder = (req) => prisma.order.findFirst({
  where: { id: parseInt(req.params.id), ...(req.user.role === 'BAYI' && { companyId: req.user.companyId }) },
  include: { invoice: true }
});

export const getOrderInvoice = async (req, res) => {
  const order = await findOrder(req);
  if (!order) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
  res.json({ invoice: order.invoice, canIssue: req.user.role === 'ADMIN' && Boolean(invoiceCreds(req.tenant)) });
};

// Sağlayıcıda kes (arka planda; ekran durumu yoklar)
export const issueInvoice = async (req, res) => {
  const order = await findOrder(req);
  if (!order) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
  if (!invoiceCreds(req.tenant)) return res.status(400).json({ message: 'E-fatura sağlayıcısı bağlı değil (Ayarlar → E-Fatura).' });
  if (order.invoice?.status === 'ISSUED') return res.status(400).json({ message: 'Bu siparişin faturası zaten kesilmiş.' });
  if (req.query.wait === 'true') {
    const invoice = await issueOrderInvoice(req.tenant, order.id).catch((e) => ({ status: 'FAILED', errorMessage: e.message }));
    return res.status(invoice.status === 'FAILED' ? 400 : 200).json({ message: invoice.status === 'FAILED' ? invoice.errorMessage : 'Fatura kesildi.', invoice });
  }
  queueOrderInvoice(req.tenant, order.id);
  res.status(202).json({ message: 'Fatura hazırlanıyor; e-belge gönderimi birkaç saniye sürebilir.' });
};

// ERP'de / elle kesilmiş faturanın numarası ve PDF'i (panelden veya /api/v1 üzerinden)
export const setInvoiceNumber = async (req, res, provider = 'MANUAL') => {
  const order = await findOrder(req);
  if (!order) return res.status(404).json({ message: 'Sipariş bulunamadı.' });
  const number = String(req.body.number || '').trim().slice(0, 50);
  if (!number) return res.status(400).json({ message: 'Fatura numarası girin.' });
  const pdfUrl = req.body.pdfUrl ? String(req.body.pdfUrl).trim() : null;
  if (pdfUrl && !/^https?:\/\//i.test(pdfUrl)) return res.status(400).json({ message: 'PDF adresi http(s) ile başlamalı.' });
  const documentType = ['E_FATURA', 'E_ARSIV', 'KAGIT'].includes(req.body.documentType) ? req.body.documentType : null;
  const data = { provider, status: 'ISSUED', number, pdfUrl, documentType, errorMessage: null, issuedAt: req.body.issuedAt ? new Date(req.body.issuedAt) : new Date(), amount: order.totalAmount };
  const invoice = await prisma.invoice.upsert({ where: { orderId: order.id }, create: { orderId: order.id, ...data }, update: data });
  if (order.invoice?.status !== 'ISSUED') afterIssued(req.tenant.id, order, invoice);
  res.json({ message: 'Fatura bilgisi kaydedildi.', invoice });
};

export const removeInvoice = async (req, res) => {
  const order = await findOrder(req);
  if (!order?.invoice) return res.status(404).json({ message: 'Fatura kaydı yok.' });
  if (order.invoice.provider === 'PARASUT' && order.invoice.status === 'ISSUED') {
    return res.status(400).json({ message: 'Paraşüt\'te kesilmiş e-belge buradan silinemez; iptali Paraşüt üzerinden yapın.' });
  }
  await prisma.invoice.delete({ where: { id: order.invoice.id } });
  res.json({ message: 'Fatura kaydı kaldırıldı.' });
};

export const invoicePdfRedirect = async (req, res) => {
  const order = await findOrder(req);
  if (!order?.invoice || order.invoice.status !== 'ISSUED') return res.status(404).json({ message: 'Fatura bulunamadı.' });
  try {
    res.json({ url: await invoicePdf(req.tenant, order.invoice) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
