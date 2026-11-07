/**
 * Kartla ödemede taksit (iyzico ve PayTR taklit sunucusu): firma en fazla taksiti ve taksit için en düşük tutarı seçer;
 * ödeme formuna bu taksitler gider; vade farkıyla çekilen ödeme istenen net tutarla eşleşir, cariye net tutar işlenir,
 * taksit sayısı ve karttan çekilen toplam kaydedilir.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { startPosMock } from './posMock.js';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'postest-a';
const PAYTR = { merchantId: '123456', merchantKey: 'paytr-key', merchantSalt: 'paytr-salt' };

let server, base, prisma, runAsPlatform, purgeTenant, encrypt, invalidateTenantCache, pos;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const setTenant = async (data) => { await P(() => prisma.tenant.update({ where: { id: T.id }, data })); invalidateTenantCache(SLUG); };
const balance = async () => (await P(() => prisma.company.findUnique({ where: { id: T.company } }))).currentBalance;
const paymentByToken = (token) => P(() => prisma.payment.findFirst({ where: { tenantId: T.id, token } }));
const iyzicoCallback = (token) => fetch(`${base}/api/public/pos/callback?tenant=${SLUG}`, {
  method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token })
});
// PayTR bildirimi: imza = base64(HMAC-SHA256(key, oid + salt + status + total_amount))
const paytrNotify = (fields) => {
  const hash = crypto.createHmac('sha256', PAYTR.merchantKey).update(`${fields.merchant_oid}${PAYTR.merchantSalt}${fields.status}${fields.total_amount}`).digest('base64');
  return fetch(`${base}/api/public/paytr/notify/${SLUG}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...fields, hash })
  });
};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  pos = await startPosMock();
  process.env.IYZICO_POS_URL = pos.url;
  process.env.PAYTR_API_URL = pos.url;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  ({ encrypt } = await import('../../src/utils/secretBox.js'));
  ({ invalidateTenantCache } = await import('../../src/middlewares/tenantMiddleware.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const tenant = await P(() => prisma.tenant.create({ data: {
    slug: SLUG, name: 'Ege Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000),
    posProvider: 'IYZICO', posMode: 'SANDBOX', posApiKey: 'iyz-api', posSecretEnc: encrypt('iyz-secret')
  } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  await user({ email: `clerk@${SLUG}.test`, name: 'Satış', role: 'ADMIN', permissions: ['ORDERS'] });
  T.company = (await P(() => prisma.company.create({ data: { tenantId, name: 'Kıyı Yapı', status: 'ACTIVE', riskLimit: 100_000, taxNumber: '3000000009' } }))).id;
  await user({ email: `bayi@${SLUG}.test`, name: 'Kıyı Yapı Yetkilisi', role: 'BAYI', companyId: T.company, isOwner: true });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['clerk', 'clerk'], ['dealer', 'bayi']]) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `${email}@${SLUG}.test`, password: 'Test12345' } });
    assert.equal(r.status, 200, `${email}: ${r.data?.message}`);
    T.tokens[k] = r.data.token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  pos?.server.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('taksit ayarı: yalnızca Ayarlar yetkilisi; izinli taksit sayıları; bayi bilgi ucunda görünür', { skip }, async () => {
  const body = { maxInstallment: 6, installmentMin: 1000 };
  assert.equal((await api('/tenant/pos/installments', { token: T.tokens.clerk, method: 'PUT', body })).status, 403);
  assert.equal((await api('/tenant/pos/installments', { token: T.tokens.admin, method: 'PUT', body: { maxInstallment: 5 } })).status, 400);
  assert.equal((await api('/tenant/pos/installments', { token: T.tokens.admin, method: 'PUT', body: { maxInstallment: 3, installmentMin: -1 } })).status, 400);
  const ok = await api('/tenant/pos/installments', { token: T.tokens.admin, method: 'PUT', body });
  assert.equal(ok.status, 200, ok.data?.message);
  assert.equal(ok.data.pos.maxInstallment, 6);
  assert.equal(ok.data.pos.installmentMin, 1000);
  assert.deepEqual(ok.data.pos.installmentOptions, [1, 2, 3, 6, 9, 12]);
  const info = await api('/payments/pos-info', { token: T.tokens.dealer });
  assert.deepEqual({ mode: info.data.mode, max: info.data.maxInstallment, min: info.data.installmentMin }, { mode: 'IYZICO', max: 6, min: 1000 });
});

test('iyzico: formda taksitler; en düşük tutarın altında tek çekim; vade farkıyla çekilen ödeme cariye net işlenir', { skip }, async () => {
  const small = await api('/payments/pos/checkout', { token: T.tokens.dealer, method: 'POST', body: { amount: 500 } });
  assert.equal(small.status, 200, small.data?.message);
  assert.deepEqual(pos.iyzicoInit.at(-1).enabledInstallments, [1], 'en düşük tutarın altında tek çekim');

  const big = await api('/payments/pos/checkout', { token: T.tokens.dealer, method: 'POST', body: { amount: 3000 } });
  assert.equal(big.status, 200, big.data?.message);
  const init = pos.iyzicoInit.at(-1);
  assert.deepEqual(init.enabledInstallments, [1, 2, 3, 6]);
  assert.equal(init.price, '3000.00');

  // Bayi 6 taksit seçti; vade farkıyla karttan 3.180 ₺ çekildi
  pos.details[big.data.token] = { paymentStatus: 'SUCCESS', price: 3000, paidPrice: 3180, installment: 6, paymentId: 'P-1', lastFourDigits: '4242' };
  const before = await balance();
  const r = await iyzicoCallback(big.data.token);
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /pos=success/);
  const p = await paymentByToken(big.data.token);
  assert.deepEqual({ status: p.status, amount: p.amount, installment: p.installment, paidTotal: p.paidTotal, card: p.cardLast4 }, { status: 'COMPLETED', amount: 3000, installment: 6, paidTotal: 3180, card: '4242' });
  assert.equal(await balance(), before + 3000, 'cariye vade farkı değil net tutar');
  const tx = await P(() => prisma.financialTransaction.findFirst({ where: { tenantId: T.id, paymentId: p.id } }));
  assert.match(tx.description, /\*\*\*\* 4242, 6 taksit/);

  // Aynı dönüş ikinci kez gelirse tekrar işlenmez
  assert.equal((await iyzicoCallback(big.data.token)).status, 303);
  assert.equal(await balance(), before + 3000);

  // İstenen tutar tutmazsa ya da çekilen tutar istenenden azsa ödeme işlenmez
  pos.details[small.data.token] = { paymentStatus: 'SUCCESS', price: 450, paidPrice: 450, installment: 1, paymentId: 'P-2' };
  assert.match((await iyzicoCallback(small.data.token)).headers.get('location'), /pos=failed/);
  assert.equal((await paymentByToken(small.data.token)).status, 'FAILED');
  const third = await api('/payments/pos/checkout', { token: T.tokens.dealer, method: 'POST', body: { amount: 2000 } });
  pos.details[third.data.token] = { paymentStatus: 'SUCCESS', price: 2000, paidPrice: 1900, installment: 3, paymentId: 'P-3' };
  assert.match((await iyzicoCallback(third.data.token)).headers.get('location'), /pos=failed/);
  assert.equal(await balance(), before + 3000);
});

test('PayTR: taksit açıksa no_installment=0 ve en fazla taksit; bildirimde vade farkı ve taksit sayısı kaydedilir', { skip }, async () => {
  await setTenant({ posProvider: 'PAYTR', posApiKey: PAYTR.merchantId, posSecretEnc: encrypt(JSON.stringify({ merchantKey: PAYTR.merchantKey, merchantSalt: PAYTR.merchantSalt })) });
  const r = await api('/payments/pos/checkout', { token: T.tokens.dealer, method: 'POST', body: { amount: 1500 } });
  assert.equal(r.status, 200, r.data?.message);
  const form = pos.paytr.at(-1);
  assert.deepEqual({ no: form.no_installment, max: form.max_installment, amount: form.payment_amount }, { no: '0', max: '6', amount: '150000' });

  const payment = await P(() => prisma.payment.findFirst({ where: { tenantId: T.id, provider: 'PAYTR' }, orderBy: { id: 'desc' } }));
  const before = await balance();
  const res = await paytrNotify({ merchant_oid: payment.token, status: 'success', total_amount: '157500', payment_amount: '150000', installment_count: '3', test_mode: '1' });
  assert.equal(await res.text(), 'OK');
  const done = await P(() => prisma.payment.findUnique({ where: { id: payment.id } }));
  assert.deepEqual({ status: done.status, installment: done.installment, paidTotal: done.paidTotal }, { status: 'COMPLETED', installment: 3, paidTotal: 1575 });
  assert.equal(await balance(), before + 1500, 'cariye net tutar');

  // Tutarın altında ve taksit kapalıyken tek çekim
  await api('/payments/pos/checkout', { token: T.tokens.dealer, method: 'POST', body: { amount: 200 } });
  assert.deepEqual({ no: pos.paytr.at(-1).no_installment, max: pos.paytr.at(-1).max_installment }, { no: '1', max: '0' });
  await api('/tenant/pos/installments', { token: T.tokens.admin, method: 'PUT', body: { maxInstallment: 1 } });
  await api('/payments/pos/checkout', { token: T.tokens.dealer, method: 'POST', body: { amount: 5000 } });
  assert.deepEqual({ no: pos.paytr.at(-1).no_installment, max: pos.paytr.at(-1).max_installment }, { no: '1', max: '0' });
});
