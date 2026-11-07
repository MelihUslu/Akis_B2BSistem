/**
 * Bayilere XML ürün beslemesi: firma açar; bayinin ana kullanıcısı adres üretir / yeniler / kapatır; adres bayinin
 * gördüğü ürünleri (grup görünürlüğü, pasif hariç) bayinin net fiyatıyla verir; anahtar başka yanıtlarda görünmez;
 * firma kapatınca, bayi pasifleşince ya da anahtar yenilenince eski adres hemen 404.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'feedtest-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const get = async (url) => { const r = await fetch(url); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() }; };
// XML'deki ürün satırları: stok kodu → satır
const rows = (xml) => new Map([...xml.matchAll(/<Urun>(.*?)<\/Urun>/gs)].map((m) => [/<StokKodu>(.*?)<\/StokKodu>/.exec(m[1])[1], m[1]]));
const field = (row, name) => new RegExp(`<${name}>(.*?)</${name}>`).exec(row)?.[1] ?? null;

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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Ova Hırdavat', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  T.a = (await P(() => prisma.company.create({ data: { tenantId, name: 'Alfa Yapı', status: 'ACTIVE', netDiscount: 10, taxNumber: '3100000001' } }))).id;
  T.b = (await P(() => prisma.company.create({ data: { tenantId, name: 'Beta Yapı', status: 'ACTIVE', dealerGroup: 'GOLD', taxNumber: '3100000002' } }))).id;
  await user({ email: `sahip@${SLUG}.test`, name: 'Alfa Sahibi', role: 'BAYI', companyId: T.a, isOwner: true });
  await user({ email: `calisan@${SLUG}.test`, name: 'Alfa Çalışanı', role: 'BAYI', companyId: T.a, isOwner: false });

  const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'El Aletleri' } }));
  const sub = await P(() => prisma.category.create({ data: { tenantId, name: 'Matkaplar', parentId: cat.id } }));
  const gold = await P(() => prisma.category.create({ data: { tenantId, name: 'Özel Seri', visibleGroups: ['GOLD'] } }));
  const product = (data) => P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, vatRate: 20, unit: 'Adet', stock: 10, ...data } }));
  await product({ name: 'Matkap & Uç Seti', sku: 'F-MATKAP', brand: 'Akis', barcode: '8690000000011', categoryId: sub.id, price: 1000, stock: 250, moq: 2, stepQuantity: 2,
    images: JSON.stringify(['/uploads/products/matkap.jpg', 'https://cdn.example.com/matkap-2.jpg']), shortDesc: '18V <akülü>' });
  const special = await product({ name: 'Vida Kutusu', sku: 'F-VIDA', price: 500 });
  await P(() => prisma.specialPrice.create({ data: { tenantId, productId: special.id, companyId: T.a, price: 400, minQty: 1 } }));
  await product({ name: 'Fiyatı Gizli Ürün', sku: 'F-GIZLI', price: 700, hidePrice: true });
  await product({ name: 'Altın Seri Testere', sku: 'F-GOLD', price: 900, categoryId: gold.id });
  await product({ name: 'Satıştan Kalkan', sku: 'F-PASIF', price: 50, isActive: false });
  const master = await product({ name: 'Pense', sku: 'F-PENSE', price: 100, isMaster: true });
  const option = await P(() => prisma.productOption.create({ data: { tenantId, productId: master.id, name: 'Boy' } }));
  for (const [i, [value, stock]] of [['160 mm', 3], ['200 mm', 0]].entries()) {
    const v = await product({ name: `Pense ${value}`, sku: `F-PENSE-${i + 1}`, price: 100 + i * 20, stock, parentId: master.id });
    const ov = await P(() => prisma.productOptionValue.create({ data: { tenantId, optionId: option.id, value } }));
    await P(() => prisma.productVariantValue.create({ data: { tenantId, variantId: v.id, optionValueId: ov.id } }));
  }

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['owner', 'sahip'], ['staff', 'calisan']]) {
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

test('firma açmadan adres üretilemez; yalnızca ana kullanıcı üretir ve görür', { skip }, async () => {
  const off = await api('/feed', { token: T.tokens.owner });
  assert.deepEqual({ enabled: off.data.enabled, url: off.data.url }, { enabled: false, url: null });
  assert.equal((await api('/feed', { token: T.tokens.owner, method: 'POST' })).status, 400);
  assert.equal((await api('/feed', { token: T.tokens.admin })).status, 403, 'yönetici bayi ucunu kullanamaz');

  assert.equal((await api('/settings', { token: T.tokens.admin, method: 'POST', body: { key: 'dealer_feed', value: 'true' } })).status, 200);
  assert.equal((await api('/settings/portal', { token: T.tokens.owner })).data.dealerFeed, true);
  assert.equal((await api('/feed', { token: T.tokens.staff, method: 'POST' })).status, 403);
  const created = await api('/feed', { token: T.tokens.owner, method: 'POST' });
  assert.equal(created.status, 200, created.data?.message);
  assert.match(created.data.feed.url, /\/api\/public\/feed\/[a-f0-9]{48}$/);
  T.url = created.data.feed.url.replace(/^https?:\/\/[^/]+/, base);
  const staffView = await api('/feed', { token: T.tokens.staff });
  assert.deepEqual({ url: staffView.data.url, active: staffView.data.active }, { url: null, active: true }, 'çalışan adresi görmez');
  // Anahtar başka yanıtlarda yok (bayinin bütün kullanıcıları görür)
  for (const k of ['owner', 'staff']) {
    assert.equal((await api('/auth/me', { token: T.tokens[k] })).data.company.feedToken, undefined);
    assert.equal((await api('/finance/my-statement', { token: T.tokens[k] })).data.company.feedToken, undefined);
  }
});

test('XML: bayinin gördüğü ürünler, net fiyat, özel fiyat, gizli fiyat, varyantlar, stok sınırı, mutlak görsel adresi', { skip }, async () => {
  const r = await get(T.url);
  assert.equal(r.status, 200);
  assert.match(r.type, /application\/xml/);
  assert.match(r.text, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<Urunler firma="Ova Hırdavat" bayi="Alfa Yapı"/);
  const map = rows(r.text);
  assert.deepEqual([...map.keys()].sort(), ['F-GIZLI', 'F-MATKAP', 'F-PENSE-1', 'F-PENSE-2', 'F-VIDA'], 'gruba kapalı, pasif ve ana ürün satırı yok');

  const matkap = map.get('F-MATKAP');
  assert.equal(field(matkap, 'UrunAdi'), 'Matkap &amp; Uç Seti', 'XML kaçışı');
  assert.equal(field(matkap, 'Aciklama'), '18V &lt;akülü&gt;');
  assert.equal(field(matkap, 'Kategori'), 'El Aletleri &gt; Matkaplar');
  assert.deepEqual([field(matkap, 'ListeFiyati'), field(matkap, 'BayiFiyati'), field(matkap, 'KdvOrani'), field(matkap, 'ParaBirimi')], ['1000.00', '900.00', '20', 'TRY'], '%10 bayi iskontosu');
  assert.deepEqual([field(matkap, 'Stok'), field(matkap, 'StokDurumu'), field(matkap, 'MinSiparis'), field(matkap, 'SiparisKatsayisi')], ['100', 'VAR', '2', '2']);
  assert.match(matkap, /<Resim>http[^<]*\/uploads\/products\/matkap\.jpg<\/Resim><Resim>https:\/\/cdn\.example\.com\/matkap-2\.jpg<\/Resim>/);
  assert.equal(field(map.get('F-VIDA'), 'BayiFiyati'), '400.00', 'bayiye özel fiyat');
  const hidden = map.get('F-GIZLI');
  assert.equal(field(hidden, 'FiyatGizli'), 'true');
  assert.equal(field(hidden, 'BayiFiyati'), null);
  const v1 = map.get('F-PENSE-1');
  assert.deepEqual([field(v1, 'AnaUrunKodu'), field(v1, 'Varyant'), field(v1, 'UrunAdi'), field(v1, 'Stok')], ['F-PENSE', 'Boy: 160 mm', 'Pense Boy: 160 mm', '3']);
  assert.equal(field(map.get('F-PENSE-2'), 'StokDurumu'), 'YOK');

  // GOLD grubundaki bayi gruba özel kategoriyi görür
  await P(() => prisma.company.update({ where: { id: T.b }, data: { feedToken: 'b'.repeat(48) } }));
  assert.ok(rows((await get(`${base}/api/public/feed/${'b'.repeat(48)}`)).text).has('F-GOLD'));
});

test('anahtar yenilenince, firma kapatınca, bayi pasifleşince, kapatılınca 404; geçersiz anahtar 404', { skip }, async () => {
  assert.equal((await get(`${base}/api/public/feed/${'0'.repeat(48)}`)).status, 404);
  assert.equal((await get(`${base}/api/public/feed/kisa`)).status, 404);

  const renewed = await api('/feed', { token: T.tokens.owner, method: 'POST' });
  assert.match(renewed.data.message, /eski adres artık çalışmaz/);
  assert.equal((await get(T.url)).status, 404, 'eski adres');
  T.url = renewed.data.feed.url.replace(/^https?:\/\/[^/]+/, base);
  assert.equal((await get(T.url)).status, 200);

  await api('/settings', { token: T.tokens.admin, method: 'POST', body: { key: 'dealer_feed', value: 'false' } });
  assert.equal((await get(T.url)).status, 404, 'önbellekte olsa da firma kapatınca');
  await api('/settings', { token: T.tokens.admin, method: 'POST', body: { key: 'dealer_feed', value: 'true' } });
  assert.equal((await get(T.url)).status, 200);

  await P(() => prisma.company.update({ where: { id: T.a }, data: { status: 'PASSIVE' } }));
  assert.equal((await get(T.url)).status, 404, 'pasif bayi');
  await P(() => prisma.company.update({ where: { id: T.a }, data: { status: 'ACTIVE' } }));

  const removed = await api('/feed', { token: T.tokens.owner, method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(removed.data.feed.url, null);
  assert.equal((await get(T.url)).status, 404);
});
