/**
 * Bayi kullanıcı yetkileri. Bayinin ana kullanıcısı (ya da firma) ana kullanıcı olmayan çalışanların yetkilerini
 * kapatabilir; varsayılan hepsi açık. Ana kullanıcıya ve bayi adına işlem yapan yönetici / plasiyere uygulanmaz.
 *   PRICES: fiyat görme. Kapalıysa katalog fiyatsız görünür; sipariş, teklif ve cari de kapanır, sipariş tutarları gizlenir.
 *   FINANCE: Finansal Durum, ekstre, mutabakat, kartla ödeme, hedef / prim.
 *   RETURNS: iade / değişim talepleri.  ADDRESSES: teslimat adresi ekleme / düzenleme / silme.
 * Sipariş verme ayrı kuraldır (User.orderApproval: NONE, ALWAYS, OVER, BLOCKED).
 */
export const DEALER_CAPS = {
  PRICES: 'Fiyatları görür',
  FINANCE: 'Cari ve ödeme',
  RETURNS: 'İade / değişim talebi',
  ADDRESSES: 'Teslimat adreslerini yönetir'
};
export const ORDER_RULES = ['NONE', 'ALWAYS', 'OVER', 'BLOCKED'];

const DENIED = {
  PRICES: 'Fiyatları görme yetkiniz yok. Firmanızın ana kullanıcısı açabilir.',
  FINANCE: 'Cari hesap ve ödeme ekranları için yetkiniz yok. Firmanızın ana kullanıcısı açabilir.',
  RETURNS: 'İade / değişim talebi için yetkiniz yok. Firmanızın ana kullanıcısı açabilir.',
  ADDRESSES: 'Teslimat adreslerini değiştirme yetkiniz yok. Firmanızın ana kullanıcısı açabilir.'
};

// Bayi kullanıcısı değilse, ana kullanıcıysa ya da bayi adına işlem yapılıyorsa her yetki açık
const restricted = (user) => user?.role === 'BAYI' && !user.isOwner && !user.actingAs;

export const dealerCan = (user, cap) => {
  if (!restricted(user)) return true;
  const deny = user.dealerDeny || [];
  if (deny.includes(cap)) return false;
  return !(cap === 'FINANCE' && deny.includes('PRICES')); // fiyatı göremeyen cari tutarlarını da göremez
};

export const requireDealer = (cap) => Object.assign((req, res, next) => (dealerCan(req.user, cap)
  ? next()
  : res.status(403).json({ message: DENIED[cap], code: 'DEALER_PERMISSION', permission: cap })), { allows: (u) => dealerCan(u, cap) });

/** Sipariş verebilir mi? (fiyatı göremeyen ya da sipariş yetkisi kapalı olan veremez) */
export const orderBlockedMessage = (user) => {
  if (!restricted(user)) return null;
  if (!dealerCan(user, 'PRICES')) return 'Fiyatları görme yetkiniz olmadığı için sipariş veremezsiniz. Firmanızın ana kullanıcısı açabilir.';
  if (user.orderApproval === 'BLOCKED') return 'Sipariş verme yetkiniz yok. Firmanızın ana kullanıcısı açabilir.';
  return null;
};

/** Yetki listesini doğrular (bilinmeyen değer → null) */
export const normalizeDeny = (list) => {
  if (!Array.isArray(list)) return null;
  const out = [...new Set(list.map(String))];
  return out.every((c) => DEALER_CAPS[c]) ? out : null;
};

// Sipariş / tutar alanlarını gizler (fiyatı göremeyen kullanıcı)
const MONEY = ['subtotal', 'discountAmount', 'vatAmount', 'totalAmount', 'shippingFee', 'shippingVat', 'couponValue', 'paidAmount'];
export const maskOrderMoney = (order) => {
  if (!order) return order;
  const out = { ...order, pricesHidden: true };
  for (const k of MONEY) if (k in out) out[k] = null;
  if (Array.isArray(out.items)) out.items = out.items.map((i) => ({ ...i, price: null }));
  return out;
};
