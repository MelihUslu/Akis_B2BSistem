// Para gösterimi (bildirim ve e-posta metinleri): ₺1.234,50 · $1.234,50 · €1.234,50
const SYMBOL = { TRY: '₺', USD: '$', EUR: '€' };
export const formatMoney = (value, currency = 'TRY') =>
  `${SYMBOL[currency] || ''}${(Number(value) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${SYMBOL[currency] ? '' : ` ${currency}`}`;
