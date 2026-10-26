import crypto from 'crypto';

/**
 * PayTR iFrame API (firmanın bayilerinden tahsilat).
 * creds: { merchantId, merchantKey, merchantSalt, testMode }
 * Ödeme sonucu, PayTR mağaza panelinde tanımlanan "Bildirim URL"ine sunucudan sunucuya POST edilir.
 */
const TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
export const PAYMENT_PAGE = (token) => `https://www.paytr.com/odeme/guvenli/${token}`;

export class PaytrError extends Error {}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest('base64');

/**
 * Ödeme token'ı alır. amount: TL (ör. 250.5) · merchantOid: sadece harf/rakam, benzersiz
 */
export const getPaymentToken = async (creds, { amount, merchantOid, email, userIp, userName, userAddress, userPhone, basketName, okUrl, failUrl }) => {
  const paymentAmount = Math.round(amount * 100); // kuruş
  const userBasket = Buffer.from(JSON.stringify([[basketName, amount.toFixed(2), 1]])).toString('base64');
  const noInstallment = '1';
  const maxInstallment = '0';
  const currency = 'TL';
  const testMode = creds.testMode ? '1' : '0';

  const hashStr = `${creds.merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
  const paytrToken = hmac(creds.merchantKey, hashStr + creds.merchantSalt);

  const form = new URLSearchParams({
    merchant_id: creds.merchantId,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_amount: String(paymentAmount),
    paytr_token: paytrToken,
    user_basket: userBasket,
    debug_on: '0',
    no_installment: noInstallment,
    max_installment: maxInstallment,
    user_name: userName.slice(0, 60),
    user_address: userAddress.slice(0, 400),
    user_phone: userPhone.slice(0, 20),
    merchant_ok_url: okUrl,
    merchant_fail_url: failUrl,
    timeout_limit: '30',
    currency,
    test_mode: testMode,
    lang: 'tr'
  });

  const res = await fetch(TOKEN_URL, { method: 'POST', body: form, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (data.status !== 'success' || !data.token) {
    console.error('[PayTR] get-token:', res.status, data.reason);
    throw new PaytrError(data.reason || `PayTR isteği başarısız (HTTP ${res.status}).`);
  }
  return { token: data.token, paymentPageUrl: PAYMENT_PAGE(data.token), paymentAmount };
};

// Bildirimin PayTR'den geldiğini doğrular: base64(HMAC-SHA256(merchant_key, merchant_oid + salt + status + total_amount))
export const verifyNotification = (creds, body) => {
  const expected = hmac(creds.merchantKey, `${body.merchant_oid}${creds.merchantSalt}${body.status}${body.total_amount}`);
  const given = String(body.hash || '');
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
};

// Anahtarları doğrulamak için test modunda ödeme token'ı ister (tahsilat yapılmaz)
export const testCredentials = (creds, { okUrl, failUrl }) => getPaymentToken({ ...creds, testMode: true }, {
  amount: 1, merchantOid: `TEST${Date.now()}`, email: 'test@example.com', userIp: '85.34.78.112',
  userName: 'Test', userAddress: 'Test', userPhone: '05000000000', basketName: 'Bağlantı testi', okUrl, failUrl
});
