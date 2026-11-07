import pkg from '@prisma/client';
import { resolveShippingAddress } from './addressController.js';
import prisma, { runAsPlatform } from '../utils/prisma.js';
import { loadOrderableProducts, effectiveProduct, variantLabelOf, availableCredit, round2, loadSpecialPrices, buildPricingContext, unitPriceFor } from '../services/pricingService.js';
import { createOrderRecord, OrderError, approvalNeeded } from './orderController.js';
import { accessFor, isVisibleTo } from '../services/catalogAccess.js';
import { notifyAdmins, notifyCompany, notifyUser, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';
import { getSettingsMap, num, flag } from '../services/settingsService.js';
import { hasPermission } from '../services/permissions.js';
import { tenantPortalUrl } from '../config.js';
import { sendQuoteMail } from '../services/mailService.js';
import { aiStatus, AiError } from '../services/ai/index.js';
import { draftQuoteWithAi } from '../services/quoteAiService.js';
import { searchCatalog, productSummary } from '../services/quoteCatalogService.js';
import {
  QuoteError, EDITABLE, quoteNo, canPrice, canApprove, normalizeItems, priceQuoteLines, sendBlockers,
  assertPricingAllowed, writeItems, itemsFromStored, createWithNumber, buildSnapshot, customerView,
  expireIfNeeded, ensureSentSnapshot, latestSentRevision, newShareToken, shareTokenOf, respondAsCustomer,
  undoCustomerResponse, conversionCheck, convertQuote
} from '../services/quoteService.js';

const { Prisma } = pkg;

const fail = (res, error, fallback) => {
  if (error instanceof QuoteError || error instanceof AiError) {
    return res.status(error.status).json({ message: error.message, code: error.code, ...(error.warnings && { warnings: error.warnings }), ...(error.blockers && { blockers: error.blockers }) });
  }
  if (error instanceof OrderError) return res.status(400).json({ message: error.message });
  console.error(fallback, error);
  return res.status(400).json({ message: fallback });
};

const fmtTRY = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const str = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const dateEnd = (v) => {
  if (!v) return null;
  const d = new Date(`${String(v).slice(0, 10)}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isStaff = (user) => user.role === 'ADMIN';

const dealerInclude = {
  items: { include: { product: { select: { name: true, sku: true, unit: true, parent: { select: { name: true } } } } } },
  revisions: { orderBy: { revision: 'desc' }, take: 1 }
};
const staffInclude = {
  company: { select: { id: true, name: true, status: true, dealerGroup: true, netDiscount: true, taxNumber: true } },
  user: { select: { id: true, name: true, role: true } },
  preparedBy: { select: { id: true, name: true } },
  items: true,
  revisions: { orderBy: { revision: 'desc' }, select: { revision: true, totalAmount: true, createdAt: true, sentByName: true } },
  order: { select: { id: true, status: true } }
};

// Personel yalnızca "Teklifler" yetkisiyle; bayi kendi teklifleriyle
export const quoteAccess = (req, res, next) => {
  if (req.user.role === 'BAYI' || hasPermission(req.user, 'QUOTES')) return next();
  return res.status(403).json({ message: 'Bu işlem için yetkiniz yok. Firma yöneticinizden "Teklifler" yetkisi isteyin.', code: 'NO_PERMISSION', permission: 'QUOTES' });
};

const loadCompany = async (id) => {
  const company = await prisma.company.findUnique({ where: { id: parseInt(id) || 0 } });
  if (!company) throw new QuoteError('Müşteri bulunamadı.', 404);
  if (company.status === 'PASSIVE') throw new QuoteError('Pasif müşteriye teklif hazırlanamaz.');
  if (company.kind === 'SUPPLIER') throw new QuoteError('Tedarikçi carisine satış teklifi hazırlanamaz.');
  return company;
};

const loadStaffQuote = async (id) => {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(id) || 0 }, include: staffInclude });
  if (!quote) throw new QuoteError('Teklif bulunamadı.', 404);
  return quote;
};

const notifyApprovers = async (payload) => {
  const users = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, role: true, isOwner: true, permissions: true } });
  await Promise.all(users.filter((u) => hasPermission(u, 'QUOTE_APPROVAL')).map((u) => notifyUser(u.id, payload)));
};

// ─── Personel: liste, ayrıntı, ayarlar ──────────────────────────────────────

export const quoteMeta = async (req, res) => {
  const settings = await getSettingsMap();
  const { enabled, mock, reason, provider } = aiStatus();
  res.json({
    ai: { enabled, mock: Boolean(mock), reason: reason || null, provider },
    defaults: {
      validDays: num(settings.quote_valid_days, 15),
      paymentTerms: settings.quote_payment_terms || '',
      deliveryTerms: settings.quote_delivery_terms || '',
      discountLimit: num(settings.quote_discount_limit, 10)
    },
    can: { price: canPrice(req.user), approve: canApprove(req.user), convert: hasPermission(req.user, 'ORDERS') }
  });
};

const staffWhere = (query) => {
  const { status, companyId, from, to, q, source } = query;
  const term = String(q || '').trim();
  const no = parseInt(term.replace(/^#?TK-?/i, ''));
  return {
    ...(status && { status: { in: String(status).split(',') } }),
    ...(source && { source }),
    ...(companyId && { companyId: parseInt(companyId) }),
    ...((from || to) && { createdAt: { ...(from && { gte: new Date(`${from}T00:00:00`) }), ...(to && { lte: new Date(`${to}T23:59:59.999`) }) } }),
    ...(term && {
      OR: [
        ...(Number.isInteger(no) ? [{ number: no }] : []),
        { title: { contains: term, mode: 'insensitive' } },
        { company: { name: { contains: term, mode: 'insensitive' } } }
      ]
    })
  };
};

export const listQuotes = async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      const quotes = await prisma.quoteRequest.findMany({
        where: { companyId: req.user.companyId, OR: [{ source: 'DEALER' }, { sentRevision: { not: null } }] },
        include: dealerInclude,
        orderBy: { createdAt: 'desc' },
        take: 200
      });
      return res.json(await Promise.all(quotes.map((q) => customerView(q, req.tenant))));
    }

    const quotes = await prisma.quoteRequest.findMany({
      where: staffWhere(req.query),
      include: { company: { select: { id: true, name: true } }, preparedBy: { select: { name: true } }, user: { select: { name: true, role: true } }, order: { select: { id: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300
    });
    const now = new Date();
    res.json(quotes.map((q) => ({
      id: q.id, number: q.number, code: quoteNo(q), title: q.title, source: q.source,
      status: q.status === 'QUOTED' && q.validUntil && q.validUntil < now ? 'EXPIRED' : q.status,
      company: q.company, createdAt: q.createdAt, validUntil: q.validUntil, currency: q.currency,
      totalAmount: q.totalAmount, revision: q.revision, sentRevision: q.sentRevision, itemCount: q._count.items,
      preparedBy: q.preparedBy?.name || (q.user.role === 'ADMIN' ? q.user.name : null),
      requestedBy: q.source === 'DEALER' ? q.user.name : null,
      responseType: q.responseType, order: q.order
    })));
  } catch (error) {
    fail(res, error, 'Teklifler getirilemedi.');
  }
};

const staffDetail = async (req, quote) => {
  quote = await ensureSentSnapshot(await expireIfNeeded(quote), req.tenant);
  const company = await prisma.company.findUnique({ where: { id: quote.companyId } });
  // Taslak güncel katalogla yeniden fiyatlanır; gönderilmiş / onaydaki teklifte kayıtlı fiyatlar gösterilir
  const editable = EDITABLE.includes(quote.status);
  const sorted = [...quote.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const stored = itemsFromStored(sorted);
  const frozen = stored.map((i, idx) => (sorted[idx].quotedPrice !== null ? { ...i, manualPrice: true, unitPrice: sorted[idx].quotedPrice } : i));
  const priced = await priceQuoteLines(company, editable ? stored : frozen);
  const share = quote.shareTokenEnc ? `${tenantPortalUrl(req.tenant)}/teklif/${shareTokenOf(quote)}` : null;
  const { shareTokenHash, shareTokenEnc, items, ...rest } = quote; // eslint-disable-line no-unused-vars
  return {
    ...rest,
    code: quoteNo(quote),
    editable,
    ...priced,
    storedTotal: quote.totalAmount,
    shareUrl: share,
    can: {
      price: canPrice(req.user), approve: canApprove(req.user), convert: hasPermission(req.user, 'ORDERS'),
      revise: ['QUOTED', 'EXPIRED', 'REJECTED'].includes(quote.status) && Boolean(quote.sentRevision)
    }
  };
};

export const getQuote = async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      const quote = await prisma.quoteRequest.findFirst({ where: { id: parseInt(req.params.id) || 0, companyId: req.user.companyId }, include: dealerInclude });
      if (!quote || (quote.source === 'STAFF' && !quote.sentRevision)) return res.status(404).json({ message: 'Teklif bulunamadı.' });
      return res.json(await customerView(quote, req.tenant));
    }
    res.json(await staffDetail(req, await loadStaffQuote(req.params.id)));
  } catch (error) {
    fail(res, error, 'Teklif getirilemedi.');
  }
};

// Belge (PDF / önizleme): gönderilmiş sürüm ya da personel için taslağın önizlemesi
export const quoteDocument = async (req, res) => {
  try {
    if (!isStaff(req.user)) {
      const quote = await prisma.quoteRequest.findFirst({ where: { id: parseInt(req.params.id) || 0, companyId: req.user.companyId }, include: dealerInclude });
      const view = quote && await customerView(quote, req.tenant);
      if (!view?.document) return res.status(404).json({ message: 'Teklif belgesi bulunamadı.' });
      return res.json({ document: view.document, status: view.status });
    }
    const quote = await loadStaffQuote(req.params.id);
    const revision = parseInt(req.query.revision);
    if (revision) {
      const rev = await prisma.quoteRevision.findUnique({ where: { quoteRequestId_revision: { quoteRequestId: quote.id, revision } } });
      if (!rev) return res.status(404).json({ message: 'Sürüm bulunamadı.' });
      return res.json({ document: rev.snapshot, status: quote.status, preview: false });
    }
    const company = await prisma.company.findUnique({ where: { id: quote.companyId } });
    const priced = await priceQuoteLines(company, itemsFromStored(quote.items));
    const document = buildSnapshot({ quote, tenant: req.tenant, company, priced, preparedByName: quote.preparedBy?.name || req.user.name, revision: quote.revision });
    res.json({ document, status: quote.status, preview: true });
  } catch (error) {
    fail(res, error, 'Belge hazırlanamadı.');
  }
};

export const quoteHistory = async (req, res) => {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) || 0 }, select: { id: true } });
  if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
  const logs = await runAsPlatform(() => prisma.auditLog.findMany({
    where: { tenantId: req.tenant.id, entity: 'quotes', entityId: String(quote.id) },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, action: true, actorName: true, actorType: true, impersonatedBy: true, createdAt: true }
  }));
  res.json(logs);
};

// ─── Personel: katalog, fiyatlama, yapay zekâ ───────────────────────────────

export const quoteCatalog = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const company = req.query.companyId ? await loadCompany(req.query.companyId) : null;
    const results = await searchCatalog({ text: q, inStockOnly: req.query.inStockOnly === 'true', limit: 20 });
    const products = results.map((r) => r.product);
    const ctx = await buildPricingContext(company, await loadSpecialPrices(prisma, company, [...products.map((p) => p.id), ...products.map((p) => p.parentId)]));
    res.json(products.map((raw) => {
      const p = effectiveProduct(raw, raw.parent);
      return { ...productSummary(raw), unitPrice: unitPriceFor(p, p.moq || 1, ctx)?.unit ?? null };
    }));
  } catch (error) {
    fail(res, error, 'Ürün araması yapılamadı.');
  }
};

// Taslak hesaplaması (kaydetmeden): ekrandaki her değişiklikte fiyatlar backend'de hesaplanır
export const priceQuote = async (req, res) => {
  try {
    const company = await loadCompany(req.body.companyId);
    const items = normalizeItems(req.body.items);
    if (req.body.quoteId) {
      const stored = await prisma.quoteRequestItem.findMany({ where: { quoteRequestId: parseInt(req.body.quoteId) || 0 } });
      assertPricingAllowed(req.user, items, stored);
    } else {
      assertPricingAllowed(req.user, items);
    }
    const priced = await priceQuoteLines(company, items);
    res.json({ ...priced, approvalRequired: priced.approval.reasons.length > 0 && !canApprove(req.user) });
  } catch (error) {
    fail(res, error, 'Teklif hesaplanamadı.');
  }
};

export const aiDraft = async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    if (text.length < 3) return res.status(400).json({ message: 'İhtiyacı birkaç kelimeyle yazın.' });
    if (text.length > 4000) return res.status(400).json({ message: 'Talep metni en fazla 4000 karakter olabilir.' });
    const company = await loadCompany(req.body.companyId);
    const result = await draftQuoteWithAi({ tenantId: req.tenant.id, company, text, preferences: req.body.preferences, answers: req.body.answers });
    res.json({ ...result, approvalRequired: (result.approval?.reasons.length || 0) > 0 && !canApprove(req.user) });
  } catch (error) {
    if (error instanceof AiError) console.warn('[AI]', error.code, error.detail || '');
    fail(res, error, 'Yapay zekâ taslağı hazırlanamadı. Teklifi manuel olarak hazırlayabilirsiniz.');
  }
};

// ─── Personel: taslak kaydetme ──────────────────────────────────────────────

const aiMetaOf = (v) => {
  if (!v || typeof v !== 'object') return undefined;
  const json = JSON.stringify(v);
  return json.length <= 20000 ? JSON.parse(json) : undefined;
};

const headerData = (body) => ({
  title: str(body.title, 160),
  validUntil: dateEnd(body.validUntil),
  paymentTerms: str(body.paymentTerms, 1000),
  deliveryTerms: str(body.deliveryTerms, 1000),
  adminNote: str(body.adminNote, 2000),
  internalNote: str(body.internalNote, 2000),
  ...(body.aiRequest !== undefined && { aiRequest: str(body.aiRequest, 4000) }),
  ...(body.aiMeta !== undefined && { aiMeta: aiMetaOf(body.aiMeta) ?? Prisma.DbNull })
});

const totalsData = (priced) => ({ subtotal: priced.totals.subtotal, vatAmount: priced.totals.vatAmount, totalAmount: priced.totals.total });

export const createStaffQuote = async (req, res) => {
  try {
    const company = await loadCompany(req.body.companyId);
    const items = normalizeItems(req.body.items);
    assertPricingAllowed(req.user, items);
    const priced = await priceQuoteLines(company, items);
    const quote = await createWithNumber(async (tx, number) => {
      const q = await tx.quoteRequest.create({
        data: { number, source: 'STAFF', status: 'DRAFT', companyId: company.id, userId: req.user.id, preparedById: req.user.id, ...headerData(req.body), ...totalsData(priced) }
      });
      await writeItems(tx, q.id, priced.lines);
      return q;
    });
    res.locals.auditEntityId = quote.id;
    res.status(201).json({ message: 'Teklif taslağı kaydedildi.', id: quote.id, code: quoteNo(quote) });
  } catch (error) {
    fail(res, error, 'Teklif kaydedilemedi.');
  }
};

export const updateStaffQuote = async (req, res) => {
  try {
    const quote = await loadStaffQuote(req.params.id);
    if (!EDITABLE.includes(quote.status)) throw new QuoteError(quote.status === 'PENDING_APPROVAL' ? 'Onay bekleyen teklif değiştirilemez. Önce onaydan geri çekin.' : 'Gönderilmiş teklif değiştirilemez. Değişiklik için yeni revizyon oluşturun.', 409);
    // Bayinin talebinde müşteri değişmez; personel taslağında değişebilir (fiyatlar yeni müşteriye göre hesaplanır)
    const companyId = quote.source === 'STAFF' && req.body.companyId ? parseInt(req.body.companyId) : quote.companyId;
    const company = await loadCompany(companyId);
    const items = normalizeItems(req.body.items);
    assertPricingAllowed(req.user, items, quote.items);
    const priced = await priceQuoteLines(company, items);
    await prisma.$transaction(async (tx) => {
      await writeItems(tx, quote.id, priced.lines);
      await tx.quoteRequest.update({
        where: { id: quote.id },
        data: { ...headerData(req.body), ...totalsData(priced), companyId: company.id, status: 'DRAFT', preparedById: quote.preparedById || req.user.id }
      });
    });
    res.json({ message: 'Teklif taslağı kaydedildi.' });
  } catch (error) {
    fail(res, error, 'Teklif kaydedilemedi.');
  }
};

export const deleteStaffQuote = async (req, res) => {
  const deleted = await prisma.quoteRequest.deleteMany({ where: { id: parseInt(req.params.id) || 0, source: 'STAFF', status: 'DRAFT', sentRevision: null } });
  if (!deleted.count) return res.status(400).json({ message: 'Yalnızca hiç gönderilmemiş taslaklar silinebilir.' });
  res.json({ message: 'Taslak silindi.' });
};

// ─── Personel: gönderme, onay, revizyon ─────────────────────────────────────

const sendQuote = async (req, quote, company, priced, { approvedByUser = null } = {}) => {
  const revision = quote.revision;
  const snapshot = buildSnapshot({ quote, tenant: req.tenant, company, priced, preparedByName: quote.preparedBy?.name || req.user.name, revision });
  const reasons = priced.approval.reasons;
  await prisma.$transaction(async (tx) => {
    await writeItems(tx, quote.id, priced.lines);
    await tx.quoteRevision.create({ data: { quoteRequestId: quote.id, revision, snapshot, totalAmount: priced.totals.total, sentById: req.user.id, sentByName: req.user.name } });
    await tx.quoteRequest.update({
      where: { id: quote.id },
      data: {
        ...totalsData(priced),
        status: 'QUOTED', sentRevision: revision, sentAt: new Date(), preparedById: quote.preparedById || req.user.id,
        approvalReasons: reasons.length ? reasons : Prisma.DbNull,
        ...(reasons.length && approvedByUser
          ? { approvedById: approvedByUser.id, approvedByName: approvedByUser.name, approvedAt: new Date() }
          : !reasons.length && { approvedById: null, approvedByName: null, approvedAt: null }),
        responseType: null, responseNote: null, responseBy: null, responseVia: null, respondedAt: null
      }
    });
  });
  const code = quoteNo(quote);
  safeNotify(notifyCompany(company.id, {
    type: 'QUOTE',
    title: revision > 1 ? 'Teklifiniz güncellendi' : 'Yeni teklif',
    message: `${code}${quote.title ? ` · ${quote.title}` : ''}: ${fmtTRY(priced.totals.total)} (KDV dahil)${quote.validUntil ? `, geçerlilik ${new Date(quote.validUntil).toLocaleDateString('tr-TR')}` : ''}.`,
    link: '/bayi/quotes'
  }));
  emitEvent(req.tenant.id, 'quote.sent', { id: quote.id, number: quote.number, revision, companyId: company.id, total: priced.totals.total });
};

export const submitQuote = async (req, res) => {
  try {
    const quote = await loadStaffQuote(req.params.id);
    if (!EDITABLE.includes(quote.status)) throw new QuoteError('Bu teklif gönderilemez (taslak değil).', 409);
    const company = await loadCompany(quote.companyId);
    const priced = await priceQuoteLines(company, itemsFromStored(quote.items));
    const blockers = sendBlockers(priced.lines, { validUntil: quote.validUntil });
    if (blockers.length) throw new QuoteError(`Teklif gönderilemez: ${blockers.join(' ')}`, 400, { blockers });

    const reasons = priced.approval.reasons;
    if (reasons.length && !canApprove(req.user)) {
      await prisma.$transaction(async (tx) => {
        await writeItems(tx, quote.id, priced.lines);
        await tx.quoteRequest.update({
          where: { id: quote.id },
          data: { ...totalsData(priced), status: 'PENDING_APPROVAL', approvalReasons: reasons, approvedById: null, approvedByName: null, approvedAt: null, approvalNote: null, preparedById: quote.preparedById || req.user.id }
        });
      });
      safeNotify(notifyApprovers({
        type: 'QUOTE', title: 'Teklif onayı bekleniyor',
        message: `${quoteNo(quote)} (${quote.company.name}, ${fmtTRY(priced.totals.total)}): ${reasons.slice(0, 2).join('; ')}${reasons.length > 2 ? '…' : ''}`,
        link: `/admin/quotes/${quote.id}`
      }));
      return res.json({ status: 'PENDING_APPROVAL', message: 'Teklif yetki sınırınızı aştığı için yönetici onayına gönderildi. Onaylanınca müşteriye iletilecek.', reasons });
    }

    await sendQuote(req, quote, company, priced, { approvedByUser: reasons.length ? req.user : null });
    res.json({ status: 'QUOTED', message: 'Teklif gönderildi. Müşteri portalda görebilir; bağlantı ve e-posta ile de paylaşabilirsiniz.' });
  } catch (error) {
    fail(res, error, 'Teklif gönderilemedi.');
  }
};

export const approveQuote = async (req, res) => {
  try {
    const quote = await loadStaffQuote(req.params.id);
    if (quote.status !== 'PENDING_APPROVAL') throw new QuoteError('Bu teklif onay beklemiyor.', 409);
    const company = await loadCompany(quote.companyId);
    const priced = await priceQuoteLines(company, itemsFromStored(quote.items));
    // Onaya gönderildikten sonra katalog fiyatı / kur değiştiyse onaylanan içerik farklı olurdu
    if (round2(priced.totals.total) !== round2(quote.totalAmount)) {
      await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'DRAFT', approvalNote: 'Onay sırasında fiyatlar değişmişti; teklif taslağa döndürüldü.' } });
      throw new QuoteError('Teklif onaya gönderildikten sonra fiyatlar değişmiş (katalog veya kur). Teklif taslağa döndürüldü; kontrol edip yeniden gönderin.', 409, { code: 'PRICES_CHANGED' });
    }
    const blockers = sendBlockers(priced.lines, { validUntil: quote.validUntil });
    if (blockers.length) throw new QuoteError(`Teklif gönderilemez: ${blockers.join(' ')}`, 400, { blockers });
    await prisma.quoteRequest.update({ where: { id: quote.id }, data: { approvalNote: str(req.body.note, 1000) } });
    await sendQuote(req, quote, company, priced, { approvedByUser: req.user });
    if (quote.preparedById && quote.preparedById !== req.user.id) {
      safeNotify(notifyUser(quote.preparedById, { type: 'QUOTE', title: 'Teklif onaylandı', message: `${quoteNo(quote)} onaylandı ve müşteriye gönderildi.`, link: `/admin/quotes/${quote.id}` }));
    }
    res.json({ message: 'Teklif onaylandı ve müşteriye gönderildi.' });
  } catch (error) {
    fail(res, error, 'Teklif onaylanamadı.');
  }
};

// Onaydan geri çekme (hazırlayan) veya düzeltme için geri gönderme (onaylayan)
export const withdrawQuote = async (req, res) => {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
  if (!quote || quote.status !== 'PENDING_APPROVAL') return res.status(409).json({ message: 'Bu teklif onay beklemiyor.' });
  const note = str(req.body.note, 1000);
  await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'DRAFT', approvalNote: note } });
  if (quote.preparedById && quote.preparedById !== req.user.id) {
    safeNotify(notifyUser(quote.preparedById, { type: 'QUOTE', title: 'Teklif düzeltme için geri gönderildi', message: `${quoteNo(quote)}${note ? `: ${note}` : ''}`, link: `/admin/quotes/${quote.id}` }));
  }
  res.json({ message: 'Teklif taslağa döndürüldü.' });
};

// Gönderilmiş teklifte değişiklik: yeni revizyon açılır, müşterideki eski sürüm artık kabul edilemez
export const reviseQuote = async (req, res) => {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
  if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
  const updated = await prisma.quoteRequest.updateMany({
    where: { id: quote.id, status: { in: ['QUOTED', 'EXPIRED', 'REJECTED'] }, sentRevision: { not: null } },
    data: { status: 'DRAFT', revision: (quote.sentRevision || quote.revision) + 1, approvalReasons: Prisma.DbNull, approvedById: null, approvedByName: null, approvedAt: null, approvalNote: null }
  });
  if (!updated.count) return res.status(409).json({ message: 'Bu teklif için revizyon açılamaz (kabul edilmiş veya henüz gönderilmemiş).' });
  res.json({ message: `Revizyon ${(quote.sentRevision || quote.revision) + 1} açıldı. Müşteri yeni sürüm gönderilene kadar teklifi kabul edemez.` });
};

// Bayinin teklif talebine fiyat verilemiyorsa
export const rejectQuote = async (req, res) => {
  const id = parseInt(req.params.id) || 0;
  const quote = await prisma.quoteRequest.findUnique({ where: { id } });
  if (!quote || quote.source !== 'DEALER' || !['PENDING', 'DRAFT'].includes(quote.status) || quote.sentRevision) return res.status(400).json({ message: 'Bu teklif reddedilemez.' });
  await prisma.quoteRequest.update({ where: { id }, data: { status: 'REJECTED', adminNote: str(req.body.adminNote, 2000) ?? quote.adminNote } });
  safeNotify(notifyCompany(quote.companyId, { type: 'QUOTE', title: 'Teklif talebiniz yanıtlandı', message: `${quoteNo(quote)} için teklif verilemedi.${req.body.adminNote ? ` Not: ${req.body.adminNote}` : ''}`, link: '/bayi/quotes' }));
  res.json({ message: 'Teklif talebi reddedildi.' });
};

// ─── Personel: paylaşım ve e-posta ──────────────────────────────────────────

const shareLink = (req, token) => `${tenantPortalUrl(req.tenant)}/teklif/${token}`;

export const createShareLink = async (req, res) => {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
  if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
  if (!quote.sentRevision) return res.status(400).json({ message: 'Bağlantı, teklif gönderildikten sonra oluşturulabilir.' });
  if (quote.shareTokenEnc && !req.body.rotate) return res.json({ url: shareLink(req, shareTokenOf(quote)) });
  const { token, hash, enc } = newShareToken();
  await prisma.quoteRequest.update({ where: { id: quote.id }, data: { shareTokenHash: hash, shareTokenEnc: enc } });
  res.json({ url: shareLink(req, token), message: req.body.rotate ? 'Yeni bağlantı oluşturuldu; eski bağlantı artık çalışmaz.' : 'Paylaşım bağlantısı oluşturuldu.' });
};

export const revokeShareLink = async (req, res) => {
  await prisma.quoteRequest.updateMany({ where: { id: parseInt(req.params.id) || 0 }, data: { shareTokenHash: null, shareTokenEnc: null } });
  res.json({ message: 'Paylaşım bağlantısı iptal edildi.' });
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailQuote = async (req, res) => {
  try {
    let quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    quote = await expireIfNeeded(quote);
    if (quote.status !== 'QUOTED') throw new QuoteError('Yalnızca gönderilmiş ve geçerliliği devam eden teklif e-postayla iletilebilir.', 409);

    const typed = String(req.body.to || '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (typed.some((e) => !EMAIL.test(e))) throw new QuoteError('Geçersiz e-posta adresi.');
    // Alıcı yazılmadıysa: bayinin portal kullanıcıları; portal dışı müşteride cari e-postası ve yetkililer
    let recipients = typed.slice(0, 10);
    if (!recipients.length) {
      const company = await prisma.company.findUnique({
        where: { id: quote.companyId },
        select: { email: true, users: { where: { role: 'BAYI', isActive: true }, select: { email: true } }, contacts: { where: { email: { not: null } }, orderBy: { isPrimary: 'desc' }, select: { email: true } } }
      });
      const portal = company.users.map((u) => u.email);
      recipients = [...new Set(portal.length ? portal : [company.email, ...company.contacts.map((c) => c.email)].filter(Boolean))].slice(0, 10);
    }
    if (!recipients.length) throw new QuoteError('Müşterinin kayıtlı e-postası yok; alıcı e-posta adresini yazın.');

    let token = shareTokenOf(quote);
    if (!token) {
      const t = newShareToken();
      await prisma.quoteRequest.update({ where: { id: quote.id }, data: { shareTokenHash: t.hash, shareTokenEnc: t.enc } });
      token = t.token;
    }
    const rev = await latestSentRevision(quote);
    const url = shareLink(req, token);
    const results = await Promise.all(recipients.map((to) => sendQuoteMail({
      to, tenant: req.tenant, code: quoteNo(quote), title: quote.title, total: fmtTRY(rev.totalAmount),
      validUntil: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('tr-TR') : null, url, message: str(req.body.message, 2000)
    }).catch((err) => { console.error('[Teklif e-postası]', err.message); return { delivered: false }; })));
    const delivered = results.filter((r) => r.delivered).length;
    if (delivered) await prisma.quoteRequest.update({ where: { id: quote.id }, data: { emailedAt: new Date() } });
    res.json({
      delivered, total: recipients.length, url,
      message: delivered === recipients.length
        ? `Teklif ${delivered} alıcıya e-postayla gönderildi.`
        : delivered
          ? `${recipients.length} alıcıdan ${delivered} tanesine gönderildi; diğerleri gönderilemedi.`
          : 'E-posta gönderilemedi (sunucuda e-posta ayarı yok veya hata oluştu). Bağlantıyı kopyalayıp müşteriye iletebilirsiniz.'
    });
  } catch (error) {
    fail(res, error, 'E-posta gönderilemedi.');
  }
};

// ─── Personel: siparişe dönüştürme ──────────────────────────────────────────

export const convertQuoteToOrder = async (req, res) => {
  try {
    const quote = await prisma.quoteRequest.findUnique({ where: { id: parseInt(req.params.id) || 0 } });
    if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    const paymentMethod = req.body.paymentMethod === 'WIRE_TRANSFER' ? 'WIRE_TRANSFER' : 'CURRENT_ACCOUNT';
    const { blockers, warnings, rev, company } = await conversionCheck(quote, { paymentMethod });
    if (blockers.length) throw new QuoteError(blockers.join(' '), 400, { blockers });
    if (warnings.length && req.body.confirmWarnings !== true) {
      throw new QuoteError('Siparişe dönüştürmeden önce uyarıları onaylayın.', 409, { code: 'CONFIRM_REQUIRED', warnings });
    }
    const ship = await resolveShippingAddress(company, req.body.addressId);
    if (ship.error) throw new QuoteError(ship.error);
    const order = await convertQuote({ quote, userId: req.user.id, paymentMethod, shippingAddress: ship.address, createOrder: createOrderRecord, rev });
    safeNotify(notifyCompany(company.id, { type: 'ORDER', title: 'Teklifiniz siparişe dönüştürüldü', message: `${quoteNo(quote)} için #AK-${order.id} siparişi oluşturuldu.`, link: `/bayi/orders/${order.id}` }));
    res.status(201).json({ message: `#AK-${order.id} siparişi oluşturuldu (onay bekliyor). Fiyatlar teklifteki gibi korundu.`, orderId: order.id });
  } catch (error) {
    fail(res, error, 'Sipariş oluşturulamadı.');
  }
};

// ─── Bayi (portal) ──────────────────────────────────────────────────────────

// Bayi teklif ister (fiyatı gizli ürünler dahil)
export const createQuote = async (req, res) => {
  try {
    const items = (Array.isArray(req.body.items) ? req.body.items : [])
      .map(i => ({ productId: parseInt(i.productId), quantity: parseInt(i.quantity) }))
      .filter(i => i.productId && i.quantity > 0);
    if (items.length === 0) return res.status(400).json({ message: 'Teklif için en az bir ürün ve miktar girin.' });

    const products = await loadOrderableProducts(prisma, items.map(i => i.productId));
    const access = req.user.companyId ? await accessFor(prisma, await prisma.company.findUnique({ where: { id: req.user.companyId } })) : null;
    for (const item of items) {
      const raw = products.get(item.productId);
      if (!raw || !effectiveProduct(raw, raw.parent).isActive || !isVisibleTo(raw, access)) return res.status(400).json({ message: 'Ürün bulunamadı veya satışa kapalı.' });
      if (raw.isMaster && raw._count.variants > 0) return res.status(400).json({ message: `${raw.name}: Lütfen bir varyant seçin.` });
    }

    // Stokta olmayan ürün: ayar açıksa teklif alınır (sipariş oluşmaz, stok düşmez), kapalıysa stok kuralı geçerli
    const nameOf = (raw) => [raw.parent?.name || raw.name, variantLabelOf(raw)].filter(Boolean).join(' — ');
    const outOfStock = items.filter(i => (products.get(i.productId).stock ?? 0) <= 0);
    if (outOfStock.length) {
      const { quote_out_of_stock } = await getSettingsMap();
      if (!flag(quote_out_of_stock)) {
        return res.status(400).json({ message: `${outOfStock.map(i => nameOf(products.get(i.productId))).join(', ')} stokta yok. Stokta olmayan ürünler için teklif talebi alınmıyor.` });
      }
    }
    const outIds = new Set(outOfStock.map(i => i.productId));

    const quote = await createWithNumber(async (tx, number) => {
      const q = await tx.quoteRequest.create({
        data: { number, source: 'DEALER', companyId: req.user.companyId, userId: req.user.id, note: String(req.body.note || '').trim() || null }
      });
      await tx.quoteRequestItem.createMany({
        data: items.map((i, idx) => ({
          quoteRequestId: q.id, productId: i.productId, quantity: i.quantity, sortOrder: idx, variantLabel: variantLabelOf(products.get(i.productId)),
          ...(outIds.has(i.productId) && { warnings: ['Talep anında stokta yoktu (tedarik gerekir).'] })
        }))
      });
      return q;
    });

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    safeNotify(notifyAdmins({ type: 'QUOTE', title: 'Yeni teklif talebi', message: `${company.name} ${items.length} kalem için teklif istedi (${quoteNo(quote)})${outIds.size ? `; ${outIds.size} kalem stokta yok` : ''}.`, link: `/admin/quotes/${quote.id}` }));
    emitEvent(req.tenant.id, 'quote.created', { id: quote.id, number: quote.number, companyId: req.user.companyId, items: items.length });
    res.locals.auditEntityId = quote.id;
    res.status(201).json({ message: 'Teklif talebiniz alındı. Fiyatlandırıldığında size bildirim göndereceğiz.', quote: { id: quote.id, code: quoteNo(quote) } });
  } catch (error) {
    console.error('createQuote error:', error);
    res.status(400).json({ message: 'Teklif talebi oluşturulamadı.' });
  }
};

export const cancelQuote = async (req, res) => {
  const id = parseInt(req.params.id) || 0;
  const updated = await prisma.quoteRequest.updateMany({
    where: { id, companyId: req.user.companyId, source: 'DEALER', status: { in: ['PENDING', 'DRAFT'] }, sentRevision: null },
    data: { status: 'CANCELLED' }
  });
  if (updated.count === 0) return res.status(400).json({ message: 'Bu teklif iptal edilemez.' });
  res.json({ message: 'Teklif talebi iptal edildi.' });
};

const notifyStaffResponse = (quote, title, message) =>
  safeNotify(notifyAdmins({ type: 'QUOTE', title, message, link: `/admin/quotes/${quote.id}` }));

// Bayi teklifi kabul eder → teklif fiyatlarıyla sipariş oluşur (admin onayına düşer)
export const acceptQuote = async (req, res) => {
  try {
    const paymentMethod = req.body.paymentMethod === 'WIRE_TRANSFER' ? 'WIRE_TRANSFER' : 'CURRENT_ACCOUNT';
    let quote = await prisma.quoteRequest.findFirst({ where: { id: parseInt(req.params.id) || 0, companyId: req.user.companyId } });
    if (!quote || !quote.sentRevision) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    quote = await expireIfNeeded(quote);
    const rev = await latestSentRevision(quote);
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    // Bayi içinde onay: teklif kabulü de sipariştir; kuralı olan çalışan kabul edemez, ana kullanıcıya iletir
    if (!req.user.actingAs && (req.user.orderApproval === 'BLOCKED' || approvalNeeded(req.user, rev?.snapshot?.totals?.total ?? 0))) {
      return res.status(403).json({ message: 'Bu teklifi firmanızın ana kullanıcısı onaylar. "Ana kullanıcıya ilet" ile bildirebilirsiniz.', code: 'DEALER_PERMISSION', permission: 'ORDER' });
    }

    if (paymentMethod === 'CURRENT_ACCOUNT' && rev && parseInt(req.body.revision) === quote.sentRevision) {
      const { availableTRY: available } = await availableCredit(prisma, company);
      if (available === null || rev.snapshot.totals.total > available) {
        return res.status(400).json({ message: `Risk limitiniz yetersiz. Kullanılabilir limit: ₺${Math.max(0, available).toLocaleString('tr-TR')}. Havale/EFT seçebilirsiniz.` });
      }
    }

    await respondAsCustomer({ quote, revision: req.body.revision, type: 'ACCEPTED', by: req.user.name, via: 'PORTAL' });
    let order;
    try {
      const ship = await resolveShippingAddress(company, req.body.addressId);
      if (ship.error) throw new QuoteError(ship.error);
      order = await convertQuote({ quote: { ...quote, status: 'ACCEPTED' }, userId: req.user.id, paymentMethod, shippingAddress: ship.address, createOrder: createOrderRecord, rev });
    } catch (error) {
      await undoCustomerResponse(quote.id); // Teklif tekrar kabul edilebilsin
      throw error;
    }

    emitEvent(req.tenant.id, 'quote.accepted', { id: quote.id, number: quote.number, revision: quote.sentRevision, companyId: company.id, orderId: order.id });
    notifyStaffResponse(quote, 'Teklif kabul edildi', `${company.name} ${quoteNo(quote)} teklifini kabul etti; #AK-${order.id} siparişi oluştu.`);
    res.status(201).json({ message: 'Teklif onaylandı, siparişiniz oluşturuldu.', orderId: order.id });
  } catch (error) {
    fail(res, error, 'Teklif onaylanamadı.');
  }
};

// Onay kuralı olan çalışan teklifi ana kullanıcı(lar)a iletir
export const forwardQuote = async (req, res) => {
  try {
    const quote = await prisma.quoteRequest.findFirst({ where: { id: parseInt(req.params.id) || 0, companyId: req.user.companyId } });
    if (!quote || !quote.sentRevision) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    const owners = await prisma.user.findMany({ where: { companyId: req.user.companyId, role: 'BAYI', isOwner: true, isActive: true }, select: { id: true } });
    for (const o of owners) {
      safeNotify(notifyUser(o.id, { type: 'QUOTE', title: 'Onayınızı bekleyen teklif', message: `${req.user.name}, ${quoteNo(quote)} teklifinin onaylanmasını istiyor.`, link: '/bayi/quotes' }));
    }
    res.json({ message: 'Teklif firmanızın ana kullanıcısına iletildi.' });
  } catch (error) {
    fail(res, error, 'Teklif iletilemedi.');
  }
};

// Bayi teklifi reddeder veya revizyon ister
export const dealerFeedback = async (req, res) => {
  try {
    const type = req.body.type === 'REVISION_REQUESTED' ? 'REVISION_REQUESTED' : 'REJECTED';
    const note = str(req.body.note, 1000);
    if (type === 'REVISION_REQUESTED' && !note) throw new QuoteError('Revizyon talebinde ne değişmesini istediğinizi yazın.');
    const quote = await prisma.quoteRequest.findFirst({ where: { id: parseInt(req.params.id) || 0, companyId: req.user.companyId } });
    if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı.' });
    await respondAsCustomer({ quote, revision: req.body.revision, type, note, by: req.user.name, via: 'PORTAL' });
    const company = await prisma.company.findUnique({ where: { id: quote.companyId }, select: { name: true } });
    notifyStaffResponse(quote, type === 'REJECTED' ? 'Teklif reddedildi' : 'Revizyon talebi', `${company.name} · ${quoteNo(quote)}${note ? `: ${note}` : ''}`);
    res.json({ message: type === 'REJECTED' ? 'Teklif reddedildi.' : 'Revizyon talebiniz iletildi.' });
  } catch (error) {
    fail(res, error, 'Yanıt iletilemedi.');
  }
};
