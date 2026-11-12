import bcrypt from 'bcrypt';
import { failureLimiter } from '../middlewares/rateLimit.js';

/**
 * Giriş korumaları (firma, ortak giriş, platform girişi ve 2FA kodu):
 *  - Hesap yoksa da şifre karşılaştırılır: yanıt süresinden e-postanın kayıtlı olup olmadığı anlaşılmaz.
 *  - Hesap başına 15 dakikada 10 hatalı denemeden sonra o hesaba giriş 15 dakika kapanır (IP'den bağımsız).
 */
const DUMMY_HASH = bcrypt.hashSync('akis-olmayan-hesap', 10);

export const checkPassword = async (user, password) => {
  const plain = String(password || '');
  if (!user?.password) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, user.password);
};
export const comparePasswordTiming = (password) => bcrypt.compare(String(password || ''), DUMMY_HASH);

export const loginFailures = failureLimiter({ windowMs: 15 * 60 * 1000, max: 10, prefix: 'login' });
export const LOCKED_MESSAGE = 'Bu hesap için çok fazla hatalı deneme yapıldı. Güvenliğiniz için 15 dakika sonra tekrar deneyin.';
export const emailKey = (email) => String(email || '').toLowerCase().trim().slice(0, 160);
