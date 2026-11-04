// Backend'deki yetkilerle aynı. Firma sahibi (isOwner) hepsine sahiptir.
export const PERMISSION_LABELS = {
  CATALOG: 'Katalog',
  ORDERS: 'Siparişler',
  QUOTES: 'Teklifler',
  QUOTE_PRICING: 'Teklif fiyatı / iskonto',
  QUOTE_APPROVAL: 'Teklif onayı',
  DEALERS: 'Bayiler',
  FINANCE: 'Finans',
  LEADS: 'Müşteri adayları',
  HR: 'Personel',
  MESSAGES: 'WhatsApp',
  SETTINGS: 'Ayarlar',
};

// Herhangi bir yönetim yetkisi var mı (yoksa panel özeti ve arama gösterilmez; ör. yalnızca personel alanını kullanan ekip üyesi)
export const hasAnyPermission = (user) => user?.role === 'ADMIN' && (user.isOwner || (user.permissions || []).length > 0);

export const can = (user, permission) =>
  user?.role === 'ADMIN' && (user.isOwner || (user.permissions || []).includes(permission));
