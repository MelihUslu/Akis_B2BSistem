import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_VERIFY } from '../config.js';
import { markOnce } from '../utils/redis.js';

/**
 * Ortak giriş sayfasından (kök alan adı /giris) firmanın kendi portalına oturum aktarımı.
 * E-posta + şifre kök alan adında doğrulanır; kullanıcı portal adresine kısa ömürlü, tek kullanımlık bir kodla
 * yönlendirilir ve portal bu kodu kendi oturumuna çevirir (oturum her alan adının kendi tarayıcı deposundadır).
 * Kod yalnızca ilgili firmada geçerlidir; kullanılan kodlar süreleri dolana kadar işaretlenir (Redis varsa tüm süreçler /
 * sunucular arasında ortak, yoksa süreç belleğinde): aynı kod ikinci kez kullanılamaz.
 */
const TTL_SECONDS = 120;

export class HandoffError extends Error {}

// via: girişin nasıl yapıldığı (işlem kaydında görünür), ör. 'Google'
export const issueHandoff = (user, via) =>
  jwt.sign({ typ: 'login-handoff', uid: user.id, tenantId: user.tenantId, ...(via && { via }), jti: crypto.randomBytes(12).toString('hex') }, JWT_SECRET, { expiresIn: TTL_SECONDS });

export const consumeHandoff = async (code, tenantId) => {
  let payload;
  try {
    payload = jwt.verify(String(code || ''), JWT_SECRET, JWT_VERIFY);
  } catch {
    throw new HandoffError('Giriş bağlantısının süresi doldu. Lütfen tekrar giriş yapın.');
  }
  if (payload.typ !== 'login-handoff' || payload.tenantId !== tenantId) throw new HandoffError('Giriş bağlantısı bu portala ait değil.');
  const ttl = Math.max(1000, payload.exp * 1000 - Date.now());
  if (!(await markOnce(`handoff:${payload.jti}`, ttl))) throw new HandoffError('Bu giriş bağlantısı daha önce kullanıldı. Lütfen tekrar giriş yapın.');
  return { uid: payload.uid, via: payload.via || null };
};
