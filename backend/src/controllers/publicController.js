import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { RESERVED_SLUGS, ROOT_DOMAIN, isRootHost, tenantUrl } from '../config.js';
import { loadTenantByHost } from '../middlewares/tenantMiddleware.js';
import { sendVerificationMail, sendPlatformAlert } from '../services/mailService.js';
import * as iyzico from '../services/iyzicoService.js';
import { syncSubscription } from '../services/iyzicoSyncService.js';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const DAY = 24 * 60 * 60 * 1000;

export const normalizeSlug = (value) =>
  String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

export const checkSlug = async (slug) => {
  if (!SLUG_RE.test(slug)) return 'Adres 3-30 karakter olmalı; sadece küçük harf, rakam ve tire içerebilir.';
  if (RESERVED_SLUGS.has(slug)) return 'Bu adres kullanılamaz.';
  if (await prisma.tenant.findUnique({ where: { slug } })) return 'Bu adres zaten kullanımda.';
  return null;
};

export const getPlans = async (req, res) => {
  const plans = await prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' } });
  res.json(plans.map(p => ({
    code: p.code, name: p.name, description: p.description, priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
    maxDealers: p.maxDealers, maxProducts: p.maxProducts, maxAdmins: p.maxAdmins, trialDays: p.trialDays
  })));
};

export const slugAvailable = async (req, res) => {
  const slug = normalizeSlug(req.query.slug);
  const error = await checkSlug(slug);
  res.json({ slug, available: !error, message: error });
};

/**
 * Kendi kendine kayıt: kiracı + ilk yönetici oluşturulur, paket deneme süresiyle başlar.
 * Yönetici e-postasını doğrulayana kadar giriş yapamaz.
 */
export const signup = async (req, res) => {
  try {
    const { companyName, name, email, password, phone, planCode } = req.body;
    const slug = normalizeSlug(req.body.slug || companyName);
    const mail = String(email || '').toLowerCase().trim();

    if (!companyName || String(companyName).trim().length < 2) return res.status(400).json({ message: 'Firma adını girin.' });
    if (!name || name.trim().length < 3) return res.status(400).json({ message: 'Ad soyad girin.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return res.status(400).json({ message: 'Geçerli bir e-posta adresi girin.' });
    if (!password || password.length < 8) return res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });

    const slugError = await checkSlug(slug);
    if (slugError) return res.status(400).json({ message: slugError, field: 'slug' });

    const plan = await prisma.plan.findFirst({
      where: { isActive: true, isPublic: true, ...(planCode && { code: planCode }) },
      orderBy: { sortOrder: 'asc' }
    });
    if (!plan) return res.status(400).json({ message: 'Geçerli bir paket bulunamadı.' });

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: companyName.trim(),
        contactEmail: mail,
        phone,
        planId: plan.id,
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + plan.trialDays * DAY),
        signupSource: 'SELF',
        users: {
          create: {
            email: mail,
            password: await bcrypt.hash(password, 10),
            name: name.trim(),
            role: 'ADMIN',
            isOwner: true,
            emailVerifyToken: verifyToken
          }
        }
      }
    });

    await sendVerificationMail({ to: mail, name: name.trim(), token: verifyToken, tenant })
      .catch(err => console.error('[MAIL] Doğrulama maili gönderilemedi:', err.message));
    sendPlatformAlert({ subject: 'Yeni kayıt', text: `${tenant.name} (${tenant.slug}) ${plan.name} paketiyle deneme başlattı.` }).catch(() => {});

    res.status(201).json({
      message: 'Hesabınız oluşturuldu. E-posta adresinize gönderilen link ile hesabınızı doğrulayın.',
      slug,
      portalUrl: tenantUrl(slug)
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Kayıt sırasında bir hata oluştu.' });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const token = String(req.body.token || '');
    if (token.length < 32) return res.status(400).json({ message: 'Doğrulama linki geçersiz.' });

    const user = await prisma.user.findUnique({ where: { emailVerifyToken: token }, include: { tenant: true } });
    if (!user) return res.status(400).json({ message: 'Doğrulama linki geçersiz veya daha önce kullanılmış.' });

    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyToken: null, emailVerifiedAt: new Date() } });
    res.json({ message: 'E-posta adresiniz doğrulandı. Giriş yapabilirsiniz.', slug: user.tenant.slug });
  } catch (error) {
    res.status(500).json({ message: 'Doğrulama yapılamadı.' });
  }
};

export const resendVerification = async (req, res) => {
  const slug = normalizeSlug(req.body.slug);
  const email = String(req.body.email || '').toLowerCase().trim();
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  const user = tenant && await prisma.user.findFirst({ where: { tenantId: tenant.id, email, emailVerifyToken: { not: null } } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifyToken: token } });
    await sendVerificationMail({ to: email, name: user.name, token, tenant }).catch(() => {});
  }
  // Hesabın var olup olmadığını belli etmemek için her durumda aynı yanıt
  res.json({ message: 'Hesap doğrulama bekliyorsa yeni bir link gönderildi.' });
};

// ─── iyzico ──────────────────────────────────────────────────────────────────

/**
 * iyzico ödeme formu tamamlanınca tarayıcıyı buraya POST eder (token ile).
 * Token, ödemeyi başlatan kiracıya bağlıdır; sonuç iyzico'dan tekrar sorgulanır.
 */
export const iyzicoCallback = async (req, res) => {
  const slug = normalizeSlug(req.query.tenant);
  const back = (status, message) =>
    res.redirect(303, `${tenantUrl(slug)}/admin/subscription?payment=${status}${message ? `&message=${encodeURIComponent(message)}` : ''}`);

  try {
    const token = String(req.body?.token || req.query.token || '');
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant || !token || tenant.iyzicoCheckoutToken !== token) return back('failed', 'Ödeme bilgisi bu firmaya ait değil veya süresi doldu.');

    const result = await iyzico.retrieveCheckout(token);
    const subscriptionRef = result.subscriptionReferenceCode || result.referenceCode;
    if (!subscriptionRef) return back('failed', 'Ödeme tamamlanamadı.');

    const previousRef = tenant.iyzicoSubscriptionRef;
    await prisma.tenant.update({ where: { id: tenant.id }, data: { iyzicoCheckoutToken: null } });
    const { plan, cycle, recorded } = await syncSubscription(tenant, subscriptionRef);

    // Ödeme sıklığı değişikliğinde (aylık → yıllık) eski abonelik yenilenmesin
    if (previousRef && previousRef !== subscriptionRef) {
      await iyzico.cancelSubscription(previousRef).catch(err => console.error('[iyzico] Eski abonelik iptal edilemedi:', previousRef, err.message));
    }

    if (recorded === 0) return back('failed', 'Ödeme onayı alınamadı. Kısa süre içinde hesabınıza yansımazsa bizimle iletişime geçin.');
    sendPlatformAlert({ subject: 'Yeni abonelik', text: `${tenant.name} ${plan.name} (${cycle}) aboneliği başlattı.` }).catch(() => {});
    back('success');
  } catch (error) {
    console.error('iyzico callback error:', error);
    back('failed', error instanceof iyzico.IyzicoError ? error.message : 'Ödeme doğrulanamadı.');
  }
};

/**
 * iyzico abonelik bildirimleri (yenileme başarılı / başarısız, iptal).
 * Bildirim içeriğine güvenilmez: abonelik iyzico API'sinden yeniden okunur.
 * iyzico panelinde "Bildirim URL" olarak  {API_PUBLIC_URL}/api/public/iyzico/webhook  tanımlanmalıdır.
 */
export const iyzicoWebhook = async (req, res) => {
  // iyzico tekrar denemesin diye her durumda 200 dönülür; hatalar loglanır
  res.status(200).json({ received: true });

  try {
    const subscriptionRef = req.body?.subscriptionReferenceCode;
    if (!subscriptionRef) return;

    const tenant = await prisma.tenant.findUnique({ where: { iyzicoSubscriptionRef: subscriptionRef } });
    if (!tenant) return console.warn('[iyzico webhook] Kiracı bulunamadı:', subscriptionRef);

    await syncSubscription(tenant, subscriptionRef);
  } catch (error) {
    console.error('[iyzico webhook] İşlenemedi:', error.message);
  }
};

// Ters vekil (Caddy on_demand_tls "ask") için: 200 = sertifika alınabilir, 404 = alınamaz
export const domainCheck = async (req, res) => {
  const domain = String(req.query.domain || '').trim().toLowerCase();
  if (!domain) return res.status(400).end();
  if (isRootHost(domain)) {
    const slug = domain === ROOT_DOMAIN ? null : domain.slice(0, -(ROOT_DOMAIN.length + 1));
    if (!slug || slug === 'platform' || slug === 'www') return res.status(200).end();
    return (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) ? res.status(200).end() : res.status(404).end();
  }
  return (await loadTenantByHost(domain)) ? res.status(200).end() : res.status(404).end();
};

// Tarayıcıda oluşan hatalar (arayüz hata izleme). Hız sınırlı; büyük gövdeler kırpılır.
export const reportClientError = async (req, res) => {
  const { recordError } = await import('../services/errorTracker.js');
  const b = req.body || {};
  if (!b.message) return res.status(204).end();
  recordError({
    source: 'CLIENT', message: String(b.message).slice(0, 1000), stack: b.stack ? String(b.stack).slice(0, 6000) : null,
    path: b.url ? String(b.url).replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 300) : null,
    userAgent: req.headers['user-agent'], tenantId: null
  });
  res.status(204).end();
};
