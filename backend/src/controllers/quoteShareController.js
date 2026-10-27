import prisma from '../utils/prisma.js';
import { audit, clientIp } from '../services/auditService.js';
import { notifyAdmins, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';
import { QuoteError, quoteNo, tokenHash, customerView, respondAsCustomer } from '../services/quoteService.js';

/**
 * Teklif paylaşım bağlantısı (giriş gerektirmez). Bağlantıdaki anahtar tahmin edilemez; veritabanında
 * yalnızca özeti tutulur ve iptal edilince geçersiz olur. Müşteri yalnızca gönderilmiş son sürümü görür.
 * Kabul siparişe otomatik dönüşmez; personel kontrol edip siparişe dönüştürür.
 */

const findByToken = async (token) => {
  if (!token || String(token).length < 20 || String(token).length > 100) return null;
  return prisma.quoteRequest.findUnique({
    where: { shareTokenHash: tokenHash(token) },
    include: { items: { include: { product: { select: { name: true, sku: true, unit: true, parent: { select: { name: true } } } } } }, revisions: { orderBy: { revision: 'desc' }, take: 1 } }
  });
};

export const viewSharedQuote = async (req, res) => {
  const quote = await findByToken(req.params.token);
  if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı veya bağlantı iptal edilmiş.' });
  const view = await customerView(quote, req.tenant);
  if (!view.document) return res.status(404).json({ message: 'Teklif henüz paylaşıma hazır değil.' });
  // Bağlantı sahibi bayinin iç notunu ve sipariş bilgisini görmez
  const { note, order, requestedItems, ...rest } = view; // eslint-disable-line no-unused-vars
  res.json(rest);
};

const LABELS = { ACCEPTED: 'Müşteri teklifi kabul etti (bağlantı)', REJECTED: 'Müşteri teklifi reddetti (bağlantı)', REVISION_REQUESTED: 'Müşteri revizyon istedi (bağlantı)' };

export const respondSharedQuote = async (req, res) => {
  try {
    const type = ['ACCEPTED', 'REJECTED', 'REVISION_REQUESTED'].includes(req.body.type) ? req.body.type : null;
    if (!type) throw new QuoteError('Geçersiz yanıt.');
    const name = String(req.body.name || '').trim().slice(0, 120);
    const note = String(req.body.note || '').trim().slice(0, 1000);
    if (name.length < 2) throw new QuoteError('Adınızı ve soyadınızı yazın.');
    if (type === 'REVISION_REQUESTED' && !note) throw new QuoteError('Revizyon talebinde ne değişmesini istediğinizi yazın.');

    const quote = await findByToken(req.params.token);
    if (!quote) return res.status(404).json({ message: 'Teklif bulunamadı veya bağlantı iptal edilmiş.' });
    await respondAsCustomer({ quote, revision: req.body.revision, type, note, by: name, via: 'LINK' });

    audit({ tenantId: req.tenant.id, actorType: 'CUSTOMER', actorName: name, action: LABELS[type], method: req.method, path: '/api/quote-links/:token/respond', entity: 'quotes', entityId: quote.id, details: { revision: quote.sentRevision, note: note || undefined }, ip: clientIp(req) });
    const company = await prisma.company.findUnique({ where: { id: quote.companyId }, select: { name: true } });
    const title = { ACCEPTED: 'Teklif kabul edildi', REJECTED: 'Teklif reddedildi', REVISION_REQUESTED: 'Revizyon talebi' }[type];
    safeNotify(notifyAdmins({ type: 'QUOTE', title, message: `${company.name} · ${quoteNo(quote)} (${name})${note ? `: ${note}` : ''}`, link: `/admin/quotes/${quote.id}` }));
    if (type === 'ACCEPTED') emitEvent(req.tenant.id, 'quote.accepted', { id: quote.id, number: quote.number, revision: quote.sentRevision, companyId: quote.companyId, orderId: null });

    res.json({
      message: {
        ACCEPTED: 'Teklifi kabul ettiniz. Firma siparişinizi hazırlayıp sizinle iletişime geçecek.',
        REJECTED: 'Yanıtınız iletildi. Teşekkür ederiz.',
        REVISION_REQUESTED: 'Revizyon talebiniz iletildi. Güncel teklif hazırlandığında bu bağlantıdan görebilirsiniz.'
      }[type]
    });
  } catch (error) {
    if (error instanceof QuoteError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error('respondSharedQuote error:', error);
    res.status(400).json({ message: 'Yanıt iletilemedi.' });
  }
};
