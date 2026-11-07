import { typesFor, emailPrefs, smsTypesFor, smsPrefs } from '../services/notificationPrefs.js';
import { smsActive, normalizePhone, PhoneError } from '../services/smsService.js';
import { issueResetToken, findByResetToken, setNewPassword, passwordProblem } from '../services/passwordResetService.js';
import { sendPasswordResetMail } from '../services/mailService.js';
import { tenantPortalUrl } from '../config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import { JWT_SECRET } from '../config.js';
import { tenantAccess, ACCESS_MESSAGES } from '../middlewares/tenantMiddleware.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import * as twoFactor from '../services/twoFactorService.js';
import { audit, clientIp } from '../services/auditService.js';
import { consumeHandoff, HandoffError } from '../services/loginHandoff.js';
import { consumeTicket, GoogleLoginError } from '../services/googleAuth.js';

// Oturum token'ı + istemciye dönen kullanıcı bilgisi
const sessionFor = (user, tenantId) => ({
  token: jwt.sign({ id: user.id, role: user.role, companyId: user.companyId, tenantId }, JWT_SECRET, { expiresIn: '1d' }),
  user: {
    id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId,
    isOwner: user.isOwner, permissions: Array.isArray(user.permissions) ? user.permissions : [],
    orderApproval: user.orderApproval, orderApprovalLimit: user.orderApprovalLimit
  }
});

const ALLOWED_ROLES = ['ADMIN', 'BAYI', 'PLASIYER'];

// Sadece ADMIN yeni kullanıcı (admin, plasiyer veya bayi kullanıcısı) oluşturabilir
export const register = async (req, res) => {
  try {
    const { email, password, name, role, companyId } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Ad, e-posta ve şifre zorunludur.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Şifre en az 8 karakter olmalıdır.' });
    }
    if (role && !ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Geçersiz rol.' });
    }

    if ((role || 'BAYI') === 'ADMIN') await assertWithinLimit(req.tenant, 'admins');

    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Bu e-posta adresi ile zaten kayıtlı bir kullanıcı var.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        name,
        role: role || 'BAYI',
        emailVerifiedAt: new Date(),
        companyId: companyId ? parseInt(companyId) : null,
      },
    });

    res.status(201).json({ message: 'Kullanıcı başarıyla oluşturuldu.', user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error instanceof LimitError) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error('Register error:', error);
    res.status(500).json({ message: 'Kayıt sırasında bir sunucu hatası oluştu.' });
  }
};

// Şifre (ya da ortak girişten gelen aktarım kodu, Google bileti) doğrulandıktan sonraki ortak kontroller ve oturum.
// via: işlem kaydında girişin nasıl yapıldığı (ör. 'Google')
const finishLogin = async (req, res, user, via = null) => {
  if (!user.isActive) {
    return res.status(403).json({ message: 'Kullanıcı hesabınız devre dışı bırakılmış. Firma yöneticinizle iletişime geçin.' });
  }

  if (user.emailVerifyToken) {
    return res.status(403).json({ message: 'Lütfen önce e-posta adresinize gönderilen doğrulama linkine tıklayın.', code: 'EMAIL_NOT_VERIFIED' });
  }

  const access = tenantAccess(req.tenant);
  if (!access.active && (user.role !== 'ADMIN' || ['SUSPENDED', 'CANCELLED'].includes(access.reason))) {
    return res.status(402).json({
      message: user.role === 'ADMIN' ? ACCESS_MESSAGES[access.reason] : 'Portal şu anda kullanıma kapalı. Lütfen tedarikçi firmanızla iletişime geçin.',
      code: 'SUBSCRIPTION_INACTIVE'
    });
  }

  if (user.role === 'BAYI') {
    if (user.company?.status === 'PENDING') {
      return res.status(403).json({ message: 'Bayilik başvurunuz henüz onaylanmadı.' });
    }
    if (user.company?.status !== 'ACTIVE') {
      return res.status(403).json({ message: 'Hesabınız askıya alınmıştır. Lütfen firma yetkilisiyle iletişime geçin.' });
    }
  }

  // İki aşamalı doğrulama açıksa önce kod istenir
  if (user.twoFactorEnabled) {
    return res.json({ twoFactorRequired: true, challenge: twoFactor.issueChallenge(user) });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  if (user.role === 'ADMIN') audit({ tenantId: req.tenant.id, actorId: user.id, actorName: user.name, action: via ? `Giriş yapıldı (${via})` : 'Giriş yapıldı', ip: clientIp(req) });

  res.status(200).json({ message: 'Giriş başarılı.', ...sessionFor(user, req.tenant.id) });
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Kullanıcı sadece bu alt alan adının kiracısında aranır
    const user = await prisma.user.findFirst({ where: { email: String(email || '').toLowerCase().trim() }, include: { company: true } });
    if (!user || !(await bcrypt.compare(password || '', user.password))) {
      audit({ tenantId: req.tenant.id, actorType: 'USER', actorId: user?.id, actorName: String(email || '').slice(0, 100), action: 'Başarısız giriş denemesi', ip: clientIp(req) });
      return res.status(401).json({ message: 'Geçersiz e-posta veya şifre.' });
    }

    return await finishLogin(req, res, user);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Giriş sırasında bir sunucu hatası oluştu.' });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        company: {
          include: { plasiyer: { select: { name: true, email: true } } }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
    }

    const { password, twoFactorSecretEnc, twoFactorRecovery, emailVerifyToken, passwordResetHash, passwordResetExpires, cart, cartUpdatedAt, ...userData } = user;
    // Bayi adına işlem: kişi kendi kimliğiyle kalır, "company" işlem yapılan bayidir (katalog başlığı, sorumlu plasiyer)
    const full = req.user.actingAs
      ? await prisma.company.findUnique({ where: { id: req.user.companyId }, include: { plasiyer: { select: { name: true, email: true } } } })
      : userData.company;
    // XML besleme anahtarı yalnızca Profilim'de ana kullanıcıya gösterilir
    const company = full && { ...full, feedToken: undefined };
    res.json({ ...userData, company, actingAs: req.user.actingAs || null, impersonatedBy: req.user.impersonatedBy || null });
  } catch (error) {
    res.status(500).json({ message: 'Kullanıcı bilgileri alınamadı.' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'Yeni şifre en az 8 karakter olmalıdır.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!(await bcrypt.compare(currentPassword || '', user.password))) {
      return res.status(400).json({ message: 'Mevcut şifreniz hatalı.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() }
    });

    // Diğer cihazlardaki oturumlar kapanır; bu cihaz yeni oturumla devam eder
    res.json({ message: 'Şifreniz güncellendi. Diğer cihazlardaki oturumlarınız kapatıldı.', ...sessionFor(user, req.tenant.id) });
  } catch (error) {
    res.status(500).json({ message: 'Şifre güncellenemedi.' });
  }
};

// Admin: rol bazlı kullanıcı listesi (örn. plasiyer seçimi için)
export const listUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const users = await prisma.user.findMany({
      where: role ? { role } : {},
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { name: 'asc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Kullanıcılar getirilemedi.' });
  }
};

// ─── İki aşamalı doğrulama ───────────────────────────────────────────────────

// Girişin ikinci adımı: doğrulama bileti + uygulama kodu (veya yedek kod)
// Ortak giriş sayfasından (/giris) gelen tek kullanımlık kodla oturum açma
export const handoffLogin = async (req, res) => {
  try {
    const { uid, via } = await consumeHandoff(req.body?.code, req.tenant.id);
    const user = await prisma.user.findFirst({ where: { id: uid }, include: { company: true } });
    if (!user) return res.status(401).json({ message: 'Kullanıcı bulunamadı.' });
    return await finishLogin(req, res, user, via);
  } catch (error) {
    if (error instanceof HandoffError) return res.status(401).json({ message: error.message });
    console.error('Handoff login error:', error);
    res.status(500).json({ message: 'Giriş sırasında bir sunucu hatası oluştu.' });
  }
};

/**
 * Portalın giriş sayfasından başlatılan Google girişi: bilet (Google'ın doğruladığı e-posta) bu portaldaki hesaba
 * çevrilir. Hesap yoksa açılmaz; yönetici bayiyi / ekip üyesini bu e-postayla tanımlamış olmalıdır.
 * Google e-postayı doğruladığı için doğrulama bekleyen hesap doğrulanmış sayılır.
 */
export const googleLogin = async (req, res) => {
  try {
    const { email } = await consumeTicket(req.body?.ticket, req.tenant.slug);
    let user = await prisma.user.findFirst({ where: { email }, include: { company: true } });
    if (!user) {
      audit({ tenantId: req.tenant.id, actorType: 'USER', actorName: email.slice(0, 100), action: 'Başarısız giriş denemesi (Google, hesap yok)', ip: clientIp(req) });
      return res.status(401).json({ message: 'Bu Google hesabının e-posta adresiyle bu portalda kayıtlı bir hesap yok.', code: 'GOOGLE_NO_ACCOUNT', email });
    }
    if (user.emailVerifyToken) {
      user = await prisma.user.update({ where: { id: user.id }, data: { emailVerifyToken: null, emailVerifiedAt: new Date() }, include: { company: true } });
    }
    return await finishLogin(req, res, user, 'Google');
  } catch (error) {
    if (error instanceof GoogleLoginError) return res.status(401).json({ message: error.message });
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Giriş sırasında bir sunucu hatası oluştu.' });
  }
};

export const verifyTwoFactorLogin = async (req, res) => {
  try {
    const { uid, tenantId } = twoFactor.readChallenge(req.body.challenge);
    if (tenantId !== req.tenant.id) return res.status(401).json({ message: 'Doğrulama bu firmaya ait değil.' });
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user || !user.isActive) return res.status(401).json({ message: 'Kullanıcı bulunamadı.' });
    if (!(await twoFactor.checkCode(user, req.body.code))) {
      audit({ tenantId, actorId: user.id, actorName: user.name, action: 'Hatalı 2FA kodu', ip: clientIp(req) });
      return res.status(401).json({ message: 'Doğrulama kodu hatalı.' });
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    audit({ tenantId, actorId: user.id, actorName: user.name, action: 'Giriş yapıldı (2FA)', ip: clientIp(req) });
    res.json({ message: 'Giriş başarılı.', ...sessionFor(user, tenantId) });
  } catch (error) {
    if (error instanceof twoFactor.TwoFactorError) return res.status(401).json({ message: error.message });
    res.status(500).json({ message: 'Doğrulama yapılamadı.' });
  }
};

const loadSelf = (req) => prisma.user.findUnique({ where: { id: req.user.id } });

export const twoFactorStatus = async (req, res) => res.json(twoFactor.status(await loadSelf(req)));

export const twoFactorSetup = async (req, res) => {
  const user = await loadSelf(req);
  if (user.twoFactorEnabled) return res.status(400).json({ message: 'İki aşamalı doğrulama zaten açık.' });
  res.json(await twoFactor.startSetup(user, `${req.tenant.name} B2B`));
};

export const twoFactorEnable = async (req, res) => {
  try {
    const recoveryCodes = await twoFactor.enable(await loadSelf(req), req.body.code);
    res.json({ message: 'İki aşamalı doğrulama açıldı.', recoveryCodes });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const twoFactorDisable = async (req, res) => {
  try {
    await twoFactor.disable(await loadSelf(req), req.body.password, req.body.code);
    res.json({ message: 'İki aşamalı doğrulama kapatıldı.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ─── Şifremi unuttum ─────────────────────────────────────────────────────────

// E-posta kayıtlı olsun olmasın aynı yanıt döner (hangi adreslerin kayıtlı olduğu dışarıdan anlaşılamaz)
export const forgotPassword = async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const generic = { message: 'Bu e-posta adresi kayıtlıysa şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu (ve gereksiz klasörünü) kontrol edin.' };
  if (!email) return res.status(400).json({ message: 'E-posta adresinizi girin.' });
  try {
    const user = await prisma.user.findFirst({ where: { email, isActive: true } });
    if (user) {
      const token = await issueResetToken(user.id);
      await sendPasswordResetMail({ to: user.email, name: user.name, brand: req.tenant.name, link: `${tenantPortalUrl(req.tenant)}/reset-password?token=${token}` });
      audit({ tenantId: req.tenant.id, actorType: 'USER', actorId: user.id, actorName: user.name, action: 'Şifre sıfırlama bağlantısı istendi', ip: clientIp(req) });
    }
  } catch (error) {
    console.error('[Şifre sıfırlama]', error.message);
  }
  res.json(generic);
};

export const resetPassword = async (req, res) => {
  const problem = passwordProblem(req.body.password);
  if (problem) return res.status(400).json({ message: problem });
  const user = await findByResetToken(req.body.token);
  if (!user) return res.status(400).json({ message: 'Bağlantı geçersiz veya süresi dolmuş. Yeni bir sıfırlama bağlantısı isteyin.' });
  await setNewPassword(user.id, req.body.password);
  audit({ tenantId: req.tenant.id, actorType: 'USER', actorId: user.id, actorName: user.name, action: 'Şifre sıfırlandı (e-posta bağlantısı)', ip: clientIp(req) });
  res.json({ message: 'Şifreniz değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.' });
};

// ─── Bildirim tercihleri (e-posta) ───────────────────────────────────────────

// SMS bölümü yalnızca firmada SMS açıkken gösterilir (cep telefonu her zaman kaydedilebilir)
const smsSection = (tenant, user) => ({ available: smsActive(tenant), types: smsTypesFor(tenant, user.role), prefs: smsPrefs(tenant, user) });

export const getNotificationPrefs = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, notificationPrefs: true, phone: true, smsPrefs: true } });
  res.json({ types: typesFor(user.role), prefs: emailPrefs(user), phone: user.phone || '', sms: smsSection(req.tenant, user) });
};

export const saveNotificationPrefs = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true, notificationPrefs: true, smsPrefs: true } });
  const data = {};
  if (req.body.prefs) {
    const allowed = new Set(typesFor(user.role).map((t) => t.id));
    data.notificationPrefs = Object.fromEntries(Object.entries(req.body.prefs).filter(([k]) => allowed.has(k)).map(([k, v]) => [k, v === true]));
  }
  if (req.body.smsPrefs) {
    const allowed = new Set(smsTypesFor(req.tenant, user.role).map((t) => t.id));
    data.smsPrefs = { ...(user.smsPrefs || {}), ...Object.fromEntries(Object.entries(req.body.smsPrefs).filter(([k]) => allowed.has(k)).map(([k, v]) => [k, v === true])) };
  }
  if (req.body.phone !== undefined) {
    try { data.phone = normalizePhone(req.body.phone); } catch (error) {
      if (error instanceof PhoneError) return res.status(400).json({ message: error.message });
      throw error;
    }
  }
  const saved = await prisma.user.update({ where: { id: req.user.id }, data, select: { role: true, notificationPrefs: true, phone: true, smsPrefs: true } });
  res.json({ message: 'Bildirim tercihleriniz kaydedildi.', prefs: emailPrefs(saved), phone: saved.phone || '', sms: smsSection(req.tenant, saved) });
};
