/**
 * Bayi içinde sipariş onayı: ana kullanıcı (ya da firma) çalışana onay kuralı koyar; kurala uyan sipariş sipariş olmaz,
 * onay talebi olur (stok ayırmaz, firmaya düşmez); ana kullanıcı onaylayınca sipariş çalışan adına o anki fiyat / stok /
 * limitle oluşur; kural ihlalinde talep beklemede kalır; ret, geri çekme ve yetki sınırları.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'orqtest-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const until = async (fn, ms = 4000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return true;
  return false;
};
const order = (token, quantity, paymentMethod = 'CURRENT_ACCOUNT') => api('/orders', { token, method: 'POST', body: { items: [{ productId: T.product, quantity }], paymentMethod, addressId: T.address } });
const orderCount = () => P(() => prisma.order.count({ where: { tenantId: T.id } }));
const notified = (userId, title) => until(async () => Boolean(await P(() => prisma.notification.findFirst({ where: { userId, title } }))));

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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Dağ Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  T.company = (await P(() => prisma.company.create({ data: { tenantId, name: 'Zirve Market', status: 'ACTIVE', riskLimit: 100_000, taxNumber: '3200000001' } }))).id;
  T.ownerId = (await user({ email: `sahip@${SLUG}.test`, name: 'Zirve Sahibi', role: 'BAYI', companyId: T.company, isOwner: true })).id;
  T.staffId = (await user({ email: `depo@${SLUG}.test`, name: 'Depo Sorumlusu', role: 'BAYI', companyId: T.company })).id;
  T.staff2Id = (await user({ email: `sube@${SLUG}.test`, name: 'Şube', role: 'BAYI', companyId: T.company })).id;
  T.address = (await P(() => prisma.deliveryAddress.create({ data: { tenantId, companyId: T.company, title: 'Merkez', contactName: 'Ali', phone: '0555', city: 'Bursa', district: 'Nilüfer', line: 'No:1', isDefault: true } }))).id;
  const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'Genel' } }));
  T.product = (await P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, name: 'Silikon', sku: 'O-SIL', price: 100, stock: 50, vatRate: 20, unit: 'Adet' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['owner', 'sahip'], ['staff', 'depo'], ['staff2', 'sube']]) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `${email}@${SLUG}.test`, password: 'Test12345' } });
    assert.equal(r.status, 200, `${email}: ${r.data?.message}`);
    T.tokens[k] = r.data.token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('onay kuralı: ana kullanıcı ve firma koyar; çalışan koyamaz; sınır şart; ana kullanıcıya uygulanmaz', { skip }, async () => {
  assert.equal((await api(`/team/my-company/${T.staff2Id}`, { token: T.tokens.staff, method: 'PATCH', body: { orderApproval: 'ALWAYS' } })).status, 403);
  assert.equal((await api(`/team/my-company/${T.staffId}`, { token: T.tokens.owner, method: 'PATCH', body: { orderApproval: 'OVER' } })).status, 400, 'sınır yok');
  assert.equal((await api(`/team/my-company/${T.staffId}`, { token: T.tokens.owner, method: 'PATCH', body: { orderApproval: 'HEPSI' } })).status, 400);
  const ok = await api(`/team/my-company/${T.staffId}`, { token: T.tokens.owner, method: 'PATCH', body: { orderApproval: 'ALWAYS' } });
  assert.equal(ok.status, 200, ok.data?.message);
  assert.equal(ok.data.user.orderApproval, 'ALWAYS');
  const admin = await api(`/companies/${T.company}/users/${T.staff2Id}`, { token: T.tokens.admin, method: 'PATCH', body: { orderApproval: 'OVER', orderApprovalLimit: 1000 } });
  assert.deepEqual([admin.status, admin.data.user.orderApproval, admin.data.user.orderApprovalLimit], [200, 'OVER', 1000]);
  const self = await api(`/team/my-company/${T.ownerId}`, { token: T.tokens.owner, method: 'PATCH', body: { orderApproval: 'ALWAYS' } });
  assert.equal(self.data.user.orderApproval, 'NONE', 'ana kullanıcı onaylayan kişidir');
  // Oturum bilgisinde kural görünür (ödeme ekranı önceden uyarır)
  assert.equal((await api('/auth/me', { token: T.tokens.staff })).data.orderApproval, 'ALWAYS');
});

test('kurala uyan sipariş talep olur: sipariş oluşmaz, stok ayrılmaz, ana kullanıcıya bildirim; sınır altı doğrudan sipariş', { skip }, async () => {
  const before = await orderCount();
  const r = await order(T.tokens.staff, 3);
  assert.equal(r.status, 202, r.data?.message);
  assert.match(r.data.message, /Zirve Sahibi onayına gönderildi/);
  assert.equal(r.data.request.total, 360);
  assert.equal(await orderCount(), before, 'sipariş oluşmadı');
  assert.ok(await notified(T.ownerId, 'Onayınızı bekleyen sipariş'));
  // Talep stok ayırmaz: ana kullanıcı 50 adedin hepsini sepete koyabilir
  assert.deepEqual((await api('/orders/quote', { token: T.tokens.owner, method: 'POST', body: { items: [{ productId: T.product, quantity: 50 }] } })).data.errors, []);

  const small = await order(T.tokens.staff2, 5); // 600 ₺ ≤ 1000
  assert.equal(small.status, 201, small.data?.message);
  const big = await order(T.tokens.staff2, 10); // 1200 ₺ > 1000
  assert.equal(big.status, 202);
  assert.equal(await orderCount(), before + 1);
  // Sepet kuralı ihlali talep açtırmaz
  assert.equal((await order(T.tokens.staff, 0)).status, 400);
  assert.equal((await order(T.tokens.staff, 3, 'KREDI')).status, 400);
});

test('liste: ana kullanıcı hepsini, çalışan kendini görür; bekleyende güncel tutar', { skip }, async () => {
  const owner = await api('/order-requests', { token: T.tokens.owner });
  assert.equal(owner.data.isOwner, true);
  assert.equal(owner.data.pending, 2);
  const r = owner.data.requests.find((x) => x.user.id === T.staffId);
  assert.deepEqual(r.lines, [{ productId: T.product, quantity: 3, name: 'Silikon', sku: 'O-SIL', unit: 'Adet' }]);
  assert.deepEqual(r.current, { total: 360, errors: [] });
  const staff = await api('/order-requests', { token: T.tokens.staff });
  assert.equal(staff.data.isOwner, false);
  assert.deepEqual(staff.data.requests.map((x) => x.user.id), [T.staffId]);
});

test('onay: sipariş çalışan adına oluşur; çalışan onaylayamaz; iki kez onaylanmaz; kural ihlalinde talep beklemede kalır; ret', { skip }, async () => {
  const list = (await api('/order-requests', { token: T.tokens.owner })).data.requests;
  const first = list.find((x) => x.user.id === T.staffId);
  const second = list.find((x) => x.user.id === T.staff2Id);
  assert.equal((await api(`/order-requests/${first.id}/approve`, { token: T.tokens.staff, method: 'POST' })).status, 403);

  // Fiyat değişti: onayda güncel fiyat geçerli
  await P(() => prisma.product.update({ where: { id: T.product }, data: { price: 110 } }));
  const ok = await api(`/order-requests/${first.id}/approve`, { token: T.tokens.owner, method: 'POST' });
  assert.equal(ok.status, 200, ok.data?.message);
  const created = await P(() => prisma.order.findUnique({ where: { id: ok.data.orderId } }));
  assert.deepEqual([created.userId, created.channel, created.status, created.totalAmount], [T.staffId, 'PORTAL', 'PENDING', 396]);
  const saved = await P(() => prisma.orderRequest.findUnique({ where: { id: first.id } }));
  assert.deepEqual([saved.status, saved.orderId, saved.decidedById], ['APPROVED', created.id, T.ownerId]);
  assert.ok(await notified(T.staffId, 'Siparişiniz onaylandı'));
  assert.equal((await api(`/order-requests/${first.id}/approve`, { token: T.tokens.owner, method: 'POST' })).status, 404, 'ikinci onay');

  // Stok bitti: onay olmaz, talep beklemede kalır
  await P(() => prisma.product.update({ where: { id: T.product }, data: { stock: 3 } }));
  const fail = await api(`/order-requests/${second.id}/approve`, { token: T.tokens.owner, method: 'POST' });
  assert.equal(fail.status, 400);
  assert.match(fail.data.message, /^Sipariş oluşturulamadı: /);
  assert.equal((await P(() => prisma.orderRequest.findUnique({ where: { id: second.id } }))).status, 'PENDING');
  assert.ok((await api('/order-requests', { token: T.tokens.owner })).data.requests.find((x) => x.id === second.id).current.errors.length > 0);

  const rej = await api(`/order-requests/${second.id}/reject`, { token: T.tokens.owner, method: 'POST', body: { reason: 'Bu ay bütçe yok' } });
  assert.equal(rej.status, 200);
  const r2 = await P(() => prisma.orderRequest.findUnique({ where: { id: second.id } }));
  assert.deepEqual([r2.status, r2.reason], ['REJECTED', 'Bu ay bütçe yok']);
  assert.ok(await notified(T.staff2Id, 'Sipariş talebiniz reddedildi'));
});

test('limit onayda denetlenir; çalışan kendi bekleyen talebini geri çeker, başkasınınkini çekemez', { skip }, async () => {
  await P(() => prisma.product.update({ where: { id: T.product }, data: { stock: 50 } }));
  await P(() => prisma.company.update({ where: { id: T.company }, data: { riskLimit: 500 } }));
  const r = await order(T.tokens.staff, 10); // 1320 ₺: limit yetersiz ama talep açılır (ana kullanıcı önce ödeyebilir)
  assert.equal(r.status, 202, r.data?.message);
  const limited = await api(`/order-requests/${r.data.request.id}/approve`, { token: T.tokens.owner, method: 'POST' });
  assert.equal(limited.status, 400);
  assert.match(limited.data.message, /Risk limitiniz/);

  assert.equal((await api(`/order-requests/${r.data.request.id}/cancel`, { token: T.tokens.staff2, method: 'POST' })).status, 404);
  assert.equal((await api(`/order-requests/${r.data.request.id}/cancel`, { token: T.tokens.staff, method: 'POST' })).status, 200);
  assert.equal((await P(() => prisma.orderRequest.findUnique({ where: { id: r.data.request.id } }))).status, 'CANCELLED');
});
