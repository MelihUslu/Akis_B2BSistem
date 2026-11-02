// Bildirim türleri ve e-posta tercihleri (panel içi bildirim her zaman oluşur; e-posta tercihe bağlıdır)
export const NOTIFICATION_TYPES = {
  ORDER: { label: 'Siparişler', admin: 'Yeni sipariş, iptal', dealer: 'Onay, kargo, teslim, fatura' },
  PAYMENT: { label: 'Ödemeler', admin: 'Bayiden gelen ödemeler', dealer: 'Ödemenizin alınması' },
  PAYMENT_DUE: { label: 'Vade hatırlatma', admin: null, dealer: 'Yaklaşan ve geçen vadeler' },
  CREDIT: { label: 'Cari hareketler', admin: null, dealer: 'Hesabınıza yazılan borç / alacak' },
  QUOTE: { label: 'Teklifler', admin: 'Onay bekleyen teklifler, müşteri yanıtları', dealer: 'Size gönderilen teklifler' },
  RETURN: { label: 'İadeler', admin: 'Yeni iade talepleri', dealer: 'İade talebinizin sonucu' },
  STOCK: { label: 'Stok', admin: 'Kritik stok', dealer: '“Gelince haber ver” dediğiniz ürünler' },
  LEAD: { label: 'Müşteri adayları', admin: 'Talep formunu dolduran yeni kişiler', dealer: null },
  REMINDER: { label: 'Hatırlatmalar', admin: 'Cari görüşme notlarındaki hatırlatmalar', dealer: null },
  SYSTEM: { label: 'Sistem ve destek', admin: 'Destek yanıtları, abonelik, güvenlik', dealer: 'Duyurular' }
};

// Varsayılan e-posta tercihleri (kullanıcı değiştirmediyse)
const DEFAULTS = {
  ADMIN: { REMINDER: true, QUOTE: true, ORDER: true, PAYMENT: true, RETURN: true, STOCK: false, SYSTEM: true },
  BAYI: { QUOTE: true, ORDER: true, PAYMENT: true, PAYMENT_DUE: true, CREDIT: false, RETURN: true, STOCK: true, SYSTEM: false }
};

// Yöneticiye giden bildirim türü → gereken yetki (personel yalnızca yetkili olduğu konularda bildirim alır)
export const TYPE_PERMISSION = { QUOTE: 'QUOTES', ORDER: 'ORDERS', RETURN: 'ORDERS', PAYMENT: 'FINANCE', STOCK: 'CATALOG', LEAD: 'LEADS' };

export const typesFor = (role) => Object.entries(NOTIFICATION_TYPES)
  .filter(([, t]) => (role === 'BAYI' ? t.dealer : t.admin))
  .map(([id, t]) => ({ id, label: t.label, description: role === 'BAYI' ? t.dealer : t.admin }));

export const emailPrefs = (user) => ({ ...(DEFAULTS[user.role] || {}), ...(user.notificationPrefs || {}) });

export const wantsEmail = (user, type) => Boolean(emailPrefs(user)[type]);
