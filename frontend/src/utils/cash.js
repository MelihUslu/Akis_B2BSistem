// Gelir-gider ortak sabitleri ve hesapları
export const METHODS = [['CASH', 'Nakit'], ['BANK', 'Banka'], ['CARD', 'Kart']];
export const METHOD_TR = Object.fromEntries(METHODS);
export const VAT_RATES = [0, 1, 10, 20];

// "15.000,50" / "15000.50" → 15000.5 (önizleme için; sunucu da aynı kuralla okur)
export const parseAmount = (v) => {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
};

// KDV dahil tutarın içindeki KDV
export const vatOf = (amount, rate) => (rate > 0 ? amount - amount / (1 + rate / 100) : 0);
