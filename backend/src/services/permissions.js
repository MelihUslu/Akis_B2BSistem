// Firma (kiracı) içi yönetici yetkileri. Firma sahibi (isOwner) tüm yetkilere sahiptir.
export const PERMISSIONS = {
  CATALOG: 'Ürünler, kategoriler, özel fiyatlar, kampanyalar',
  ORDERS: 'Siparişler, teklifler, iadeler',
  DEALERS: 'Bayiler, bayi kullanıcıları, başvurular',
  FINANCE: 'Cari hesaplar, tahsilatlar, prim',
  SETTINGS: 'Ayarlar, ekip, entegrasyon, sanal POS, abonelik'
};

export const normalizePermissions = (list) =>
  [...new Set((Array.isArray(list) ? list : []).filter(p => Object.prototype.hasOwnProperty.call(PERMISSIONS, p)))];

export const hasPermission = (user, permission) =>
  user?.role === 'ADMIN' && (user.isOwner || (Array.isArray(user.permissions) && user.permissions.includes(permission)));
