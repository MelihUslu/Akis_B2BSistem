import { setStock, reconcileStock } from '../services/stockService.js';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { hashApiKey } from '../middlewares/apiKeyAuth.js';
import { notifyRestocked, safeNotify } from '../services/notificationService.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import { WEBHOOK_EVENTS, validateWebhookUrl, sendTestEvent } from '../services/webhookService.js';
import { variantLabelOf, VARIANT_VALUES_INCLUDE, round2 } from '../services/pricingService.js';
import { markShipped, markDelivered } from '../services/orderShippingService.js';

const MAX_BATCH = 1000;
const batch = (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body?.items;
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: 'Gövde bir dizi veya { items: [...] } olmalıdır.' }); return null; }
  if (items.length > MAX_BATCH) { res.status(400).json({ error: `Tek istekte en fazla ${MAX_BATCH} kayıt gönderilebilir.` }); return null; }
  return items;
};
const page = (req) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
  const p = Math.max(parseInt(req.query.page) || 1, 1);
  return { take: limit, skip: (p - 1) * limit, page: p, limit };
};
const currency = (c) => (c === 'TL' ? 'TRY' : c);

// ═══ Yönetim (firma admini, SETTINGS) ════════════════════════════════════════

export const listIntegration = async (req, res) => {
  const [keys, webhooks] = await Promise.all([
    prisma.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true } }),
    prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } })
  ]);
  res.json({ keys, webhooks, events: WEBHOOK_EVENTS });
};

// Anahtar sadece oluşturulduğunda bir kez gösterilir; veritabanında özeti saklanır
export const createApiKey = async (req, res) => {
  const name = String(req.body.name || '').trim() || 'ERP';
  const key = `akb2b_${crypto.randomBytes(24).toString('base64url')}`;
  const created = await prisma.apiKey.create({ data: { name, prefix: key.slice(0, 12), keyHash: hashApiKey(key) } });
  res.status(201).json({ message: 'API anahtarı oluşturuldu. Bu anahtar bir daha gösterilmeyecek, güvenli bir yere kaydedin.', key, id: created.id });
};

export const revokeApiKey = async (req, res) => {
  await prisma.apiKey.updateMany({ where: { id: parseInt(req.params.id) }, data: { revokedAt: new Date() } });
  res.json({ message: 'API anahtarı iptal edildi.' });
};

const parseEvents = (events) => (Array.isArray(events) ? events.filter(e => e === '*' || WEBHOOK_EVENTS[e]) : []);

export const createWebhook = async (req, res) => {
  const url = String(req.body.url || '').trim();
  const invalid = await validateWebhookUrl(url);
  if (invalid) return res.status(400).json({ message: invalid });
  const events = parseEvents(req.body.events);
  if (events.length === 0) return res.status(400).json({ message: 'En az bir olay seçin.' });
  const hook = await prisma.webhook.create({ data: { url, events, secret: `whsec_${crypto.randomBytes(24).toString('base64url')}` } });
  res.status(201).json({ message: 'Webhook eklendi.', webhook: hook });
};

export const updateWebhook = async (req, res) => {
  const id = parseInt(req.params.id);
  const data = {};
  if (req.body.url !== undefined) {
    const invalid = await validateWebhookUrl(req.body.url);
    if (invalid) return res.status(400).json({ message: invalid });
    data.url = req.body.url;
  }
  if (req.body.events !== undefined) data.events = parseEvents(req.body.events);
  if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
  const hook = await prisma.webhook.update({ where: { id }, data });
  res.json({ message: 'Webhook güncellendi.', webhook: hook });
};

export const deleteWebhook = async (req, res) => {
  await prisma.webhook.deleteMany({ where: { id: parseInt(req.params.id) } });
  res.json({ message: 'Webhook silindi.' });
};

export const testWebhook = async (req, res) => {
  const hook = await prisma.webhook.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!hook) return res.status(404).json({ message: 'Webhook bulunamadı.' });
  const result = await sendTestEvent(hook);
  res.json(result.error ? { ok: false, message: `Gönderilemedi: ${result.error}` } : { ok: true, message: `Gönderildi (HTTP ${result.status}).` });
};

// ═══ Entegrasyon API'si (/api/v1, API anahtarı ile) ══════════════════════════

const productOut = (p) => ({
  id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, brand: p.brand, price: p.price, currency: p.currency,
  vatRate: p.vatRate, stock: p.stock, unit: p.unit, moq: p.moq, stepQuantity: p.stepQuantity, isActive: p.isActive,
  category: p.category?.name || null, parentSku: p.parent?.sku || null, variantLabel: variantLabelOf(p), updatedAt: p.updatedAt
});

export const apiListProducts = async (req, res) => {
  const { take, skip, page: p, limit } = page(req);
  const where = req.query.updatedSince ? { updatedAt: { gte: new Date(req.query.updatedSince) } } : {};
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, take, skip, orderBy: { id: 'asc' }, include: { category: true, parent: { select: { sku: true } }, ...VARIANT_VALUES_INCLUDE } }),
    prisma.product.count({ where })
  ]);
  res.json({ data: rows.map(productOut), page: p, limit, total });
};

// [{ sku, stock, warehouse? }] — ERP stok miktarları (varyant SKU'ları dahil). warehouse: depo kodu (yoksa toplam stok)
export const apiUpdateStock = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const result = { updated: 0, notFound: [] };
  const restocked = [];
  for (const item of items) {
    const stock = parseInt(item.stock);
    if (!item.sku || !Number.isFinite(stock)) continue;
    const product = await prisma.product.findFirst({ where: { sku: String(item.sku) } });
    if (!product) { result.notFound.push(item.sku); continue; }
    let warehouseId = null;
    if (item.warehouse) {
      const w = await prisma.warehouse.findFirst({ where: { code: String(item.warehouse).trim().toUpperCase() } });
      if (!w) { result.notFound.push(`${item.sku} (depo: ${item.warehouse})`); continue; }
      warehouseId = w.id;
    }
    const updated = await setStock(prisma, product.id, stock, warehouseId);
    if (product.stock <= 0 && updated.stock > 0) restocked.push(product.id);
    result.updated++;
  }
  safeNotify(notifyRestocked(restocked));
  res.json(result);
};

// [{ sku, price, currency? }] — liste fiyatları (KDV hariç)
export const apiUpdatePrices = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const result = { updated: 0, notFound: [] };
  for (const item of items) {
    const price = parseFloat(item.price);
    if (!item.sku || !Number.isFinite(price) || price < 0) continue;
    const updated = await prisma.product.updateMany({
      where: { sku: String(item.sku) },
      data: { price, ...(item.currency && { currency: currency(item.currency) }) }
    });
    if (updated.count === 0) result.notFound.push(item.sku); else result.updated++;
  }
  res.json(result);
};

// [{ sku, name, price, currency, vatRate, stock, unit, brand, barcode, category }] — SKU varsa günceller, yoksa ekler
export const apiUpsertProducts = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const result = { created: 0, updated: 0, errors: [] };
  for (const [i, item] of items.entries()) {
    try {
      if (!item.sku) throw new Error('sku zorunlu');
      let categoryId;
      if (item.category) {
        const cat = await prisma.category.findFirst({ where: { name: String(item.category) } })
          || await prisma.category.create({ data: { name: String(item.category) } });
        categoryId = cat.id;
      }
      const data = {
        ...(item.name !== undefined && { name: String(item.name) }),
        ...(item.price !== undefined && { price: parseFloat(item.price) }),
        ...(item.currency && { currency: currency(item.currency) }),
        ...(item.vatRate !== undefined && { vatRate: parseFloat(item.vatRate) }),
        ...(item.stock !== undefined && { stock: parseInt(item.stock) }),
        ...(item.unit && { unit: String(item.unit) }),
        ...(item.brand !== undefined && { brand: item.brand || null }),
        ...(item.barcode !== undefined && { barcode: item.barcode ? String(item.barcode) : null }),
        ...(item.isActive !== undefined && { isActive: Boolean(item.isActive) }),
        ...(categoryId && { categoryId })
      };
      const existing = await prisma.product.findFirst({ where: { sku: String(item.sku) } });
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        await reconcileStock(prisma, existing.id, data.stock);
        result.updated++;
      } else {
        if (!data.name || data.price === undefined) throw new Error('yeni ürün için name ve price zorunlu');
        await assertWithinLimit(req.tenant, 'products');
        const created = await prisma.product.create({ data: { ...data, sku: String(item.sku), images: '[]' } });
        await reconcileStock(prisma, created.id, data.stock);
        result.created++;
      }
    } catch (error) {
      result.errors.push({ index: i, sku: item.sku, error: error instanceof LimitError ? error.message : error.message.split('\n').pop() });
    }
  }
  res.json(result);
};

const companyOut = (c) => ({
  id: c.id, externalCode: c.externalCode, name: c.name, taxNumber: c.taxNumber, taxOffice: c.taxOffice,
  authorizedPerson: c.authorizedPerson, phone: c.phone, address: c.address, status: c.status,
  dealerGroup: c.dealerGroup, riskLimit: c.riskLimit, balance: c.currentBalance, netDiscount: c.netDiscount
});

export const apiListCompanies = async (req, res) => {
  const { take, skip, page: p, limit } = page(req);
  const [rows, total] = await Promise.all([prisma.company.findMany({ take, skip, orderBy: { id: 'asc' } }), prisma.company.count()]);
  res.json({ data: rows.map(companyOut), page: p, limit, total });
};

// Önce cari kodu, bulunamazsa vergi no ile eşleşir (ilk senkronda mevcut bayiye cari kodu bağlanır)
const findCompany = async (item) => {
  if (item.externalCode) {
    const byCode = await prisma.company.findFirst({ where: { externalCode: String(item.externalCode) } });
    if (byCode) return byCode;
  }
  if (item.taxNumber) return prisma.company.findFirst({ where: { taxNumber: String(item.taxNumber) } });
  return null;
};

// [{ externalCode, name, taxNumber, riskLimit, dealerGroup, netDiscount, ... }] — cari kodu veya vergi no ile eşleşir.
// Yeni cari eklenir ama kullanıcı oluşturulmaz (giriş hesabı panelden açılır).
export const apiUpsertCompanies = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const result = { created: 0, updated: 0, errors: [] };
  for (const [i, item] of items.entries()) {
    try {
      if (!item.externalCode && !item.taxNumber) throw new Error('externalCode veya taxNumber zorunlu');
      const data = {
        ...(item.externalCode && { externalCode: String(item.externalCode) }),
        ...(item.name && { name: String(item.name) }),
        ...(item.taxNumber && { taxNumber: String(item.taxNumber) }),
        ...(item.taxOffice !== undefined && { taxOffice: item.taxOffice }),
        ...(item.authorizedPerson !== undefined && { authorizedPerson: item.authorizedPerson }),
        ...(item.phone !== undefined && { phone: item.phone }),
        ...(item.address !== undefined && { address: item.address }),
        ...(item.riskLimit !== undefined && { riskLimit: parseFloat(item.riskLimit) }),
        ...(item.netDiscount !== undefined && { netDiscount: parseFloat(item.netDiscount) }),
        ...(['STANDART', 'GOLD', 'VIP'].includes(item.dealerGroup) && { dealerGroup: item.dealerGroup }),
        ...(item.paymentTermDays !== undefined && { paymentTermDays: parseInt(item.paymentTermDays) })
      };
      const existing = await findCompany(item);
      if (existing) {
        await prisma.company.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        if (!data.name) throw new Error('yeni cari için name zorunlu');
        await assertWithinLimit(req.tenant, 'dealers');
        await prisma.company.create({ data: { ...data, status: 'ACTIVE' } });
        result.created++;
      }
    } catch (error) {
      result.errors.push({ index: i, externalCode: item.externalCode, error: error instanceof LimitError ? error.message : error.message.split('\n').pop() });
    }
  }
  res.json(result);
};

// [{ externalCode | taxNumber, balance }] — ERP'deki güncel cari bakiye (artı = alacaklı, eksi = borçlu).
// Fark, ekstrede "ERP bakiye düzeltmesi" olarak görünür.
export const apiSyncBalances = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const result = { updated: 0, unchanged: 0, notFound: [] };
  for (const item of items) {
    const balance = parseFloat(item.balance);
    if (!Number.isFinite(balance)) continue;
    const company = await findCompany(item);
    if (!company) { result.notFound.push(item.externalCode || item.taxNumber); continue; }
    const diff = round2(balance - company.currentBalance);
    if (diff === 0) { result.unchanged++; continue; }
    await prisma.$transaction([
      prisma.financialTransaction.create({
        data: { companyId: company.id, type: diff > 0 ? 'CREDIT' : 'DEBT', amount: Math.abs(diff), description: item.description || 'ERP bakiye düzeltmesi' }
      }),
      prisma.company.update({ where: { id: company.id }, data: { currentBalance: balance } })
    ]);
    result.updated++;
  }
  res.json(result);
};

const orderOut = (o) => ({
  id: o.id, number: `AK-${o.id}`, status: o.status, createdAt: o.createdAt, approvedAt: o.approvedAt, exportedAt: o.exportedAt,
  paymentMethod: o.paymentMethod, subtotal: o.subtotal, discountAmount: o.discountAmount, vatAmount: o.vatAmount, total: o.totalAmount,
  couponCode: o.couponCode, dueDate: o.dueDate, cargoCompany: o.cargoCompany, trackingNumber: o.trackingNumber,
  company: { id: o.company.id, externalCode: o.company.externalCode, name: o.company.name, taxNumber: o.company.taxNumber, taxOffice: o.company.taxOffice },
  shippingAddress: o.shippingAddress || null,
  warehouse: o.warehouse ? { code: o.warehouse.code, name: o.warehouse.name } : null,
  invoice: o.invoice ? { status: o.invoice.status, number: o.invoice.number, documentType: o.invoice.documentType, issuedAt: o.invoice.issuedAt } : null,
  items: o.items.map(i => ({
    sku: i.product.sku, name: i.product.parent?.name || i.product.name, variantLabel: i.variantLabel,
    quantity: i.quantity, unitPrice: i.price, vatRate: i.vatRate, status: i.status
  }))
});

const ORDER_INCLUDE = { company: true, warehouse: true, invoice: true, items: { include: { product: { select: { sku: true, name: true, parent: { select: { name: true } } } } } } };

// ?exported=false → ERP'ye henüz aktarılmamış siparişler · ?status=APPROVED · ?since=2026-01-01
export const apiListOrders = async (req, res) => {
  const { take, skip, page: p, limit } = page(req);
  const where = {
    ...(req.query.status && { status: { in: String(req.query.status).split(',') } }),
    ...(req.query.exported === 'false' && { exportedAt: null }),
    ...(req.query.exported === 'true' && { exportedAt: { not: null } }),
    ...(req.query.since && { createdAt: { gte: new Date(req.query.since) } })
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, take, skip, orderBy: { id: 'asc' }, include: ORDER_INCLUDE }),
    prisma.order.count({ where })
  ]);
  res.json({ data: rows.map(orderOut), page: p, limit, total });
};

export const apiGetOrder = async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) }, include: ORDER_INCLUDE });
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
  res.json(orderOut(order));
};

// ERP siparişi aldı: tekrar çekilmesin
export const apiMarkExported = async (req, res) => {
  const updated = await prisma.order.updateMany({ where: { id: parseInt(req.params.id) }, data: { exportedAt: new Date() } });
  if (updated.count === 0) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
  res.json({ ok: true });
};

// ERP'den kargo bilgisi / teslim durumu
export const apiUpdateOrderStatus = async (req, res) => {
  const id = parseInt(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
  const status = req.body.status;
  if (!['SHIPPED', 'COMPLETED'].includes(status)) return res.status(400).json({ error: 'status SHIPPED veya COMPLETED olmalıdır (onay/iptal panelden yapılır).' });
  if (!['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED'].includes(order.status)) return res.status(409).json({ error: `Sipariş durumu ${order.status}; bu işlem yapılamaz.` });

  // Panelden yapılan işlemle aynı akış: bayiye bildirim, webhook, (ayarlıysa) otomatik fatura
  let updated = order;
  if (status === 'SHIPPED' || order.status !== 'SHIPPED') {
    updated = await markShipped(req.tenant, order, {
      trackingNumber: req.body.trackingNumber ? String(req.body.trackingNumber) : order.trackingNumber,
      cargoCompany: req.body.cargoCompany ? String(req.body.cargoCompany).toUpperCase() : order.cargoCompany
    });
  }
  if (status === 'COMPLETED') updated = await markDelivered(req.tenant, updated);
  res.json({ ok: true, status: updated.status });
};
