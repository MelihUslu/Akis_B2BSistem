import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Tarih filtreleri ("bugün", "1–31 Ekim") ve raporlar firma saatine göre yorumlanır.
// Sunucu UTC'de çalışsa bile gece yarısı sınırları Türkiye saatine göre olur.
process.env.TZ = process.env.TZ || 'Europe/Istanbul';

if (!process.env.JWT_SECRET) {
  console.error('[Config] JWT_SECRET tanımlı değil. Lütfen backend/.env dosyasına güçlü bir JWT_SECRET ekleyin.');
  process.exit(1);
}

export const JWT_SECRET = process.env.JWT_SECRET;
export const PORT = process.env.PORT || 5001;

// Kök alan adı: kiracılar <slug>.ROOT_DOMAIN, platform paneli platform.ROOT_DOMAIN adresinde çalışır.
// Geliştirmede "localhost" (akis.localhost:5173, platform.localhost:5173)
export const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || 'localhost').toLowerCase();
const FRONTEND_PROTOCOL = process.env.FRONTEND_PROTOCOL || 'http';
const FRONTEND_PORT = process.env.FRONTEND_PORT ?? '5173';
const portPart = FRONTEND_PORT ? `:${FRONTEND_PORT}` : '';

export const rootUrl = () => `${FRONTEND_PROTOCOL}://${ROOT_DOMAIN}${portPart}`;
export const tenantUrl = (slug) => `${FRONTEND_PROTOCOL}://${slug}.${ROOT_DOMAIN}${portPart}`;
export const platformUrl = () => tenantUrl('platform');
// Doğrulanmış özel alan adı varsa (b2b.firmasi.com) firmanın bağlantıları oradan verilir
export const tenantPortalUrl = (tenant) =>
  tenant?.customDomain && tenant.customDomainVerifiedAt ? `https://${tenant.customDomain}` : tenantUrl(tenant.slug);

// Backend'in dışarıdan erişilen adresi (iyzico geri dönüş adresi ve yüklenen dosya linkleri için)
export const API_PUBLIC_URL = process.env.API_PUBLIC_URL || `http://localhost:${PORT}`;
export const PUBLIC_URL = process.env.PUBLIC_URL || '';

export const isRootHost = (hostname) => hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);

// Kök alan adı ve tüm alt alan adlarından gelen istekler kabul edilir (özel alan adları server.js'te ayrıca kontrol edilir)
export const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return isRootHost(hostname);
  } catch {
    return false;
  }
};

// Alt alan adı olarak kullanılamayacak isimler
export const RESERVED_SLUGS = new Set([
  'www', 'api', 'app', 'platform', 'admin', 'mail', 'smtp', 'static', 'cdn', 'assets', 'help', 'destek',
  'support', 'blog', 'docs', 'status', 'billing', 'panel', 'test', 'demo-api'
]);
