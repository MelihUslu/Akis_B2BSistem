import prisma, { runAsPlatform } from '../utils/prisma.js';

// Rota → okunabilir işlem adı ("METHOD /api/... kalıbı")
const LABELS = {
  'POST /api/products': 'Ürün oluşturuldu',
  'PATCH /api/products/:id': 'Ürün güncellendi',
  'DELETE /api/products/:id': 'Ürün silindi / pasife alındı',
  'POST /api/products/reorder': 'Ürün sıralaması değişti',
  'PUT /api/products/:id/special-prices': 'Özel fiyatlar güncellendi',
  'POST /api/products/bulk-update/:type': 'Excel ile toplu güncelleme',
  'POST /api/categories': 'Kategori oluşturuldu',
  'PATCH /api/categories/:id': 'Kategori güncellendi',
  'DELETE /api/categories/:id': 'Kategori silindi',
  'POST /api/companies': 'Bayi oluşturuldu',
  'PATCH /api/companies/:id': 'Bayi güncellendi',
  'POST /api/companies/:companyId/reset-password': 'Bayi şifresi sıfırlandı',
  'POST /api/companies/:companyId/users': 'Bayiye kullanıcı eklendi',
  'PATCH /api/companies/:companyId/users/:userId': 'Bayi kullanıcısı güncellendi',
  'POST /api/orders': 'Sipariş verildi',
  'PATCH /api/orders/:id/partial-approve': 'Sipariş onaylandı / kalem iptali',
  'PATCH /api/orders/:id/ship': 'Sipariş kargoya verildi',
  'PATCH /api/orders/:id/complete': 'Sipariş teslim edildi',
  'POST /api/finance/transaction': 'Manuel cari işlem',
  'POST /api/partners': 'Cari kartı oluşturuldu (müşteri / tedarikçi)',
  'POST /api/partners/import': 'Excel ile cari aktarımı',
  'POST /api/partners/:id/convert-to-dealer': 'Müşteri bayiye dönüştürüldü',
  'POST /api/partners/:id/payments': 'Tahsilat / ödeme kaydedildi',
  'POST /api/partners/:id/transactions/:txId/reverse': 'Cari hareket ters kaydedildi',
  'POST /api/partners/:id/statement-link': 'Ekstre bağlantısı oluşturuldu / gönderildi',
  'POST /api/partners/:id/notes': 'Cari notu eklendi',
  'POST /api/partners/:id/documents': 'Cari belgesi yüklendi',
  'DELETE /api/partners/:id/documents/:docId': 'Cari belgesi silindi',
  'PATCH /api/partners/:id': 'Cari kartı güncellendi',
  'DELETE /api/partners/:id': 'Cari kartı silindi / pasife alındı',
  'POST /api/finance/reconcile': 'Bayi mutabakat onayı',
  'PATCH /api/returns/:id': 'İade talebi karara bağlandı',
  'POST /api/quotes': 'Bayi teklif istedi',
  'POST /api/quotes/draft': 'Teklif taslağı oluşturuldu',
  'PUT /api/quotes/:id': 'Teklif taslağı güncellendi',
  'DELETE /api/quotes/:id': 'Teklif taslağı silindi',
  'POST /api/quotes/:id/submit': 'Teklif gönderildi / onaya sunuldu',
  'POST /api/quotes/:id/approve': 'Teklif onaylandı ve gönderildi',
  'POST /api/quotes/:id/withdraw': 'Teklif onaydan taslağa döndü',
  'POST /api/quotes/:id/revise': 'Teklif için revizyon açıldı',
  'POST /api/quotes/:id/reject': 'Teklif talebi reddedildi',
  'POST /api/quotes/:id/share': 'Teklif paylaşım bağlantısı oluşturuldu',
  'DELETE /api/quotes/:id/share': 'Teklif paylaşım bağlantısı iptal edildi',
  'POST /api/quotes/:id/email': 'Teklif e-postayla iletildi',
  'POST /api/quotes/:id/convert': 'Teklif siparişe dönüştürüldü',
  'POST /api/quotes/:id/accept': 'Bayi teklifi kabul etti (sipariş oluştu)',
  'POST /api/quotes/:id/feedback': 'Bayi teklifi reddetti / revizyon istedi',
  'POST /api/quotes/:id/cancel': 'Bayi teklif talebini iptal etti',
  'POST /api/coupons': 'Kupon oluşturuldu',
  'PATCH /api/coupons/:id': 'Kupon güncellendi',
  'DELETE /api/coupons/:id': 'Kupon silindi',
  'POST /api/settings': 'Sistem ayarı değişti',
  'PATCH /api/tenant': 'Firma bilgileri güncellendi',
  'PUT /api/tenant/pos': 'Sanal POS bağlandı',
  'DELETE /api/tenant/pos': 'Sanal POS kaldırıldı',
  'PUT /api/account/domain': 'Özel alan adı tanımlandı',
  'POST /api/account/domain/verify': 'Özel alan adı doğrulandı',
  'DELETE /api/account/domain': 'Özel alan adı kaldırıldı',
  'POST /api/account/close': 'Hesap kapatma talebi',
  'POST /api/team/admins': 'Ekibe kullanıcı eklendi',
  'PATCH /api/team/admins/:id': 'Ekip üyesi güncellendi',
  'POST /api/team/admins/:id/reset-password': 'Ekip üyesi şifresi sıfırlandı',
  'POST /api/integrations/keys': 'API anahtarı oluşturuldu',
  'DELETE /api/integrations/keys/:id': 'API anahtarı iptal edildi',
  'POST /api/integrations/webhooks': 'Webhook eklendi',
  'PATCH /api/integrations/webhooks/:id': 'Webhook güncellendi',
  'DELETE /api/integrations/webhooks/:id': 'Webhook silindi',
  'POST /api/billing/checkout': 'Abonelik ödemesi başlatıldı',
  'POST /api/billing/cancel': 'Abonelik yenilemesi durduruldu',
  'POST /api/auth/change-password': 'Şifre değiştirildi',
  'POST /api/auth/2fa/setup': 'İki aşamalı doğrulama kurulumu başlatıldı',
  'POST /api/auth/2fa/enable': 'İki aşamalı doğrulama açıldı',
  'POST /api/auth/2fa/disable': 'İki aşamalı doğrulama kapatıldı',
  'POST /api/account/support': 'Destek talebi açıldı',
  'POST /api/account/support/:id/messages': 'Destek talebine yanıt yazıldı',
  'POST /api/platform/tenants': 'Müşteri oluşturuldu',
  'POST /api/platform/me/2fa/setup': 'Platform: 2FA kurulumu başlatıldı',
  'POST /api/platform/me/2fa/enable': 'Platform: 2FA açıldı',
  'POST /api/platform/me/2fa/disable': 'Platform: 2FA kapatıldı',
  'PATCH /api/platform/tenants/:id': 'Müşteri güncellendi',
  'POST /api/platform/tenants/:id/payments': 'Manuel abonelik ödemesi',
  'POST /api/platform/tenants/:id/impersonate': 'Müşteri paneline destek girişi',
  'POST /api/platform/tenants/:id/purge': 'Müşteri verisi kalıcı silindi',
  'POST /api/platform/tenants/:id/reopen': 'Kapatılan hesap geri açıldı',
  'POST /api/platform/plans': 'Paket oluşturuldu',
  'PATCH /api/platform/plans/:id': 'Paket güncellendi',
  'POST /api/platform/announcements': 'Duyuru yayınlandı',
  'DELETE /api/platform/announcements/:id': 'Duyuru kaldırıldı',
  'POST /api/platform/support/:id/messages': 'Destek talebi yanıtlandı'
};

// Kayda girmemesi gereken alanlar
const SENSITIVE = /pass|secret|token|salt|cvc|cardnumber|apikey|merchantkey|code$|recovery/i;

const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth > 3) return '…';
  if (Array.isArray(value)) return value.slice(0, 20).map(v => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([k, v]) => [k, SENSITIVE.test(k) ? '***' : sanitize(v, depth + 1)]));
  }
  if (typeof value === 'string' && value.length > 300) return `${value.slice(0, 300)}…`;
  return value;
};

/**
 * Kayıt yazar. Hata asıl işlemi etkilemez.
 */
export const audit = ({ tenantId = null, actorType = 'USER', actorId = null, actorName = null, impersonatedBy = null, action, method, path, entity, entityId, details, ip }) =>
  runAsPlatform(() => prisma.auditLog.create({
    data: {
      tenantId, actorType, actorId, actorName, impersonatedBy, action,
      method, path, entity, entityId: entityId ? String(entityId) : null,
      details: details === undefined ? undefined : sanitize(details), ip
    }
  })).catch(err => console.error('[Audit]', err.message));

const clientIp = (req) => (req.ip || '').replace('::ffff:', '');

/**
 * Değişiklik yapan (POST/PUT/PATCH/DELETE) ve başarılı biten istekleri otomatik kaydeder.
 * Bayi işlemlerinden sadece etiketli olanlar (sipariş, mutabakat, teklif onayı) kaydedilir.
 */
export const auditTrail = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    const pattern = `${req.method} ${req.baseUrl}${req.route?.path || ''}`.replace(/(.)\/$/, '$1');
    const label = LABELS[pattern];
    if (!label && req.user.role === 'BAYI') return;
    const isPlatform = req.user.role === 'SUPER_ADMIN';
    audit({
      tenantId: isPlatform ? (req.params?.id && req.baseUrl.includes('/tenants') ? parseInt(req.params.id) : null) : req.tenant?.id ?? null,
      actorType: isPlatform ? 'PLATFORM' : 'USER',
      actorId: req.user.id,
      actorName: req.user.name || req.user.email || null,
      impersonatedBy: req.user.impersonatedBy || null,
      action: label || pattern,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      entity: req.baseUrl.split('/').pop(),
      // Yeni kayıt oluşturan uçlar kimliği res.locals.auditEntityId ile bildirir
      entityId: res.locals.auditEntityId || req.params?.id || req.params?.companyId || null,
      details: req.body && Object.keys(req.body).length ? req.body : undefined,
      ip: clientIp(req)
    });
  });
  next();
};

export { clientIp };
