/**
 * Bayiler arası erişim: aynı firmadaki bir bayi, başka bayinin siparişini, faturasını, ekstresini, teklifini,
 * adresini, şablonunu, bildirimini, kullanıcısını ve iadesini numarasıyla açamaz / değiştiremez; liste uçlarına
 * companyId vererek başkasınınkini alamaz. Bayi grubuna kapalı ürünler hiçbir uçtan görünmez.
 * Her denemenin karşısında B'nin kendi kaydına erişebildiği de doğrulanır (kayıt gerçekten var, 404 boşuna değil).
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import xlsx from 'xlsx';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'dtest-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = { tokens: {} };

const request = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
});
const api = (path, opts) => request(path, opts).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
// Excel çıktısındaki bütün hücreler tek metin olarak
const sheetText = async (path, token) => {
  const r = await request(path, { token });
  assert.equal(r.status, 200, path);
  const wb = xlsx.read(Buffer.from(await r.arrayBuffer()), { type: 'buffer' });
  return wb.SheetNames.map((n) => JSON.stringify(xlsx.utils.sheet_to_json(wb.Sheets[n], { header: 1 }))).join('\n');
};
const P = (fn) => runAsPlatform(fn);
const A = () => T.tokens.a;
const B = () => T.tokens.b;
const valid = () => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const until = async (fn, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return true;
  return false;
};

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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Bayi Ayrımı Test', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  const company = (name, data) => P(() => prisma.company.create({ data: { tenantId, name, status: 'ACTIVE', riskLimit: 1_000_000, ...data } }));
  T.ca = (await company('Alfa Bayi', { taxNumber: '2000000001' })).id;
  T.cb = (await company('Beta Bayi', { taxNumber: '2000000002', dealerGroup: 'VIP' })).id;
  T.ua = (await user({ email: `a@${SLUG}.test`, name: 'Alfa Sahip', role: 'BAYI', companyId: T.ca, isOwner: true })).id;
  T.ua2 = (await user({ email: `a2@${SLUG}.test`, name: 'Alfa Çalışan', role: 'BAYI', companyId: T.ca })).id;
  T.ub = (await user({ email: `b@${SLUG}.test`, name: 'Beta Sahip', role: 'BAYI', companyId: T.cb, isOwner: true })).id;
  T.ub2 = (await user({ email: `b2@${SLUG}.test`, name: 'Beta Çalışan', role: 'BAYI', companyId: T.cb })).id;

  const address = (companyId, city) => P(() => prisma.deliveryAddress.create({ data: { tenantId, companyId, title: 'Merkez', contactName: 'Yetkili', phone: '0555', city, district: 'Merkez', line: 'No:1', isDefault: true } }));
  T.addrA = (await address(T.ca, 'İzmir')).id;
  T.addrB = (await address(T.cb, 'Bursa')).id;

  const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'Genel' } }));
  T.vipCat = (await P(() => prisma.category.create({ data: { tenantId, name: 'VIP Köşesi', visibleGroups: ['VIP'] } }))).id;
  const product = (data) => P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, vatRate: 20, unit: 'Adet', price: 100, stock: 100, ...data } }));
  T.open = (await product({ name: 'Açık Ürün', sku: 'D-ACIK', brand: 'Herkes' })).id;
  T.vipOnly = (await product({ name: 'Gizli VIP Ürün', sku: 'D-VIP', brand: 'GizliMarka', stock: 0, visibleGroups: ['VIP'] })).id;
  T.vipCatProduct = (await product({ name: 'VIP Köşesi Ürünü', sku: 'D-VIPKAT', brand: 'KöşeMarka', categoryId: T.vipCat })).id;
  // B'ye özel fiyat ve kupon
  await P(() => prisma.specialPrice.create({ data: { tenantId, productId: T.open, companyId: T.cb, price: 40 } }));
  await P(() => prisma.coupon.create({ data: { tenantId, code: 'BETAOZEL', type: 'PERCENT', value: 50, companyId: T.cb } }));

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['a', 'a'], ['a2', 'a2'], ['b', 'b']]) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `${email}@${SLUG}.test`, password: 'Test12345' } });
    assert.equal(r.status, 200, `${email}: ${r.data?.message}`);
    T.tokens[k] = r.data.token;
  }
  const admin = T.tokens.admin;

  // A'nın ve B'nin siparişi; B'ninki onaylanıp kargoya verilir (iade açılabilsin), faturası kesilir
  const order = (token, addressId) => api('/orders', { token, method: 'POST', body: { items: [{ productId: T.open, quantity: 2 }], paymentMethod: 'CURRENT_ACCOUNT', addressId } });
  const oa = await order(A(), T.addrA);
  assert.equal(oa.status, 201, oa.data?.message);
  T.orderA = oa.data.id ?? oa.data.order?.id;
  const ob = await order(B(), T.addrB);
  assert.equal(ob.status, 201, ob.data?.message);
  T.orderB = ob.data.id ?? ob.data.order?.id;
  const items = await P(() => prisma.orderItem.findMany({ where: { orderId: T.orderB } }));
  T.itemB = items[0].id;
  const approved = await api(`/orders/${T.orderB}/partial-approve`, { token: admin, method: 'PATCH', body: { itemStatuses: items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) } });
  assert.equal(approved.status, 200, approved.data?.message);
  await P(() => prisma.order.update({ where: { id: T.orderB }, data: { status: 'SHIPPED' } }));
  const inv = await api(`/orders/${T.orderB}/invoice`, { token: admin, method: 'PUT', body: { number: 'BETA-FAT-1', pdfUrl: 'https://fatura.example.test/beta.pdf' } });
  assert.ok([200, 201].includes(inv.status), inv.data?.message);

  // B'nin iade talebi, şablonu, teklif talebi, kendisine gönderilmiş teklif, bildirimi, ödemesi, hedefi
  const ret = await api('/returns', { token: B(), method: 'POST', body: { orderItemId: T.itemB, quantity: 1, type: 'RETURN', reason: 'Ambalajı hasarlı geldi, değişim istiyoruz.' } });
  assert.equal(ret.status, 201, ret.data?.message);
  T.returnB = ret.data.id ?? ret.data.returnRequest?.id ?? ret.data.request?.id;
  const tpl = await api('/lists/templates', { token: B(), method: 'POST', body: { name: 'Beta haftalık', items: [{ sku: 'D-ACIK', quantity: 3 }] } });
  assert.ok([200, 201].includes(tpl.status), tpl.data?.message);
  T.tplB = tpl.data.id ?? tpl.data.template?.id;
  const qr = await api('/quotes', { token: B(), method: 'POST', body: { items: [{ productId: T.open, quantity: 5 }], note: 'Beta fiyat istiyor' } });
  assert.equal(qr.status, 201, qr.data?.message);
  T.quoteReqB = qr.data.id ?? qr.data.quote?.id;
  const draft = await api('/quotes/draft', { token: admin, method: 'POST', body: { companyId: T.cb, validUntil: valid(), items: [{ productId: T.open, quantity: 3 }] } });
  assert.equal(draft.status, 201, draft.data?.message);
  T.quoteB = draft.data.id;
  assert.equal((await api(`/quotes/${T.quoteB}/submit`, { token: admin, method: 'POST' })).status, 200);
  T.notifB = (await P(() => prisma.notification.create({ data: { tenantId, userId: T.ub, type: 'ORDER', title: 'Beta özel', message: 'Beta bildirimi' } }))).id;
  await P(() => prisma.payment.create({ data: { tenantId, companyId: T.cb, amount: 1234.56, method: 'POS' } }));
  await P(() => prisma.dealerTarget.create({ data: { tenantId, companyId: T.cb, name: 'Beta çeyrek hedefi', periodStart: new Date(Date.now() - 864e5), periodEnd: new Date(Date.now() + 30 * 864e5), targetAmount: 50000, bonusRate: 2 } }));
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('sipariş, fatura ve iptal: başka bayinin siparişi numarasıyla açılamaz', { skip }, async () => {
  assert.equal((await api(`/orders/${T.orderB}`, { token: B() })).status, 200);
  assert.equal((await api(`/orders/${T.orderB}/invoice`, { token: B() })).data?.invoice?.number, 'BETA-FAT-1');
  assert.equal((await api(`/orders/${T.orderB}`, { token: A() })).status, 404);
  const inv = await api(`/orders/${T.orderB}/invoice`, { token: A() });
  assert.equal(inv.status, 404);
  assert.ok(!JSON.stringify(inv.data).includes('BETA-FAT-1'));
  assert.equal((await api(`/orders/${T.orderB}/invoice/pdf`, { token: A() })).status, 404);

  // B'nin bekleyen ikinci siparişini A iptal edemez
  const pending = await api('/orders', { token: B(), method: 'POST', body: { items: [{ productId: T.open, quantity: 1 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.addrB } });
  const id = pending.data.id ?? pending.data.order?.id;
  assert.equal((await api(`/orders/${id}/cancel`, { token: A(), method: 'PATCH' })).status, 404);
  assert.equal((await P(() => prisma.order.findUnique({ where: { id } }))).status, 'PENDING');
});

test('sipariş listesi ve Excel: companyId, arama ya da sipariş numarasıyla başkasınınki gelmez', { skip }, async () => {
  for (const q of [`companyId=${T.cb}`, `q=${T.orderB}`, 'q=Beta', `company=${T.cb}`]) {
    const res = await api(`/orders?${q}`, { token: A() });
    assert.equal(res.status, 200, q);
    const list = res.data.data ?? res.data.orders ?? res.data;
    assert.ok(list.every((o) => o.id !== T.orderB && (o.companyId ?? T.ca) === T.ca), q);
  }
  assert.ok((await api('/orders', { token: B() })).data.some((o) => o.id === T.orderB));
  assert.ok((await api('/orders?page=1', { token: A() })).data.data.every((o) => o.companyId === T.ca));
  const sheet = await sheetText(`/orders/export?companyId=${T.cb}`, A());
  assert.ok(!sheet.includes('Beta Bayi'), 'Excel çıktısında B yok');
  assert.ok(sheet.includes('Alfa Bayi'));
});

test('ekstre ve Excel: yalnızca kendi carisi', { skip }, async () => {
  const mine = await api(`/finance/my-statement?companyId=${T.cb}`, { token: A() });
  assert.equal(mine.status, 200);
  const text = JSON.stringify(mine.data);
  assert.ok(text.includes('Alfa Bayi') && !text.includes('Beta Bayi'));
  assert.ok(!text.includes(`#${T.orderB}`) && !text.includes(`AK-${T.orderB}`));
  assert.equal((await api(`/finance/statement/${T.cb}`, { token: A() })).status, 403);
  assert.equal((await api(`/finance/statement/${T.cb}/export`, { token: A() })).status, 403);
  const sheet = await sheetText(`/finance/my-statement/export?companyId=${T.cb}`, A());
  assert.ok(!sheet.includes('Beta Bayi'));
});

test('ödemeler, iadeler, hedefler: liste başkasınınkini içermez; iade başka bayinin kalemine açılamaz', { skip }, async () => {
  const pays = await api(`/payments?companyId=${T.cb}`, { token: A() });
  assert.equal(pays.status, 200);
  assert.ok(!JSON.stringify(pays.data).includes('1234.56'));
  assert.ok(JSON.stringify((await api('/payments', { token: B() })).data).includes('1234.56'));

  const rets = await api(`/returns?companyId=${T.cb}`, { token: A() });
  assert.equal(rets.status, 200);
  assert.ok(!JSON.stringify(rets.data).includes('Ambalajı hasarlı'));
  assert.ok(JSON.stringify((await api('/returns', { token: B() })).data).includes('Ambalajı hasarlı'));
  const steal = await api('/returns', { token: A(), method: 'POST', body: { orderItemId: T.itemB, quantity: 1, type: 'RETURN', reason: 'Başka bayinin kalemi için iade denemesi' } });
  assert.equal(steal.status, 404);

  assert.ok(!JSON.stringify((await api(`/targets/mine?companyId=${T.cb}`, { token: A() })).data).includes('Beta çeyrek'));
  assert.ok(JSON.stringify((await api('/targets/mine', { token: B() })).data).includes('Beta çeyrek'));
});

test('teklifler: başka bayinin teklifi listede yok, açılamaz, belgesi alınamaz, kabul / ret / iptal edilemez', { skip }, async () => {
  const bList = await api('/quotes', { token: B() });
  assert.ok(bList.data.some((q) => q.id === T.quoteB) && bList.data.some((q) => q.id === T.quoteReqB));
  assert.equal((await api(`/quotes/${T.quoteB}`, { token: B() })).status, 200);

  const aList = await api(`/quotes?companyId=${T.cb}`, { token: A() });
  assert.ok(aList.data.every((q) => q.id !== T.quoteB && q.id !== T.quoteReqB));
  for (const id of [T.quoteB, T.quoteReqB]) {
    assert.equal((await api(`/quotes/${id}`, { token: A() })).status, 404);
    assert.equal((await api(`/quotes/${id}/document`, { token: A() })).status, 404);
  }
  const before = await P(() => prisma.quoteRequest.findMany({ where: { id: { in: [T.quoteB, T.quoteReqB] } }, orderBy: { id: 'asc' } }));
  assert.equal((await api(`/quotes/${T.quoteB}/accept`, { token: A(), method: 'POST', body: { revision: 1, paymentMethod: 'CURRENT_ACCOUNT' } })).status, 404);
  assert.equal((await api(`/quotes/${T.quoteB}/feedback`, { token: A(), method: 'POST', body: { revision: 1, type: 'REJECTED', note: 'x' } })).status, 404);
  // İptal edilemeyen kendi talebiyle aynı yanıt (400 "Bu teklif iptal edilemez"); sonuç aşağıda durumdan doğrulanır
  assert.ok([400, 404].includes((await api(`/quotes/${T.quoteReqB}/cancel`, { token: A(), method: 'POST' })).status));
  const after = await P(() => prisma.quoteRequest.findMany({ where: { id: { in: [T.quoteB, T.quoteReqB] } }, orderBy: { id: 'asc' } }));
  assert.deepEqual(after.map((q) => q.status), before.map((q) => q.status));
  assert.ok(after.every((q) => !q.orderId), 'teklif siparişe dönmedi');
});

test('adres ve şablon: başkasınınki listelenmez, değiştirilemez, silinemez; siparişte başkasının adresi kullanılamaz', { skip }, async () => {
  assert.ok((await api('/addresses', { token: A() })).data.every((a) => a.id !== T.addrB));
  assert.equal((await api(`/addresses/${T.addrB}`, { token: A(), method: 'PATCH', body: { city: 'Ele geçti' } })).status, 404);
  assert.equal((await api(`/addresses/${T.addrB}`, { token: A(), method: 'DELETE' })).status, 404);
  const addr = await P(() => prisma.deliveryAddress.findUnique({ where: { id: T.addrB } }));
  assert.equal(addr?.city, 'Bursa');

  const res = await api('/orders', { token: A(), method: 'POST', body: { items: [{ productId: T.open, quantity: 1 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.addrB } });
  assert.equal(res.status, 400);
  const leaked = await P(() => prisma.order.count({ where: { companyId: T.ca, shippingAddress: { path: ['city'], equals: 'Bursa' } } }));
  assert.equal(leaked, 0);

  assert.ok((await api('/lists/templates', { token: B() })).data.some((t) => t.id === T.tplB));
  assert.ok((await api('/lists/templates', { token: A() })).data.every((t) => t.id !== T.tplB));
  assert.equal((await api(`/lists/templates/${T.tplB}`, { token: A(), method: 'PATCH', body: { name: 'Ele geçti' } })).status, 404);
  assert.equal((await api(`/lists/templates/${T.tplB}`, { token: A(), method: 'DELETE' })).status === 404
    || (await P(() => prisma.orderTemplate.count({ where: { id: T.tplB } }))) === 1, true);
  const tpl = await P(() => prisma.orderTemplate.findUnique({ where: { id: T.tplB } }));
  assert.equal(tpl?.name, 'Beta haftalık');
});

test('bildirim: başkasınınki listelenmez, okundu yapılamaz', { skip }, async () => {
  const list = await api('/notifications', { token: A() });
  assert.ok(!JSON.stringify(list.data).includes('Beta bildirimi'));
  await api(`/notifications/${T.notifB}/read`, { token: A(), method: 'PATCH' });
  assert.equal((await P(() => prisma.notification.findUnique({ where: { id: T.notifB } }))).isRead, false);
});

test('bayi kullanıcıları: başka bayinin kullanıcısı görülemez, kapatılamaz, şifresi sıfırlanamaz; çalışan sahibi yönetemez', { skip }, async () => {
  const list = await api('/team/my-company', { token: A() });
  assert.ok(list.data.every((u) => u.id !== T.ub && u.id !== T.ub2));
  const hash = (await P(() => prisma.user.findUnique({ where: { id: T.ub2 } }))).password;
  assert.equal((await api(`/team/my-company/${T.ub2}`, { token: A(), method: 'PATCH', body: { isActive: false, name: 'Ele geçti' } })).status, 404);
  assert.equal((await api(`/team/my-company/${T.ub2}/reset-password`, { token: A(), method: 'POST' })).status, 404);
  const b2 = await P(() => prisma.user.findUnique({ where: { id: T.ub2 } }));
  assert.equal(b2.isActive, true);
  assert.equal(b2.name, 'Beta Çalışan');
  assert.equal(b2.password, hash);

  // Aynı bayide sahibi olmayan kullanıcı: sahibin şifresini sıfırlayamaz, kullanıcı ekleyemez / kapatamaz
  const ownerHash = (await P(() => prisma.user.findUnique({ where: { id: T.ua } }))).password;
  assert.equal((await api(`/team/my-company/${T.ua}/reset-password`, { token: T.tokens.a2, method: 'POST' })).status, 403);
  assert.equal((await api(`/team/my-company/${T.ua}`, { token: T.tokens.a2, method: 'PATCH', body: { isActive: false } })).status, 403);
  assert.equal((await api('/team/my-company', { token: T.tokens.a2, method: 'POST', body: { name: 'Sızma', email: 'sizma@x.test' } })).status, 403);
  assert.equal((await P(() => prisma.user.findUnique({ where: { id: T.ua } }))).password, ownerHash);
});

test('fiyat ve kupon: başka bayiye özel fiyat ve kupon görünmez, kullanılamaz', { skip }, async () => {
  const priceOf = async (token) => {
    const res = await api('/products?search=D-ACIK', { token });
    const p = res.data.data.find((x) => x.sku === 'D-ACIK');
    return { p, text: JSON.stringify(res.data) };
  };
  const b = await priceOf(B());
  assert.equal(b.p.netPrice ?? b.p.price, 40);
  const a = await priceOf(A());
  assert.equal(a.p.netPrice ?? a.p.price, 100);
  assert.ok(!/"(specialPrices|priceRules)"\s*:\s*\[\s*\{/.test(a.text), 'özel fiyat listesi bayiye gitmez');

  const quote = await api('/orders/quote', { token: A(), method: 'POST', body: { items: [{ productId: T.open, quantity: 1 }], couponCode: 'BETAOZEL' } });
  assert.ok(quote.status === 400 || !(quote.data?.discount > 0 || quote.data?.couponDiscount > 0 || quote.data?.totals?.discount > 0), JSON.stringify(quote.data));
  const ord = await api('/orders', { token: A(), method: 'POST', body: { items: [{ productId: T.open, quantity: 1 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.addrA, couponCode: 'BETAOZEL' } });
  if (ord.status === 201) {
    const o = await P(() => prisma.order.findUnique({ where: { id: ord.data.id ?? ord.data.order?.id } }));
    assert.ok(!o.couponId && !(o.discountAmount > 0), 'B\'nin kuponu A\'nın siparişine uygulanmadı');
  } else assert.equal(ord.status, 400);
});

test('gruba kapalı ürünler: katalog, filtre, kategori, kod çözme, fiyat, teklif ve sipariş görmez', { skip }, async () => {
  const list = await api('/products?limit=100', { token: A() });
  const skus = list.data.data.map((p) => p.sku);
  assert.ok(skus.includes('D-ACIK') && !skus.includes('D-VIP') && !skus.includes('D-VIPKAT'));
  assert.ok((await api('/products?limit=100', { token: B() })).data.data.some((p) => p.sku === 'D-VIP'));
  for (const q of ['search=Gizli', 'search=D-VIP', 'brand=GizliMarka', `categoryId=${T.vipCat}`]) {
    assert.ok((await api(`/products?${q}`, { token: A() })).data.data.every((p) => !p.sku.startsWith('D-VIP')), q);
  }
  const filters = JSON.stringify((await api('/products/filters', { token: A() })).data);
  assert.ok(!filters.includes('GizliMarka') && !filters.includes('KöşeMarka'));
  assert.ok(!JSON.stringify((await api('/categories', { token: A() })).data).includes('VIP Köşesi'));
  const resolved = await api('/products/resolve-skus', { token: A(), method: 'POST', body: { lines: [{ sku: 'D-VIP', quantity: 1 }], skus: ['D-VIP'], items: [{ sku: 'D-VIP', quantity: 1 }] } });
  assert.ok(!JSON.stringify(resolved.data).includes('Gizli VIP Ürün'), JSON.stringify(resolved.data));
  // Sepet hesabı hatayı listede döner; var olmayan ürünle aynı mesaj, ad / fiyat yok
  const priced = await api('/orders/quote', { token: A(), method: 'POST', body: { items: [{ productId: T.vipCatProduct, quantity: 1 }] } });
  assert.ok(priced.status === 400 || (priced.data.errors?.length && !priced.data.lines?.length), JSON.stringify(priced.data));
  assert.ok(!JSON.stringify(priced.data).includes('VIP Köşesi Ürünü'));
  assert.equal((await api('/orders', { token: A(), method: 'POST', body: { items: [{ productId: T.vipCatProduct, quantity: 1 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.addrA } })).status, 400);
  assert.equal((await api('/quotes', { token: A(), method: 'POST', body: { items: [{ productId: T.vipOnly, quantity: 1 }] } })).status, 400);
});

test('gruba kapalı ürün: "gelince haber ver" ve favori yok gibi davranır; stok gelince bildirim sızmaz', { skip }, async () => {
  // Var olmayan ürünle aynı yanıt: numara deneyerek gizli ürün bulunamaz
  const missing = await api('/products/99999999/stock-alert', { token: A(), method: 'POST' });
  const hidden = await api(`/products/${T.vipOnly}/stock-alert`, { token: A(), method: 'POST' });
  assert.equal(hidden.status, 404);
  assert.equal(missing.status, 404);
  assert.equal((await api(`/lists/favorites/${T.vipOnly}`, { token: A(), method: 'POST' })).status, 404);
  assert.equal((await api(`/lists/favorites/${T.vipCatProduct}`, { token: A(), method: 'POST' })).status, 404);
  assert.equal((await api(`/products/${T.vipOnly}/stock-alert`, { token: B(), method: 'POST' })).status, 200);

  // Ürün sonradan gruba kapatıldıysa eski abonelik de bildirim almaz
  await P(() => prisma.stockAlert.create({ data: { tenantId: T.id, userId: T.ua, productId: T.vipOnly } }));
  const res = await api(`/products/${T.vipOnly}`, { token: T.tokens.admin, method: 'PATCH', body: { stock: 10 } });
  assert.equal(res.status, 200, res.data?.message);
  const stockNote = (userId) => P(() => prisma.notification.findFirst({ where: { userId, type: 'STOCK' } }));
  assert.ok(await until(async () => Boolean(await stockNote(T.ub))), 'B bildirimi aldı');
  assert.equal(await stockNote(T.ua), null);
});
