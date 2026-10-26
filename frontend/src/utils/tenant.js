/**
 * Uygulamanın hangi modda açıldığını alt alan adından belirler:
 *   alanadi.com            → 'root'     (tanıtım + kayıt)
 *   platform.alanadi.com   → 'platform' (platform sahibi paneli)
 *   <firma>.alanadi.com    → 'tenant'   (firmanın admin + bayi portalı)
 *   b2b.firmasi.com        → 'tenant'   (firmanın doğrulanmış özel alan adı; firma sunucuda X-Tenant-Host ile bulunur)
 *
 * Geliştirmede kök alan adı "localhost"tur: akis.localhost:5173, platform.localhost:5173.
 * Alt alan adı kullanılamayan ortamlarda (IP ile erişim) VITE_DEFAULT_TENANT kullanılır.
 */
const ROOT_DOMAIN = (import.meta.env.VITE_ROOT_DOMAIN || 'localhost').toLowerCase();

const isIpOrLocal = (host) => /^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost';

const resolve = () => {
  const host = window.location.hostname.toLowerCase();
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return { mode: 'root', slug: null };
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = host.slice(0, -(ROOT_DOMAIN.length + 1));
    if (sub === 'platform') return { mode: 'platform', slug: null };
    if (!sub.includes('.')) return { mode: 'tenant', slug: sub };
  }
  const fallback = import.meta.env.VITE_DEFAULT_TENANT;
  if (fallback) return { mode: 'tenant', slug: fallback };
  if (!isIpOrLocal(host) && !host.endsWith(`.${ROOT_DOMAIN}`)) return { mode: 'tenant', slug: null, customHost: host };
  return { mode: 'root', slug: null };
};

export const { mode: APP_MODE, slug: TENANT_SLUG, customHost: CUSTOM_HOST = null } = resolve();

const portPart = window.location.port ? `:${window.location.port}` : '';
export const tenantUrl = (slug) => `${window.location.protocol}//${slug}.${ROOT_DOMAIN}${portPart}`;
export const rootUrl = () => `${window.location.protocol}//${ROOT_DOMAIN}${portPart}`;
export const platformUrl = () => tenantUrl('platform');
export const ROOT_DOMAIN_LABEL = ROOT_DOMAIN;
