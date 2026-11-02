import { localDate } from './format';
// Teklif durumları. Personel ve müşteri farklı adlar görür (müşteri için taslak/onay aşaması "hazırlanıyor"dur).
export const QUOTE_STATUS = {
  PENDING: { label: 'Fiyat Bekleniyor', className: 'bg-orange-100 text-orange-600' },
  DRAFT: { label: 'Taslak', className: 'bg-slate-100 text-slate-600' },
  PENDING_APPROVAL: { label: 'Onay Bekliyor', className: 'bg-amber-100 text-amber-700' },
  QUOTED: { label: 'Gönderildi', className: 'bg-blue-100 text-blue-600' },
  ACCEPTED: { label: 'Kabul Edildi', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Reddedildi', className: 'bg-red-100 text-red-600' },
  CANCELLED: { label: 'İptal Edildi', className: 'bg-gray-200 text-gray-600' },
  EXPIRED: { label: 'Süresi Doldu', className: 'bg-gray-200 text-gray-600' },
  // Yalnızca müşteri görünümü
  PREPARING: { label: 'Hazırlanıyor', className: 'bg-orange-100 text-orange-600' },
  REVISING: { label: 'Revize Ediliyor', className: 'bg-amber-100 text-amber-700' },
};

// Kalemin katalog eşleşmesi (yalnızca personel görür)
export const MATCH_STATUS = {
  MATCHED: { label: 'Eşleşti', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REVIEW: { label: 'Teyit gerekli', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  UNMATCHED: { label: 'Eşleşmedi', className: 'bg-red-50 text-red-600 ring-red-200' },
  MANUAL: { label: 'Elle eklendi', className: 'bg-slate-50 text-slate-500 ring-slate-200' },
};

export const RESPONSE_LABEL = { ACCEPTED: 'Kabul etti', REJECTED: 'Reddetti', REVISION_REQUESTED: 'Revizyon istedi' };

export const addDays = (days) => localDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));

// Editördeki kalemlerin React anahtarı (sunucuya gönderilmez)
let seq = 0;
export const newLineKey = () => `l${Date.now()}${seq++}`;
