import crypto from 'crypto';
import dns from 'dns/promises';
import bcrypt from 'bcrypt';
import prisma, { runAsPlatform } from '../utils/prisma.js';
import { ROOT_DOMAIN } from '../config.js';
import { invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { exportTenantWorkbook } from '../services/tenantDataService.js';
import { sendPlatformAlert } from '../services/mailService.js';
import * as iyzico from '../services/iyzicoService.js';
import { searchArticles, getArticle, articleFeedback } from '../services/helpService.js';

const DAY = 24 * 60 * 60 * 1000;
export const CUSTOM_DOMAIN_TARGET = () => process.env.CUSTOM_DOMAIN_TARGET || `custom.${ROOT_DOMAIN}`;

// ─── İşlem kaydı ─────────────────────────────────────────────────────────────

export const listAuditLogs = async (req, res) => {
  const take = Math.min(parseInt(req.query.limit) || 50, 200);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const q = String(req.query.q || '').trim();
  const where = {
    tenantId: req.tenant.id,
    ...(q && { OR: [{ action: { contains: q, mode: 'insensitive' } }, { actorName: { contains: q, mode: 'insensitive' } }] })
  };
  const [data, total] = await runAsPlatform(() => Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip: (page - 1) * take }),
    prisma.auditLog.count({ where })
  ]));
  res.json({ data, pagination: { total, page, pages: Math.max(1, Math.ceil(total / take)) } });
};

// ─── Duyurular (platformdan) ─────────────────────────────────────────────────

export const activeAnnouncements = async (req, res) => {
  const now = new Date();
  const list = await prisma.announcement.findMany({
    where: {
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      AND: [{ OR: [{ planCode: null }, { planCode: req.tenant.plan?.code }] }]
    },
    orderBy: { startsAt: 'desc' },
    take: 5
  });
  res.json(list);
};

// ─── Destek talepleri (firma → platform) ─────────────────────────────────────

import { SLA_HOURS, dueDate, cleanAttachments, buildContext } from '../services/supportService.js';
import { localDay } from '../utils/dates.js';

const TICKET_CATEGORIES = ['TECHNICAL', 'BILLING', 'FEATURE', 'USAGE', 'OTHER'];

export const supportMeta = (req, res) => res.json({ slaHours: SLA_HOURS });

export const listTickets = async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    include: { user: { select: { name: true } }, _count: { select: { messages: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, authorType: true, authorName: true, createdAt: true } } },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(tickets);
};

export const getTicket = async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { user: { select: { name: true } }, messages: { orderBy: { createdAt: 'asc' } } }
  });
  if (!ticket) return res.status(404).json({ message: 'Talep bulunamadı.' });
  res.json(ticket);
};

export const createTicket = async (req, res) => {
  const subject = String(req.body.subject || '').trim();
  const body = String(req.body.body || '').trim();
  if (subject.length < 3 || body.length < 10) return res.status(400).json({ message: 'Konu ve en az 10 karakterlik açıklama girin.' });
  const priority = req.body.priority === 'HIGH' ? 'HIGH' : 'NORMAL';
  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        subject: subject.slice(0, 200),
        priority,
        category: TICKET_CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER',
        context: buildContext(req),
        dueAt: dueDate(priority),
        userId: req.user.id
      }
    });
    await tx.supportMessage.create({ data: { ticketId: t.id, authorType: 'TENANT', authorName: req.user.name, body: body.slice(0, 5000), attachments: cleanAttachments(req.body.attachments) } });
    return t;
  });
  sendPlatformAlert({ subject: `Destek talebi #${ticket.id}: ${subject}`, text: `${req.tenant.name} · ${req.user.name}: ${body.slice(0, 500)}` }).catch(() => {});
  res.status(201).json({ message: 'Destek talebiniz alındı. Yanıtlandığında bildirim alacaksınız.', ticket });
};

export const replyTicket = async (req, res) => {
  const body = String(req.body.body || '').trim();
  const attachments = cleanAttachments(req.body.attachments);
  if (!body && !attachments) return res.status(400).json({ message: 'Mesaj boş olamaz.' });
  const ticket = await prisma.supportTicket.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!ticket) return res.status(404).json({ message: 'Talep bulunamadı.' });
  // Firma yazınca talep yeniden platformun sırasına girer; hedef süre (yoksa) yeniden başlar
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: ticket.id, authorType: 'TENANT', authorName: req.user.name, body: body.slice(0, 5000), attachments } }),
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN', ...(ticket.status !== 'OPEN' || !ticket.dueAt ? { dueAt: dueDate(ticket.priority) } : {}) } })
  ]);
  sendPlatformAlert({ subject: `Destek talebi #${ticket.id} yeni mesaj`, text: `${req.tenant.name}: ${body.slice(0, 500)}` }).catch(() => {});
  res.json({ message: 'Mesajınız iletildi.' });
};

export const closeTicket = async (req, res) => {
  await prisma.supportTicket.updateMany({ where: { id: parseInt(req.params.id) }, data: { status: 'CLOSED', dueAt: null } });
  res.json({ message: 'Talep kapatıldı.' });
};

// ─── Özel alan adı ───────────────────────────────────────────────────────────

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
// İki parçalı uzantılar: akishirdavat.com.tr de "alan adının tamamı" sayılır
const SECOND_LEVEL = new Set(['com.tr', 'net.tr', 'org.tr', 'gen.tr', 'web.tr', 'biz.tr', 'info.tr', 'tv.tr', 'bel.tr', 'av.tr', 'dr.tr', 'co.uk', 'org.uk', 'com.de', 'com.cy']);
export const isApexDomain = (domain) => {
  const parts = domain.split('.');
  return parts.length === 2 || (parts.length === 3 && SECOND_LEVEL.has(parts.slice(1).join('.')));
};

// Alan adının tamamı (A kaydı) için sunucu IP'si: CUSTOM_DOMAIN_IP, yoksa CNAME hedefinin IP'leri
const resolver = new dns.Resolver({ timeout: 2500, tries: 1 });
const serverIps = async () => {
  const fixed = String(process.env.CUSTOM_DOMAIN_IP || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  try { return await resolver.resolve4(CUSTOM_DOMAIN_TARGET()); } catch { return []; }
};

// DNS'in sunucuya yönlenip yönlenmediği (doğrulanmış alan adı için bilgi amaçlı)
const checkRouting = async (domain, ips) => {
  if (!ips.length) return null;
  const pointsHere = async (host) => {
    try { return (await resolver.resolve4(host)).some((ip) => ips.includes(ip)); } catch { return false; }
  };
  return pointsHere(domain);
};

const domainView = async (t, { routing = false } = {}) => {
  const apex = Boolean(t.customDomain && t.customDomainApex);
  const ips = apex || (routing && t.customDomainVerifiedAt) ? await serverIps() : [];
  const records = [];
  if (t.customDomain) {
    if (apex) {
      records.push({ type: 'A', host: '@', name: t.customDomain, value: ips[0] || null });
      records.push({ type: 'CNAME', host: 'www', name: `www.${t.customDomain}`, value: CUSTOM_DOMAIN_TARGET() });
    } else {
      records.push({ type: 'CNAME', host: t.customDomain.split('.')[0], name: t.customDomain, value: CUSTOM_DOMAIN_TARGET() });
    }
    if (!t.customDomainVerifiedAt) records.push({ type: 'TXT', host: apex ? '_akisb2b' : `_akisb2b.${t.customDomain.split('.')[0]}`, name: `_akisb2b.${t.customDomain}`, value: t.customDomainToken });
  }
  return {
    domain: t.customDomain,
    mode: apex ? 'root' : 'subdomain',
    verified: Boolean(t.customDomainVerifiedAt),
    verifiedAt: t.customDomainVerifiedAt,
    records,
    txtName: t.customDomain ? `_akisb2b.${t.customDomain}` : null,
    txtValue: t.customDomainToken,
    cnameTarget: CUSTOM_DOMAIN_TARGET(),
    // true: sunucuya yönleniyor · false: henüz yönlenmiyor · null: kontrol edilmedi
    routed: routing && t.customDomainVerifiedAt ? await checkRouting(t.customDomain, ips) : null,
    allowed: Boolean(t.plan?.allowCustomDomain)
  };
};

export const getDomain = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, include: { plan: true } });
  res.json(await domainView(tenant, { routing: true }));
};

export const setDomain = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, include: { plan: true } });
  if (!tenant.plan.allowCustomDomain) return res.status(403).json({ message: `Özel alan adı ${tenant.plan.name} paketinde yok. Paketinizi yükseltin.` });
  const domain = String(req.body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const apex = req.body.mode === 'root';
  if (!DOMAIN_RE.test(domain)) return res.status(400).json({ message: `Geçerli bir alan adı girin (örn. ${apex ? 'firmaniz.com' : 'b2b.firmaniz.com'}).` });
  if (domain === ROOT_DOMAIN || domain.endsWith(`.${ROOT_DOMAIN}`)) return res.status(400).json({ message: 'Platformun kendi alan adı kullanılamaz.' });
  if (apex && !isApexDomain(domain)) {
    return res.status(400).json({ message: `${domain} bir alt alan adı. Alan adının tamamı için başında ek olmadan yazın (örn. firmaniz.com) ya da "Alt alan adı" seçeneğini kullanın.` });
  }
  if (!apex && isApexDomain(domain)) {
    return res.status(400).json({ message: `${domain} alan adının tamamı. Başına b2b. gibi bir ek yazın ya da "Alan adının tamamı" seçeneğini kullanın.` });
  }
  if (!apex && domain.startsWith('www.')) {
    return res.status(400).json({ message: 'www ile başlayan adres için "Alan adının tamamı" seçeneğini kullanın; www adresi kendiliğinden yönlenir.' });
  }
  try {
    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { customDomain: domain, customDomainApex: apex, customDomainToken: `akisb2b-verify=${crypto.randomBytes(12).toString('hex')}`, customDomainVerifiedAt: null },
      include: { plan: true }
    });
    invalidateTenantCache();
    res.json({ message: 'Alan adı kaydedildi. DNS kayıtlarını ekleyip "Doğrula"ya basın.', ...(await domainView(updated)) });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ message: 'Bu alan adı başka bir firmada kullanılıyor.' });
    throw error;
  }
};

// DNS'teki TXT kaydı ile alan adının firmaya ait olduğu doğrulanır
export const verifyDomain = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, include: { plan: true } });
  if (!tenant.customDomain) return res.status(400).json({ message: 'Önce alan adı girin.' });
  let records = [];
  try {
    records = (await dns.resolveTxt(`_akisb2b.${tenant.customDomain}`)).map(r => r.join(''));
  } catch {
    return res.status(400).json({ message: `_akisb2b.${tenant.customDomain} TXT kaydı bulunamadı. DNS değişikliklerinin yayılması birkaç dakika sürebilir.` });
  }
  if (!records.includes(tenant.customDomainToken)) {
    return res.status(400).json({ message: 'TXT kaydı bulundu ama değer eşleşmiyor. Ekrandaki değeri birebir girin.' });
  }
  const updated = await prisma.tenant.update({ where: { id: tenant.id }, data: { customDomainVerifiedAt: new Date() }, include: { plan: true } });
  invalidateTenantCache();
  const view = await domainView(updated, { routing: true });
  const message = view.routed === false
    ? `${tenant.customDomain} doğrulandı ama ${tenant.customDomainApex ? 'A' : 'CNAME'} kaydı henüz sunucumuza yönlenmiyor. Kayıt yayıldığında portalınız bu adreste açılır.`
    : `${tenant.customDomain} doğrulandı. Portalınız https://${tenant.customDomain} adresinde açılır.`;
  res.json({ message, ...view });
};

export const removeDomain = async (req, res) => {
  const updated = await prisma.tenant.update({ where: { id: req.tenant.id }, data: { customDomain: null, customDomainApex: false, customDomainToken: null, customDomainVerifiedAt: null }, include: { plan: true } });
  invalidateTenantCache();
  res.json({ message: 'Özel alan adı kaldırıldı.', ...(await domainView(updated)) });
};

// ─── Veri dışa aktarma ve hesap kapatma (KVKK) ───────────────────────────────

export const exportData = async (req, res) => {
  const { buffer, tenant } = await exportTenantWorkbook(req.tenant.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${tenant.slug}-tum-veriler-${localDay()}.xlsx"`);
  res.send(buffer);
};

/**
 * Hesap kapatma: sadece firma sahibi, şifresi ve firma adresini yazarak yapabilir.
 * Erişim hemen kapanır, aboneliğin yenilemesi durur; veriler 30 gün sonra kalıcı silinebilir.
 */
export const closeAccount = async (req, res) => {
  if (!req.user.isOwner) return res.status(403).json({ message: 'Hesabı sadece firma sahibi kapatabilir.' });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(String(req.body.password || ''), user.password))) return res.status(400).json({ message: 'Şifre hatalı.' });
  if (String(req.body.confirm || '').trim().toLowerCase() !== req.tenant.slug) {
    return res.status(400).json({ message: `Onay için firma adresinizi (${req.tenant.slug}) yazın.` });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } });
  if (tenant.iyzicoSubscriptionRef) await iyzico.cancelSubscription(tenant.iyzicoSubscriptionRef).catch(() => {});
  const now = new Date();
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status: 'CANCELLED', closedAt: now, deletionScheduledAt: new Date(now.getTime() + 30 * DAY), iyzicoSubscriptionRef: null, cancelAtPeriodEnd: true }
  });
  invalidateTenantCache(tenant.slug);
  sendPlatformAlert({ subject: 'Hesap kapatma talebi', text: `${tenant.name} (${tenant.slug}) hesabını kapattı. Veriler ${new Date(now.getTime() + 30 * DAY).toLocaleDateString('tr-TR')} sonrası silinebilir.` }).catch(() => {});
  res.json({ message: 'Hesabınız kapatıldı. 30 gün içinde platform yöneticisine başvurarak geri açtırabilirsiniz; sonrasında verileriniz kalıcı olarak silinir.' });
};

// ─── Yardım merkezi ve memnuniyet puanı ─────────────────────────────────────

export const helpList = async (req, res) => {
  res.json(await searchArticles({ q: String(req.query.q || '').slice(0, 300), category: String(req.query.category || ''), limit: Math.min(Number(req.query.limit) || 30, 50) }));
};

export const helpGet = async (req, res) => {
  const article = await getArticle(parseInt(req.params.id));
  if (!article) return res.status(404).json({ message: 'Yazı bulunamadı.' });
  res.json(article);
};

export const helpFeedback = async (req, res) => {
  await articleFeedback(parseInt(req.params.id), Boolean(req.body.helpful));
  res.json({ message: 'Geri bildiriminiz için teşekkürler.' });
};

// Kapanan talebe 1-5 puan ve isteğe bağlı yorum (değiştirilebilir)
export const rateTicket = async (req, res) => {
  const rating = parseInt(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ message: '1 ile 5 arasında bir puan seçin.' });
  const ticket = await prisma.supportTicket.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!ticket) return res.status(404).json({ message: 'Talep bulunamadı.' });
  if (ticket.status !== 'CLOSED') return res.status(400).json({ message: 'Yalnızca kapanan talepler değerlendirilebilir.' });
  const comment = String(req.body.comment || '').trim().slice(0, 1000) || null;
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { rating, ratingComment: comment, ratedAt: new Date() } });
  if (rating <= 2) sendPlatformAlert({ subject: `Düşük memnuniyet puanı: #${ticket.id} (${rating}/5)`, text: `${req.tenant.name} · ${ticket.subject}${comment ? `\n\n${comment}` : ''}` }).catch(() => {});
  res.json({ message: 'Değerlendirmeniz için teşekkürler.' });
};
