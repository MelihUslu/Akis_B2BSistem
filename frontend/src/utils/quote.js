export const QUOTE_STATUS = {
  PENDING: { label: 'Fiyat Bekleniyor', className: 'bg-orange-100 text-orange-600' },
  QUOTED: { label: 'Teklif Verildi', className: 'bg-blue-100 text-blue-600' },
  ACCEPTED: { label: 'Siparişe Dönüştü', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Reddedildi', className: 'bg-red-100 text-red-600' },
  CANCELLED: { label: 'İptal Edildi', className: 'bg-gray-200 text-gray-600' },
  EXPIRED: { label: 'Süresi Doldu', className: 'bg-gray-200 text-gray-600' },
};

// Kalemin görünen adı: varyantsa ana ürün adı
export const itemName = (item) => item.product?.parent?.name || item.product?.name;
