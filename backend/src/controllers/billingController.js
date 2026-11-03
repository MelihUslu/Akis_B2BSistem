import prisma, { runAsPlatform, currentTenantId } from '../utils/prisma.js';
import { syncSubscription } from '../services/iyzicoSyncService.js';
import { API_PUBLIC_URL } from '../config.js';
import { tenantAccess, invalidateTenantCache } from '../middlewares/tenantMiddleware.js';
import { getUsage } from '../services/limitService.js';
import * as iyzico from '../services/iyzicoService.js';
import { planPrice } from '../services/subscriptionService.js';
import { getSiteSettings } from '../services/siteSettings.js';
import { sendPlatformAlert } from '../services/mailService.js';

const PROFILE_KEY = 'billing_profile'; // Son kullanılan fatura bilgileri (bir sonraki ödemede form dolu gelir)
const PROFILE_FIELDS = ['fullName', 'identityNumber', 'gsmNumber', 'city', 'address'];

const loadProfile = async () => {
  const row = await prisma.setting.findFirst({ where: { key: PROFILE_KEY } });
  try { return JSON.parse(row?.value || 'null'); } catch { return null; }
};
const saveProfile = (profile) => prisma.setting.upsert({
  where: { tenantId_key: { tenantId: currentTenantId(), key: PROFILE_KEY } },
  update: { value: JSON.stringify(profile) },
  create: { key: PROFILE_KEY, value: JSON.stringify(profile) }
});

// Havale bilgileri platform ayarlarından (Platform → Site ve Chatbot → Ödeme); IBAN yoksa havale seçeneği gösterilmez
const bankInfo = async () => {
  const { billing, company } = await getSiteSettings();
  return {
    bank: billing.iban ? { bankName: billing.bankName, accountName: billing.accountName || company.legalName || company.brand, iban: billing.iban, note: billing.transferNote } : null,
    contact: { phone: company.phone, whatsapp: company.whatsapp, email: company.email }
  };
};

const publicPlan = (p) => ({
  code: p.code, name: p.name, description: p.description,
  priceMonthly: p.priceMonthly, priceYearly: p.priceYearly,
  maxDealers: p.maxDealers, maxProducts: p.maxProducts, maxAdmins: p.maxAdmins, trialDays: p.trialDays, allowCustomDomain: p.allowCustomDomain,
  onlinePayment: { MONTHLY: Boolean(p.iyzicoMonthlyPlanRef), YEARLY: Boolean(p.iyzicoYearlyPlanRef) }
});

// Kiracı yöneticisinin abonelik özeti
export const getBilling = async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id }, include: { plan: true } });
    const [usage, plans, payments, profile, pay, pendingTransfer] = await Promise.all([
      getUsage(),
      prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.subscriptionPayment.findMany({ orderBy: { createdAt: 'desc' }, take: 24 }),
      loadProfile(),
      bankInfo(),
      prisma.transferNotice.findFirst({ where: { status: { in: ['PENDING', 'REJECTED'] } }, orderBy: { createdAt: 'desc' } })
    ]);

    res.json({
      tenant: {
        name: tenant.name, slug: tenant.slug, status: tenant.status, billingCycle: tenant.billingCycle,
        trialEndsAt: tenant.trialEndsAt, currentPeriodEnd: tenant.currentPeriodEnd,
        cancelAtPeriodEnd: tenant.cancelAtPeriodEnd, hasIyzicoSubscription: Boolean(tenant.iyzicoSubscriptionRef) && !tenant.cancelAtPeriodEnd,
        contactEmail: tenant.contactEmail, phone: tenant.phone, address: tenant.address, taxNumber: tenant.taxNumber
      },
      access: tenantAccess(tenant),
      plan: publicPlan(tenant.plan),
      usage,
      plans: plans.map(publicPlan),
      payments,
      iyzicoEnabled: iyzico.iyzicoEnabled(),
      // Ödeme ekranı: kayıtlı fatura bilgileri, havale bilgileri, bekleyen / reddedilen havale bildirimi
      profile: profile || { fullName: req.user.name || '', identityNumber: tenant.taxNumber || '', gsmNumber: tenant.phone || '', city: '', address: tenant.address || '' },
      bank: pay.bank,
      contact: pay.contact,
      transferRef: `${tenant.slug.toUpperCase()}`,
      transfer: pendingTransfer && (pendingTransfer.status === 'PENDING' || Date.now() - pendingTransfer.resolvedAt < 14 * 864e5) ? pendingTransfer : null
    });
  } catch (error) {
    console.error('getBilling error:', error);
    res.status(500).json({ message: 'Abonelik bilgileri getirilemedi.' });
  }
};

const splitName = (full = '') => {
  const parts = full.trim().split(/\s+/);
  return { name: parts.slice(0, -1).join(' ') || parts[0] || '', surname: parts.length > 1 ? parts[parts.length - 1] : parts[0] || '' };
};

/**
 * Paket seçimi: iyzico ödeme formunu başlatır.
 * Aktif bir iyzico aboneliği varsa ödeme formu yerine paket yükseltme yapılır.
 */
export const startCheckout = async (req, res) => {
  try {
    if (!iyzico.iyzicoEnabled()) {
      return res.status(400).json({ message: 'Online ödeme şu an aktif değil. Paket değişikliği için platform yöneticisiyle iletişime geçin.' });
    }

    const { planCode, billingCycle = 'MONTHLY', customer = {} } = req.body;
    if (!['MONTHLY', 'YEARLY'].includes(billingCycle)) return res.status(400).json({ message: 'Geçersiz ödeme periyodu.' });

    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    const pricingPlanRef = billingCycle === 'YEARLY' ? plan?.iyzicoYearlyPlanRef : plan?.iyzicoMonthlyPlanRef;
    if (!plan || !plan.isActive || !pricingPlanRef) {
      return res.status(400).json({ message: 'Bu paket için online ödeme tanımlı değil.' });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } });

    const hasLiveSubscription = tenant.iyzicoSubscriptionRef && !tenant.cancelAtPeriodEnd;

    // Yıllık ödemesi devam ederken aylığa geçiş, kalan dönemi boşa harcatacağı için engellenir
    if (hasLiveSubscription && tenant.billingCycle === 'YEARLY' && billingCycle === 'MONTHLY') {
      return res.status(400).json({ message: 'Yıllık aboneliğiniz devam ediyor. Aylık plana geçmek için önce otomatik yenilemeyi durdurun; dönem sonunda aylık plana geçebilirsiniz.' });
    }

    // Aynı ödeme sıklığında paket değişikliği: mevcut abonelik iyzico'da yükseltilir.
    // (iyzico farklı sıklıktaki plana yükseltmeye izin vermez; aylık → yıllık yeni ödeme formuyla yapılır)
    if (hasLiveSubscription && tenant.billingCycle === billingCycle) {
      if (plan.id === tenant.planId) return res.status(400).json({ message: 'Zaten bu paketi kullanıyorsunuz.' });

      // Üst pakete geçiş hemen geçerli olur (yeni ücret bu dönem için çekilir);
      // alt pakete geçiş bir sonraki yenilemede başlar, müşteri aynı dönem için iki kez ödemez.
      const currentPlan = await prisma.plan.findUnique({ where: { id: tenant.planId } });
      const immediate = planPrice(plan, billingCycle) > planPrice(currentPlan, billingCycle);

      // iyzico yükseltmede eski aboneliği kapatıp yeni referanslı bir abonelik açar
      const upgraded = await iyzico.upgradeSubscription(tenant.iyzicoSubscriptionRef, pricingPlanRef, immediate ? 'NOW' : 'NEXT_PERIOD');
      const newRef = upgraded.referenceCode || tenant.iyzicoSubscriptionRef;
      await prisma.tenant.update({
        where: { id: tenant.id },
        // Alt pakette limitler, yeni planın ilk ödemesi alınınca (webhook) güncellenir
        data: { iyzicoSubscriptionRef: newRef, ...(immediate && { planId: plan.id }) }
      });
      await runAsPlatform(() => syncSubscription({ ...tenant, iyzicoSubscriptionRef: newRef }, newRef))
        .catch(err => console.error('[iyzico] Paket değişikliği sonrası eşitleme:', err.message));
      invalidateTenantCache(tenant.slug);
      return res.json({
        upgraded: true,
        message: immediate
          ? `Paketiniz ${plan.name} olarak güncellendi. Yeni paket ücreti (${planPrice(plan, billingCycle).toLocaleString('tr-TR')} ₺) kayıtlı kartınızdan çekilecek.`
          : `${plan.name} paketine geçişiniz bir sonraki yenileme tarihinde başlayacak. O zamana kadar mevcut paketinizi kullanmaya devam edersiniz.`
      });
    }

    const identityNumber = String(customer.identityNumber || '').replace(/\D/g, '');
    const gsm = String(customer.gsmNumber || '').replace(/[^\d+]/g, '');
    if (!customer.fullName || identityNumber.length < 10 || gsm.length < 10 || !customer.city || !customer.address) {
      return res.status(400).json({ message: 'Fatura bilgilerini eksiksiz doldurun (ad soyad, TCKN/VKN, telefon, şehir, adres).' });
    }

    await saveProfile(Object.fromEntries(PROFILE_FIELDS.map((k) => [k, String(customer[k] || '').trim().slice(0, 300)])));
    const { name, surname } = splitName(customer.fullName);
    const address = { contactName: customer.fullName, city: customer.city, country: 'Turkey', address: customer.address, zipCode: customer.zipCode || '' };

    const result = await iyzico.initializeCheckout({
      pricingPlanRef,
      conversationId: `t${tenant.id}-${Date.now()}`,
      callbackUrl: `${API_PUBLIC_URL}/api/public/iyzico/callback?tenant=${tenant.slug}`,
      customer: {
        name, surname, identityNumber,
        email: req.body.email || tenant.contactEmail,
        gsmNumber: gsm.startsWith('+') ? gsm : `+90${gsm.replace(/^0/, '')}`,
        billingAddress: address,
        shippingAddress: address
      }
    });

    // Geri dönüşte token'ın bu kiracıya ait olduğu doğrulanır
    await prisma.tenant.update({ where: { id: tenant.id }, data: { iyzicoCheckoutToken: result.token } });

    res.json({
      checkoutFormContent: result.checkoutFormContent,
      token: result.token,
      amount: planPrice(plan, billingCycle)
    });
  } catch (error) {
    if (error instanceof iyzico.IyzicoError) return res.status(400).json({ message: `Ödeme başlatılamadı: ${error.message}` });
    console.error('startCheckout error:', error);
    res.status(500).json({ message: 'Ödeme başlatılamadı.' });
  }
};

// ─── Havale / EFT bildirimi ──────────────────────────────────────────────────

// Firma "ödemeyi yaptım" der; platform yöneticisi hesabına geçtiğini görünce onaylar ve abonelik uzar
export const notifyTransfer = async (req, res) => {
  try {
    const { bank } = await bankInfo();
    if (!bank) return res.status(400).json({ message: 'Havale ile ödeme şu an kullanılamıyor.' });
    const billingCycle = req.body.billingCycle === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
    const plan = await prisma.plan.findUnique({ where: { code: String(req.body.planCode || '') } });
    if (!plan || !plan.isActive) return res.status(400).json({ message: 'Paket bulunamadı.' });
    const senderName = String(req.body.senderName || '').trim().slice(0, 120);
    if (senderName.length < 3) return res.status(400).json({ message: 'Gönderen adını (hesap sahibi) yazın.' });
    if (await prisma.transferNotice.findFirst({ where: { status: 'PENDING' } })) {
      return res.status(400).json({ message: 'Onay bekleyen bir havale bildiriminiz var. Önce onu iptal edin ya da onaylanmasını bekleyin.' });
    }
    const amount = planPrice(plan, billingCycle);
    const notice = await prisma.transferNotice.create({
      data: { planCode: plan.code, billingCycle, amount, senderName, note: String(req.body.note || '').trim().slice(0, 500) || null, createdByName: req.user.name || null }
    });
    sendPlatformAlert({
      subject: `Havale bildirimi: ${req.tenant.name}`,
      text: `${req.tenant.name} (${req.tenant.slug}) ${plan.name} · ${billingCycle === 'YEARLY' ? 'yıllık' : 'aylık'} için ${amount.toLocaleString('tr-TR')} TL havale yaptığını bildirdi. Gönderen: ${senderName}.${notice.note ? ` Not: ${notice.note}` : ''} Hesaba geçince Platform → Ödemeler ekranından onaylayın.`
    }).catch((err) => console.error('[Havale bildirimi] Uyarı gönderilemedi:', err.message));
    res.locals.auditEntityId = notice.id;
    res.status(201).json({ message: 'Bildiriminiz alındı. Ödeme hesabımıza geçince aboneliğiniz aktifleşir; e-posta ve bildirimle haber veririz.', transfer: notice });
  } catch (error) {
    console.error('notifyTransfer error:', error);
    res.status(500).json({ message: 'Bildirim gönderilemedi.' });
  }
};

export const cancelTransfer = async (req, res) => {
  const updated = await prisma.transferNotice.updateMany({ where: { id: parseInt(req.params.id) || 0, status: 'PENDING' }, data: { status: 'CANCELLED', resolvedAt: new Date() } });
  if (!updated.count) return res.status(400).json({ message: 'Bu bildirim iptal edilemez.' });
  res.json({ message: 'Havale bildirimi iptal edildi.' });
};

// Yenilemeyi durdur: erişim dönem sonuna kadar devam eder
export const cancelRenewal = async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.tenant.id } });
    if (tenant.iyzicoSubscriptionRef) await iyzico.cancelSubscription(tenant.iyzicoSubscriptionRef);
    await prisma.tenant.update({ where: { id: tenant.id }, data: { cancelAtPeriodEnd: true, iyzicoSubscriptionRef: null } });
    invalidateTenantCache(tenant.slug);
    res.json({ message: 'Otomatik yenileme durduruldu. Mevcut döneminizin sonuna kadar kullanmaya devam edebilirsiniz.' });
  } catch (error) {
    if (error instanceof iyzico.IyzicoError) return res.status(400).json({ message: `İptal başarısız: ${error.message}` });
    res.status(500).json({ message: 'İptal işlemi yapılamadı.' });
  }
};

// Platformun firmaya kestiği abonelik faturasının PDF'i
export const subscriptionInvoice = async (req, res) => {
  const payment = await prisma.subscriptionPayment.findFirst({ where: { id: parseInt(req.params.id), tenantId: req.tenant.id } });
  if (!payment?.invoiceExternalId) return res.status(404).json({ message: 'Bu ödemenin faturası henüz kesilmedi.' });
  try {
    const { subscriptionInvoicePdf } = await import('../services/platformInvoiceService.js');
    res.json({ url: await subscriptionInvoicePdf(payment.invoiceExternalId) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
