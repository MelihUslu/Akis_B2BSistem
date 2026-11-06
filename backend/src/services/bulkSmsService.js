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
import { smsActive, smsCreds } from './smsService.js';
import { formatMoney } from './money.js';
import { rowsByKeys, MAX_ROWS } from './recipientService.js';

export const KINDS = { INFO: 'Bilgilendirme', COMMERCIAL: 'Ticari (İYS)' };
export const OPTOUT_KEY = 'sms_optout_text';
export const MAX_RECIPIENTS = MAX_ROWS;
export const MAX_TEXT = 900;
const CHUNK = 500;

export class BulkSmsError extends Error {}

// SMS boyu (Türkçe karakterli): 155 karaktere kadar 1, uzunsa 150'şer karakterlik parçalar (yaklaşık; Netgsm böyle sayar)
export const smsParts = (text) => (text.length <= 155 ? 1 : Math.ceil(text.length / 150));

/** Kişiselleştirme: {ad} firma / kişi adı, {yetkili} yetkili kişi, {bakiye} cari bakiye (borçluysa "borç") */
export const fillTemplate = (template, row) => template
  .replace(/\{ad\}/g, row.name)
  .replace(/\{yetkili\}/g, row.contact || row.name)
  .replace(/\{bakiye\}/g, row.balance == null ? '' : `${formatMoney(Math.abs(row.balance), row.currency || 'TRY')}${row.balance < 0 ? ' borç' : row.balance > 0 ? ' alacak' : ''}`);

export const optOutText = async (tenantId) =>
  (await prisma.setting.findUnique({ where: { tenantId_key: { tenantId, key: OPTOUT_KEY } } }))?.value?.trim() || '';

/** Seçilen kayıtların numaraları (firma başına bir ya da hepsi); aynı numaraya bir kez */
const resolve = async (keys, allNumbers) => {
  const seen = new Set();
  const out = [];
  for (const row of await rowsByKeys(keys)) {
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
