import prisma from '../utils/prisma.js';
import { getExchangeRates } from './exchangeRateService.js';

/**
 * Cari hareket kaydı — tüm borç / alacak yazımları buradan geçer.
 *
 * Cari para birimi TRY, USD veya EUR olabilir; bakiye ve hareket tutarı carinin para birimindedir.
 * Her harekette kullanılan kur (1 birim döviz = rate TL) ve TL karşılığı saklanır; böylece kur farkı
 * ve TL raporları hesaplanabilir. TL caride kur 1'dir.
 *
 * Siparişler TL'dir: dövizli cariye siparişin oluştuğu andaki kurla (order.fxRates) çevrilerek yazılır;
 * böylece döviz fiyatlı ürün dövizli cariye liste fiyatıyla yansır.
 */
export const CURRENCIES = ['TRY', 'USD', 'EUR'];
export const CURRENCY_LABEL = { TRY: 'TL', USD: 'USD', EUR: 'EUR' };

const round2 = (n) => Math.round(Number((Number(n) * 100).toPrecision(15))) / 100;
const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

export class CurrencyError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const normalizeCurrency = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  if (s === 'TL' || s === '') return 'TRY';
  return CURRENCIES.includes(s) ? s : null;
};

// Güncel kur (TCMB döviz satış; erişilemezse son değer veya Ayarlar'daki manuel kur)
export const currentRate = async (currency) => {
  if (!currency || currency === 'TRY') return 1;
  const fx = await getExchangeRates();
  const rate = fx.rates?.[currency];
  if (!rate) throw new CurrencyError(`${currency} kuru şu an alınamıyor. Ayarlar'dan manuel kur girebilir veya kuru elle yazabilirsiniz.`);
  return rate;
};

// Elle girilen kur (yoksa güncel kur)
export const rateOrCurrent = async (currency, given) => {
  if (!currency || currency === 'TRY') return 1;
  const r = parseFloat(String(given ?? '').replace(',', '.'));
  if (Number.isFinite(r) && r > 0) {
    if (r > 10000) throw new CurrencyError('Kur geçersiz.');
    return round4(r);
  }
  return currentRate(currency);
};

// Siparişin dövizli cariye işleneceği kur: sipariş anındaki kur, yoksa güncel kur
export const orderRate = async (order, currency) => {
  if (!currency || currency === 'TRY') return 1;
  return order?.fxRates?.[currency] || currentRate(currency);
};

/**
 * Hareket yazar ve bakiyeyi günceller (transaction içinde çağrılmalı).
 * company: { id, currency } · type: DEBT | CREDIT
 * Tutar iki şekilde verilebilir: amount (cari para biriminde) veya amountTRY (TL; kurla çevrilir).
 * rate verilmezse güncel kur kullanılır (mümkünse transaction dışında hesaplayıp verin).
 * Yuvarlama sonrası sıfır kalan tutar yazılmaz (null döner).
 */
export const postEntry = async (tx, { company, type, amount, amountTRY, rate, ...rest }) => {
  const currency = company.currency || 'TRY';
  const r = currency === 'TRY' ? 1 : (rate || await currentRate(currency));
  const value = round2(amount !== undefined && amount !== null ? amount : amountTRY / r);
  if (!(value > 0)) return null;
  const tl = round2(amountTRY !== undefined && amountTRY !== null ? amountTRY : value * r);
  const entry = await tx.financialTransaction.create({
    data: { companyId: company.id, type, amount: value, currency, rate: r, amountTRY: tl, ...rest }
  });
  await tx.company.update({ where: { id: company.id }, data: { currentBalance: { increment: type === 'CREDIT' ? value : -value } } });
  return entry;
};

// Bakiyesi olmayan ve hareketi olmayan carinin para birimi değiştirilebilir
export const assertCurrencyChangeAllowed = async (company, next) => {
  if (!next || next === (company.currency || 'TRY')) return;
  const count = await prisma.financialTransaction.count({ where: { companyId: company.id } });
  if (count > 0 || company.currentBalance !== 0) {
    throw new CurrencyError('Hareketi olan carinin para birimi değiştirilemez. Gerekirse yeni para biriminde ayrı bir cari kartı açın.');
  }
};

/**
 * TL tutarı carinin para birimine çevirir (bilgi / limit kontrolü için).
 * Kur bilinmiyorsa null döner.
 */
export const fromTRY = (amountTRY, currency, rates) => {
  if (!currency || currency === 'TRY') return amountTRY;
  const r = rates?.[currency];
  return r ? round2(amountTRY / r) : null;
};
