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
  MESSAGES: 'WhatsApp',
  SETTINGS: 'Ayarlar',
};

export const can = (user, permission) =>
  user?.role === 'ADMIN' && (user.isOwner || (user.permissions || []).includes(permission));
