/**
 * Toplu e-posta (Müşteriler → Toplu E-posta): bayiler, bayi olmayan müşteri carileri ve müşteri adayları seçilir;
 * e-postalar platformun SMTP sunucusundan, firmanın adıyla ve yanıtlar firmanın adresine gidecek şekilde gönderilir.
 *  - Gönderim arka planda, gönderim başına hızı ayarlı (BULK_MAIL_PER_MINUTE, varsayılan 120 / dk) ve firma başına günlük sınırlı
 *    (BULK_MAIL_DAILY_LIMIT, varsayılan 2000): platformun gönderici itibarı tüm firmaların ortak malı.
 *  - Alıcılar 20'lik partilerle alınır (FOR UPDATE SKIP LOCKED: iki süreç aynı kişiye göndermez). Sunucu yeniden
 *    başlarsa zamanlanmış iş bekleyenlerden devam eder; gönderilirken kalan alıcı "bilinmiyor" olarak hatalı sayılır
 *    (iki kez gitmesin diye yeniden denenmez).
 *  - Her e-postada abonelikten çıkma bağlantısı ve List-Unsubscribe başlıkları; çıkan adrese firmanın toplu e-postası
 *    bir daha gitmez (bildirim e-postaları ayrı). Ticari iletide ret hakkı yasal zorunluluk.
 */
import crypto from 'crypto';
import prisma, { basePrisma, runWithTenant, runAsPlatform } from '../utils/prisma.js';
import { API_PUBLIC_URL, JWT_SECRET } from '../config.js';
import { sendMail, smtpConfigured } from './mailService.js';
import { rowsByKeys, KEY_PREFIX, MAX_ROWS, emailOf } from './recipientService.js';
import { fillTemplate } from './bulkSmsService.js';

export const KINDS = { INFO: 'Bilgilendirme', COMMERCIAL: 'Ticari' };
export const MAX_SUBJECT = 150;
export const MAX_BODY = 10_000;
export const dailyLimit = () => parseInt(process.env.BULK_MAIL_DAILY_LIMIT) || 2000;
const perMinute = () => Math.max(1, parseInt(process.env.BULK_MAIL_PER_MINUTE) || 120);
const BATCH = 20;
const STALE_MS = 3 * 60 * 1000;

export class BulkMailError extends Error {}

// ─── Abonelikten çıkma bağlantısı (imzalı: firma + adres) ───────────────────
const sign = (payload) => crypto.createHmac('sha256', `${JWT_SECRET}:email-optout`).update(payload).digest('base64url').slice(0, 32);
export const optOutToken = (tenantId, email) => {
  const payload = Buffer.from(`${tenantId}:${email}`).toString('base64url');
  return `${payload}.${sign(payload)}`;
};
export const readOptOutToken = (token) => {
  const [payload, mac] = String(token || '').split('.');
  const given = Buffer.from(mac || '');
  if (!payload || given.length !== 32 || !crypto.timingSafeEqual(given, Buffer.from(sign(payload)))) return null;
  const [tenantId, ...rest] = Buffer.from(payload, 'base64url').toString().split(':');
  const email = emailOf(rest.join(':'));
  return Number.isInteger(+tenantId) && email ? { tenantId: +tenantId, email } : null;
};
export const optOutUrl = (tenantId, email) => `${API_PUBLIC_URL}/api/public/unsubscribe/${optOutToken(tenantId, email)}`;

/** Adres aboneliği bırakır (bağlantıdan; tekrar tıklanırsa değişmez) */
export const optOut = ({ tenantId, email }) => runAsPlatform(() => basePrisma.emailOptOut.upsert({
  where: { tenantId_email: { tenantId, email } }, update: {}, create: { tenantId, email }
}));

export const optedOutSet = async (emails) => new Set((await prisma.emailOptOut.findMany({ where: { email: { in: [...new Set(emails)] } }, select: { email: true } })).map((r) => r.email));

// ─── İçerik ─────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Düz metin → HTML: paragraflar, satır sonları, bağlantılar tıklanır
const bodyHtml = (text) => text.trim().split(/\n{2,}/).map((p) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${esc(p).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#986B47">$1</a>').replace(/\n/g, '<br>')}</p>`).join('');

export const renderMail = ({ tenant, kind, subject, body, row, email }) => {
  const filledSubject = fillTemplate(subject, row).slice(0, 200);
  const filledBody = fillTemplate(body, row);
  const url = optOutUrl(tenant.id, email);
  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#14283F">
    <p style="margin:0 0 20px;font-size:13px;font-weight:800;color:#986B47">${esc(tenant.name)}</p>
    ${bodyHtml(filledBody)}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px">
    <p style="font-size:12px;color:#94a3b8;margin:0">${kind === 'COMMERCIAL' ? 'Bu bir ticari iletidir. ' : ''}Bu e-postayı ${esc(tenant.name)} gönderdi.
      Toplu e-posta almak istemiyorsanız <a href="${url}" style="color:#94a3b8">abonelikten çıkın</a>.</p>
  </div>`;
  const text = `${filledBody}\n\n--\n${kind === 'COMMERCIAL' ? 'Bu bir ticari iletidir. ' : ''}${tenant.name} · Abonelikten çıkmak için: ${url}`;
  return {
    subject: filledSubject, html, text,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
  };
};

const deliver = async (tenant, mail, to) => {
  const res = await sendMail({ to, fromName: tenant.name, replyTo: tenant.contactEmail || undefined, ...mail });
  if (!res.delivered) throw new Error('E-posta sunucusu (SMTP) tanımlı değil');
};

const validate = ({ kind, subject, body }) => {
  if (!smtpConfigured()) throw new BulkMailError('E-posta sunucusu (SMTP) tanımlı değil; platform yöneticisine başvurun.');
  if (!KINDS[kind]) throw new BulkMailError('E-posta türünü seçin.');
  const s = String(subject || '').trim();
  const b = String(body || '').trim();
  if (!s) throw new BulkMailError('Konu yazın.');
  if (s.length > MAX_SUBJECT) throw new BulkMailError(`Konu en fazla ${MAX_SUBJECT} karakter olabilir.`);
  if (!b) throw new BulkMailError('E-posta metnini yazın.');
  if (b.length > MAX_BODY) throw new BulkMailError(`E-posta metni en fazla ${MAX_BODY.toLocaleString('tr-TR')} karakter olabilir.`);
  return { subject: s, body: b };
};

const tenantForSending = (tenantId) => runAsPlatform(() => basePrisma.tenant.findUnique({
  where: { id: tenantId }, select: { id: true, name: true, slug: true, contactEmail: true, customDomain: true, customDomainVerifiedAt: true }
}));

/** Bugün bu firmanın toplu e-postaya ayırdığı alıcı sayısı (İstanbul günü) */
const usedToday = async () => {
  const start = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })}T00:00:00+03:00`);
  return (await prisma.mailCampaign.aggregate({ where: { createdAt: { gte: start } }, _sum: { total: true } }))._sum.total || 0;
};
export const remainingToday = async () => Math.max(0, dailyLimit() - await usedToday());

/** Kendine deneme: ilk seçilen alıcının bilgileriyle (yoksa örnek) doldurulur, konuya [Deneme] eklenir */
export const sendTestMail = async ({ tenant, user, kind, subject, body, keys }) => {
  const v = validate({ kind, subject, body });
  const [row] = Array.isArray(keys) && keys.length ? await rowsByKeys(keys.slice(0, 1)) : [];
  const sample = row || { name: 'Örnek Firma', contact: 'Örnek Yetkili', balance: -1250, currency: 'TRY' };
  const mail = renderMail({ tenant, kind, ...v, row: sample, email: user.email });
  await deliver(tenant, { ...mail, subject: `[Deneme] ${mail.subject}` }, user.email);
  return user.email;
};

/**
 * Gönderimi oluşturur ve arka planda başlatır. Firma başına bir adres (önce ana kullanıcı) ya da hepsi; aboneliği
 * bırakanlar ve aynı adres elenir. Günlük sınır aşılıyorsa hiç başlamaz.
 */
export const createCampaign = async ({ tenant, userId, kind, subject, body, keys, allAddresses }) => {
  const v = validate({ kind, subject, body });
  if (!Array.isArray(keys) || !keys.length) throw new BulkMailError('Alıcı seçin.');
  const rows = await rowsByKeys(keys);
  const out = await optedOutSet(rows.flatMap((r) => r.emails));
  const seen = new Set();
  const recipients = [];
  for (const row of rows) {
    const usable = row.emails.filter((e) => !out.has(e));
    for (const email of allAddresses ? usable : usable.slice(0, 1)) {
      if (seen.has(email)) continue;
      seen.add(email);
      recipients.push({ source: row.source, sourceId: row.id, name: row.name, email });
    }
  }
  if (!recipients.length) throw new BulkMailError('Seçilenlerin hiçbirinde e-posta adresi yok (ya da abonelikten çıkmışlar).');
  if (recipients.length > MAX_ROWS) throw new BulkMailError(`Tek gönderimde en fazla ${MAX_ROWS} adres.`);
  const left = await remainingToday();
  if (recipients.length > left) throw new BulkMailError(`Günlük toplu e-posta sınırı ${dailyLimit().toLocaleString('tr-TR')} adres; bugün ${left.toLocaleString('tr-TR')} kaldı.`);

  const campaign = await prisma.mailCampaign.create({ data: { createdById: userId, kind, ...v, total: recipients.length } });
  await prisma.mailCampaignRecipient.createMany({ data: recipients.map((r) => ({ ...r, campaignId: campaign.id })) });
  setImmediate(() => processCampaign(tenant.id, campaign.id).catch((err) => console.error('[Toplu e-posta]', err.message)));
  return campaign;
};

const refreshCounts = async (campaignId, finished) => {
  const counts = Object.fromEntries((await prisma.mailCampaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: true })).map((r) => [r.status, r._count]));
  const done = finished && !counts.PENDING && !counts.SENDING;
  return prisma.mailCampaign.update({
    where: { id: campaignId },
    data: { sent: counts.SENT || 0, failed: counts.FAILED || 0, ...(done && { status: 'DONE', finishedAt: new Date() }) }
  });
};

/** Bekleyen alıcılara gönderir (bu ya da başka bir süreç; aynı alıcıyı yalnızca biri alır) */
export const processCampaign = (tenantId, campaignId) => runWithTenant(tenantId, async () => {
  const campaign = await prisma.mailCampaign.findFirst({ where: { id: campaignId, status: 'SENDING' } });
  if (!campaign) return;
  const tenant = await tenantForSending(tenantId);
  const gap = 60_000 / perMinute();
  for (;;) {
    const batch = await basePrisma.$queryRaw`
      UPDATE "MailCampaignRecipient" SET status = 'SENDING', "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "MailCampaignRecipient" WHERE "campaignId" = ${campaignId} AND status = 'PENDING'
        ORDER BY id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
      )
      RETURNING id, source, "sourceId", name, email`;
    if (!batch.length) break;
    // Kişiselleştirme bugünkü bilgilerle (bakiye vb.); bu arada abonelikten çıkan atlanır
    const rows = new Map((await rowsByKeys(batch.map((r) => `${KEY_PREFIX[r.source]}:${r.sourceId}`))).map((r) => [r.key, r]));
    const out = await optedOutSet(batch.map((r) => r.email));
    for (const r of batch) {
      const started = Date.now();
      let error = null;
      if (out.has(r.email)) error = 'Abonelikten çıktı';
      else {
        const row = rows.get(`${KEY_PREFIX[r.source]}:${r.sourceId}`) || { name: r.name, contact: r.name, balance: null };
        try {
          await deliver(tenant, renderMail({ tenant, kind: campaign.kind, subject: campaign.subject, body: campaign.body, row, email: r.email }), r.email);
        } catch (err) {
          error = String(err.message || err).slice(0, 300);
        }
      }
      await prisma.mailCampaignRecipient.update({ where: { id: r.id }, data: error ? { status: 'FAILED', error } : { status: 'SENT', sentAt: new Date() } });
      const wait = gap - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }
    await refreshCounts(campaignId, false); // updatedAt: gönderimin sürdüğünü gösterir
  }
  await refreshCounts(campaignId, true);
});

/**
 * Yarıda kalan gönderimler (sunucu yeniden başladı): 3 dakikadır ilerlemeyen gönderimde "gönderiliyor"da kalan alıcı
 * hatalı sayılır (gidip gitmediği bilinmez; tekrar gönderilmez), bekleyenlerden devam edilir. Zamanlanmış iş çağırır.
 */
export const resumeStaleCampaigns = async () => {
  const stale = new Date(Date.now() - STALE_MS);
  const campaigns = await runAsPlatform(() => basePrisma.mailCampaign.findMany({ where: { status: 'SENDING', updatedAt: { lt: stale } }, select: { id: true, tenantId: true } }));
  for (const c of campaigns) {
    await basePrisma.mailCampaignRecipient.updateMany({
      where: { campaignId: c.id, status: 'SENDING', updatedAt: { lt: stale } },
      data: { status: 'FAILED', error: 'Gönderim sırasında sunucu yeniden başladı; bu adrese gidip gitmediği bilinmiyor' }
    });
    await processCampaign(c.tenantId, c.id).catch((err) => console.error('[Toplu e-posta devam]', err.message));
  }
  return campaigns.length;
};

export const listMailCampaigns = () => prisma.mailCampaign.findMany({
  orderBy: { createdAt: 'desc' }, take: 200, include: { createdBy: { select: { name: true } } }
});
export const mailCampaignDetail = (id) => prisma.mailCampaign.findFirst({
  where: { id }, include: { createdBy: { select: { name: true } }, recipients: { orderBy: [{ status: 'asc' }, { name: 'asc' }] } }
});
