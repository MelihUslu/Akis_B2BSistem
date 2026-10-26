import crypto from 'crypto';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';

const TTL_MS = 60 * 60 * 1000; // bağlantı 1 saat geçerli
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

export const MIN_PASSWORD = 8;

// Yeni sıfırlama anahtarı üretir; düz anahtar yalnızca e-postadaki bağlantıda bulunur
export const issueResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.user.update({
    where: { id: userId },
    data: { passwordResetHash: sha256(token), passwordResetExpires: new Date(Date.now() + TTL_MS) }
  });
  return token;
};

export const findByResetToken = async (token, where = {}) => {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const user = await prisma.user.findFirst({ where: { ...where, passwordResetHash: sha256(token) } });
  if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) return null;
  return user;
};

// Şifreyi değiştirir, anahtarı tüketir ve önceki tüm oturumları geçersiz kılar
export const setNewPassword = (userId, password) =>
  bcrypt.hash(password, 10).then((hash) => prisma.user.update({
    where: { id: userId },
    data: { password: hash, passwordResetHash: null, passwordResetExpires: null, passwordChangedAt: new Date() }
  }));

export const passwordProblem = (password) =>
  typeof password !== 'string' || password.length < MIN_PASSWORD ? `Şifre en az ${MIN_PASSWORD} karakter olmalı.` : null;

// JWT "iat" (saniye) şifre değişikliğinden önceyse oturum geçersizdir
export const sessionRevoked = (decoded, passwordChangedAt) =>
  Boolean(passwordChangedAt && decoded.iat && decoded.iat * 1000 < passwordChangedAt.getTime() - 1000);
