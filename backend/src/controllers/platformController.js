import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import { JWT_SECRET, tenantUrl, tenantPortalUrl } from '../config.js';
import { tenantAccess, invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { checkSlug, normalizeSlug } from './publicController.js';
import { sendCredentialsMail } from '../services/mailService.js';
import { recordSuccessfulPayment, planPrice, addPeriod } from '../services/subscriptionService.js';
import * as iyzico from '../services/iyzicoService.js';
import * as twoFactor from '../services/twoFactorService.js';
import { audit, clientIp } from '../services/auditService.js';
import { exportTenantWorkbook, purgeTenant } from '../services/tenantDataService.js';
import { notifyUser } from '../services/notificationService.js';
import { cleanAttachments } from '../services/supportService.js';

const DAY = 24 * 60 * 60 * 1000;
const TENANT_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'];

// ─── Kimlik ──────────────────────────────────────────────────────────────────
export const platformLogin = async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const user = await prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN', tenantId: null } });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) {
    audit({ actorType: 'PLATFORM', actorId: user?.id, actorName: email.slice(0, 100), action: 'Platform: başarısız giriş denemesi', ip: clientIp(req) });
    return res.status(401).json({ message: 'Geçersiz e-posta veya şifre.' });
  }
  if (user.twoFactorEnabled) return res.json({ twoFactorRequired: true, challenge: twoFactor.issueChallenge(user) });
  audit({ actorType: 'PLATFORM', actorId: user.id, actorName: user.name, action: 'Platform: giriş yapıldı', ip: clientIp(req) });
  res.json(platformSession(user));
};

const platformSession = (user) => ({
  token: jwt.sign({ id: user.id, role: 'SUPER_ADMIN', tenantId: null }, JWT_SECRET, { expiresIn: '12h' }),
  user: { id: user.id, name: user.name, email: user.email, role: user.role }
});

export const platformVerifyTwoFactor = async (req, res) => {
  try {
    const { uid, tenantId } = twoFactor.readChallenge(req.body.challenge);
    if (tenantId !== null) return res.status(401).json({ message: 'Geçersiz doğrulama.' });
    const user = await prisma.user.findFirst({ where: { id: uid, role: 'SUPER_ADMIN', tenantId: null } });
    if (!user || !(await twoFactor.checkCode(user, req.body.code))) {
      audit({ actorType: 'PLATFORM', actorId: uid, action: 'Platform: hatalı 2FA kodu', ip: clientIp(req) });
      return res.status(401).json({ message: 'Doğrulama kodu hatalı.' });
    }
    audit({ actorType: 'PLATFORM', actorId: user.id, actorName: user.name, action: 'Platform: giriş yapıldı (2FA)', ip: clientIp(req) });
    res.json(platformSession(user));
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

const self = (req) => prisma.user.findUnique({ where: { id: req.user.id } });
export const platformTwoFactorStatus = async (req, res) => res.json(twoFactor.status(await self(req)));
export const platformTwoFactorSetup = async (req, res) => res.json(await twoFactor.startSetup(await self(req), `${process.env.PLATFORM_NAME || 'Akis B2B'} Platform`));
export const platformTwoFactorEnable = async (req, res) => {
  try { res.json({ message: 'İki aşamalı doğrulama açıldı.', recoveryCodes: await twoFactor.enable(await self(req), req.body.code) }); }
  catch (error) { res.status(400).json({ message: error.message }); }
};
export const platformTwoFactorDisable = async (req, res) => {
  try { await twoFactor.disable(await self(req), req.body.password, req.body.code); res.json({ message: 'İki aşamalı doğrulama kapatıldı.' }); }
  catch (error) { res.status(400).json({ message: error.message }); }
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const [tenants, recentPayments, monthRevenue] = await Promise.all([
      prisma.tenant.findMany({ include: { plan: true }, orderBy: { createdAt: 'desc' } }),
      prisma.subscriptionPayment.findMany({ include: { tenant: { select: { name: true, slug: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.subscriptionPayment.aggregate({
        where: { status: 'SUCCESS', createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        _sum: { amount: true }
      })
    ]);

    const byStatus = TENANT_STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    let mrr = 0;
    for (const t of tenants) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      if (t.status === 'ACTIVE' && tenantAccess(t).active) {
        mrr += t.billingCycle === 'YEARLY' ? t.plan.priceYearly / 12 : t.plan.priceMonthly;
      }
    }

    res.json({
      totals: { tenants: tenants.length, ...byStatus },
      mrr: Math.round(mrr * 100) / 100,
      monthRevenue: monthRevenue._sum.amount || 0,
      trialsEnding: tenants
        .filter(t => t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt > now && t.trialEndsAt - now < 7 * DAY)
        .map(t => ({ id: t.id, name: t.name, slug: t.slug, trialEndsAt: t.trialEndsAt })),
      expiring: tenants
        .filter(t => t.status !== 'TRIAL' && t.currentPeriodEnd && t.currentPeriodEnd - now < 7 * DAY && !['SUSPENDED', 'CANCELLED'].includes(t.status))
        .map(t => ({ id: t.id, name: t.name, slug: t.slug, currentPeriodEnd: t.currentPeriodEnd, status: t.status })),
      recentSignups: tenants.slice(0, 6).map(t => ({ id: t.id, name: t.name, slug: t.slug, plan: t.plan.name, status: t.status, createdAt: t.createdAt, signupSource: t.signupSource })),
      recentPayments
    });
  } catch (error) {
    console.error('Platform dashboard error:', error);
    res.status(500).json({ message: 'Panel verileri getirilemedi.' });
  }
};

// ─── Kiracılar ───────────────────────────────────────────────────────────────
const usageFor = async (tenantId) => {
  const [dealers, products, admins, orders] = await Promise.all([
    prisma.company.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId, isMaster: true } }),
    prisma.user.count({ where: { tenantId, role: 'ADMIN' } }),
    prisma.order.count({ where: { tenantId } })
  ]);
  return { dealers, products, admins, orders };
};

export const listTenants = async (req, res) => {
  try {
    const { search, status } = req.query;
    const tenants = await prisma.tenant.findMany({
      where: {
        ...(status && { status }),
        ...(search && { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search.toLowerCase() } }, { contactEmail: { contains: search, mode: 'insensitive' } }] })
      },
      include: { plan: true, _count: { select: { companies: true, products: true, orders: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tenants.map(t => ({ ...t, access: tenantAccess(t), url: tenantPortalUrl(t) })));
  } catch (error) {
    res.status(500).json({ message: 'Müşteriler getirilemedi.' });
  }
};

export const getTenant = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tenant = await prisma.tenant.findUnique({ where: { id }, include: { plan: true } });
    if (!tenant) return res.status(404).json({ message: 'Müşteri bulunamadı.' });

    const [usage, admins, payments] = await Promise.all([
      usageFor(id),
      prisma.user.findMany({ where: { tenantId: id, role: 'ADMIN' }, select: { id: true, name: true, email: true, emailVerifiedAt: true, emailVerifyToken: true, createdAt: true } }),
      prisma.subscriptionPayment.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' } })
    ]);

    res.json({
      ...tenant,
      access: tenantAccess(tenant),
      url: tenantPortalUrl(tenant),
      usage,
      admins: admins.map(({ emailVerifyToken, ...a }) => ({ ...a, pendingVerification: Boolean(emailVerifyToken) })),
      payments
    });
  } catch (error) {
    res.status(500).json({ message: 'Müşteri getirilemedi.' });
  }
};

/**
 * Platform sahibinin manuel müşteri açması (satışı kendisi yaptığında).
 * İlk yönetici doğrulanmış olarak oluşturulur ve giriş bilgileri mail ile gönderilir.
 */
export const createTenant = async (req, res) => {
  try {
    const { name, contactEmail, phone, taxNumber, planCode, adminName, adminEmail, adminPassword, mode = 'TRIAL', trialDays, periodMonths } = req.body;
    const slug = normalizeSlug(req.body.slug || name);
    const email = String(adminEmail || contactEmail || '').toLowerCase().trim();

    if (!name || !email || !adminName) return res.status(400).json({ message: 'Firma adı, yönetici adı ve e-posta zorunludur.' });
    if (adminPassword && adminPassword.length < 8) return res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
    const slugError = await checkSlug(slug);
    if (slugError) return res.status(400).json({ message: slugError, field: 'slug' });

    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) return res.status(400).json({ message: 'Paket seçin.' });

    const password = adminPassword || crypto.randomBytes(9).toString('base64url').slice(0, 12);
    const now = Date.now();
    const isTrial = mode === 'TRIAL';

    const tenant = await prisma.tenant.create({
      data: {
        slug, name: name.trim(), contactEmail: contactEmail || email, phone, taxNumber,
        planId: plan.id,
        status: isTrial ? 'TRIAL' : 'ACTIVE',
        trialEndsAt: isTrial ? new Date(now + (parseInt(trialDays) || plan.trialDays) * DAY) : null,
        currentPeriodEnd: isTrial ? null : addPeriod(new Date(), (parseInt(periodMonths) || 1) >= 12 ? 'YEARLY' : 'MONTHLY'),
        signupSource: 'PLATFORM',
        users: {
          create: { email, password: await bcrypt.hash(password, 10), name: adminName.trim(), role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() }
        }
      }
    });

    const mail = await sendCredentialsMail({ to: email, name: adminName, password, tenant })
      .catch(() => ({ delivered: false }));

    res.status(201).json({
      tenant,
      url: tenantUrl(slug),
      message: mail.delivered
        ? `Müşteri oluşturuldu. Giriş bilgileri ${email} adresine gönderildi.`
        : `Müşteri oluşturuldu ancak e-posta gönderilemedi (SMTP). Yönetici şifresini panelden sıfırlayabilirsiniz.`
    });
  } catch (error) {
    console.error('createTenant error:', error);
    res.status(400).json({ message: 'Müşteri oluşturulamadı.' });
  }
};

export const updateTenant = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, contactEmail, phone, taxNumber, status, planCode, billingCycle, trialEndsAt, currentPeriodEnd, notes } = req.body;

    if (status && !TENANT_STATUSES.includes(status)) return res.status(400).json({ message: 'Geçersiz durum.' });
    const plan = planCode ? await prisma.plan.findUnique({ where: { code: planCode } }) : null;
    if (planCode && !plan) return res.status(400).json({ message: 'Paket bulunamadı.' });

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        name, contactEmail, phone, taxNumber, status, notes,
        billingCycle: ['MONTHLY', 'YEARLY'].includes(billingCycle) ? billingCycle : undefined,
        planId: plan?.id,
        trialEndsAt: trialEndsAt !== undefined ? (trialEndsAt ? new Date(trialEndsAt) : null) : undefined,
        currentPeriodEnd: currentPeriodEnd !== undefined ? (currentPeriodEnd ? new Date(currentPeriodEnd) : null) : undefined
      }
    });
    invalidateTenantCache(tenant.slug);
    res.json({ message: 'Müşteri güncellendi.', tenant });
  } catch (error) {
    res.status(400).json({ message: 'Müşteri güncellenemedi.' });
  }
};

// Havale / fatura ile alınan ödemeyi işler ve aboneliği uzatır
export const addManualPayment = async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: parseInt(req.params.id) }, include: { plan: true } });
    if (!tenant) return res.status(404).json({ message: 'Müşteri bulunamadı.' });

    const cycle = req.body.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    const plan = req.body.planCode ? await prisma.plan.findUnique({ where: { code: req.body.planCode } }) : tenant.plan;
    if (!plan) return res.status(400).json({ message: 'Paket bulunamadı.' });

    const amount = req.body.amount !== undefined && req.body.amount !== '' ? parseFloat(req.body.amount) : planPrice(plan, cycle);
    const { duplicate, payment } = await recordSuccessfulPayment({
      tenant, plan, cycle, amount,
      method: 'MANUAL',
      reference: req.body.reference ? `manual:${req.body.reference}` : null,
      note: req.body.note
    });
    if (duplicate) return res.status(400).json({ message: 'Bu referans numarasıyla bir ödeme zaten kayıtlı.' });

    res.status(201).json({ message: `Ödeme kaydedildi. Abonelik ${payment.periodEnd.toLocaleDateString('tr-TR')} tarihine uzatıldı.`, payment });
  } catch (error) {
    console.error('addManualPayment error:', error);
    res.status(400).json({ message: 'Ödeme kaydedilemedi.' });
  }
};

export const resetTenantAdminPassword = async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: parseInt(req.params.id) } });
    const admin = await prisma.user.findFirst({ where: { id: parseInt(req.params.userId), tenantId: tenant?.id, role: 'ADMIN' } });
    if (!tenant || !admin) return res.status(404).json({ message: 'Yönetici bulunamadı.' });

    const password = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    await prisma.user.update({ where: { id: admin.id }, data: { password: await bcrypt.hash(password, 10), emailVerifyToken: null, emailVerifiedAt: admin.emailVerifiedAt || new Date() } });
    const mail = await sendCredentialsMail({ to: admin.email, name: admin.name, password, isReset: true, tenant }).catch(() => ({ delivered: false }));
    res.json({ message: mail.delivered ? `Yeni şifre ${admin.email} adresine gönderildi.` : 'Şifre sıfırlandı ancak e-posta gönderilemedi (SMTP).' });
  } catch (error) {
    res.status(400).json({ message: 'Şifre sıfırlanamadı.' });
  }
};

// ─── Paketler ────────────────────────────────────────────────────────────────
const PLAN_FIELDS = ['name', 'description', 'priceMonthly', 'priceYearly', 'maxDealers', 'maxProducts', 'maxAdmins', 'trialDays', 'isActive', 'isPublic', 'allowCustomDomain', 'sortOrder'];
const NUMERIC = new Set(['priceMonthly', 'priceYearly', 'maxDealers', 'maxProducts', 'maxAdmins', 'trialDays', 'sortOrder']);

const planData = (body) => {
  const data = {};
  for (const f of PLAN_FIELDS) {
    if (body[f] === undefined) continue;
    data[f] = NUMERIC.has(f) ? Number(body[f]) : (typeof body[f] === 'boolean' ? body[f] : body[f]);
  }
  return data;
};

export const listPlans = async (req, res) => {
  const plans = await prisma.plan.findMany({ include: { _count: { select: { tenants: true } } }, orderBy: { sortOrder: 'asc' } });
  res.json({ plans, iyzicoEnabled: iyzico.iyzicoEnabled() });
};

export const createPlan = async (req, res) => {
  try {
    const code = String(req.body.code || '').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!code || !req.body.name) return res.status(400).json({ message: 'Paket kodu ve adı zorunludur.' });
    const plan = await prisma.plan.create({ data: { code, ...planData(req.body) } });
    res.status(201).json(plan);
  } catch (error) {
    res.status(400).json({ message: 'Paket oluşturulamadı (kod benzersiz olmalı, fiyat ve limitler zorunlu).' });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const current = await prisma.plan.findUnique({ where: { id } });
    const data = planData(req.body);
    // iyzico fiyat planları sonradan değiştirilemez; fiyat değişince yeniden senkronize edilmeli
    if (data.priceMonthly !== undefined && data.priceMonthly !== current.priceMonthly) data.iyzicoMonthlyPlanRef = null;
    if (data.priceYearly !== undefined && data.priceYearly !== current.priceYearly) data.iyzicoYearlyPlanRef = null;
    const plan = await prisma.plan.update({ where: { id }, data });
    invalidateTenantCache();
    res.json(plan);
  } catch (error) {
    res.status(400).json({ message: 'Paket güncellenemedi.' });
  }
};

// Paketi iyzico'da ürün + aylık/yıllık fiyat planı olarak oluşturur (eksik olanları)
export const syncPlanToIyzico = async (req, res) => {
  try {
    if (!iyzico.iyzicoEnabled()) return res.status(400).json({ message: 'iyzico API anahtarları tanımlı değil (.env).' });
    let plan = await prisma.plan.findUnique({ where: { id: parseInt(req.params.id) } });

    // Tüm paketler iyzico'da TEK ürünün fiyat planlarıdır: iyzico aboneliği sadece aynı ürünün
    // planları arasında yükseltmeye izin verir (aksi halde paket değişikliği yapılamaz)
    const data = {};
    let productRef = plan.iyzicoProductRef
      || (await prisma.plan.findFirst({ where: { iyzicoProductRef: { not: null } } }))?.iyzicoProductRef;
    if (!productRef) {
      const product = await iyzico.createProduct({ name: `${process.env.PLATFORM_NAME || 'Akis B2B'} Abonelik`, description: 'B2B portal aboneliği' });
      productRef = product.referenceCode;
    }
    if (plan.iyzicoProductRef !== productRef) data.iyzicoProductRef = productRef;
    if (!plan.iyzicoMonthlyPlanRef && plan.priceMonthly > 0) {
      data.iyzicoMonthlyPlanRef = (await iyzico.createPricingPlan(productRef, { name: `${plan.name} Aylık ${plan.priceMonthly}`, price: plan.priceMonthly, interval: 'MONTHLY' })).referenceCode;
    }
    if (!plan.iyzicoYearlyPlanRef && plan.priceYearly > 0) {
      data.iyzicoYearlyPlanRef = (await iyzico.createPricingPlan(productRef, { name: `${plan.name} Yıllık ${plan.priceYearly}`, price: plan.priceYearly, interval: 'YEARLY' })).referenceCode;
    }

    plan = await prisma.plan.update({ where: { id: plan.id }, data });
    res.json({ message: 'Paket iyzico ile senkronize edildi.', plan });
  } catch (error) {
    res.status(400).json({ message: `iyzico senkronizasyonu başarısız: ${error.message}` });
  }
};

export const listPayments = async (req, res) => {
  const payments = await prisma.subscriptionPayment.findMany({
    include: { tenant: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  res.json(payments);
};

// ─── Müşteri olarak giriş (destek) ───────────────────────────────────────────

/**
 * Firma sahibinin yetkileriyle 1 saatlik destek oturumu açar. Token adresin # kısmında taşınır
 * (sunucu loglarına düşmez). Firma sahibine bildirim gider, işlem kaydına yazılır.
 */
export const impersonateTenant = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!tenant) return res.status(404).json({ message: 'Müşteri bulunamadı.' });
  const owner = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: 'ADMIN', isActive: true }, orderBy: [{ isOwner: 'desc' }, { id: 'asc' }] });
  if (!owner) return res.status(400).json({ message: 'Firmada aktif yönetici yok.' });

  const token = jwt.sign(
    { id: owner.id, role: 'ADMIN', companyId: null, tenantId: tenant.id, impersonatedBy: req.user.name },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const user = { id: owner.id, name: owner.name, email: owner.email, role: 'ADMIN', companyId: null, isOwner: owner.isOwner, permissions: owner.permissions || [], impersonatedBy: req.user.name };

  await runWithTenantSafe(tenant.id, () => notifyUser(owner.id, {
    type: 'SYSTEM', title: 'Destek oturumu açıldı', message: `Platform destek ekibi (${req.user.name}) sorununuzu incelemek için panelinize giriş yaptı.`, link: '/admin/settings?tab=audit'
  }));

  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  res.json({ url: `${tenantPortalUrl(tenant)}/impersonate#token=${token}&user=${payload}` });
};

const runWithTenantSafe = async (tenantId, fn) => {
  const { runWithTenant } = await import('../utils/prisma.js');
  return runWithTenant(tenantId, async () => fn()).catch(() => {});
};

// ─── Hesap kapatma / silme ───────────────────────────────────────────────────

export const exportTenantData = async (req, res) => {
  const { buffer, tenant } = await exportTenantWorkbook(parseInt(req.params.id));
  audit({ tenantId: tenant.id, actorType: 'PLATFORM', actorId: req.user.id, actorName: req.user.name, action: 'Platform: firma verisi dışa aktarıldı', ip: clientIp(req) });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${tenant.slug}-tum-veriler.xlsx"`);
  res.send(buffer);
};

export const reopenTenant = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!tenant?.closedAt) return res.status(400).json({ message: 'Bu hesap kapatılmamış.' });
  const status = tenant.currentPeriodEnd && tenant.currentPeriodEnd > new Date() ? 'ACTIVE' : 'TRIAL';
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status, closedAt: null, deletionScheduledAt: null } });
  invalidateTenantCache(tenant.slug);
  res.json({ message: `Hesap yeniden açıldı (durum: ${status === 'ACTIVE' ? 'aktif' : 'deneme'}). Gerekirse süreleri güncelleyin.` });
};

// Geri alınamaz. Onay için firma adresi yazılmalı; kapatılmamış hesapta 'force' gerekir.
export const purgeTenantData = async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!tenant) return res.status(404).json({ message: 'Müşteri bulunamadı.' });
  if (String(req.body.confirm || '').trim() !== tenant.slug) return res.status(400).json({ message: `Onay için müşteri adresini (${tenant.slug}) yazın.` });
  if (!tenant.closedAt && req.body.force !== true) return res.status(400).json({ message: 'Hesap kapatılmamış. Önce askıya alın / kapatın veya zorla silmeyi onaylayın.' });

  await purgeTenant(tenant.id);
  invalidateTenantCache(tenant.slug);
  audit({ tenantId: tenant.id, actorType: 'PLATFORM', actorId: req.user.id, actorName: req.user.name, action: 'Platform: firma verisi kalıcı silindi', details: { name: tenant.name, slug: tenant.slug }, ip: clientIp(req) });
  res.json({ message: `${tenant.name} ve tüm verileri kalıcı olarak silindi.` });
};

// ─── İşlem kaydı ─────────────────────────────────────────────────────────────

export const platformAuditLogs = async (req, res) => {
  const take = Math.min(parseInt(req.query.limit) || 50, 200);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const q = String(req.query.q || '').trim();
  const where = {
    ...(req.query.tenantId && { tenantId: parseInt(req.query.tenantId) }),
    ...(req.query.platformOnly === 'true' && { actorType: 'PLATFORM' }),
    ...(q && { OR: [{ action: { contains: q, mode: 'insensitive' } }, { actorName: { contains: q, mode: 'insensitive' } }] })
  };
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip: (page - 1) * take }),
    prisma.auditLog.count({ where })
  ]);
  const tenants = await prisma.tenant.findMany({ where: { id: { in: [...new Set(data.map(d => d.tenantId).filter(Boolean))] } }, select: { id: true, name: true } });
  const names = new Map(tenants.map(t => [t.id, t.name]));
  res.json({ data: data.map(d => ({ ...d, tenantName: d.tenantId ? names.get(d.tenantId) || `#${d.tenantId} (silinmiş)` : null })), pagination: { total, page, pages: Math.max(1, Math.ceil(total / take)) } });
};

// ─── Duyurular ───────────────────────────────────────────────────────────────

export const listAnnouncements = async (req, res) => res.json(await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));

export const createAnnouncement = async (req, res) => {
  const title = String(req.body.title || '').trim();
  const body = String(req.body.body || '').trim();
  if (!title || !body) return res.status(400).json({ message: 'Başlık ve metin zorunludur.' });
  const item = await prisma.announcement.create({
    data: {
      title, body,
      level: ['INFO', 'WARNING', 'MAINTENANCE'].includes(req.body.level) ? req.body.level : 'INFO',
      planCode: req.body.planCode || null,
      startsAt: req.body.startsAt ? new Date(req.body.startsAt) : new Date(),
      endsAt: req.body.endsAt ? new Date(`${req.body.endsAt}T23:59:59`) : null
    }
  });
  res.status(201).json({ message: 'Duyuru yayınlandı.', announcement: item });
};

export const deleteAnnouncement = async (req, res) => {
  await prisma.announcement.deleteMany({ where: { id: parseInt(req.params.id) } });
  res.json({ message: 'Duyuru kaldırıldı.' });
};

// ─── Destek talepleri ────────────────────────────────────────────────────────

export const listSupportTickets = async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: req.query.status ? { status: req.query.status } : {},
    include: { tenant: { select: { name: true, slug: true } }, user: { select: { name: true, email: true } }, _count: { select: { messages: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, authorType: true, authorName: true, createdAt: true } } },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 200
  });
  res.json(tickets);
};

export const getSupportTicket = async (req, res) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parseInt(req.params.id) },
    include: { tenant: { select: { id: true, name: true, slug: true } }, user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: 'asc' } } }
  });
  if (!ticket) return res.status(404).json({ message: 'Talep bulunamadı.' });
  res.json(ticket);
};

export const replySupportTicket = async (req, res) => {
  const body = String(req.body.body || '').trim();
  const attachments = cleanAttachments(req.body.attachments);
  if (!body && !attachments) return res.status(400).json({ message: 'Mesaj boş olamaz.' });
  const ticket = await prisma.supportTicket.findUnique({ where: { id: parseInt(req.params.id) } });
  if (!ticket) return res.status(404).json({ message: 'Talep bulunamadı.' });
  await prisma.$transaction([
    prisma.supportMessage.create({ data: { tenantId: ticket.tenantId, ticketId: ticket.id, authorType: 'PLATFORM', authorName: req.user.name, body: body.slice(0, 5000), attachments } }),
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: req.body.close ? 'CLOSED' : 'ANSWERED', dueAt: null, ...(!ticket.firstResponseAt && { firstResponseAt: new Date() }) }
    })
  ]);
  await runWithTenantSafe(ticket.tenantId, () => notifyUser(ticket.userId, {
    type: 'SYSTEM', title: `Destek talebiniz yanıtlandı (#${ticket.id})`, message: body.slice(0, 160), link: '/admin/support'
  }));
  res.json({ message: 'Yanıt gönderildi.' });
};
