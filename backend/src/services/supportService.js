import { SUPPORT_FILE_RE } from '../middlewares/upload.js';

// Hedef yanıt süreleri (saat). Ortam değişkeniyle değiştirilebilir.
export const SLA_HOURS = {
  HIGH: Number(process.env.SUPPORT_SLA_HIGH_HOURS) || 2,
  NORMAL: Number(process.env.SUPPORT_SLA_NORMAL_HOURS) || 24
};

export const dueDate = (priority, from = new Date()) =>
  new Date(from.getTime() + (SLA_HOURS[priority] || SLA_HOURS.NORMAL) * 60 * 60 * 1000);

// İstemciden gelen ek listesi: yalnızca bizim yüklediğimiz destek dosyaları, en fazla 5 adet
export const cleanAttachments = (list) => {
  if (!Array.isArray(list)) return undefined;
  const clean = list
    .filter((a) => a && typeof a.url === 'string' && SUPPORT_FILE_RE.test(a.url.split('?')[0]))
    .slice(0, 5)
    .map((a) => ({ url: a.url, name: String(a.name || 'dosya').slice(0, 120), type: String(a.type || '').slice(0, 120), size: Number(a.size) || 0 }));
  return clean.length ? clean : undefined;
};

const str = (v, n) => (v == null ? undefined : String(v).slice(0, n));

// Talebe otomatik eklenen bağlam: tarayıcıdan gelenler kısaltılır, firma bilgisi sunucuda eklenir
export const buildContext = (req) => {
  const c = req.body.context || {};
  return {
    page: str(c.page, 200),
    pageTitle: str(c.pageTitle, 120),
    userAgent: str(c.userAgent || req.headers['user-agent'], 300),
    screen: str(c.screen, 30),
    language: str(c.language, 20),
    timezone: str(c.timezone, 60),
    plan: req.tenant?.plan?.name,
    tenantStatus: req.tenant?.status,
    role: req.user?.isOwner ? 'Firma sahibi' : 'Yönetici',
    ip: str(req.ip, 60)
  };
};
