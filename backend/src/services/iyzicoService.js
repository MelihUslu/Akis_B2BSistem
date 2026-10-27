import crypto from 'crypto';
import { trackExternal } from './monitoring.js';

/**
 * iyzico Abonelik (Subscription) API istemcisi.
 * .env: IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL (varsayılan: sandbox)
 * Anahtarlar tanımlı değilse online ödeme kapalıdır; abonelikler Platform panelinden manuel yönetilir.
 *
 * Kimlik doğrulama: IYZWSv2 — HMAC-SHA256(secretKey, randomKey + uriPath + body)
 */
export const SANDBOX_URL = 'https://sandbox-api.iyzipay.com';
export const LIVE_URL = 'https://api.iyzipay.com';

// Platformun kendi iyzico hesabı (abonelik tahsilatı)
const platformCreds = () => ({
  apiKey: process.env.IYZICO_API_KEY,
  secretKey: process.env.IYZICO_SECRET_KEY,
  baseUrl: process.env.IYZICO_BASE_URL || SANDBOX_URL
});

export const iyzicoEnabled = () => Boolean(process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY);

export class IyzicoError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
  }
}

const authHeaders = (creds, path, body) => {
  const randomKey = `${Date.now()}${crypto.randomBytes(6).toString('hex')}`;
  const signature = crypto
    .createHmac('sha256', creds.secretKey)
    .update(randomKey + path + (body || ''))
    .digest('hex');
  const authString = `apiKey:${creds.apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return {
    Authorization: `IYZWSv2 ${Buffer.from(authString).toString('base64')}`,
    'x-iyzi-rnd': randomKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
};

// creds verilmezse platformun hesabı kullanılır; firmanın sanal POS'u için kendi anahtarları verilir
const request = (method, path, payload, creds = platformCreds()) =>
  trackExternal('iyzico', `${method} ${path.split('?')[0].replace(/\/\d+/g, '/:id')}`, () => requestRaw(method, path, payload, creds));

const requestRaw = async (method, path, payload, creds) => {
  if (!creds.apiKey || !creds.secretKey) throw new IyzicoError('iyzico yapılandırılmamış.');
  const body = payload ? JSON.stringify(payload) : '';
  const res = await fetch(creds.baseUrl + path, {
    method,
    headers: authHeaders(creds, path.split('?')[0], body),
    body: method === 'GET' ? undefined : body,
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status !== 'success') {
    console.error('[iyzico]', method, path, res.status, data.errorCode, data.errorMessage);
    throw new IyzicoError(data.errorMessage || `iyzico isteği başarısız (HTTP ${res.status}).`, data);
  }
  return data.data ?? data;
};

// ─── Ürün ve fiyat planları (Platform panelinden paket senkronizasyonu) ───────
export const createProduct = ({ name, description }) =>
  request('POST', '/v2/subscription/products', { locale: 'tr', name, description });

export const createPricingPlan = (productRef, { name, price, interval }) =>
  request('POST', `/v2/subscription/products/${productRef}/pricing-plans`, {
    locale: 'tr',
    name,
    price: Number(price).toFixed(2),
    currencyCode: 'TRY',
    paymentInterval: interval, // MONTHLY | YEARLY
    paymentIntervalCount: 1,
    planPaymentType: 'RECURRING'
  });

// ─── Abonelik başlatma (iyzico ödeme formu) ──────────────────────────────────
export const initializeCheckout = ({ pricingPlanRef, callbackUrl, conversationId, customer }) =>
  request('POST', '/v2/subscription/checkoutform/initialize', {
    locale: 'tr',
    conversationId,
    callbackUrl,
    pricingPlanReferenceCode: pricingPlanRef,
    subscriptionInitialStatus: 'ACTIVE',
    customer
  });

export const retrieveCheckout = (token) => request('GET', `/v2/subscription/checkoutform/${token}`);

// ─── Abonelik yönetimi ───────────────────────────────────────────────────────
export const getSubscription = (subscriptionRef) => request('GET', `/v2/subscription/subscriptions/${subscriptionRef}`);

export const cancelSubscription = (subscriptionRef) =>
  request('POST', `/v2/subscription/subscriptions/${subscriptionRef}/cancel`, { locale: 'tr' });

// period: 'NOW' (hemen, yeni plan ücreti bu dönem için çekilir) | 'NEXT_PERIOD' (bir sonraki yenilemede)
// iyzico eski aboneliği UPGRADED durumuna alır ve yeni referanslı bir abonelik döner.
export const upgradeSubscription = (subscriptionRef, newPricingPlanRef, period = 'NOW') =>
  request('POST', `/v2/subscription/subscriptions/${subscriptionRef}/upgrade`, {
    locale: 'tr',
    newPricingPlanReferenceCode: newPricingPlanRef,
    upgradePeriod: period,
    useTrial: false,
    resetRecurrenceCount: true
  });

// iyzico'nun döndürdüğü tarih alanları ms cinsinden sayı veya ISO metin olabilir
export const toDate = (value) => {
  if (!value) return null;
  const d = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ─── Tek seferlik ödeme (firmanın bayilerinden tahsilat) ─────────────────────

const money = (n) => Number(n).toFixed(2);

export const initializePaymentCheckout = (creds, { amount, conversationId, basketId, callbackUrl, buyer, address, itemName }) =>
  request('POST', '/payment/iyzipos/checkoutform/initialize/auth/ecom', {
    locale: 'tr',
    conversationId,
    price: money(amount),
    paidPrice: money(amount),
    currency: 'TRY',
    basketId,
    paymentGroup: 'PRODUCT',
    callbackUrl,
    enabledInstallments: [1],
    buyer,
    shippingAddress: address,
    billingAddress: address,
    basketItems: [{ id: basketId, name: itemName, category1: 'Cari Tahsilat', itemType: 'VIRTUAL', price: money(amount) }]
  }, creds);

export const retrievePaymentCheckout = (creds, token) =>
  request('POST', '/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', token }, creds);

// Anahtarların geçerliliğini zararsız bir sorgu ile dener
export const testCredentials = (creds) => request('POST', '/payment/bin/check', { locale: 'tr', binNumber: '552879' }, creds);
