// Personel yönetimi: ekranlarda ortak etiketler (backend services/hrService.js ile aynı anahtarlar)
export const LEAVE_TYPES = { ANNUAL: 'Yıllık izin', EXCUSE: 'Mazeret izni', SICK: 'Hastalık / rapor', UNPAID: 'Ücretsiz izin', OTHER: 'Diğer' };
export const CLAIM_TYPES = { EXPENSE: 'Masraf', ADVANCE: 'Avans' };
export const METHODS = { CASH: 'Nakit', BANK: 'Banka', CARD: 'Kart' };
// Ödeme kaydının türü: firmadan ödeme, avanstan mahsup, personelin avans iadesi, maaştan kesinti
export const PAYMENT_KINDS = { PAYOUT: 'Ödeme', OFFSET: 'Avanstan mahsup', REFUND: 'Avans iadesi', PAYROLL: 'Maaştan kesinti' };
export const HALF = { AM: 'Sabah (yarım gün)', PM: 'Öğleden sonra (yarım gün)' };
export const days = (n) => `${String(n ?? 0).replace('.', ',')} gün`;
export const BASES = {
  SALES: { label: 'Satış', hint: 'Ayda onaylanan siparişler (KDV hariç, iptaller sayılmaz) eksi iadeler' },
  COLLECTION: { label: 'Tahsilat', hint: 'Sorumlu olduğu bayilerden ayda alınan tahsilatlar' }
};

// Talep durumu → etiket ve renk (Tailwind sınıfları sabit yazılır)
export const STATUS = {
  PENDING: { label: 'Onay bekliyor', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
  APPROVED: { label: 'Onaylandı', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  REJECTED: { label: 'Reddedildi', className: 'bg-red-50 text-red-700 ring-red-200' },
  CANCELLED: { label: 'İptal edildi', className: 'bg-gray-100 text-gray-500 ring-gray-200' },
  TO_PAY: { label: 'Ödeme bekliyor', className: 'bg-brand-50 text-brand-700 ring-brand-200' },
  PARTIAL: { label: 'Kısmen ödendi', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  PAID: { label: 'Ödendi', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  OPEN: { label: 'Sürüyor', className: 'bg-brand-50 text-brand-700 ring-brand-200' },
  CLOSED: { label: 'Kapandı', className: 'bg-gray-100 text-gray-600 ring-gray-200' }
};

// Masraf / avansın (ve primin) görünen durumu: onay ve ödeme ayrı izlenir; ödeme kısmi olabilir
export const claimState = (c) => (c.paidAt ? 'PAID' : c.status === 'APPROVED' ? (c.paidAmount > 0 ? 'PARTIAL' : 'TO_PAY') : c.status);
export const targetState = (t) => (t.paidAt ? 'PAID' : t.status === 'CLOSED' && t.paidBonus > 0 ? 'PARTIAL' : t.status);

export const monthLabel = (period) => {
  const [y, m] = String(period || '').split('-').map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : period;
};
export const thisMonth = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);
export const shiftMonth = (period, delta) => {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
