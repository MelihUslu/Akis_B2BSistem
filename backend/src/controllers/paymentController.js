import crypto from 'crypto';
import prisma, { runWithTenant } from '../utils/prisma.js';
import { API_PUBLIC_URL, tenantUrl, tenantPortalUrl } from '../config.js';
import * as iyzico from '../services/iyzicoService.js';
import * as paytr from '../services/paytrService.js';
import { tenantPosCreds, posMode } from '../services/tenantPosService.js';
import { emitEvent } from '../services/webhookService.js';
import { availableCredit, round2 } from '../services/pricingService.js';
import { postEntry, currentRate } from '../services/accountPosting.js';
import { notifyAdmins, notifyCompany, safeNotify } from '../services/notificationService.js';

export const getPayments = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      where: req.user.role === 'BAYI' ? { companyId: req.user.companyId } : {},
      include: { company: { select: { name: true } } },
      orderBy: { paymentDate: 'desc' }
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Ödemeler getirilirken hata oluştu.' });
  }
};

const luhnValid = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

/**
 * Sanal POS (MOCKUP): Gerçek banka entegrasyonu yoktur, kart doğrulaması
 * sonrası ödeme başarılı kabul edilir. Kart numarasının sadece son 4 hanesi saklanır.
 * Ödeme anında bakiye artar ve risk limiti otomatik olarak tekrar açılır.
 */
export const payWithPos = async (req, res) => {
  try {
    if (posMode(req.tenant) !== 'DEMO') {
      return res.status(400).json({ message: 'Demo ödeme kapalı. Lütfen kartla ödeme formunu kullanın.' });
    }
    const { amount, cardHolder, cardNumber, expiry, cvc } = req.body;
    const value = round2(parseFloat(amount));
    const digits = String(cardNumber || '').replace(/\D/g, '');
    const [mm, yy] = String(expiry || '').split('/').map(s => parseInt(s));

    if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) {
      return res.status(400).json({ message: 'Geçerli bir ödeme tutarı girin (en fazla ₺1.000.000).' });
    }
    if (!cardHolder || cardHolder.trim().length < 3) {
      return res.status(400).json({ message: 'Kart üzerindeki ismi girin.' });
    }
    if (digits.length < 15 || digits.length > 16 || !luhnValid(digits)) {
      return res.status(400).json({ message: 'Kart numarası geçersiz.' });
    }
    const now = new Date();
    const expEnd = new Date(2000 + (yy || 0), mm || 0, 1); // Ayın sonrası
    if (!mm || mm < 1 || mm > 12 || !yy || expEnd <= now) {
      return res.status(400).json({ message: 'Kartın son kullanma tarihi geçersiz.' });
    }
    if (!/^\d{3,4}$/.test(String(cvc || ''))) {
      return res.status(400).json({ message: 'CVC geçersiz.' });
    }

    const companyId = req.user.companyId;
    const reference = `POS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Kartla ödeme TL'dir; dövizli cariye güncel kurla çevrilerek alacak yazılır
    const account = await prisma.company.findUnique({ where: { id: companyId } });
    const rate = await currentRate(account.currency);
    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: { companyId, amount: value, method: 'POS', cardLast4: digits.slice(-4), reference, status: 'COMPLETED', currency: 'TRY', rate, accountAmount: account.currency === 'TRY' ? value : round2(value / rate) }
      });
      await postEntry(tx, { company: account, type: 'CREDIT', amountTRY: value, rate, source: 'PAYMENT', paymentId: p.id, description: `Sanal POS tahsilatı (**** ${digits.slice(-4)}) · ${reference}` });
      return p;
    });

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    const credit = await availableCredit(prisma, company);

    safeNotify(notifyAdmins({
      type: 'PAYMENT',
      title: 'Sanal POS tahsilatı',
      message: `${company.name} ₺${value.toLocaleString('tr-TR')} ödeme yaptı.`,
      link: '/admin/finance'
    }));

    emitEvent(req.tenant.id, 'payment.received', { companyId, amount: value, method: 'DEMO_POS', reference });

    res.status(201).json({
      message: 'Ödemeniz başarıyla alındı.',
      payment,
      balance: company.currentBalance,
      credit
    });
  } catch (error) {
    console.error('POS error:', error);
    res.status(500).json({ message: 'Ödeme işlemi sırasında hata oluştu.' });
  }
};

// Bayi ekranı hangi ödeme yöntemini göstereceğini buradan öğrenir
export const getPosInfo = (req, res) => res.json({ mode: posMode(req.tenant) });

const splitName = (full = '') => {
  const parts = full.trim().split(/\s+/);
  return { name: parts.slice(0, -1).join(' ') || parts[0] || 'Bayi', surname: parts.length > 1 ? parts[parts.length - 1] : 'Yetkili' };
};

/**
 * Bekleyen bir bayi ödemesini tamamlar: cariye alacak yazılır, bakiye artar (risk limiti açılır).
 * Aynı ödeme iki kez işlenmez. Kiracı bağlamında çağrılmalıdır.
 */
const completeDealerPayment = async (tenant, payment, { reference, cardLast4, description }) => {
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'PENDING' },
    data: { status: 'COMPLETED', cardLast4: cardLast4 || null, reference }
  });
  if (claimed.count !== 1) return false;

  // Kartla ödeme TL'dir; dövizli cariye güncel kurla çevrilerek alacak yazılır
  const company = await prisma.company.findUnique({ where: { id: payment.companyId } });
  const rate = await currentRate(company.currency).catch(() => null);
  await prisma.$transaction(async (tx) => {
    // Kur alınamazsa (nadir) ödeme yine işlenir: postEntry son kuru tekrar dener, olmazsa hata loglanır
    const entry = await postEntry(tx, { company, type: 'CREDIT', amountTRY: payment.amount, rate: rate || undefined, source: 'PAYMENT', paymentId: payment.id, description });
    await tx.payment.update({ where: { id: payment.id }, data: { currency: 'TRY', rate: entry?.rate ?? 1, accountAmount: entry?.amount ?? payment.amount } });
  });
  safeNotify(notifyAdmins({ type: 'PAYMENT', title: 'Kartla tahsilat', message: `${company.name} ₺${payment.amount.toLocaleString('tr-TR')} ödedi.`, link: '/admin/finance' }));
  safeNotify(notifyCompany(company.id, { type: 'PAYMENT', title: 'Ödemeniz alındı', message: `₺${payment.amount.toLocaleString('tr-TR')} carinize işlendi.`, link: '/bayi/finance' }));
  emitEvent(tenant.id, 'payment.received', { companyId: company.id, externalCode: company.externalCode, amount: payment.amount, method: payment.provider, reference });
  return true;
};

/**
 * Firmanın seçtiği sanal POS (iyzico veya PayTR) ile kartla cari ödeme.
 * Bayi sağlayıcının güvenli ödeme sayfasına yönlendirilir; sonuç sunucuda doğrulanır.
 */
export const startPosCheckout = async (req, res) => {
  try {
    const creds = tenantPosCreds(req.tenant);
    if (!creds) return res.status(400).json({ message: 'Firmanın sanal POS bağlantısı tanımlı değil.' });

    const amount = round2(parseFloat(req.body.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) {
      return res.status(400).json({ message: 'Geçerli bir ödeme tutarı girin (₺1 – ₺1.000.000).' });
    }

    const [company, user] = await Promise.all([
      prisma.company.findUnique({ where: { id: req.user.companyId } }),
      prisma.user.findUnique({ where: { id: req.user.id } })
    ]);
    const userIp = req.ip?.replace('::ffff:', '') || '85.34.78.112';
    const phone = String(company.phone || '').replace(/[^\d]/g, '').replace(/^90/, '').replace(/^0/, '');
    const back = `${tenantPortalUrl(req.tenant)}/bayi/finance`;

    if (creds.provider === 'PAYTR') {
      // merchant_oid: sadece harf ve rakam
      const merchantOid = `C${company.id}T${Date.now()}${crypto.randomBytes(3).toString('hex')}`;
      const result = await paytr.getPaymentToken(creds, {
        amount, merchantOid, email: user.email, userIp,
        userName: company.authorizedPerson || user.name,
        userAddress: company.address || company.name,
        userPhone: `0${phone || '5000000000'}`,
        basketName: `${company.name} cari ödeme`,
        okUrl: `${back}?pos=pending`,
        failUrl: `${back}?pos=failed`
      });
      await prisma.payment.create({
        data: { companyId: company.id, userId: user.id, amount, method: 'POS', provider: 'PAYTR', status: 'PENDING', token: merchantOid, reference: merchantOid }
      });
      return res.json({ provider: 'PAYTR', paymentPageUrl: result.paymentPageUrl });
    }

    const { name, surname } = splitName(company.authorizedPerson || user.name);
    const address = { contactName: company.authorizedPerson || user.name, city: req.body.city || 'Istanbul', country: 'Turkey', address: company.address || company.name };
    const basketId = `C${company.id}-${Date.now()}`;
    const result = await iyzico.initializePaymentCheckout(creds, {
      amount,
      conversationId: basketId,
      basketId,
      callbackUrl: `${API_PUBLIC_URL}/api/public/pos/callback?tenant=${req.tenant.slug}`,
      itemName: `${company.name} cari ödeme`,
      address,
      buyer: {
        id: String(company.id), name, surname,
        gsmNumber: `+90${phone || '5000000000'}`,
        email: user.email,
        // iyzico kimlik no zorunlu tutar; vergi no yoksa iyzico'nun kabul ettiği varsayılan kullanılır
        identityNumber: String(company.taxNumber || '11111111111').padStart(11, '1'),
        registrationAddress: address.address, city: address.city, country: 'Turkey', ip: userIp
      }
    });
    await prisma.payment.create({
      data: { companyId: company.id, userId: user.id, amount, method: 'POS', provider: 'IYZICO', status: 'PENDING', token: result.token, reference: basketId }
    });
    res.json({ provider: 'IYZICO', checkoutFormContent: result.checkoutFormContent, paymentPageUrl: result.paymentPageUrl, token: result.token });
  } catch (error) {
    if (error instanceof iyzico.IyzicoError || error instanceof paytr.PaytrError) {
      return res.status(400).json({ message: `Ödeme başlatılamadı: ${error.message}` });
    }
    console.error('startPosCheckout error:', error);
    res.status(500).json({ message: 'Ödeme başlatılamadı.' });
  }
};

/**
 * iyzico ödeme formu dönüşü (tarayıcı POST). Ödeme iyzico'dan sorgulanır, tutar eşleşirse tamamlanır.
 */
export const posCallback = async (req, res) => {
  const slug = String(req.query.tenant || '').toLowerCase();
  const back = (status, message) =>
    res.redirect(303, `${tenantUrl(slug)}/bayi/finance?pos=${status}${message ? `&message=${encodeURIComponent(message)}` : ''}`);

  try {
    const token = String(req.body?.token || '');
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    const creds = tenantPosCreds(tenant);
    if (!tenant || creds?.provider !== 'IYZICO' || !token) return back('failed', 'Ödeme bilgisi bulunamadı.');

    await runWithTenant(tenant.id, async () => {
      const payment = await prisma.payment.findFirst({ where: { token, provider: 'IYZICO' } });
      if (!payment) return back('failed', 'Ödeme kaydı bulunamadı.');
      if (payment.status === 'COMPLETED') return back('success');

      const detail = await iyzico.retrievePaymentCheckout(creds, token);
      const paid = String(detail.paymentStatus).toUpperCase() === 'SUCCESS' && round2(parseFloat(detail.paidPrice)) === round2(payment.amount);
      if (!paid) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED' } });
        return back('failed', detail.errorMessage || 'Ödeme onaylanmadı.');
      }
      await completeDealerPayment(tenant, payment, {
        reference: `iyzico:${detail.paymentId}`,
        cardLast4: detail.lastFourDigits,
        description: `Kartla ödeme (**** ${detail.lastFourDigits || ''}) · iyzico ${detail.paymentId}`
      });
      return back('success');
    });
  } catch (error) {
    console.error('posCallback error:', error);
    back('failed', error instanceof iyzico.IyzicoError ? error.message : 'Ödeme doğrulanamadı.');
  }
};

/**
 * PayTR ödeme bildirimi (sunucudan sunucuya, PayTR panelindeki "Bildirim URL").
 * İmza doğrulanır; başarılı ve tutar eşleşiyorsa ödeme tamamlanır. PayTR "OK" yanıtı alana kadar tekrar dener.
 */
export const paytrNotify = async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    const creds = tenantPosCreds(tenant);
    if (!tenant || creds?.provider !== 'PAYTR') return res.status(404).send('PAYTR notification failed: unknown merchant');
    if (!paytr.verifyNotification(creds, req.body)) return res.status(400).send('PAYTR notification failed: bad hash');

    await runWithTenant(tenant.id, async () => {
      const payment = await prisma.payment.findFirst({ where: { token: String(req.body.merchant_oid), provider: 'PAYTR' } });
      if (!payment || payment.status !== 'PENDING') return; // bilinmeyen veya daha önce işlenmiş bildirim

      // Taksit farkı olmadan istenen tutar (kuruş) bizim kaydımızla eşleşmeli
      const requested = parseInt(req.body.payment_amount ?? req.body.total_amount);
      if (req.body.status !== 'success' || requested !== Math.round(payment.amount * 100)) {
        await prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'FAILED', reference: `paytr:${req.body.failed_reason_code || 'mismatch'}` } });
        return;
      }
      await completeDealerPayment(tenant, payment, {
        reference: `paytr:${payment.token}`,
        description: `Kartla ödeme · PayTR ${payment.token}${req.body.test_mode === '1' ? ' (test)' : ''}`
      });
    });
    res.send('OK');
  } catch (error) {
    console.error('paytrNotify error:', error);
    res.status(500).send('PAYTR notification failed');
  }
};
