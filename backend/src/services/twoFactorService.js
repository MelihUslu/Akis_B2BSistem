import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma.js';
import { JWT_SECRET } from '../config.js';
import { encrypt, decrypt } from '../utils/secretBox.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../utils/totp.js';

const hash = (code) => crypto.createHash('sha256').update(code.replace(/[^a-z0-9]/gi, '').toLowerCase()).digest('hex');

export class TwoFactorError extends Error {}

// Giriş: şifre doğruysa ve 2FA açıksa kısa ömürlü doğrulama bileti verilir
export const issueChallenge = (user) =>
  jwt.sign({ uid: user.id, purpose: '2fa', tenantId: user.tenantId ?? null }, JWT_SECRET, { expiresIn: '5m' });

export const readChallenge = (challenge) => {
  try {
    const payload = jwt.verify(String(challenge || ''), JWT_SECRET);
    if (payload.purpose !== '2fa') throw new Error();
    return payload;
  } catch {
    throw new TwoFactorError('Doğrulama süresi doldu. Lütfen tekrar giriş yapın.');
  }
};

/**
 * Kod doğrulaması: 6 haneli uygulama kodu veya tek kullanımlık yedek kod.
 * Yedek kod kullanılırsa listeden düşülür.
 */
export const checkCode = async (user, code) => {
  if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) return false;
  const value = String(code || '').trim();
  if (/^\d{6}$/.test(value.replace(/\s/g, ''))) return verifyTotp(decrypt(user.twoFactorSecretEnc), value);

  const codes = Array.isArray(user.twoFactorRecovery) ? user.twoFactorRecovery : [];
  const h = hash(value);
  if (!value || !codes.includes(h)) return false;
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorRecovery: codes.filter(c => c !== h) } });
  return true;
};

// Kurulum: yeni gizli anahtar üretilir (henüz aktif değil); QR için otpauth adresi döner
export const startSetup = async (user, issuer) => {
  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecretEnc: encrypt(secret), twoFactorEnabled: false } });
  return { secret, otpauthUrl: otpauthUrl({ secret, account: user.email, issuer }) };
};

// Uygulamadan okunan kod doğruysa 2FA açılır; 8 yedek kod bir kez gösterilir
export const enable = async (user, code) => {
  if (!user.twoFactorSecretEnc) throw new TwoFactorError('Önce kurulumu başlatın.');
  if (!verifyTotp(decrypt(user.twoFactorSecretEnc), code)) throw new TwoFactorError('Kod hatalı. Uygulamadaki güncel 6 haneli kodu girin.');
  const recoveryCodes = Array.from({ length: 8 }, () => {
    const raw = crypto.randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorRecovery: recoveryCodes.map(hash) } });
  return recoveryCodes;
};

export const disable = async (user, password, code) => {
  if (!(await bcrypt.compare(String(password || ''), user.password))) throw new TwoFactorError('Şifre hatalı.');
  if (!(await checkCode(user, code))) throw new TwoFactorError('Doğrulama kodu hatalı.');
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorRecovery: null } });
};

export const status = (user) => ({
  enabled: user.twoFactorEnabled,
  recoveryCodesLeft: Array.isArray(user.twoFactorRecovery) ? user.twoFactorRecovery.length : 0
});
