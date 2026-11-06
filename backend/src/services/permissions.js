// Firma (kiracı) içi yönetici yetkileri. Firma sahibi (isOwner) tüm yetkilere sahiptir.
export const PERMISSIONS = {
  CATALOG: 'Ürünler, kategoriler, özel fiyatlar, kampanyalar',
  ORDERS: 'Siparişler, iadeler, tekliften sipariş oluşturma',
  QUOTES: 'Teklif hazırlama, gönderme ve paylaşma',
  QUOTE_PRICING: 'Teklifte iskonto ve elle fiyat (onay sınırına kadar)',
  QUOTE_APPROVAL: 'Sınırı aşan teklifleri onaylama',
  DEALERS: 'Bayiler, bayi kullanıcıları, başvurular',
  FINANCE: 'Cari hesaplar, tahsilatlar, prim',
  MESSAGES: 'WhatsApp gelen kutusu: müşteri mesajlarını görme ve yanıtlama',
  LEADS: 'Müşteri adayları (Instagram, WhatsApp, talep formu) ve Excel',
  SMS: 'Toplu SMS: bayilere, müşterilere ve müşteri adaylarına SMS gönderme (firmada SMS açıksa)',
  HR: 'Personel: kartlar, izin / masraf / avans onayı, satış hedefi ve prim, duyurular (ödemeler Finans yetkisiyle)',
  SETTINGS: 'Ayarlar, ekip, entegrasyon, sanal POS, abonelik'
};

export const normalizePermissions = (list) =>
  [...new Set((Array.isArray(list) ? list : []).filter(p => Object.prototype.hasOwnProperty.call(PERMISSIONS, p)))];

export const hasPermission = (user, permission) =>
  user?.role === 'ADMIN' && (user.isOwner || (Array.isArray(user.permissions) && user.permissions.includes(permission)));
