import { locale } from '../i18n';

export const formatTRY = (value) =>
  `₺${(Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (value, withTime = false) =>
  value
    ? new Date(value).toLocaleString(locale(), withTime
      ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';

export const firstImage = (images) => {
  try {
    const list = typeof images === 'string' ? JSON.parse(images) : images;
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
  } catch {
    return null;
  }
};

export const ORDER_STATUS = {
  PENDING: { label: 'Onay Bekliyor', className: 'bg-orange-100 text-orange-600' },
  APPROVED: { label: 'Onaylandı', className: 'bg-emerald-100 text-emerald-600' },
  PARTIAL_APPROVED: { label: 'Kısmen Onaylandı', className: 'bg-amber-100 text-amber-700' },
  SHIPPED: { label: 'Kargoda', className: 'bg-blue-100 text-blue-600' },
  COMPLETED: { label: 'Teslim Edildi', className: 'bg-green-100 text-green-700' },
  CANCELLED: { label: 'İptal Edildi', className: 'bg-red-100 text-red-600' },
};

export const RETURN_STATUS = {
  PENDING: { label: 'İnceleniyor', className: 'bg-orange-100 text-orange-600' },
  APPROVED: { label: 'Onaylandı', className: 'bg-emerald-100 text-emerald-600' },
  REJECTED: { label: 'Reddedildi', className: 'bg-red-100 text-red-600' },
  COMPLETED: { label: 'Tamamlandı', className: 'bg-green-100 text-green-700' },
};

// MOQ ve artış katsayısına uygun en yakın geçerli miktar
export const normalizeQty = (value, product) => {
  const moq = product.moq || 1;
  const step = product.stepQuantity || 1;
  let qty = parseInt(value);
  if (isNaN(qty) || qty < moq) qty = moq;
  if (step > 1 && qty % step !== 0) qty = Math.ceil(qty / step) * step;
  return qty;
};
