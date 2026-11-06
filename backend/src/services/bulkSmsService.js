/**
 * Toplu SMS (Müşteriler → Toplu SMS): bayiler, bayi olmayan müşteri carileri ve müşteri adayları süzülür, seçilir,
 * firmanın Netgsm hesabıyla gönderilir. Her gönderim alıcılarıyla birlikte kaydedilir (geçmiş).
 *   INFO: bilgilendirme (bayram tatili, teslimat günü…); İYS süzgeci yok.
 *   COMMERCIAL: ticari (kampanya, yeni ürün…); Netgsm İYS süzgeciyle gider (cari: tacir, aday: bireysel), sonuna firmanın
 *   ret metni eklenir. İYS'de reddetmiş alıcıya Netgsm göndermez.
 * Numaralar her zaman sunucuda kayıtlardan çözülür (tarayıcıdan gelen numaraya güvenilmez).
 */
import prisma from '../utils/prisma.js';
import * as netgsm from './sms/netgsm.js';
import { smsActive, smsCreds, normalizePhone } from './smsService.js';
import { formatMoney } from './money.js';

export const SOURCES = { DEALER: 'Bayiler', CUSTOMER: 'Müşteriler', LEAD: 'Müşteri adayları' };
export const KINDS = { INFO: 'Bilgilendirme', COMMERCIAL: 'Ticari (İYS)' };
export const OPTOUT_KEY = 'sms_optout_text';
export const MAX_RECIPIENTS = 5000;
export const MAX_TEXT = 900;
const CHUNK = 500;
const KEY_PREFIX = { DEALER: 'D', CUSTOMER: 'C', LEAD: 'L' };

export class BulkSmsError extends Error {}

const mobile = (v) => { try { return normalizePhone(v); } catch { return null; } };
const uniq = (list) => [...new Set(list.filter(Boolean))];

// SMS boyu (Türkçe karakterli): 155 karaktere kadar 1, uzunsa 150'şer karakterlik parçalar (yaklaşık; Netgsm böyle sayar)
export const smsParts = (text) => (text.length <= 155 ? 1 : Math.ceil(text.length / 150));

/** Kişiselleştirme: {ad} firma / kişi adı, {yetkili} yetkili kişi, {bakiye} cari bakiye (borçluysa "borç") */
export const fillTemplate = (template, row) => template
  .replace(/\{ad\}/g, row.name)
  .replace(/\{yetkili\}/g, row.contact || row.name)
  .replace(/\{bakiye\}/g, row.balance == null ? '' : `${formatMoney(Math.abs(row.balance), row.currency || 'TRY')}${row.balance < 0 ? ' borç' : row.balance > 0 ? ' alacak' : ''}`);

export const optOutText = async (tenantId) =>
  (await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: OPTOUT_KEY } } }))?.value?.trim() || '';

// Cari (bayi ya da müşteri) satırları. Numara sırası: portal kullanıcıları (önce ana kullanıcı), yetkili kişiler
// (önce birincil), carinin telefonu; yalnızca cep telefonları
const companyRows = async (kind, f = {}) => {
  const companies = await prisma.company.findMany({
    where: {
      kind,
      ...(kind === 'DEALER' ? { status: 'ACTIVE' } : { status: { not: 'PASSIVE' } }),
      ...(f.ids && { id: { in: f.ids } }),
      ...(f.q && { name: { contains: f.q, mode: 'insensitive' } }),
      ...(f.tag && { tags: { has: f.tag } }),
      ...(f.group && { dealerGroup: f.group }),
      ...(f.plasiyerId && { plasiyerId: f.plasiyerId }),
      ...(f.debtOnly && { currentBalance: { lt: 0 } })
    },
    select: {
      id: true, name: true, authorizedPerson: true, phone: true, tags: true, dealerGroup: true, currentBalance: true, currency: true,
      plasiyer: { select: { name: true } },
      users: { where: { role: 'BAYI', isActive: true, phone: { not: null } }, select: { name: true, phone: true }, orderBy: [{ isOwner: 'desc' }, { id: 'asc' }] },
      contacts: { select: { name: true, phone: true }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] }
    },
    orderBy: { name: 'asc' },
    take: MAX_RECIPIENTS
  });
  const last = new Map((await prisma.order.groupBy({
    by: ['companyId'], where: { companyId: { in: companies.map((c) => c.id) }, status: { not: 'CANCELLED' } }, _max: { createdAt: true }
  })).map((r) => [r.companyId, r._max.createdAt]));
  const cutoff = f.noOrderDays ? Date.now() - f.noOrderDays * 864e5 : null;
  return companies
    .map((c) => ({
      key: `${KEY_PREFIX[kind]}:${c.id}`, source: kind, id: c.id, name: c.name,
      contact: c.users[0]?.name || c.contacts[0]?.name || c.authorizedPerson || '',
      phones: uniq([...c.users.map((u) => u.phone), ...c.contacts.map((x) => mobile(x.phone)), mobile(c.phone)]),
      tags: c.tags, group: kind === 'DEALER' ? c.dealerGroup : null, plasiyer: c.plasiyer?.name || null,
      balance: c.currentBalance, currency: c.currency, lastOrderAt: last.get(c.id) || null
    }))
    .filter((r) => !cutoff || !r.lastOrderAt || r.lastOrderAt.getTime() < cutoff);
};

const leadRows = async (f = {}) => {
  const leads = await prisma.customerLead.findMany({
    where: {
      ...(f.ids && { id: { in: f.ids } }),
      ...(f.q && { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { phone: { contains: f.q } }] }),
      ...(f.status && { status: f.status }),
      ...(f.leadSource && { source: f.leadSource }),
      ...(f.city && { city: { contains: f.city, mode: 'insensitive' } })
    },
    select: { id: true, name: true, phone: true, city: true, source: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_RECIPIENTS
  });
  return leads.map((l) => ({
    key: `L:${l.id}`, source: 'LEAD', id: l.id, name: l.name || l.phone, contact: l.name, phones: uniq([mobile(l.phone)]),
    city: l.city, leadSource: l.source, status: l.status, createdAt: l.createdAt, balance: null
  }));
};

/** Seçim ekranı: kaynağa ve süzgeçlere göre adaylar (telefonu olmayanlar da gelir, seçilemez) */
export const listRecipients = (source, filters) => (source === 'LEAD' ? leadRows(filters) : companyRows(source, filters));

/** "D:12", "C:5", "L:9" anahtarlarından alıcılar (numaralar kayıtlardan); aynı numaraya bir kez */
const resolve = async (keys, allNumbers) => {
  const ids = { DEALER: [], CUSTOMER: [], LEAD: [] };
  const byPrefix = Object.fromEntries(Object.entries(KEY_PREFIX).map(([k, p]) => [p, k]));
  for (const key of keys) {
    const [p, id] = String(key).split(':');
    if (byPrefix[p] && Number.isInteger(+id)) ids[byPrefix[p]].push(+id);
  }
  const rows = [
    ...(ids.DEALER.length ? await companyRows('DEALER', { ids: ids.DEALER }) : []),
    ...(ids.CUSTOMER.length ? await companyRows('CUSTOMER', { ids: ids.CUSTOMER }) : []),
    ...(ids.LEAD.length ? await leadRows({ ids: ids.LEAD }) : [])
  ];
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    for (const phone of allNumbers ? row.phones : row.phones.slice(0, 1)) {
      if (seen.has(phone)) continue;
      seen.add(phone);
      out.push({ ...row, phone });
    }
  }
  return out;
};

/**
 * Gönderim: { kind, text, keys, allNumbers } → kayıt { id, total, sent, failed }. Netgsm'e 500'lük partilerle gider;
 * başarısız parti diğerlerini durdurmaz, alıcının satırına hata yazılır.
 */
export const sendBulk = async ({ tenant, userId, kind, text, keys, allNumbers }) => {
  if (!smsActive(tenant)) throw new BulkSmsError('SMS kapalı ya da Netgsm bağlı değil (Ayarlar → SMS).');
  if (!KINDS[kind]) throw new BulkSmsError('Mesaj türünü seçin.');
  const template = String(text || '').trim();
  if (!template) throw new BulkSmsError('Mesaj metnini yazın.');
  if (template.length > MAX_TEXT) throw new BulkSmsError(`Mesaj en fazla ${MAX_TEXT} karakter olabilir.`);
  const optOut = kind === 'COMMERCIAL' ? await optOutText(tenant.id) : '';
  if (kind === 'COMMERCIAL' && !optOut) throw new BulkSmsError('Ticari SMS için ret metni gerekli (Ayarlar → SMS).');
  if (!Array.isArray(keys) || !keys.length) throw new BulkSmsError('Alıcı seçin.');

  const recipients = await resolve(keys, allNumbers === true);
  if (!recipients.length) throw new BulkSmsError('Seçilenlerin hiçbirinde cep telefonu yok.');
  if (recipients.length > MAX_RECIPIENTS) throw new BulkSmsError(`Tek gönderimde en fazla ${MAX_RECIPIENTS} numara.`);

  const messages = recipients.map((r) => ({ ...r, msg: optOut ? `${fillTemplate(template, r)} ${optOut}` : fillTemplate(template, r) }));
  const creds = smsCreds(tenant);
  // Ticari: cari tacir, aday bireysel (İYS süzgeci istek başına) → ayrı istekler
  const groups = kind === 'COMMERCIAL'
    ? [[netgsm.IYS_FILTER.MERCHANT, messages.filter((m) => m.source !== 'LEAD')], [netgsm.IYS_FILTER.INDIVIDUAL, messages.filter((m) => m.source === 'LEAD')]]
    : [[null, messages]];
  const results = new Map();
  let lastError = null;
  for (const [iysfilter, list] of groups) {
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      try {
        await netgsm.sendSms(creds, chunk.map((m) => ({ no: m.phone, msg: m.msg })), { iysfilter });
        chunk.forEach((m) => results.set(m.phone, null));
      } catch (error) {
        lastError = error.message;
        chunk.forEach((m) => results.set(m.phone, error.message));
      }
    }
  }

  const sent = [...results.values()].filter((e) => !e).length;
  const campaign = await prisma.smsCampaign.create({
    data: {
      createdById: userId, kind, text: template, total: messages.length, sent, failed: messages.length - sent,
      parts: Math.max(...messages.map((m) => smsParts(m.msg))), error: lastError
    }
  });
  await prisma.smsCampaignRecipient.createMany({
    data: messages.map((m) => ({ campaignId: campaign.id, source: m.source, sourceId: m.id, name: m.name, phone: m.phone, ok: !results.get(m.phone), error: results.get(m.phone) || null }))
  });
  return campaign;
};

export const listCampaigns = () => prisma.smsCampaign.findMany({
  orderBy: { createdAt: 'desc' }, take: 200, include: { createdBy: { select: { name: true } } }
});
export const campaignDetail = (id) => prisma.smsCampaign.findFirst({
  where: { id }, include: { createdBy: { select: { name: true } }, recipients: { orderBy: [{ ok: 'asc' }, { name: 'asc' }] } }
});
