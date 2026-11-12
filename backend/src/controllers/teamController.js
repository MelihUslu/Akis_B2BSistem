import bcrypt from 'bcrypt';
import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import { normalizePermissions, PERMISSIONS } from '../services/permissions.js';
import { assertWithinLimit, LimitError } from '../services/limitService.js';
import { normalizePhone, PhoneError } from '../services/smsService.js';
import { sendCredentialsMail } from '../services/mailService.js';
import { normalizeDeny, ORDER_RULES } from '../services/dealerAccess.js';

const generatePassword = () => crypto.randomBytes(9).toString('base64url').slice(0, 12);
const publicUser = ({ password, emailVerifyToken, twoFactorSecretEnc, twoFactorRecovery, ...u }) => u;

const mailResult = (mail, email) => (mail.delivered
  ? `Giriş bilgileri ${email} adresine gönderildi.`
  : 'E-posta gönderilemedi (SMTP ayarlarını kontrol edin).');

// ─── Firma ekibi (yöneticiler) ───────────────────────────────────────────────

export const listTeam = async (req, res) => {
  const users = await prisma.user.findMany({ where: { role: 'ADMIN' }, orderBy: [{ isOwner: 'desc' }, { name: 'asc' }] });
  res.json({ users: users.map(publicUser), permissions: PERMISSIONS });
};

export const inviteTeamMember = async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const name = String(req.body.name || '').trim();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Ad ve geçerli bir e-posta girin.' });
    await assertWithinLimit(req.tenant, 'admins');
    if (await prisma.user.findFirst({ where: { email } })) return res.status(400).json({ message: 'Bu e-posta ile kayıtlı bir kullanıcı var.' });

    const password = generatePassword();
    const user = await prisma.user.create({
      data: {
        email, name, role: 'ADMIN', password: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(),
        permissions: normalizePermissions(req.body.permissions)
      }
    });
    const mail = await sendCredentialsMail({ to: email, name, password, tenant: req.tenant }).catch(() => ({ delivered: false }));
    res.status(201).json({ message: `${name} ekibe eklendi. ${mailResult(mail, email)}`, user: publicUser(user) });
  } catch (error) {
    if (error instanceof LimitError) return res.status(error.status).json({ message: error.message });
    res.status(400).json({ message: 'Kullanıcı eklenemedi.' });
  }
};

export const updateTeamMember = async (req, res) => {
  const id = parseInt(req.params.id);
  const target = await prisma.user.findFirst({ where: { id, role: 'ADMIN' } });
  if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
  if (target.isOwner && (req.body.isActive === false || req.body.permissions !== undefined)) {
    return res.status(400).json({ message: 'Firma sahibinin yetkileri değiştirilemez ve hesabı kapatılamaz.' });
  }
  if (target.id === req.user.id && req.body.isActive === false) return res.status(400).json({ message: 'Kendi hesabınızı kapatamazsınız.' });

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(req.body.name && { name: String(req.body.name).trim() }),
      ...(req.body.permissions !== undefined && { permissions: normalizePermissions(req.body.permissions) }),
      ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) })
    }
  });
  res.json({ message: 'Kullanıcı güncellendi.', user: publicUser(user) });
};

export const resetTeamMemberPassword = async (req, res) => {
  const target = await prisma.user.findFirst({ where: { id: parseInt(req.params.id), role: 'ADMIN' } });
  if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
  if (target.isOwner && !req.user.isOwner) return res.status(403).json({ message: 'Firma sahibinin şifresini yalnızca kendisi değiştirebilir.' });
  const password = generatePassword();
  // Açık oturumlar da kapanır (hesabından şüphelenilen kişinin şifresi sıfırlandığında eski oturumu çalışmaz)
  await prisma.user.update({ where: { id: target.id }, data: { password: await bcrypt.hash(password, 10), passwordChangedAt: new Date() } });
  const mail = await sendCredentialsMail({ to: target.email, name: target.name, password, isReset: true, tenant: req.tenant }).catch(() => ({ delivered: false }));
  res.json({ message: `Şifre sıfırlandı. ${mailResult(mail, target.email)}` });
};

// ─── Bayi kullanıcıları ──────────────────────────────────────────────────────
// Admin (DEALERS yetkisi) herhangi bir bayinin, bayinin ana kullanıcısı ise kendi firmasının kullanıcılarını yönetir.

const companyIdFor = (req) => (req.user.role === 'BAYI' ? req.user.companyId : parseInt(req.params.companyId));

const ensureDealerManager = (req, res) => {
  if (req.user.role === 'BAYI' && !req.user.isOwner) {
    res.status(403).json({ message: 'Kullanıcıları sadece firmanızın ana kullanıcısı yönetebilir.' });
    return false;
  }
  return true;
};

export const listDealerUsers = async (req, res) => {
  const users = await prisma.user.findMany({ where: { companyId: companyIdFor(req), role: 'BAYI' }, orderBy: [{ isOwner: 'desc' }, { name: 'asc' }] });
  res.json(users.map(publicUser));
};

export const addDealerUser = async (req, res) => {
  if (!ensureDealerManager(req, res)) return;
  const companyId = companyIdFor(req);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  // Portal kullanıcısı yalnızca bayiye açılır (müşteri / tedarikçi carisi portala giremez)
  if (!company || company.kind !== 'DEALER') return res.status(404).json({ message: 'Bayi bulunamadı.' });

  const email = String(req.body.email || '').toLowerCase().trim();
  const name = String(req.body.name || '').trim();
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Ad ve geçerli bir e-posta girin.' });
  if (await prisma.user.findFirst({ where: { email } })) return res.status(400).json({ message: 'Bu e-posta ile kayıtlı bir kullanıcı var.' });
  let phone;
  try { phone = normalizePhone(req.body.phone); } catch (error) { if (error instanceof PhoneError) return res.status(400).json({ message: error.message }); throw error; }

  const password = generatePassword();
  const user = await prisma.user.create({
    data: { email, name, phone, role: 'BAYI', companyId, password: await bcrypt.hash(password, 10), emailVerifiedAt: new Date() }
  });
  const mail = await sendCredentialsMail({ to: email, name, password, tenant: req.tenant }).catch(() => ({ delivered: false }));
  res.status(201).json({ message: `${name} eklendi. ${mailResult(mail, email)}`, user: publicUser(user) });
};

export const updateDealerUser = async (req, res) => {
  if (!ensureDealerManager(req, res)) return;
  const target = await prisma.user.findFirst({ where: { id: parseInt(req.params.userId), companyId: companyIdFor(req), role: 'BAYI' } });
  if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
  if (target.id === req.user.id && req.body.isActive === false) return res.status(400).json({ message: 'Kendi hesabınızı kapatamazsınız.' });

  const data = {};
  if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
  if (req.body.name) data.name = String(req.body.name).trim();
  // Cep telefonu (SMS bildirimi için; boş bırakılırsa silinir)
  if (req.body.phone !== undefined) {
    try { data.phone = normalizePhone(req.body.phone); } catch (error) { if (error instanceof PhoneError) return res.status(400).json({ message: error.message }); throw error; }
  }
  // Bayi kullanıcı yetkileri (ana kullanıcıya uygulanmaz; o her şeyi yapar ve siparişleri onaylar)
  if (req.body.dealerDeny !== undefined) {
    const deny = normalizeDeny(req.body.dealerDeny);
    if (!deny) return res.status(400).json({ message: 'Geçersiz yetki.' });
    data.dealerDeny = target.isOwner ? [] : deny;
  }
  if (req.body.orderApproval !== undefined) {
    const mode = String(req.body.orderApproval);
    if (!ORDER_RULES.includes(mode)) return res.status(400).json({ message: 'Geçersiz onay kuralı.' });
    const limit = Number(req.body.orderApprovalLimit);
    if (mode === 'OVER' && !(limit > 0)) return res.status(400).json({ message: 'Onay için tutar sınırını girin.' });
    data.orderApproval = target.isOwner ? 'NONE' : mode;
    data.orderApprovalLimit = mode === 'OVER' ? Math.round(limit * 100) / 100 : null;
  }
  // Ana kullanıcıyı sadece admin değiştirebilir
  if (req.body.isOwner === true && req.user.role === 'ADMIN') {
    await prisma.user.updateMany({ where: { companyId: target.companyId, role: 'BAYI' }, data: { isOwner: false } });
    data.isOwner = true;
  }
  const user = await prisma.user.update({ where: { id: target.id }, data });
  res.json({ message: 'Kullanıcı güncellendi.', user: publicUser(user) });
};

export const resetDealerUserPassword = async (req, res) => {
  if (!ensureDealerManager(req, res)) return;
  const target = await prisma.user.findFirst({ where: { id: parseInt(req.params.userId), companyId: companyIdFor(req), role: 'BAYI' } });
  if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
  const password = generatePassword();
  await prisma.user.update({ where: { id: target.id }, data: { password: await bcrypt.hash(password, 10), passwordChangedAt: new Date() } });
  const mail = await sendCredentialsMail({ to: target.email, name: target.name, password, isReset: true, tenant: req.tenant }).catch(() => ({ delivered: false }));
  res.json({ message: `Şifre sıfırlandı. ${mailResult(mail, target.email)}` });
};
