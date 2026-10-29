import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

/**
 * Ortak giriş sayfasından (kök alan adı /giris) firmanın kendi portalına oturum aktarımı.
 * E-posta + şifre kök alan adında doğrulanır; kullanıcı portal adresine kısa ömürlü, tek kullanımlık bir kodla
 * yönlendirilir ve portal bu kodu kendi oturumuna çevirir (oturum her alan adının kendi tarayıcı deposundadır).
 * Kod yalnızca ilgili firmada geçerlidir; kullanılan kodlar süreleri dolana kadar bellekte tutulur.
 */
const TTL_SECONDS = 120;
const used = new Map(); // jti -> son geçerlilik (ms)

export class HandoffError extends Error {}

export const issueHandoff = (user) =>
  jwt.sign({ typ: 'login-handoff', uid: user.id, tenantId: user.tenantId, jti: crypto.randomBytes(12).toString('hex') }, JWT_SECRET, { expiresIn: TTL_SECONDS });

export const consumeHandoff = (code, tenantId) => {
  let payload;
  try {
    payload = jwt.verify(String(code || ''), JWT_SECRET);
  } catch {
    throw new HandoffError('Giriş bağlantısının süresi doldu. Lütfen tekrar giriş yapın.');
  }
  if (payload.typ !== 'login-handoff' || payload.tenantId !== tenantId) throw new HandoffError('Giriş bağlantısı bu portala ait değil.');
  const now = Date.now();
  for (const [k, exp] of used) if (exp < now) used.delete(k);
  if (used.has(payload.jti)) throw new HandoffError('Bu giriş bağlantısı daha önce kullanıldı. Lütfen tekrar giriş yapın.');
  used.set(payload.jti, payload.exp * 1000);
  return payload.uid;
};
