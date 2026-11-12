import prisma from '../utils/prisma.js';
import { smsActive } from '../services/smsService.js';
import { KINDS, MAX_RECIPIENTS, MAX_TEXT, BulkSmsError, sendBulk, listCampaigns, campaignDetail, optOutText } from '../services/bulkSmsService.js';
import { SOURCES, listRecipients, filtersFromQuery } from '../services/recipientService.js';
import { STATUSES as LEAD_STATUSES, SOURCES as LEAD_SOURCES } from './customerLeadController.js';
import { DEALER_GROUPS } from './productController.js';

const fail = (res, error, fallback) => {
  if (error instanceof BulkSmsError) return res.status(400).json({ message: error.message });
  console.error('[Toplu SMS]', error);
  return res.status(500).json({ message: fallback });
};

// Ekranın süzgeç seçenekleri ve durum (SMS açık mı, ret metni, sınırlar)
export const bulkSmsMeta = async (req, res) => {
  try {
    const [tagRows, plasiyers, optOut] = await Promise.all([
      prisma.company.findMany({ where: { kind: { in: ['DEALER', 'CUSTOMER'] }, NOT: { tags: { isEmpty: true } } }, select: { tags: true } }),
      prisma.user.findMany({ where: { role: 'PLASIYER', isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      optOutText(req.tenant.id)
    ]);
    res.json({
      active: smsActive(req.tenant), kinds: KINDS, sources: SOURCES, optOut,
      tags: [...new Set(tagRows.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'tr')),
      groups: DEALER_GROUPS, plasiyers, leadStatuses: LEAD_STATUSES, leadSources: LEAD_SOURCES,
      limits: { recipients: MAX_RECIPIENTS, text: MAX_TEXT }
    });
  } catch (error) {
    fail(res, error, 'Toplu SMS bilgileri alınamadı.');
  }
};

export const bulkSmsRecipients = async (req, res) => {
  try {
    const source = Object.hasOwn(SOURCES, req.query.source) ? req.query.source : 'DEALER';
    const rows = await listRecipients(source, filtersFromQuery(req.query, { leadStatuses: LEAD_STATUSES, leadSources: LEAD_SOURCES }));
    res.json({ rows, withPhone: rows.filter((r) => r.phones.length).length });
  } catch (error) {
    fail(res, error, 'Alıcılar alınamadı.');
  }
};

export const sendBulkSms = async (req, res) => {
  try {
    const campaign = await sendBulk({ tenant: req.tenant, userId: req.user.id, kind: req.body.kind, text: req.body.text, keys: req.body.keys, allNumbers: req.body.allNumbers });
    res.locals.auditEntityId = campaign.id; // işlem kaydı (auditTrail)
    const message = campaign.failed === 0
      ? `${campaign.sent} numaraya gönderildi.`
      : campaign.sent === 0 ? `Gönderilemedi: ${campaign.error}` : `${campaign.sent} numaraya gönderildi, ${campaign.failed} numaraya gönderilemedi: ${campaign.error}`;
    res.status(campaign.sent ? 201 : 502).json({ message, campaign });
  } catch (error) {
    fail(res, error, 'Toplu SMS gönderilemedi.');
  }
};

export const bulkSmsCampaigns = async (req, res) => {
  try {
    res.json(await listCampaigns());
  } catch (error) {
    fail(res, error, 'Gönderim geçmişi alınamadı.');
  }
};

export const bulkSmsCampaign = async (req, res) => {
  try {
    const campaign = await campaignDetail(parseInt(req.params.id) || 0);
    if (!campaign) return res.status(404).json({ message: 'Gönderim bulunamadı.' });
    res.json(campaign);
  } catch (error) {
    fail(res, error, 'Gönderim alınamadı.');
  }
};
