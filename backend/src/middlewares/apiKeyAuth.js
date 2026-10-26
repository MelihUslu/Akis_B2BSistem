import crypto from 'crypto';
import prisma, { runAsPlatform, runWithTenant } from '../utils/prisma.js';
import { tenantAccess } from './tenantMiddleware.js';

export const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

/**
 * Entegrasyon API'si kimlik doğrulaması: "Authorization: Bearer <anahtar>" veya "X-API-Key: <anahtar>".
 * Firma, anahtardan belirlenir; istek o firmanın bağlamında çalışır.
 */
export const apiKeyAuth = async (req, res, next) => {
  const raw = req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!raw || !String(raw).startsWith('akb2b_')) {
    return res.status(401).json({ error: 'API anahtarı eksik veya geçersiz.' });
  }

  try {
    const key = await runAsPlatform(() => prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(String(raw)) }, include: { tenant: { include: { plan: true } } } }));
    if (!key || key.revokedAt) return res.status(401).json({ error: 'API anahtarı geçersiz veya iptal edilmiş.' });
    if (!tenantAccess(key.tenant).active) return res.status(402).json({ error: 'Firmanın aboneliği aktif değil.' });

    req.tenant = key.tenant;
    req.apiKey = { id: key.id, name: key.name };
    // Son kullanım zamanı (dakikada en fazla bir kez yazılır)
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      runAsPlatform(() => prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })).catch(() => {});
    }
    runWithTenant(key.tenant.id, next);
  } catch (error) {
    next(error);
  }
};
