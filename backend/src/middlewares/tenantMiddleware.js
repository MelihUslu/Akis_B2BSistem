import prisma, { runWithTenant, runAsPlatform } from '../utils/prisma.js';

const CACHE_MS = 15 * 1000;
const cache = new Map(); // slug -> { tenant, at }

export const invalidateTenantCache = (slug) => { hostCache.clear(); return slug ? cache.delete(slug) : cache.clear(); };

const loadTenant = async (slug) => {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tenant;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, include: { plan: true } });
  // Bulunamayan adresler önbelleğe alınmaz: yeni kayıt olan firma hemen erişilebilir olsun
  if (tenant) cache.set(slug, { tenant, at: Date.now() });
  return tenant;
};

// Özel alan adı (b2b.firmasi.com) -> firma. Yalnızca doğrulanmış alan adları eşleşir.
const hostCache = new Map(); // host -> { tenant|null, at }
export const loadTenantByHost = async (host) => {
  host = String(host || '').trim().toLowerCase().replace(/:\d+$/, '');
  if (!host) return null;
  const hit = hostCache.get(host);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tenant;
  const tenant = await runAsPlatform(() => prisma.tenant.findFirst({
    where: { customDomain: host, customDomainVerifiedAt: { not: null } }, include: { plan: true }
  }));
  hostCache.set(host, { tenant, at: Date.now() });
  return tenant;
};
export const invalidateHostCache = () => hostCache.clear();

const DAY = 24 * 60 * 60 * 1000;
export const GRACE_DAYS = 3; // Ödeme gecikmesinde erişim bu kadar gün daha açık kalır

/**
 * Kiracının sisteme erişimi açık mı?
 * TRIAL: deneme bitene kadar · ACTIVE/PAST_DUE: dönem sonu + GRACE_DAYS'e kadar · SUSPENDED/CANCELLED: kapalı
 */
export const tenantAccess = (tenant, now = new Date()) => {
  if (!tenant) return { active: false, reason: 'NOT_FOUND' };
  if (tenant.status === 'SUSPENDED') return { active: false, reason: 'SUSPENDED' };
  if (tenant.status === 'CANCELLED') return { active: false, reason: 'CANCELLED' };
  if (tenant.status === 'TRIAL') {
    return tenant.trialEndsAt && tenant.trialEndsAt > now
      ? { active: true, reason: 'TRIAL' }
      : { active: false, reason: 'TRIAL_EXPIRED' };
  }
  const end = tenant.currentPeriodEnd ? new Date(tenant.currentPeriodEnd.getTime() + GRACE_DAYS * DAY) : null;
  return end && end > now ? { active: true, reason: tenant.status } : { active: false, reason: 'EXPIRED' };
};

export const ACCESS_MESSAGES = {
  NOT_FOUND: 'Firma bulunamadı.',
  SUSPENDED: 'Bu firmanın hesabı askıya alınmıştır.',
  CANCELLED: 'Bu firmanın aboneliği sonlandırılmıştır.',
  TRIAL_EXPIRED: 'Deneme süreniz sona erdi. Devam etmek için bir paket seçin.',
  EXPIRED: 'Abonelik süreniz doldu. Devam etmek için ödemenizi yapın.'
};

/**
 * İsteğin hangi kiracıya ait olduğunu `X-Tenant` başlığından (frontend alt alan adından gönderir)
 * ya da özel alan adında `X-Tenant-Host` başlığından çözer ve isteğin geri kalanını o kiracının bağlamında çalıştırır.
 */
export const resolveTenant = async (req, res, next) => {
  const slug = String(req.headers['x-tenant'] || '').trim().toLowerCase();
  const host = req.headers['x-tenant-host'];
  if (!slug && !host) return res.status(400).json({ message: 'Firma bilgisi eksik (alt alan adı).', code: 'TENANT_REQUIRED' });

  try {
    const tenant = slug ? await loadTenant(slug) : await loadTenantByHost(host);
    if (!tenant) return res.status(404).json({ message: ACCESS_MESSAGES.NOT_FOUND, code: 'TENANT_NOT_FOUND' });
    req.tenant = tenant;
    runWithTenant(tenant.id, next);
  } catch (error) {
    next(error);
  }
};

export const platformContext = (req, res, next) => runAsPlatform(next);
