import { setStock, reconcileStock, defaultWarehouse } from '../services/stockService.js';
import crypto from 'crypto';
import { postEntry, currentRate, normalizeCurrency } from '../services/accountPosting.js';
import prisma, { currentTenantId } from '../utils/prisma.js';
import { hashApiKey } from '../middlewares/apiKeyAuth.js';
import { notifyRestocked, safeNotify } from '../services/notificationService.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import { WEBHOOK_EVENTS, validateWebhookUrl, sendTestEvent, redeliver, MAX_ATTEMPTS } from '../services/webhookService.js';
import { variantLabelOf, VARIANT_VALUES_INCLUDE, round2 } from '../services/pricingService.js';
import { markShipped, markDelivered, markReadyForPickup } from '../services/orderShippingService.js';
import { emitEvent } from '../services/webhookService.js';

const MAX_BATCH = 1000;
const batch = (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body?.items;
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: 'Gövde bir dizi veya { items: [...] } olmalıdır.' }); return null; }
  if (items.length > MAX_BATCH) { res.status(400).json({ error: `Tek istekte en fazla ${MAX_BATCH} kayıt gönderilebilir.` }); return null; }
  return items;
};
// Tarih parametresi (ISO 8601); geçersizse 400 (hata işleyicide)
const dateParam = (value, name) => {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error(`${name} geçerli bir tarih olmalı (ör. 2026-11-01 ya da 2026-11-01T08:00:00Z).`), { status: 400 });
  return d;
};

const page = (req) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
  const p = Math.min(Math.max(parseInt(req.query.page) || 1, 1), 100_000);
  return { take: limit, skip: (p - 1) * limit, page: p, limit };
};
const currency = (c) => (c === 'TL' ? 'TRY' : c);
// Test anahtarı: istek doğrulanır, sonuç hesaplanır ama veritabanına yazılmaz
const dryRun = (req) => req.apiKey?.isTest === true;
const out = (req, body) => (dryRun(req) ? { ...body, dryRun: true } : body);

// ═══ Yönetim (firma admini, SETTINGS) ════════════════════════════════════════

export const listIntegration = async (req, res) => {
  const [keys, webhooks] = await Promise.all([
    prisma.apiKey.findMany({ where: { revokedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, prefix: true, isTest: true, lastUsedAt: true, createdAt: true } }),
    prisma.webhook.findMany({ orderBy: { createdAt: 'desc' } })
  ]);
  res.json({ keys, webhooks, events: WEBHOOK_EVENTS });
};

// Anahtar sadece oluşturulduğunda bir kez gösterilir; veritabanında özeti saklanır
export const createApiKey = async (req, res) => {
  const name = String(req.body.name || '').trim() || 'ERP';
  const isTest = req.body.isTest === true;
  const key = `akb2b_${isTest ? 'test_' : ''}${crypto.randomBytes(24).toString('base64url')}`;
  const created = await prisma.apiKey.create({ data: { name, isTest, prefix: key.slice(0, isTest ? 17 : 12), keyHash: hashApiKey(key) } });
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

// Webhook gönderim kaydı (son 100) ve elle yeniden gönderme
export const listDeliveries = async (req, res) => {
  const where = { webhookId: parseInt(req.params.id), ...(req.query.status && { status: req.query.status }) };
  const rows = await prisma.webhookDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, event: true, status: true, attempts: true, lastStatusCode: true, lastError: true, nextAttemptAt: true, deliveredAt: true, createdAt: true, body: true } });
  res.json({ maxAttempts: MAX_ATTEMPTS, data: rows });
};

export const redeliverWebhook = async (req, res) => {
  const d = await prisma.webhookDelivery.findUnique({ where: { id: parseInt(req.params.deliveryId) } });
  if (!d) return res.status(404).json({ message: 'Gönderim bulunamadı.' });
  const result = await redeliver(d.id);
  res.json({ message: result?.status === 'SUCCESS' ? `Gönderildi (HTTP ${result.lastStatusCode}).` : `Gönderilemedi: ${result?.lastError || 'bilinmeyen hata'}`, delivery: result });
};

// ═══ Entegrasyon API'si (/api/v1, API anahtarı ile) ══════════════════════════

const productOut = (p) => ({
  id: p.id, sku: p.sku, barcode: p.barcode, name: p.name, brand: p.brand, price: p.price, currency: p.currency,
  vatRate: p.vatRate, stock: p.stock, unit: p.unit, moq: p.moq, stepQuantity: p.stepQuantity, isActive: p.isActive,
  category: p.category?.name || null, parentSku: p.parent?.sku || null, variantLabel: variantLabelOf(p), updatedAt: p.updatedAt
});

export const apiListProducts = async (req, res) => {
  const { take, skip, page: p, limit } = page(req);
  const since = dateParam(req.query.updatedSince, 'updatedSince');
  const where = since ? { updatedAt: { gte: since } } : {};
  const [rows, total] = await Promise.all([
    prisma.product.findMany({ where, take, skip, orderBy: { id: 'asc' }, include: { category: true, parent: { select: { sku: true } }, ...VARIANT_VALUES_INCLUDE } }),
    prisma.product.count({ where })
  ]);
  res.json({ data: rows.map(productOut), page: p, limit, total });
};

// Parti tek seferde okunur / yazılır: kayıt başına sırayla 1–2 sorgu atıldığında 1.000 kayıtlık parti yük altında
// stokta 11 sn, fiyatta 5 sn sürüyordu; 50 bin ürünlük katalogda bir tam senkron ~7 dk (yük testi, 5 Kasım 2026).
// Aynı SKU partide birden çok kez gelirse sonuncusu geçerlidir (sırayla işlemedeki gibi).

// Depo kullanılmıyorsa (çoğu firma) stoklar tek sorguda yazılır; depolu firmada her ürün depo stoğu üzerinden (setStock).
// Dönen: stoğu sıfırdan yukarı çıkan ürünler (stok bildirimi için)
const writeStocks = async (writes) => {
  const restocked = new Set();
  if (!(await defaultWarehouse(prisma)) && writes.every((w) => !w.warehouseId)) {
    const last = new Map(writes.map((w) => [w.product.id, w]));
    const ids = [...last.keys()];
    await prisma.$executeRaw`UPDATE "Product" p SET stock = v.stock, "updatedAt" = now()
      FROM unnest(${ids}::int[], ${ids.map((id) => last.get(id).stock)}::int[]) AS v(id, stock)
      WHERE p.id = v.id AND p."tenantId" = ${currentTenantId()}`;
    for (const w of last.values()) if (w.product.stock <= 0 && w.stock > 0) restocked.add(w.product.id);
  } else {
    for (const w of writes) {
      const updated = await setStock(prisma, w.product.id, w.stock, w.warehouseId);
      if (w.product.stock <= 0 && updated.stock > 0) restocked.add(w.product.id);
    }
  }
  return [...restocked];
};

// [{ sku, stock, warehouse? }] — ERP stok miktarları (varyant SKU'ları dahil). warehouse: depo kodu (yoksa toplam stok)
export const apiUpdateStock = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const result = { updated: 0, notFound: [] };
  const valid = items.filter((item) => item.sku && Number.isFinite(parseInt(item.stock)));
  const products = new Map((await prisma.product.findMany({
    where: { sku: { in: [...new Set(valid.map((item) => String(item.sku)))] } }, select: { id: true, sku: true, stock: true }
  })).map((p) => [p.sku, p]));
  const warehouses = valid.some((item) => item.warehouse)
    ? new Map((await prisma.warehouse.findMany({ select: { id: true, code: true } })).map((w) => [w.code, w.id]))
    : new Map();
  const writes = [];
  for (const item of valid) {
    const product = products.get(String(item.sku));
    if (!product) { result.notFound.push(item.sku); continue; }
    let warehouseId = null;
    if (item.warehouse) {
      warehouseId = warehouses.get(String(item.warehouse).trim().toUpperCase());
      if (!warehouseId) { result.notFound.push(`${item.sku} (depo: ${item.warehouse})`); continue; }
    }
    writes.push({ product, stock: parseInt(item.stock), warehouseId });
    result.updated++;
  }
  if (!dryRun(req) && writes.length) safeNotify(notifyRestocked(await writeStocks(writes)));
  res.json(out(req, result));
};

// [{ sku, price, currency? }] — liste fiyatları (KDV hariç)
export const apiUpdatePrices = async (req, res) => {
  const items = batch(req, res); if (!items) return;
  const valid = items.filter((item) => item.sku && Number.isFinite(parseFloat(item.price)) && parseFloat(item.price) >= 0);
  const last = new Map(valid.map((item) => [String(item.sku), item]));
  const skus = [...last.keys()];
  let found;
  if (dryRun(req)) {
    found = new Set((await prisma.product.findMany({ where: { sku: { in: skus } }, select: { sku: true } })).map((p) => p.sku));
  } else if (skus.length) {
    const rows = await prisma.$queryRaw`UPDATE "Product" p SET price = v.price, currency = COALESCE(v.currency, p.currency), "updatedAt" = now()
      FROM unnest(${skus}::text[], ${skus.map((k) => parseFloat(last.get(k).price))}::float8[], ${skus.map((k) => (last.get(k).currency ? currency(last.get(k).currency) : null))}::text[]) AS v(sku, price, currency)
      WHERE p."tenantId" = ${currentTenantId()} AND p.sku = v.sku
      RETURNING p.sku`;
    found = new Set(rows.map((r) => r.sku));
  } else found = new Set();
  const result = { updated: 0, notFound: [] };
  for (const item of valid) if (found.has(String(item.sku))) result.updated++; else result.notFound.push(item.sku);
  res.json(out(req, result));
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
          || (dryRun(req) ? { id: null } : await prisma.category.create({ data: { name: String(item.category) } }));
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
        if (!dryRun(req)) {
          await prisma.product.update({ where: { id: existing.id }, data });
          await reconcileStock(prisma, existing.id, data.stock);
        }
        result.updated++;
      } else {
        if (!data.name || data.price === undefined) throw new Error('yeni ürün için name ve price zorunlu');
        await assertWithinLimit(req.tenant, 'products');
        if (!dryRun(req)) {
          const created = await prisma.product.create({ data: { ...data, sku: String(item.sku), images: '[]' } });
          await reconcileStock(prisma, created.id, data.stock);
        }
        result.created++;
      }
    } catch (error) {
      result.errors.push({ index: i, sku: item.sku, error: error instanceof LimitError ? error.message : error.message.split('\n').pop() });
    }
  }
  res.json(out(req, result));
};

const companyOut = (c) => ({
  id: c.id, externalCode: c.externalCode, name: c.name, taxNumber: c.taxNumber, taxOffice: c.taxOffice,
  authorizedPerson: c.authorizedPerson, phone: c.phone, address: c.address, status: c.status,
  dealerGroup: c.dealerGroup, riskLimit: c.riskLimit, balance: c.currentBalance, currency: c.currency, netDiscount: c.netDiscount, kind: c.kind
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
        ...(item.paymentTermDays !== undefined && { paymentTermDays: parseInt(item.paymentTermDays) }),
        ...(['DEALER', 'CUSTOMER', 'SUPPLIER'].includes(item.kind) && { kind: item.kind })
      };
      const existing = await findCompany(item);
      if (existing) {
        if (!dryRun(req)) await prisma.company.update({ where: { id: existing.id }, data });
        result.updated++;
      } else {
        if (!data.name) throw new Error('yeni cari için name zorunlu');
        if ((data.kind || 'DEALER') === 'DEALER') await assertWithinLimit(req.tenant, 'dealers');
        // Para birimi yalnızca yeni caride belirlenir (hareketi olan carininki değişmez)
        const currency = normalizeCurrency(item.currency) || 'TRY';
        if (!dryRun(req)) await prisma.company.create({ data: { ...data, currency, status: 'ACTIVE' } });
        result.created++;
      }
    } catch (error) {
      result.errors.push({ index: i, externalCode: item.externalCode, error: error instanceof LimitError ? error.message : error.message.split('\n').pop() });
    }
  }
  res.json(out(req, result));
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
    if (dryRun(req)) { result.updated++; continue; }
    // balance carinin para birimindedir (TRY / USD / EUR)
    const rate = await currentRate(company.currency).catch(() => null);
    if (!rate) { result.notFound.push(`${item.externalCode || item.taxNumber} (kur alınamadı)`); continue; }
    await prisma.$transaction((tx) => postEntry(tx, { company, type: diff > 0 ? 'CREDIT' : 'DEBT', amount: Math.abs(diff), rate, source: 'ERP', description: item.description || 'ERP bakiye düzeltmesi' }));
    result.updated++;
  }
  res.json(out(req, result));
};

const orderOut = (o) => ({
  id: o.id, number: `AK-${o.id}`, status: o.status, createdAt: o.createdAt, approvedAt: o.approvedAt, exportedAt: o.exportedAt,
  paymentMethod: o.paymentMethod, subtotal: o.subtotal, discountAmount: o.discountAmount, vatAmount: o.vatAmount, total: o.totalAmount,
  couponCode: o.couponCode, dueDate: o.dueDate, cargoCompany: o.cargoCompany, trackingNumber: o.trackingNumber,
  shippingFee: o.shippingFee || 0, note: o.note || null, customerRef: o.customerRef || null, channel: o.channel || 'PORTAL',
  despatchNumber: o.despatchNumber || null, despatchDate: o.despatchDate || null,
  shipments: (o.shipments || []).map((s) => ({ trackingNumber: s.trackingNumber, cargoCompany: s.cargoCompany, items: s.items, createdAt: s.createdAt })),
  company: { id: o.company.id, externalCode: o.company.externalCode, name: o.company.name, taxNumber: o.company.taxNumber, taxOffice: o.company.taxOffice },
  shippingAddress: o.shippingAddress || null,
  deliveryMethod: o.deliveryMethod || 'SHIPPING',
  pickupAt: o.pickupAt || null,
  warehouse: o.warehouse ? { code: o.warehouse.code, name: o.warehouse.name } : null,
  invoice: o.invoice ? { status: o.invoice.status, number: o.invoice.number, documentType: o.invoice.documentType, issuedAt: o.invoice.issuedAt } : null,
  items: o.items.map(i => ({
    sku: i.product.sku, name: i.product.parent?.name || i.product.name, variantLabel: i.variantLabel,
    quantity: i.quantity, unitPrice: i.price, vatRate: i.vatRate, status: i.status, shippedQuantity: i.shippedQty || 0
  }))
});

const ORDER_INCLUDE = { company: true, warehouse: true, invoice: true, shipments: { orderBy: { createdAt: 'asc' } }, items: { include: { product: { select: { sku: true, name: true, parent: { select: { name: true } } } } } } };

// ?exported=false → ERP'ye henüz aktarılmamış siparişler · ?status=APPROVED · ?since=2026-01-01
export const apiListOrders = async (req, res) => {
  const { take, skip, page: p, limit } = page(req);
  const where = {
    ...(req.query.status && { status: { in: String(req.query.status).split(',') } }),
    ...(req.query.exported === 'false' && { exportedAt: null }),
    ...(req.query.exported === 'true' && { exportedAt: { not: null } }),
    ...(req.query.since && { createdAt: { gte: dateParam(req.query.since, 'since') } })
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
  const updated = dryRun(req)
    ? { count: await prisma.order.count({ where: { id: parseInt(req.params.id) } }) }
    : await prisma.order.updateMany({ where: { id: parseInt(req.params.id) }, data: { exportedAt: new Date() } });
  if (updated.count === 0) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
  res.json(out(req, { ok: true }));
};

// ERP'den kargo bilgisi / teslim durumu
export const apiUpdateOrderStatus = async (req, res) => {
  const id = parseInt(req.params.id);
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
  const status = req.body.status;
  // İrsaliye numarası durumdan bağımsız da gönderilebilir (status vermeden)
  if (req.body.despatchNumber !== undefined && !status) {
    if (dryRun(req)) return res.json(out(req, { ok: true }));
    const despatchNumber = String(req.body.despatchNumber || '').trim().slice(0, 40) || null;
    await prisma.order.update({ where: { id }, data: { despatchNumber, despatchDate: despatchNumber ? new Date(req.body.despatchDate || Date.now()) : null } });
    return res.json({ ok: true, status: order.status, despatchNumber });
  }
  // Gel-Al siparişi: READY_FOR_PICKUP (teslim almaya hazır) ya da COMPLETED (teslim edildi); kargoya verilmez
  if (order.deliveryMethod === 'PICKUP') {
    if (!['READY_FOR_PICKUP', 'COMPLETED'].includes(status)) return res.status(400).json({ error: 'Gel-Al siparişinde status READY_FOR_PICKUP veya COMPLETED olmalıdır.' });
    if (!['APPROVED', 'PARTIAL_APPROVED', 'READY_FOR_PICKUP'].includes(order.status) || (status === 'READY_FOR_PICKUP' && order.status === 'READY_FOR_PICKUP')) {
      return res.status(409).json({ error: `Sipariş durumu ${order.status}; bu işlem yapılamaz.` });
    }
    if (dryRun(req)) return res.json(out(req, { ok: true, status }));
    const updated = status === 'COMPLETED' ? await markDelivered(req.tenant, order) : await markReadyForPickup(req.tenant, order);
    return res.json({ ok: true, status: updated.status });
  }
  if (!['SHIPPED', 'COMPLETED'].includes(status)) return res.status(400).json({ error: 'status SHIPPED veya COMPLETED olmalıdır (onay/iptal panelden yapılır).' });
  if (!['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED'].includes(order.status)) return res.status(409).json({ error: `Sipariş durumu ${order.status}; bu işlem yapılamaz.` });

  if (dryRun(req)) return res.json(out(req, { ok: true, status }));
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

// Örnek olay: entegratör gerçek sipariş beklemeden webhook alıcısını dener (gövdede test: true)
const SAMPLES = {
  'order.created': { id: 0, number: 'AK-0', status: 'PENDING', companyId: 0, total: 1180, trackingNumber: null, cargoCompany: null },
  'order.updated': { id: 0, number: 'AK-0', status: 'SHIPPED', companyId: 0, total: 1180, trackingNumber: '1234567890', cargoCompany: 'YURTICI' },
  'invoice.issued': { orderId: 0, number: 'TST2026000000001', documentType: 'E_ARSIV', provider: 'PARASUT', issuedAt: new Date().toISOString() }
};
export const apiSendSampleEvent = async (req, res) => {
  const event = String(req.body.event || 'order.created');
  if (!WEBHOOK_EVENTS[event]) return res.status(400).json({ error: `Bilinmeyen olay. Geçerli olaylar: ${Object.keys(WEBHOOK_EVENTS).join(', ')}` });
  const hooks = await prisma.webhook.count({ where: { isActive: true } });
  if (!hooks) return res.status(400).json({ error: 'Firmada aktif webhook yok (Ayarlar → Entegrasyon).' });
  emitEvent(req.tenant.id, event, { ...(SAMPLES[event] || { id: 0 }), test: true });
  res.status(202).json({ ok: true, message: `${event} örnek olayı abone webhook'lara gönderiliyor.` });
};
