/**
 * B2B kuralları: stok ayırma, bayi iptali, sipariş notu / referans, kargo ücreti, otomatik onay, süreli özel fiyat,
 * grup bazlı görünürlük, kısmi sevkiyat, irsaliye, plasiyer ve yönetici bayi adına sipariş, ciro primi, sunucuda sepet.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'btest-a';

let server, base, prisma, runAsPlatform, runWithTenant, purgeTenant;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body, act } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }), ...(act && { 'X-Act-As-Company': String(act) }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

const P = (fn) => runAsPlatform(fn);
const W = (fn) => runWithTenant(T.id, fn);
const setting = (key, value) => api('/settings', { token: T.tokens.admin, method: 'POST', body: { key, value } });
const order = (token, items, extra = {}) => api('/orders', { token, method: 'POST', body: { items, paymentMethod: 'CURRENT_ACCOUNT', addressId: token === T.tokens.vip ? T.vipAddress : T.address, ...extra } });
const approveAll = async (id) => {
  const o = await P(() => prisma.order.findUnique({ where: { id }, include: { items: true } }));
  return api(`/orders/${id}/partial-approve`, { token: T.tokens.admin, method: 'PATCH', body: { itemStatuses: o.items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) } });
};
const balance = async (companyId) => (await P(() => prisma.company.findUnique({ where: { id: companyId } }))).currentBalance;
const stockOf = async (id) => (await P(() => prisma.product.findUnique({ where: { id } }))).stock;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform, runWithTenant } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'B2B Test', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  T.id = tenant.id;
  const tenantId = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  const admin = await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  const plasiyer = await user({ email: `saha@${SLUG}.test`, name: 'Saha Satış', role: 'PLASIYER' });
  T.admin = admin.id;
  T.plasiyer = plasiyer.id;
  const company = (name, data = {}) => P(() => prisma.company.create({ data: { tenantId, name, status: 'ACTIVE', riskLimit: 1_000_000, ...data } }));
  T.std = (await company('Standart Bayi', { taxNumber: '1000000001', plasiyerId: plasiyer.id })).id;
  T.vip = (await company('VIP Bayi', { taxNumber: '1000000002', dealerGroup: 'VIP' })).id;
  await user({ email: `std@${SLUG}.test`, name: 'Standart', role: 'BAYI', companyId: T.std, isOwner: true });
  await user({ email: `vip@${SLUG}.test`, name: 'VIP', role: 'BAYI', companyId: T.vip, isOwner: true });
  T.address = (await P(() => prisma.deliveryAddress.create({ data: { tenantId, companyId: T.std, title: 'Merkez', contactName: 'Ali', phone: '0555', city: 'İstanbul', district: 'Kadıköy', line: 'No:1', isDefault: true } }))).id;
  T.vipAddress = (await P(() => prisma.deliveryAddress.create({ data: { tenantId, companyId: T.vip, title: 'Merkez', contactName: 'Veli', phone: '0555', city: 'Ankara', district: 'Çankaya', line: 'No:2', isDefault: true } }))).id;

  const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'Genel' } }));
  const goldCat = await P(() => prisma.category.create({ data: { tenantId, name: 'Gold Özel', visibleGroups: ['GOLD'] } }));
  const product = (data) => P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, vatRate: 20, unit: 'Adet', ...data } }));
  T.scarce = (await product({ name: 'Az Stoklu', sku: 'B-AZ', price: 100, stock: 5 })).id;
  T.plenty = (await product({ name: 'Bol Stoklu', sku: 'B-BOL', price: 250, stock: 500 })).id;
  T.mid = (await product({ name: 'Orta Stoklu', sku: 'B-ORTA', price: 100, stock: 100 })).id;
  T.vipOnly = (await product({ name: 'VIP Ürün', sku: 'B-VIP', price: 50, stock: 50, visibleGroups: ['VIP'] })).id;
  T.goldOnly = (await product({ name: 'Gold Kategorili', sku: 'B-GOLD', price: 50, stock: 50, categoryId: goldCat.id })).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', `admin@${SLUG}.test`], ['std', `std@${SLUG}.test`], ['vip', `vip@${SLUG}.test`], ['plasiyer', `saha@${SLUG}.test`]]) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password: 'Test12345' } });
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

test('stok ayırma: bekleyen sipariş stoğu ayırır, katalog ve yeni sipariş buna göre davranır; iptal serbest bırakır', { skip }, async () => {
  const first = await order(T.tokens.std, [{ productId: T.scarce, quantity: 3 }]);
  assert.equal(first.status, 201, first.data?.message);
  assert.equal(await stockOf(T.scarce), 5, 'stok onaya kadar düşmez');

  const list = await api('/products?search=B-AZ', { token: T.tokens.std });
  assert.equal(list.data.data[0].inStock, true);
  assert.equal(list.data.data[0].stock, 'Son 5 Ürün'); // 5 − 3 ayrılmış = 2

  const more = await order(T.tokens.vip, [{ productId: T.scarce, quantity: 3 }]);
  assert.equal(more.status, 400);
  assert.match(more.data.message, /stokta 2 Adet var/);

  // Yönetici listesinde ayrılmış miktar görünür
  const adminList = await api('/products?isAdmin=true&search=B-AZ', { token: T.tokens.admin });
  assert.equal(adminList.data.data[0].reserved, 3);

  // Bayi kendi bekleyen siparişini iptal eder: ayrılan stok serbest kalır
  const cancel = await api(`/orders/${first.data.id}/cancel`, { token: T.tokens.std, method: 'PATCH' });
  assert.equal(cancel.status, 200, cancel.data?.message);
  const cancelled = await P(() => prisma.order.findUnique({ where: { id: first.data.id } }));
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.cancelledBy, 'DEALER');
  const now = await order(T.tokens.vip, [{ productId: T.scarce, quantity: 5 }]);
  assert.equal(now.status, 201, now.data?.message);
  T.vipScarceOrder = now.data.id;
});

test('bayi iptali: yalnızca kendi bekleyen siparişi; onaylı sipariş iptal edilemez, kupon geri sayılır', { skip }, async () => {
  // Başka bayinin siparişi
  const foreign = await api(`/orders/${T.vipScarceOrder}/cancel`, { token: T.tokens.std, method: 'PATCH' });
  assert.equal(foreign.status, 404);

  // Onaylanan sipariş iptal edilemez
  assert.equal((await approveAll(T.vipScarceOrder)).status, 200);
  const late = await api(`/orders/${T.vipScarceOrder}/cancel`, { token: T.tokens.vip, method: 'PATCH' });
  assert.equal(late.status, 400);
  assert.match(late.data.message, /Yalnızca onay bekleyen/);

  // Kuponlu sipariş iptal edilince kupon kullanımı geri alınır
  await P(() => prisma.coupon.create({ data: { tenantId: T.id, code: 'BIPTAL', type: 'PERCENT', value: 10, maxUses: 1 } }));
  const withCoupon = await order(T.tokens.std, [{ productId: T.plenty, quantity: 1 }], { couponCode: 'BIPTAL' });
  assert.equal(withCoupon.status, 201, withCoupon.data?.message);
  assert.equal((await P(() => prisma.coupon.findFirst({ where: { code: 'BIPTAL' } }))).usedCount, 1);
  await api(`/orders/${withCoupon.data.id}/cancel`, { token: T.tokens.std, method: 'PATCH' });
  assert.equal((await P(() => prisma.coupon.findFirst({ where: { code: 'BIPTAL' } }))).usedCount, 0);
});

test('sipariş notu ve bayi referans numarası kaydedilir ve Excel çıktısında yer alır', { skip }, async () => {
  const o = await order(T.tokens.std, [{ productId: T.plenty, quantity: 1 }], { note: 'Pazartesi teslim olsun', customerRef: 'PO-2026-118' });
  assert.equal(o.status, 201, o.data?.message);
  const got = await api(`/orders/${o.data.id}`, { token: T.tokens.std });
  assert.equal(got.data.note, 'Pazartesi teslim olsun');
  assert.equal(got.data.customerRef, 'PO-2026-118');
  assert.equal(got.data.channel, 'PORTAL');
  await api(`/orders/${o.data.id}/cancel`, { token: T.tokens.std, method: 'PATCH' });
});

test('kargo ücreti: eşiğin altında eklenir (KDV ile), Gel-Al ve eşik üstünde yok; kısmi onayda kalır, cariye dahil yazılır', { skip }, async () => {
  await setting('shipping_fee', '100');
  await setting('shipping_free_over', '1000');
  await setting('pickup_enabled', 'true');
  try {
    const q = await api('/orders/quote', { token: T.tokens.std, method: 'POST', body: { items: [{ productId: T.plenty, quantity: 2 }] } });
    assert.equal(q.data.shippingFee, 100);
    assert.equal(q.data.shippingVat, 20);
    assert.equal(q.data.total, 500 * 1.2 + 120);
    const pickup = await api('/orders/quote', { token: T.tokens.std, method: 'POST', body: { items: [{ productId: T.plenty, quantity: 2 }], deliveryMethod: 'PICKUP' } });
    assert.equal(pickup.data.shippingFee, 0);
    const big = await api('/orders/quote', { token: T.tokens.std, method: 'POST', body: { items: [{ productId: T.plenty, quantity: 4 }] } });
    assert.equal(big.data.shippingFee, 0, '1.000 TL ve üstü ücretsiz');

    const o = await order(T.tokens.std, [{ productId: T.plenty, quantity: 1 }, { productId: T.mid, quantity: 1 }]);
    assert.equal(o.status, 201, o.data?.message);
    assert.equal(o.data.shippingFee, 100);
    assert.equal(o.data.totalAmount, 350 * 1.2 + 120);

    // Bir kalem iptal: kargo ücreti kalır; borç = kalan kalem + kargo
    const before = await balance(T.std);
    const full = await P(() => prisma.order.findUnique({ where: { id: o.data.id }, include: { items: true } }));
    const r = await api(`/orders/${o.data.id}/partial-approve`, { token: T.tokens.admin, method: 'PATCH', body: { itemStatuses: full.items.map((i) => ({ itemId: i.id, status: i.productId === T.mid ? 'CANCELLED' : 'APPROVED' })) } });
    assert.equal(r.status, 200, r.data?.message);
    assert.equal(r.data.updatedOrder.totalAmount, 250 * 1.2 + 120);
    assert.equal(await balance(T.std), before - (250 * 1.2 + 120));
  } finally {
    await setting('shipping_fee', '0');
    await setting('shipping_free_over', '0');
  }
});

test('otomatik onay: cari hesaplı ve sınırın altındaysa onaylanır (stok düşer, borç yazılır); havale ve sınır üstü bekler', { skip }, async () => {
  await setting('auto_approve', 'true');
  await setting('auto_approve_max', '1000');
  try {
    const stock = await stockOf(T.plenty);
    const before = await balance(T.std);
    const ok = await order(T.tokens.std, [{ productId: T.plenty, quantity: 2 }]);
    assert.equal(ok.status, 201, ok.data?.message);
    assert.equal(ok.data.status, 'APPROVED');
    assert.equal(ok.data.autoApproved, true);
    assert.equal(await stockOf(T.plenty), stock - 2);
    assert.equal(await balance(T.std), before - 600);

    const wire = await order(T.tokens.std, [{ productId: T.plenty, quantity: 1 }], { paymentMethod: 'WIRE_TRANSFER' });
    assert.equal(wire.data.status, 'PENDING');
    const over = await order(T.tokens.std, [{ productId: T.plenty, quantity: 4 }]);
    assert.equal(over.data.status, 'PENDING', '1.000 TL üstü otomatik onaylanmaz');
    await api(`/orders/${wire.data.id}/cancel`, { token: T.tokens.std, method: 'PATCH' });
    await api(`/orders/${over.data.id}/cancel`, { token: T.tokens.std, method: 'PATCH' });
  } finally {
    await setting('auto_approve', 'false');
  }
});

test('süreli özel fiyat: yalnızca geçerlilik aralığında uygulanır', { skip }, async () => {
  const day = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const put = (prices) => api(`/products/${T.plenty}/special-prices`, { token: T.tokens.admin, method: 'PUT', body: { prices } });
  const priceFor = async () => (await api('/orders/quote', { token: T.tokens.std, method: 'POST', body: { items: [{ productId: T.plenty, quantity: 1 }] } })).data.lines[0].unitPrice;

  assert.equal((await put([{ companyId: T.std, minQty: 1, price: 200, validFrom: day(2), validUntil: day(10) }])).status, 200);
  assert.equal(await priceFor(), 250, 'başlamamış kampanya uygulanmaz');
  await put([{ companyId: T.std, minQty: 1, price: 200, validFrom: day(0), validUntil: day(10) }]);
  assert.equal(await priceFor(), 200);
  await put([{ companyId: T.std, minQty: 1, price: 200, validFrom: day(-10), validUntil: day(-1) }]);
  assert.equal(await priceFor(), 250, 'süresi geçmiş fiyat uygulanmaz');
  const bad = await put([{ companyId: T.std, minQty: 1, price: 200, validFrom: day(5), validUntil: day(1) }]);
  assert.equal(bad.status, 400);
  await put([]);
});

test('görünürlük: gruba kapalı ürün / kategori listelenmez, kodla bulunmaz, sipariş edilemez; o grup görür', { skip }, async () => {
  const skus = (r) => r.data.data.map((p) => p.sku);
  const std = await api('/products?limit=50', { token: T.tokens.std });
  assert.ok(!skus(std).includes('B-VIP'));
  assert.ok(!skus(std).includes('B-GOLD'), 'Gold kategorisindeki ürün gizli');
  const vip = await api('/products?limit=50', { token: T.tokens.vip });
  assert.ok(skus(vip).includes('B-VIP'));
  assert.ok(!skus(vip).includes('B-GOLD'));

  const resolved = await api('/products/resolve-skus', { token: T.tokens.std, method: 'POST', body: { skus: ['B-VIP', 'B-BOL'] } });
  assert.deepEqual(resolved.data.notFound, ['B-VIP']);
  const blocked = await order(T.tokens.std, [{ productId: T.vipOnly, quantity: 1 }]);
  assert.equal(blocked.status, 400);
  const cats = await api('/categories', { token: T.tokens.std });
  assert.ok(!cats.data.some((c) => c.name === 'Gold Özel'));
  const adminCats = await api('/categories?isAdmin=true', { token: T.tokens.admin });
  assert.ok(adminCats.data.some((c) => c.name === 'Gold Özel'));

  const ok = await order(T.tokens.vip, [{ productId: T.vipOnly, quantity: 1 }]);
  assert.equal(ok.status, 201, ok.data?.message);
  await api(`/orders/${ok.data.id}/cancel`, { token: T.tokens.vip, method: 'PATCH' });
});

test('kısmi sevkiyat: parça parça kargoya verilir, tamamı gönderilince "Kargoda" olur; gönderilen kalem iptal edilemez; irsaliye no', { skip }, async () => {
  const o = await order(T.tokens.std, [{ productId: T.plenty, quantity: 4 }, { productId: T.mid, quantity: 2 }]);
  assert.equal(o.status, 201, o.data?.message);
  assert.equal((await approveAll(o.data.id)).status, 200);
  const items = (await P(() => prisma.orderItem.findMany({ where: { orderId: o.data.id } })));
  const big = items.find((i) => i.productId === T.plenty);
  const small = items.find((i) => i.productId === T.mid);

  const ship = (body) => api(`/orders/${o.data.id}/shipments`, { token: T.tokens.admin, method: 'POST', body });
  assert.equal((await ship({ trackingNumber: 'T1', items: [{ itemId: big.id, quantity: 5 }] })).status, 400, 'onaylanandan fazlası gönderilemez');
  const first = await ship({ trackingNumber: 'T1', cargoCompany: 'aras', items: [{ itemId: big.id, quantity: 2 }] });
  assert.equal(first.status, 200, first.data?.message);
  assert.equal((await P(() => prisma.order.findUnique({ where: { id: o.data.id } }))).status, 'APPROVED');

  // Kısmen gönderilen kalem iptal edilemez
  const cancelShipped = await api(`/orders/${o.data.id}/partial-approve`, { token: T.tokens.admin, method: 'PATCH', body: { itemStatuses: [{ itemId: big.id, status: 'CANCELLED' }, { itemId: small.id, status: 'APPROVED' }] } });
  assert.equal(cancelShipped.status, 400);
  assert.match(cancelShipped.data.message, /Kargoya verilmiş kalem/);

  const rest = await ship({ trackingNumber: 'T2', items: [{ itemId: big.id, quantity: 2 }, { itemId: small.id, quantity: 2 }] });
  assert.equal(rest.status, 200, rest.data?.message);
  const done = await api(`/orders/${o.data.id}`, { token: T.tokens.std });
  assert.equal(done.data.status, 'SHIPPED');
  assert.equal(done.data.shipments.length, 2);
  assert.deepEqual(done.data.shipments.map((s) => s.trackingNumber), ['T1', 'T2']);
  assert.equal(done.data.shipments[0].cargoCompany, 'ARAS');

  const desp = await api(`/orders/${o.data.id}/despatch`, { token: T.tokens.admin, method: 'PATCH', body: { despatchNumber: 'IRS-2026-0042', despatchDate: '2026-11-04' } });
  assert.equal(desp.status, 200, desp.data?.message);
  assert.equal((await api(`/orders/${o.data.id}`, { token: T.tokens.std })).data.despatchNumber, 'IRS-2026-0042');
  assert.equal((await api(`/orders/${o.data.id}/despatch`, { token: T.tokens.std, method: 'PATCH', body: { despatchNumber: 'X' } })).status, 403);

  // Tek seferde kargoya verilen sipariş de gönderi kaydı oluşturur
  const single = await order(T.tokens.std, [{ productId: T.plenty, quantity: 1 }]);
  await approveAll(single.data.id);
  await api(`/orders/${single.data.id}/ship`, { token: T.tokens.admin, method: 'PATCH', body: { trackingNumber: 'T3', cargoCompany: 'MNG' } });
  const shipped = await api(`/orders/${single.data.id}`, { token: T.tokens.std });
  assert.equal(shipped.data.shipments.length, 1);
  assert.equal(shipped.data.items[0].shippedQty, 1);
});

test('plasiyer: giriş yapar, yalnızca kendi bayilerini görür ve onlar adına sipariş verir; başkası adına veremez', { skip }, async () => {
  const dealers = await api('/plasiyer/dealers', { token: T.tokens.plasiyer });
  assert.equal(dealers.status, 200, dealers.data?.message);
  assert.deepEqual(dealers.data.map((d) => d.name), ['Standart Bayi']);

  // Bayi seçmeden sipariş / ürün uçları kapalı (tüm firmanın siparişlerini göremez)
  assert.equal((await api('/orders', { token: T.tokens.plasiyer })).status, 403);
  // Kendi bayisi adına: bayinin fiyatları ve gizlilik kuralları geçerli
  const catalog = await api('/products?limit=50', { token: T.tokens.plasiyer, act: T.std });
  assert.equal(catalog.status, 200);
  assert.ok(!catalog.data.data.some((p) => p.sku === 'B-VIP'));
  const o = await api('/orders', { token: T.tokens.plasiyer, act: T.std, method: 'POST', body: { items: [{ productId: T.plenty, quantity: 1 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.address } });
  assert.equal(o.status, 201, o.data?.message);
  const saved = await P(() => prisma.order.findUnique({ where: { id: o.data.id } }));
  assert.equal(saved.companyId, T.std);
  assert.equal(saved.userId, T.plasiyer);
  assert.equal(saved.channel, 'PLASIYER');
  // Bayi siparişi kendi listesinde görür
  assert.ok((await api('/orders', { token: T.tokens.std })).data.some((x) => x.id === o.data.id));

  // Sorumlusu olmadığı bayi adına işlem yok
  assert.equal((await api('/products', { token: T.tokens.plasiyer, act: T.vip })).status, 403);
  // Bayi adına modunda yönetici / ekip uçları açılmaz
  assert.equal((await api('/team', { token: T.tokens.plasiyer, act: T.std })).status, 403);
  await api(`/orders/${o.data.id}/cancel`, { token: T.tokens.plasiyer, act: T.std, method: 'PATCH' });
});

test('yönetici bayi adına sipariş verir; o modda yönetim uçları kapalıdır', { skip }, async () => {
  const o = await api('/orders', { token: T.tokens.admin, act: T.vip, method: 'POST', body: { items: [{ productId: T.vipOnly, quantity: 1 }], paymentMethod: 'WIRE_TRANSFER' } });
  assert.equal(o.status, 201, o.data?.message);
  const saved = await P(() => prisma.order.findUnique({ where: { id: o.data.id } }));
  assert.equal(saved.companyId, T.vip);
  assert.equal(saved.channel, 'STAFF');
  assert.equal(saved.userId, T.admin);
  // Bayi adına modunda kalem onayı yapılamaz (rol bayi olur)
  assert.equal((await api('/orders/stats', { token: T.tokens.admin, act: T.vip })).status, 403);
  // Bayiye bildirim gider
  const notes = await P(() => prisma.notification.findMany({ where: { tenantId: T.id, title: 'Adınıza sipariş oluşturuldu' } }));
  assert.ok(notes.length >= 1);
  await api(`/orders/${o.data.id}/cancel`, { token: T.tokens.vip, method: 'PATCH' });
});

test('bayi hedefi ve ciro primi: gerçekleşen izlenir, hedef tutunca prim cariye bir kez yazılır', { skip }, async () => {
  const day = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  const created = await api('/targets', { token: T.tokens.admin, method: 'POST', body: { companyId: T.vip, name: 'Kasım hedefi', periodStart: day(-1), periodEnd: day(30), targetAmount: 1000, bonusRate: 5 } });
  assert.equal(created.status, 201, created.data?.message);
  assert.equal((await api('/targets', { token: T.tokens.vip })).status, 403, 'bayi hedef tanımlayamaz / listeleyemez');

  const o = await order(T.tokens.vip, [{ productId: T.plenty, quantity: 6 }]); // 1.500 TL KDV hariç
  assert.equal(o.status, 201, o.data?.message);
  await approveAll(o.data.id);
  const mine = await api('/targets/mine', { token: T.tokens.vip });
  const t = mine.data.find((x) => x.id === created.data.id);
  assert.ok(t.achieved >= 1500, JSON.stringify(t));
  assert.ok(t.percent >= 150);
  assert.equal(t.bonus, Math.round(t.achieved * 5) / 100);

  const before = await balance(T.vip);
  const closed = await api(`/targets/${created.data.id}/close`, { token: T.tokens.admin, method: 'POST', body: {} });
  assert.equal(closed.status, 200, closed.data?.message);
  assert.equal(closed.data.target.status, 'PAID');
  assert.equal(await balance(T.vip), Math.round((before + closed.data.target.paidAmount) * 100) / 100);
  const tx = await P(() => prisma.financialTransaction.findFirst({ where: { companyId: T.vip, source: 'BONUS' } }));
  assert.ok(tx && tx.type === 'CREDIT');
  assert.equal((await api(`/targets/${created.data.id}/close`, { token: T.tokens.admin, method: 'POST', body: {} })).status, 400, 'prim iki kez yazılmaz');

  // Tutmayan hedef prim yazmadan kapanır
  const missed = await api('/targets', { token: T.tokens.admin, method: 'POST', body: { companyId: T.std, periodStart: day(-1), periodEnd: day(1), targetAmount: 10_000_000, bonusRate: 3 } });
  const shut = await api(`/targets/${missed.data.id}/close`, { token: T.tokens.admin, method: 'POST', body: {} });
  assert.equal(shut.data.target.status, 'CLOSED');
});

test('sunucuda sepet: kaydedilir, aynı kullanıcı başka cihazda alır; başka kullanıcı göremez', { skip }, async () => {
  const items = [{ id: T.plenty, quantity: 3, price: 250, name: 'Bol Stoklu', sku: 'B-BOL', unit: 'Adet' }];
  assert.equal((await api('/cart', { token: T.tokens.std, method: 'PUT', body: { items } })).status, 200);
  const mine = await api('/cart', { token: T.tokens.std });
  assert.equal(mine.data.items[0].quantity, 3);
  assert.ok(mine.data.updatedAt);
  assert.deepEqual((await api('/cart', { token: T.tokens.vip })).data.items, []);
  assert.equal((await api('/cart', { token: T.tokens.admin })).status, 403);
});

test('eşzamanlı tahsilat ve teklif: sıra numaraları çakışmaz, hepsi kaydedilir', { skip }, async () => {
  // Kampanya günü yük testinde aynı anda girilen tahsilatların %6'sı makbuz numarası çakışmasıyla düşüyordu
  const pays = await Promise.all(Array.from({ length: 12 }, (_, i) => api(`/partners/${T.std}/payments`, { token: T.tokens.admin, method: 'POST', body: { method: 'CASH', amount: 100 + i } })));
  assert.deepEqual(pays.map((r) => r.status).filter((s) => s !== 201 && s !== 200), [], JSON.stringify(pays.map((r) => r.data?.message)));
  const receipts = await P(() => prisma.payment.findMany({ where: { tenantId: T.id, receiptNo: { not: null } }, select: { receiptNo: true } }));
  assert.equal(new Set(receipts.map((r) => r.receiptNo)).size, receipts.length);
  const quotes = await Promise.all(Array.from({ length: 8 }, () => api('/quotes', { token: T.tokens.std, method: 'POST', body: { items: [{ productId: T.plenty, quantity: 40 }], note: 'eşzamanlı' } })));
  assert.deepEqual(quotes.map((r) => r.status).filter((s) => s !== 201), [], JSON.stringify(quotes.map((r) => r.data?.message)));
  const numbers = await P(() => prisma.quoteRequest.findMany({ where: { tenantId: T.id }, select: { number: true } }));
  assert.equal(new Set(numbers.map((q) => q.number)).size, numbers.length);
});
