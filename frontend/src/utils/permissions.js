// Backend'deki yetkilerle aynı. Firma sahibi (isOwner) hepsine sahiptir.
export const PERMISSION_LABELS = {
  CATALOG: 'Katalog',
  ORDERS: 'Siparişler',
  DEALERS: 'Bayiler',
  FINANCE: 'Finans',
  SETTINGS: 'Ayarlar',
};

export const can = (user, permission) =>
  user?.role === 'ADMIN' && (user.isOwner || (user.permissions || []).includes(permission));
