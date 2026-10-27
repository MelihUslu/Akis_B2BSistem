import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import {
  loadOrderableProducts, loadSpecialPrices, buildPricingContext, effectiveProduct, unitPriceFor,
  variantLabelOf, computeTotals, availableCredit, round2
} from './pricingService.js';
import { toTRY } from './exchangeRateService.js';
import { getSettingsMap, num } from './settingsService.js';
import { hasPermission } from './permissions.js';
import { packInfo } from './quoteCatalogService.js';
import { encrypt, decrypt } from '../utils/secretBox.js';

/**
 * Teklif iş kuralları. Fiyat, iskonto, KDV ve toplamlar burada, sipariş ile aynı fiyat motoruyla
 * (pricingService) hesaplanır; istemciden gelen tutarlar yalnızca "elle girilen birim fiyat" olarak kullanılır.
 */

export class QuoteError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const MAX_LINES = 200;
export const MAX_QTY = 10_000_000;
export const EDITABLE = ['PENDING', 'DRAFT'];
export const MATCH_STATUSES = ['MANUAL', 'MATCHED', 'REVIEW', 'UNMATCHED'];
export const quoteNo = (q) => `TK-${q.number}`;

export const canPrice = (user) => hasPermission(user, 'QUOTE_PRICING');
export const canApprove = (user) => hasPermission(user, 'QUOTE_APPROVAL');

const str = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};
const strList = (v, n, max) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const intList = (v, n) => (Array.isArray(v) ? [...new Set(v.map((x) => parseInt(x)).filter((x) => x > 0))].slice(0, n) : []);

// İstemciden gelen kalemleri güvenli biçime çevirir (fiyat hesaplanmaz)
export const normalizeItems = (list) => (Array.isArray(list) ? list : []).slice(0, MAX_LINES).map((i) => {
  const productId = parseInt(i.productId) || null;
  const manualPrice = Boolean(i.manualPrice) && Number.isFinite(parseFloat(i.unitPrice));
  const status = MATCH_STATUSES.includes(i.matchStatus) ? i.matchStatus : 'MANUAL';
  return {
    productId,
    quantity: Math.min(MAX_QTY, Math.max(0, parseInt(i.quantity) || 0)),
    discountRate: Math.min(100, Math.max(0, round2(parseFloat(i.discountRate) || 0))),
    manualPrice,
    unitPrice: manualPrice ? Math.max(0, round2(parseFloat(i.unitPrice))) : null,
    matchStatus: productId ? (status === 'UNMATCHED' ? 'REVIEW' : status) : 'UNMATCHED',
    requestText: str(i.requestText, 300),
    matchReason: str(i.matchReason, 400),
    warnings: strList(i.warnings, 6, 240),
    alternatives: intList(i.alternatives, 6)
  };
});

/**
 * Kalemleri müşteriye göre fiyatlandırır.
 * Birim fiyat = müşteriye sistemde geçerli fiyat (bayi/grup iskontosu, özel/kademeli fiyat, miktar indirimi)
 * × (1 − teklif iskontosu). Elle fiyat girildiyse o kullanılır ve iskonto oranı ondan türetilir.
 * Onay gerekçeleri: iskonto sınırını aşan ya da maliyetin altındaki kalemler.
 */
export const priceQuoteLines = async (company, items, { db = prisma, settings } = {}) => {
  settings = settings || await getSettingsMap();
  const limit = num(settings.quote_discount_limit, 10);
  const altIds = items.flatMap((i) => i.alternatives || []);
  const ids = [...new Set([...items.map((i) => i.productId), ...altIds].filter(Boolean))];
  const byId = await loadOrderableProducts(db, ids);
  const specialPrices = await loadSpecialPrices(db, company, [...ids, ...[...byId.values()].map((p) => p.parentId)]);
  const ctx = await buildPricingContext(company, specialPrices);

  const summary = (raw, quantity) => {
    const p = effectiveProduct(raw, raw.parent);
    const price = unitPriceFor(p, Math.max(quantity || 0, p.moq || 1), ctx);
    return {
      id: raw.id, sku: raw.sku, name: raw.parent?.name || raw.name, variantLabel: variantLabelOf(raw),
      unit: p.unit, packInfo: packInfo(p), stock: raw.stock, unitPrice: price?.unit ?? null
    };
  };

  const approvalReasons = [];
  const lines = items.map((item) => {
    const base = {
      productId: item.productId, quantity: item.quantity, discountRate: item.discountRate, manualPrice: item.manualPrice,
      matchStatus: item.matchStatus, requestText: item.requestText, matchReason: item.matchReason,
      warnings: item.warnings || [], alternatives: item.alternatives || [], notices: [], errors: [],
      unitPrice: null, basePrice: null, lineTotal: 0, vatRate: null
    };
    base.alternativeProducts = base.alternatives.map((id) => byId.get(id)).filter(Boolean)
      .filter((r) => effectiveProduct(r, r.parent).isActive).map((r) => summary(r, item.quantity));

    if (!item.productId) return { ...base, matchStatus: 'UNMATCHED' };
    const raw = byId.get(item.productId);
    if (!raw) return { ...base, productId: null, matchStatus: 'UNMATCHED', errors: ['Ürün bulunamadı.'] };

    const p = effectiveProduct(raw, raw.parent);
    const name = raw.parent?.name || raw.name;
    const line = {
      ...base, sku: raw.sku, name, variantLabel: variantLabelOf(raw), unit: p.unit, packInfo: packInfo(p),
      stock: raw.stock, moq: p.moq || 1, stepQuantity: p.stepQuantity || 1, vatRate: p.vatRate, isActive: p.isActive
    };
    if (!p.isActive) line.errors.push('Ürün satışa kapalı.');
    if (raw.isMaster && raw._count.variants > 0) line.errors.push('Bu ürünün varyantlarından birini seçin.');
    if (item.quantity <= 0) line.errors.push('Miktar girin.');

    const price = item.quantity > 0 ? unitPriceFor(p, item.quantity, ctx) : null;
    line.basePrice = price?.unit ?? null;
    line.priceSource = price?.source ?? null;
    if (item.manualPrice) {
      line.unitPrice = item.unitPrice;
      line.discountRate = line.basePrice > 0 ? Math.max(0, round2((1 - item.unitPrice / line.basePrice) * 100)) : 0;
    } else if (line.basePrice !== null) {
      line.unitPrice = round2(line.basePrice * (1 - item.discountRate / 100));
    } else if (item.quantity > 0) {
      line.errors.push(`${p.currency} kuru alınamadı; birim fiyatı elle girin.`);
    }
    line.lineTotal = line.unitPrice === null ? 0 : round2(line.unitPrice * item.quantity);

    if (raw.stock < item.quantity) line.notices.push(`Stok yetersiz (stok: ${raw.stock} ${p.unit}). Teklif stok ayırmaz.`);
    if (item.quantity > 0 && item.quantity < line.moq) line.notices.push(`Minimum sipariş miktarı ${line.moq} ${p.unit}.`);
    if (line.stepQuantity > 1 && item.quantity % line.stepQuantity !== 0) line.notices.push(`Satış ${line.stepQuantity} ${p.unit}'in katları şeklinde yapılıyor.`);

    // Onay gerekçeleri (iskonto, sistem fiyatına göre etkin indirim üzerinden ölçülür)
    const effective = line.basePrice > 0 && line.unitPrice !== null ? round2((1 - line.unitPrice / line.basePrice) * 100) : 0;
    line.effectiveDiscount = Math.max(0, effective);
    if (line.effectiveDiscount > limit) approvalReasons.push(`${name}: %${line.effectiveDiscount} iskonto (onaysız sınır %${limit})`);
    const cost = raw.costPrice ?? raw.parent?.costPrice;
    const costTRY = cost ? toTRY(cost, p.currency, ctx.rates) : null;
    line.belowCost = costTRY !== null && line.unitPrice !== null && line.unitPrice < round2(costTRY);
    if (line.belowCost) approvalReasons.push(`${name}: birim fiyat maliyetin altında`);
    return line;
  });

  const priced = lines.filter((l) => l.productId && l.unitPrice !== null);
  const totals = computeTotals(priced.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, vatRate: l.vatRate })), null);
  const listTotal = round2(priced.reduce((s, l) => s + (l.basePrice ?? l.unitPrice) * l.quantity, 0));
  return {
    lines,
    totals: { ...totals, listTotal, discountTotal: round2(Math.max(0, listTotal - totals.subtotal)) },
    approval: { reasons: [...new Set(approvalReasons)], limit }
  };
};

// Gönderimi engelleyen eksikler
export const sendBlockers = (lines, { validUntil } = {}) => {
  const out = [];
  if (!lines.length) out.push('Teklifte en az bir kalem olmalı.');
  const unmatched = lines.filter((l) => !l.productId).length;
  if (unmatched) out.push(`${unmatched} kalem katalogla eşleşmedi. Ürün seçin veya kalemi çıkarın.`);
  const review = lines.filter((l) => l.productId && l.matchStatus === 'REVIEW').length;
  if (review) out.push(`${review} kalem teyit bekliyor. Önerilen ürünü onaylayın veya değiştirin.`);
  for (const l of lines) for (const e of l.errors || []) out.push(`${l.name || l.requestText || 'Kalem'}: ${e}`);
  if (!validUntil) out.push('Geçerlilik tarihi girin.');
  else if (new Date(validUntil) < new Date()) out.push('Geçerlilik tarihi geçmiş olamaz.');
  return [...new Set(out)];
};

/**
 * İskonto / elle fiyat yetkisi. Yetkisi olmayan kullanıcı başka birinin girdiği fiyatı koruyabilir ama değiştiremez.
 */
export const assertPricingAllowed = (user, items, stored = []) => {
  if (canPrice(user)) return;
  const prev = new Map(stored.filter((s) => s.productId).map((s) => [s.productId, s]));
  for (const i of items) {
    if (!i.productId) continue;
    const old = prev.get(i.productId);
    const changed = i.manualPrice
      ? !(old?.manualPrice && round2(old.quotedPrice) === i.unitPrice)
      : i.discountRate > 0 && round2(old?.discountRate || 0) !== i.discountRate;
    if (changed) throw new QuoteError('Teklifte iskonto veya elle fiyat girme yetkiniz yok. Firma yöneticinizden "Teklif fiyatı" yetkisi isteyin.', 403, { code: 'NO_PERMISSION' });
  }
};

// Çalışma kopyasını kaydeder (kalemler baştan yazılır)
export const writeItems = async (tx, quoteId, lines) => {
  await tx.quoteRequestItem.deleteMany({ where: { quoteRequestId: quoteId } });
  if (!lines.length) return;
  await tx.quoteRequestItem.createMany({
    data: lines.map((l, idx) => ({
      quoteRequestId: quoteId,
      productId: l.productId || null,
      quantity: l.quantity || 0,
      variantLabel: l.variantLabel || null,
      sortOrder: idx,
      quotedPrice: l.unitPrice,
      basePrice: l.basePrice,
      discountRate: l.discountRate || 0,
      manualPrice: Boolean(l.manualPrice),
      vatRate: l.vatRate,
      requestText: l.requestText,
      matchStatus: l.productId ? l.matchStatus : 'UNMATCHED',
      matchReason: l.matchReason,
      warnings: l.warnings?.length ? l.warnings : undefined,
      alternatives: l.alternatives?.length ? l.alternatives : undefined
    }))
  });
};

// Kayıtlı kalemleri normalizeItems biçimine çevirir (yeniden fiyatlamak için)
export const itemsFromStored = (items) => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id).map((i) => ({
  productId: i.productId,
  quantity: i.quantity,
  discountRate: i.discountRate || 0,
  manualPrice: i.manualPrice,
  unitPrice: i.manualPrice ? i.quotedPrice : null,
  matchStatus: i.productId ? i.matchStatus : 'UNMATCHED',
  requestText: i.requestText,
  matchReason: i.matchReason,
  warnings: Array.isArray(i.warnings) ? i.warnings : [],
  alternatives: Array.isArray(i.alternatives) ? i.alternatives : []
}));

// Firma içinde benzersiz teklif numarası (eşzamanlı oluşturmada çakışırsa tekrar denenir)
export const createWithNumber = async (create) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const agg = await tx.quoteRequest.aggregate({ _max: { number: true } });
        return create(tx, (agg._max.number || 0) + 1);
      });
    } catch (error) {
      if (error.code !== 'P2002' || attempt === 4) throw error;
    }
  }
};

const sellerOf = (t) => ({
  name: t.name, address: t.address || null, taxOffice: t.taxOffice || null, taxNumber: t.taxNumber || null,
  phone: t.phone || null, email: t.contactEmail || null, logoUrl: t.logoUrl || null
});
const customerOf = (c) => ({
  name: c.name, authorizedPerson: c.authorizedPerson || null, address: c.address || null,
  taxOffice: c.taxOffice || null, taxNumber: c.taxNumber || null, phone: c.phone || null
});

/**
 * Müşteriye gönderilen sürümün değişmez kopyası. Maliyet, iç not, eşleştirme gerekçeleri ve
 * yapay zekâ değerlendirmeleri bilinçli olarak dahil edilmez.
 */
export const buildSnapshot = ({ quote, tenant, company, priced, preparedByName, revision }) => ({
  number: quote.number,
  code: quoteNo(quote),
  revision,
  title: quote.title || null,
  currency: quote.currency || 'TRY',
  issuedAt: new Date().toISOString(),
  validUntil: quote.validUntil ? new Date(quote.validUntil).toISOString() : null,
  paymentTerms: quote.paymentTerms || null,
  deliveryTerms: quote.deliveryTerms || null,
  note: quote.adminNote || null,
  preparedBy: preparedByName || null,
  seller: sellerOf(tenant),
  customer: customerOf(company),
  items: priced.lines.filter((l) => l.productId).map((l) => ({
    productId: l.productId, sku: l.sku, name: l.name, variantLabel: l.variantLabel || null,
    quantity: l.quantity, unit: l.unit, packInfo: l.packInfo || null,
    listPrice: l.basePrice ?? l.unitPrice, discountRate: l.effectiveDiscount ?? l.discountRate ?? 0,
    unitPrice: l.unitPrice, vatRate: l.vatRate, lineTotal: l.lineTotal
  })),
  totals: priced.totals
});

// Eski akışta (revizyon kaydı olmadan) fiyatlandırılmış teklifler için ilk okunuşta sürüm kopyası oluşturulur
export const ensureSentSnapshot = async (quote, tenant) => {
  if (quote.sentRevision || !['QUOTED', 'ACCEPTED', 'EXPIRED', 'REJECTED'].includes(quote.status)) return quote;
  const items = quote.items || await prisma.quoteRequestItem.findMany({ where: { quoteRequestId: quote.id } });
  if (!items.length || items.some((i) => i.quotedPrice === null || !i.productId)) return quote;
  const company = await prisma.company.findUnique({ where: { id: quote.companyId } });
  const priced = await priceQuoteLines(company, itemsFromStored(items.map((i) => ({ ...i, manualPrice: true }))));
  const snapshot = buildSnapshot({ quote, tenant, company, priced, revision: quote.revision });
  try {
    await prisma.$transaction([
      prisma.quoteRevision.create({ data: { quoteRequestId: quote.id, revision: quote.revision, snapshot, totalAmount: priced.totals.total } }),
      prisma.quoteRequest.update({ where: { id: quote.id }, data: { sentRevision: quote.revision, sentAt: quote.sentAt || quote.updatedAt } })
    ]);
  } catch (error) {
    if (error.code !== 'P2002') throw error;
  }
  return { ...quote, sentRevision: quote.revision };
};

export const latestSentRevision = (quote) => (quote.sentRevision
  ? prisma.quoteRevision.findUnique({ where: { quoteRequestId_revision: { quoteRequestId: quote.id, revision: quote.sentRevision } } })
  : null);

// Süresi geçen teklif okunurken kapatılır
export const expireIfNeeded = async (quote) => {
  if (quote.status === 'QUOTED' && quote.validUntil && new Date(quote.validUntil) < new Date()) {
    await prisma.quoteRequest.updateMany({ where: { id: quote.id, status: 'QUOTED' }, data: { status: 'EXPIRED' } });
    return { ...quote, status: 'EXPIRED' };
  }
  return quote;
};

/**
 * Müşterinin (bayi portalı ya da paylaşım bağlantısı) gördüğü teklif. Yalnızca gönderilmiş sürüm gösterilir;
 * personel yeni sürüm üzerinde çalışırken müşteri "revize ediliyor" görür ve kabul edemez.
 */
export const customerView = async (quote, tenant) => {
  quote = await ensureSentSnapshot(await expireIfNeeded(quote), tenant);
  const rev = await latestSentRevision(quote);
  const working = ['DRAFT', 'PENDING_APPROVAL', 'PENDING'].includes(quote.status);
  const status = working ? (rev ? 'REVISING' : 'PREPARING') : quote.status;
  return {
    id: quote.id,
    number: quote.number,
    code: quoteNo(quote),
    status,
    source: quote.source,
    createdAt: quote.createdAt,
    revision: rev?.revision ?? null,
    document: rev?.snapshot ?? null,
    canRespond: status === 'QUOTED' && Boolean(rev),
    response: quote.responseType ? { type: quote.responseType, note: quote.responseNote, by: quote.responseBy, at: quote.respondedAt } : null,
    order: quote.orderId ? { id: quote.orderId } : null,
    note: quote.note,
    // Bayinin kendi talebi: fiyatlandırılana kadar istediği ürünler (fiyatsız) gösterilir
    requestedItems: !rev && quote.source === 'DEALER' && quote.items
      ? quote.items.filter((i) => i.product).map((i) => ({ name: i.product.parent?.name || i.product.name, sku: i.product.sku, variantLabel: i.variantLabel, quantity: i.quantity, unit: i.product.unit }))
      : []
  };
};

// Paylaşım bağlantısı anahtarı: tahmin edilemez, özeti ile doğrulanır, iptal edilince geçersiz olur
export const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const newShareToken = () => {
  const token = crypto.randomBytes(24).toString('base64url');
  return { token, hash: tokenHash(token), enc: encrypt(token) };
};
export const shareTokenOf = (quote) => (quote.shareTokenEnc ? decrypt(quote.shareTokenEnc) : null);

/**
 * Müşteri yanıtı: yalnızca gönderilmiş son sürüm, QUOTED durumunda ve geçerlilik içinde yanıtlanabilir.
 * Eski sürüm üzerinden kabul (başka sekmede açık kalan eski teklif gibi) reddedilir.
 */
export const respondAsCustomer = async ({ quote, revision, type, note, by, via }) => {
  quote = await expireIfNeeded(quote);
  if (quote.status === 'EXPIRED') throw new QuoteError('Teklifin geçerlilik süresi dolmuş. Yeni teklif için firmayla iletişime geçin.', 409, { code: 'EXPIRED' });
  if (parseInt(revision) !== quote.sentRevision) throw new QuoteError('Bu teklifin daha yeni bir sürümü var. Sayfayı yenileyip güncel sürümü inceleyin.', 409, { code: 'STALE_REVISION' });
  if (quote.status !== 'QUOTED') throw new QuoteError('Bu teklif artık yanıtlanamaz.', 409, { code: 'NOT_OPEN' });

  const status = { ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED', REVISION_REQUESTED: 'QUOTED' }[type];
  const claimed = await prisma.quoteRequest.updateMany({
    where: { id: quote.id, status: 'QUOTED', sentRevision: quote.sentRevision, validUntil: quote.validUntil ? { gte: new Date() } : undefined },
    data: { status, responseType: type, responseNote: str(note, 1000), responseBy: str(by, 120), responseVia: via, respondedAt: new Date() }
  });
  if (claimed.count === 0) throw new QuoteError('Teklif bu sırada değişti veya yanıtlandı. Sayfayı yenileyin.', 409, { code: 'CONFLICT' });
  return { ...quote, status };
};

export const undoCustomerResponse = (quoteId) => prisma.quoteRequest.update({
  where: { id: quoteId },
  data: { status: 'QUOTED', responseType: null, responseNote: null, responseBy: null, responseVia: null, respondedAt: null }
});

/**
 * Kabul edilen teklifi siparişe dönüştürmeden önceki kontroller. Fiyatlar teklifteki gibi korunur.
 * Engeller (blockers) dönüştürmeyi durdurur; uyarılar (warnings) kullanıcı onayı ile geçilebilir.
 */
export const conversionCheck = async (quote, { paymentMethod }) => {
  const blockers = [];
  const warnings = [];
  const rev = await latestSentRevision(quote);
  if (quote.status !== 'ACCEPTED') blockers.push('Yalnızca müşterinin kabul ettiği teklif siparişe dönüştürülebilir.');
  if (quote.orderId || quote.convertedAt) blockers.push('Bu tekliften zaten sipariş oluşturuldu.');
  if (!rev) blockers.push('Teklifin gönderilmiş sürümü bulunamadı.');
  const company = await prisma.company.findUnique({ where: { id: quote.companyId } });
  if (!company || company.status !== 'ACTIVE') blockers.push('Müşteri hesabı aktif değil.');
  if (!rev || !company) return { blockers, warnings, rev, company };

  const items = rev.snapshot.items || [];
  const products = await loadOrderableProducts(prisma, items.map((i) => i.productId));
  for (const i of items) {
    const raw = products.get(i.productId);
    if (!raw) { blockers.push(`${i.name} (${i.sku}) katalogdan silinmiş.`); continue; }
    const p = effectiveProduct(raw, raw.parent);
    if (!p.isActive) warnings.push(`${i.name} (${i.sku}) şu an satışa kapalı.`);
    if (raw.stock < i.quantity) warnings.push(`${i.name} (${i.sku}): stok ${raw.stock} ${i.unit}, teklif ${i.quantity} ${i.unit}.`);
  }
  if (paymentMethod === 'CURRENT_ACCOUNT') {
    const { available } = await availableCredit(prisma, company);
    if (rev.snapshot.totals.total > available) warnings.push(`Müşterinin kullanılabilir risk limiti (₺${Math.max(0, available).toLocaleString('tr-TR')}) teklif tutarından düşük.`);
  }
  return { blockers, warnings, rev, company };
};

/**
 * Siparişe dönüştürür. Aynı tekliften ikinci sipariş oluşmaması için convertedAt kilidi atomik alınır.
 * createOrder: orderController.createOrderRecord (döngüsel içe aktarmayı önlemek için dışarıdan verilir)
 */
export const convertQuote = async ({ quote, userId, paymentMethod, shippingAddress, createOrder, rev }) => {
  const claimed = await prisma.quoteRequest.updateMany({
    where: { id: quote.id, status: 'ACCEPTED', orderId: null, convertedAt: null },
    data: { convertedAt: new Date() }
  });
  if (claimed.count === 0) throw new QuoteError('Bu teklif zaten siparişe dönüştürülüyor veya dönüştürüldü.', 409, { code: 'ALREADY_CONVERTED' });

  try {
    const lines = rev.snapshot.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, vatRate: i.vatRate, variantLabel: i.variantLabel }));
    const totals = computeTotals(lines, null);
    const company = await prisma.company.findUnique({ where: { id: quote.companyId } });
    const order = await createOrder({ company, userId, paymentMethod, lines, totals, coupon: null, shippingAddress });
    await prisma.quoteRequest.update({ where: { id: quote.id }, data: { orderId: order.id } });
    return order;
  } catch (error) {
    await prisma.quoteRequest.update({ where: { id: quote.id }, data: { convertedAt: null } });
    throw error;
  }
};
