import prisma, { basePrisma, runAsPlatform } from '../utils/prisma.js';
import { smtpConfigured } from '../services/mailService.js';
import { SOURCES, listRecipients, filtersFromQuery, MAX_ROWS } from '../services/recipientService.js';
import {
  KINDS, MAX_SUBJECT, MAX_BODY, BulkMailError, dailyLimit, remainingToday, optedOutSet, sendTestMail, createCampaign,
  listMailCampaigns, mailCampaignDetail, readOptOutToken, optOut
} from '../services/bulkMailService.js';
import { STATUSES as LEAD_STATUSES, SOURCES as LEAD_SOURCES } from './customerLeadController.js';
import { DEALER_GROUPS } from './productController.js';

const fail = (res, error, fallback) => {
  if (error instanceof BulkMailError) return res.status(400).json({ message: error.message });
  console.error('[Toplu e-posta]', error);
  return res.status(500).json({ message: fallback });
};

// Ekranın süzgeç seçenekleri ve durum (SMTP, günlük kalan, yanıt adresi)
export const bulkMailMeta = async (req, res) => {
  try {
    const [tagRows, plasiyers, left, optOuts] = await Promise.all([
      prisma.company.findMany({ where: { kind: { in: ['DEALER', 'CUSTOMER'] }, NOT: { tags: { isEmpty: true } } }, select: { tags: true } }),
      prisma.user.findMany({ where: { role: 'PLASIYER', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      remainingToday(),
      prisma.emailOptOut.count()
    ]);
    res.json({
      active: smtpConfigured(), kinds: KINDS, sources: SOURCES, replyTo: req.tenant.contactEmail || null,
      tags: [...new Set(tagRows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'tr')),
      groups: DEALER_GROUPS, plasiyers, leadStatuses: LEAD_STATUSES, leadSources: LEAD_SOURCES,
      limits: { recipients: MAX_ROWS, subject: MAX_SUBJECT, body: MAX_BODY, daily: dailyLimit(), remaining: left },
      optOuts
    });
  } catch (error) {
    fail(res, error, 'Toplu e-posta bilgileri alınamadı.');
  }
};

export const bulkMailRecipients = async (req, res) => {
  try {
    const source = Object.hasOwn(SOURCES, req.query.source) ? req.query.source : 'DEALER';
    const rows = await listRecipients(source, filtersFromQuery(req.query, { leadStatuses: LEAD_STATUSES, leadSources: LEAD_SOURCES }));
    const out = await optedOutSet(rows.flatMap((r) => r.emails));
    const withOut = rows.map(({ phones, ...r }) => ({ ...r, optedOut: r.emails.filter((e) => out.has(e)) })); // eslint-disable-line no-unused-vars
    res.json({ rows: withOut, withEmail: withOut.filter((r) => r.emails.length > r.optedOut.length).length });
  } catch (error) {
    fail(res, error, 'Alıcılar alınamadı.');
  }
};

export const sendBulkMailTest = async (req, res) => {
  try {
    // Gövdeden yalnızca içerik alınır: firma ve alıcı (deneme kendi adresine) oturumdan gelir
    const { kind, subject, body, keys } = req.body || {};
    const to = await sendTestMail({ kind, subject, body, keys, tenant: req.tenant, user: req.user });
    res.json({ message: `Deneme e-postası ${to} adresine gönderildi.` });
  } catch (error) {
    fail(res, error, 'Deneme e-postası gönderilemedi.');
  }
};

export const sendBulkMail = async (req, res) => {
  try {
    const campaign = await createCampaign({ tenant: req.tenant, userId: req.user.id, kind: req.body.kind, subject: req.body.subject, body: req.body.body, keys: req.body.keys, allAddresses: req.body.allAddresses === true });
    res.locals.auditEntityId = campaign.id; // işlem kaydı (auditTrail)
    res.status(202).json({ message: `${campaign.total} adrese gönderim başladı; ilerlemeyi Geçmiş'te görebilirsiniz.`, campaign });
  } catch (error) {
    fail(res, error, 'Toplu e-posta başlatılamadı.');
  }
};

export const bulkMailCampaigns = async (req, res) => {
  try {
    res.json(await listMailCampaigns());
  } catch (error) {
    fail(res, error, 'Gönderim geçmişi alınamadı.');
  }
};

export const bulkMailCampaign = async (req, res) => {
  try {
    const campaign = await mailCampaignDetail(parseInt(req.params.id) || 0);
    if (!campaign) return res.status(404).json({ message: 'Gönderim bulunamadı.' });
    res.json(campaign);
  } catch (error) {
    fail(res, error, 'Gönderim alınamadı.');
  }
};

// ─── Abonelikten çıkma (herkese açık, e-postadaki bağlantı) ──────────────────
const page = (title, text) => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head><body style="font-family:Inter,Arial,sans-serif;background:#f5f7fa;color:#14283F;margin:0;padding:48px 16px">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 4px 24px rgba(20,40,63,.08)">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1><p style="margin:0;line-height:1.6;color:#475569">${text}</p></div></body></html>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const unsubscribe = async (req, res) => {
  const data = readOptOutToken(req.params.token);
  if (!data) {
    return req.method === 'POST' ? res.status(400).end() : res.status(400).type('html').send(page('Bağlantı geçersiz', 'Bu abonelikten çıkma bağlantısı geçerli değil. E-postadaki bağlantıyı yeniden açmayı deneyin.'));
  }
  try {
    const tenant = await runAsPlatform(() => basePrisma.tenant.findUnique({ where: { id: data.tenantId }, select: { name: true } }));
    if (!tenant) return req.method === 'POST' ? res.status(404).end() : res.status(404).type('html').send(page('Bağlantı geçersiz', 'Bu firma artık bulunmuyor.'));
    await optOut(data);
    if (req.method === 'POST') return res.status(200).end(); // e-posta istemcisinin "tek tıkla çık" isteği
    res.type('html').send(page('Abonelikten çıktınız', `${esc(tenant.name)} firmasının toplu e-postaları <b>${esc(data.email)}</b> adresine artık gönderilmeyecek. Sipariş, ödeme gibi hesap bildirimleri bundan etkilenmez.`));
  } catch (error) {
    console.error('[Abonelikten çıkma]', error);
    res.status(500).type('html').send(page('Bir sorun oluştu', 'İşlem yapılamadı. Lütfen biraz sonra tekrar deneyin.'));
  }
};
