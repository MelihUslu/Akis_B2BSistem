/**
 * Bayi kullanıcı yetkileri: ana kullanıcı (ya da firma) çalışanın fiyat, cari / ödeme, iade ve adres yetkilerini kapatır,
 * sipariş kuralını seçer (onaysız / onaya / limit üstü onaya / sipariş veremez). Kısıt sunucuda uygulanır; ana kullanıcıya
 * ve bayi adına işlem yapan yöneticiye uygulanmaz. Teklif kabulü de sipariş kuralına bağlıdır (ana kullanıcıya iletilir).
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'yetki-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body, headers = {} } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}`, ...headers },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const until = async (fn, ms = 4000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return true;
  return false;
};
const setRule = (body) => api(`/team/my-company/${T.staffId}`, { token: T.tokens.owner, method: 'PATCH', body });
const order = (token) => api('/orders', { token, method: 'POST', body: { items: [{ productId: T.product, quantity: 2 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.address } });

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Kale Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  T.company = (await P(() => prisma.company.create({ data: { tenantId, name: 'Kale Yapı', status: 'ACTIVE', riskLimit: 100_000, taxNumber: '3300000001' } }))).id;
  T.ownerId = (await user({ email: `sahip@${SLUG}.test`, name: 'Kale Sahibi', role: 'BAYI', companyId: T.company, isOwner: true })).id;
  T.staffId = (await user({ email: `depo@${SLUG}.test`, name: 'Kale Depo', role: 'BAYI', companyId: T.company })).id;
  T.address = (await P(() => prisma.deliveryAddress.create({ data: { tenantId, companyId: T.company, title: 'Merkez', contactName: 'Ali', phone: '0555', city: 'Ankara', district: 'Çankaya', line: 'No:1', isDefault: true } }))).id;
  const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'Genel' } }));
  T.product = (await P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, name: 'Dübel', sku: 'Y-DUBEL', price: 100, stock: 100, vatRate: 20, unit: 'Paket' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['owner', 'sahip'], ['staff', 'depo']]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG }, body: JSON.stringify({ email: `${email}@${SLUG}.test`, password: 'Test12345' }) });
    const data = await r.json();
    assert.equal(r.status, 200, `${email}: ${data.message}`);
    T.tokens[k] = data.token;
  }
  // Ana kullanıcı bir sipariş verir (çalışan bu siparişi görür)
  T.orderId = (await order(T.tokens.owner)).data.id;
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('yetki düzenleme: geçersiz yetki reddedilir; ana kullanıcıya uygulanmaz; oturumda görünür', { skip }, async () => {
  assert.equal((await setRule({ dealerDeny: ['PRICES', 'UÇAK'] })).status, 400);
  assert.equal((await setRule({ orderApproval: 'HICBIRI' })).status, 400);
  assert.equal((await api(`/team/my-company/${T.ownerId}`, { token: T.tokens.staff, method: 'PATCH', body: { dealerDeny: [] } })).status, 403, 'çalışan yetki değiştiremez');
  const self = await api(`/team/my-company/${T.ownerId}`, { token: T.tokens.owner, method: 'PATCH', body: { dealerDeny: ['PRICES'] } });
  assert.deepEqual(self.data.user.dealerDeny, [], 'ana kullanıcıya kısıt konmaz');
  const ok = await setRule({ dealerDeny: ['FINANCE', 'RETURNS', 'ADDRESSES'] });
  assert.equal(ok.status, 200, ok.data?.message);
  assert.deepEqual(ok.data.user.dealerDeny, ['FINANCE', 'RETURNS', 'ADDRESSES']);
  assert.deepEqual((await api('/auth/me', { token: T.tokens.staff })).data.dealerDeny, ['FINANCE', 'RETURNS', 'ADDRESSES']);
});

test('cari / ödeme, iade ve adres kapalıyken uçlar 403; ana kullanıcı ve bayi adına işlem etkilenmez', { skip }, async () => {
  const s = T.tokens.staff;
  for (const path of ['/finance/my-statement', '/payments/pos-info', '/targets/mine', '/returns']) {
    const r = await api(path, { token: s });
    assert.equal(r.status, 403, path);
    assert.equal(r.data.code, 'DEALER_PERMISSION');
  }
  assert.equal((await api('/finance/reconcile', { token: s, method: 'POST' })).status, 403);
  assert.equal((await api('/returns', { token: s, method: 'POST', body: {} })).status, 403);
  assert.equal((await api('/addresses', { token: s })).status, 200, 'adres listesi açık (siparişte seçilir)');
  assert.equal((await api('/addresses', { token: s, method: 'POST', body: { title: 'Depo' } })).status, 403);
  assert.equal((await api(`/addresses/${T.address}`, { token: s, method: 'DELETE' })).status, 403);
  // Ana kullanıcı her şeyi yapar
  assert.equal((await api('/finance/my-statement', { token: T.tokens.owner })).status, 200);
  assert.equal((await api('/returns', { token: T.tokens.owner })).status, 200);
  // Bayi adına işlem yapan yönetici bayi kullanıcısı kısıtına takılmaz
  assert.equal((await api('/orders', { token: T.tokens.admin, headers: { 'X-Act-As-Company': String(T.company) } })).status, 200);
  // Sipariş verme açık
  assert.equal((await order(s)).status, 201);
});

test('fiyat kapalı: katalog fiyatsız; sepet, sipariş, teklif, fatura, Excel kapalı; sipariş tutarları gizli; cari de kapalı', { skip }, async () => {
  await setRule({ dealerDeny: ['PRICES'] });
  const s = T.tokens.staff;
  const products = await api('/products', { token: s });
  const p = (products.data.data || products.data).find((x) => x.id === T.product);
  assert.deepEqual([p.priceHidden, p.netPrice, p.listPriceTRY, p.price], [true, 0, 0, 0]);
  const ownerView = await api('/products', { token: T.tokens.owner });
  assert.equal((ownerView.data.data || ownerView.data).find((x) => x.id === T.product).netPrice, 100, 'ana kullanıcı fiyatı görür');

  assert.equal((await api('/orders/quote', { token: s, method: 'POST', body: { items: [{ productId: T.product, quantity: 1 }] } })).status, 403);
  const blocked = await order(s);
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.message, /Fiyatları görme yetkiniz olmadığı için/);
  assert.equal((await api('/quotes', { token: s })).status, 403);
  assert.equal((await api('/quotes', { token: s, method: 'POST', body: {} })).status, 403);
  assert.equal((await api(`/orders/${T.orderId}/invoice`, { token: s })).status, 403);
  assert.equal((await api('/orders/export', { token: s })).status, 403);
  assert.equal((await api('/finance/my-statement', { token: s })).status, 403, 'fiyatı göremeyen cariyi de göremez');

  const list = await api('/orders', { token: s });
  const o = list.data.find((x) => x.id === T.orderId);
  assert.deepEqual([o.pricesHidden, o.totalAmount, o.vatAmount, o.items[0].price], [true, null, null, null]);
  const one = await api(`/orders/${T.orderId}`, { token: s });
  assert.deepEqual([one.data.status, one.data.totalAmount], ['PENDING', null], 'durum görünür, tutar gizli');
  assert.equal((await api(`/orders/${T.orderId}`, { token: T.tokens.owner })).data.totalAmount, 240);
});

test('sipariş kuralı: sipariş veremez; onaya gider; teklif kabulü kurala bağlı, ana kullanıcıya iletilir', { skip }, async () => {
  await setRule({ dealerDeny: [], orderApproval: 'BLOCKED' });
  const s = T.tokens.staff;
  const r = await order(s);
  assert.equal(r.status, 403);
  assert.match(r.data.message, /Sipariş verme yetkiniz yok/);
  assert.equal((await api('/orders/quote', { token: s, method: 'POST', body: { items: [{ productId: T.product, quantity: 1 }] } })).status, 200, 'sepet fiyatı görünür');

  // Firma teklif gönderir
  const draft = await api('/quotes/draft', { token: T.tokens.admin, method: 'POST', body: { companyId: T.company, validUntil: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), items: [{ productId: T.product, quantity: 3 }] } });
  assert.equal(draft.status, 201, draft.data?.message);
  assert.equal((await api(`/quotes/${draft.data.id}/submit`, { token: T.tokens.admin, method: 'POST' })).status, 200);
  const q = (await api('/quotes', { token: s })).data.find((x) => x.id === draft.data.id);
  const accept = (token) => api(`/quotes/${q.id}/accept`, { token, method: 'POST', body: { revision: q.revision, paymentMethod: 'CURRENT_ACCOUNT', addressId: T.address } });

  assert.equal((await accept(s)).status, 403, 'sipariş veremeyen teklifi kabul edemez');
  await setRule({ orderApproval: 'ALWAYS' });
  const a = await accept(s);
  assert.equal(a.status, 403, 'onaya tabi çalışan teklifi kabul edemez (önceden doğrudan sipariş oluyordu)');
  assert.match(a.data.message, /ana kullanıcısı onaylar/);
  const f = await api(`/quotes/${q.id}/forward`, { token: s, method: 'POST' });
  assert.equal(f.status, 200);
  assert.ok(await until(async () => Boolean(await P(() => prisma.notification.findFirst({ where: { userId: T.ownerId, title: 'Onayınızı bekleyen teklif' } })))));
  // Ana kullanıcı kabul eder, sipariş oluşur
  const done = await accept(T.tokens.owner);
  assert.equal(done.status, 201, done.data?.message);

  // Onaya giden sipariş talep olur
  const req = await order(s);
  assert.equal(req.status, 202);
});
