/**
 * Depo yönetimi (WMS): manuel giriş/çıkış, depolar arası transfer, sayım, hareket defteri, raf (bin) yerleştirme/taşıma,
 * barkod okutma, düşük stok, sipariş toplama listesi ve "Depo" yetkisi. Stok her zaman hareketlerin toplamıyla tutarlı.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'depotest-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = { tokens: {} };

const api = (path, { token = T.tokens.admin, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const wsQty = async (warehouseId, productId) => (await P(() => prisma.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId, productId } } })))?.quantity ?? 0;
const prodStock = async (id) => (await P(() => prisma.product.findUnique({ where: { id } })))?.stock;

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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Depo Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Patron', role: 'ADMIN', isOwner: true });
  await user({ email: `depo@${SLUG}.test`, name: 'Depo Sorumlusu', role: 'ADMIN', permissions: ['WAREHOUSE'] });
  await user({ email: `satis@${SLUG}.test`, name: 'Satışçı', role: 'ADMIN', permissions: ['ORDERS'] });
  // Ürün (stoklu, barkodlu) — ilk depo açılınca stok oraya taşınır
  T.product = (await P(() => prisma.product.create({ data: { tenantId, name: 'Çelik Vida 5mm', sku: 'VD-5', barcode: '8690000000015', price: 10, stock: 100 } }))).id;
  T.company = (await P(() => prisma.company.create({ data: { tenantId, kind: 'DEALER', name: 'Yıldız Hırdavat', status: 'ACTIVE' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['depo', 'depo'], ['satis', 'satis']]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG }, body: JSON.stringify({ email: `${email}@${SLUG}.test`, password: 'Test12345' }) });
    T.tokens[k] = (await r.json()).token;
  }
  // İki depo: ilki açılınca ürünün 100 stoğu oraya taşınır
  T.w1 = (await api('/warehouses', { method: 'POST', body: { name: 'Merkez', code: 'IST', isDefault: true } })).data.warehouse.id;
  T.w2 = (await api('/warehouses', { method: 'POST', body: { name: 'Ankara', code: 'ANK' } })).data.warehouse.id;
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('ilk depo açılınca stok taşınır; manuel giriş/çıkış stoğu ve hareket defterini günceller', { skip }, async () => {
  assert.equal(await wsQty(T.w1, T.product), 100, 'ilk depoya 100 taşındı');
  assert.equal(await prodStock(T.product), 100);

  const inRes = await api('/warehouses/adjust', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, warehouseId: T.w1, quantity: 50, direction: 'IN', reason: 'Mal kabul' } });
  assert.equal(inRes.status, 200, inRes.data?.message);
  assert.equal(await wsQty(T.w1, T.product), 150);
  assert.equal(await prodStock(T.product), 150, 'toplam stok depolarla senkron');

  const outRes = await api('/warehouses/adjust', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, warehouseId: T.w1, quantity: 30, direction: 'OUT', reason: 'Fire' } });
  assert.equal(outRes.status, 200, outRes.data?.message);
  assert.equal(await wsQty(T.w1, T.product), 120);

  // Yetersiz çıkış reddedilir
  const tooMuch = await api('/warehouses/adjust', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, warehouseId: T.w2, quantity: 5, direction: 'OUT' } });
  assert.equal(tooMuch.status, 400);

  const mv = await api('/warehouses/movements?productId=' + T.product, { token: T.tokens.depo });
  assert.equal(mv.status, 200);
  const types = mv.data.map((m) => m.type);
  assert.ok(types.includes('IN') && types.includes('OUT'), 'giriş ve çıkış deftere yazıldı');
  assert.equal(mv.data.find((m) => m.type === 'IN').by, 'Depo Sorumlusu', 'hareket kimin yaptığını tutar');
});

test('depolar arası transfer iki bacağı da deftere yazar; toplam değişmez', { skip }, async () => {
  const before = await prodStock(T.product);
  const r = await api('/warehouses/transfer', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, fromWarehouseId: T.w1, toWarehouseId: T.w2, quantity: 40, reason: 'Şubeye' } });
  assert.equal(r.status, 200, r.data?.message);
  assert.equal(await wsQty(T.w1, T.product), 80);
  assert.equal(await wsQty(T.w2, T.product), 40);
  assert.equal(await prodStock(T.product), before, 'transferde toplam değişmez');

  const mv = await api('/warehouses/movements?type=TRANSFER_OUT', { token: T.tokens.depo });
  assert.ok(mv.data.some((m) => m.productId === T.product && m.delta === -40), 'transfer çıkışı deftere yazıldı');

  // Yetersiz transfer reddedilir
  const bad = await api('/warehouses/transfer', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, fromWarehouseId: T.w2, toWarehouseId: T.w1, quantity: 999 } });
  assert.equal(bad.status, 400);
});

test('sayım farkı hareket defterine COUNT olarak yazılır', { skip }, async () => {
  // w1'de 80 var; fiili 72 sayıldı → −8 düzeltme
  const r = await api('/warehouses/count', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, warehouseId: T.w1, counted: 72, reason: 'Yıl sonu sayımı' } });
  assert.equal(r.status, 200, r.data?.message);
  assert.equal(r.data.delta, -8);
  assert.equal(await wsQty(T.w1, T.product), 72);
  const mv = await api('/warehouses/movements?type=COUNT', { token: T.tokens.depo });
  assert.ok(mv.data.some((m) => m.productId === T.product && m.delta === -8));

  // Fark yoksa düzeltme yok
  const same = await api('/warehouses/count', { token: T.tokens.depo, method: 'POST', body: { productId: T.product, warehouseId: T.w1, counted: 72 } });
  assert.equal(same.data.delta, 0);
});

test('raf: oluştur, yerleştir, içerik, taşı; yerleştirilmemişi aşamaz', { skip }, async () => {
  const b1 = await api('/warehouses/bins', { token: T.tokens.depo, method: 'POST', body: { warehouseId: T.w1, code: 'A-01', name: 'A koridoru', isDefault: true } });
  assert.equal(b1.status, 201, b1.data?.message);
  const b2 = await api('/warehouses/bins', { token: T.tokens.depo, method: 'POST', body: { warehouseId: T.w1, code: 'A-02' } });
  const binA = b1.data.bin.id, binB = b2.data.bin.id;

  // w1'de 72 var; 50'yi A-01'e yerleştir
  assert.equal((await api('/warehouses/bins/putaway', { token: T.tokens.depo, method: 'POST', body: { binId: binA, productId: T.product, quantity: 50 } })).status, 200);
  // Yerleştirilmemiş 22 kaldı; 30 daha yerleştirilemez
  assert.equal((await api('/warehouses/bins/putaway', { token: T.tokens.depo, method: 'POST', body: { binId: binA, productId: T.product, quantity: 30 } })).status, 400);

  const contents = await api(`/warehouses/bins/${binA}/contents`, { token: T.tokens.depo });
  assert.equal(contents.data[0].quantity, 50);

  // A-01 → A-02 taşı 20
  assert.equal((await api('/warehouses/bins/relocate', { token: T.tokens.depo, method: 'POST', body: { fromBinId: binA, toBinId: binB, productId: T.product, quantity: 20 } })).status, 200);
  assert.equal((await api(`/warehouses/bins/${binA}/contents`, { token: T.tokens.depo })).data[0].quantity, 30);
  assert.equal((await api(`/warehouses/bins/${binB}/contents`, { token: T.tokens.depo })).data[0].quantity, 20);
  // Raf toplamı depo stoğunu (72) değiştirmez
  assert.equal(await wsQty(T.w1, T.product), 72);
});

test('barkod okutma ürünü ve rafı bulur; düşük stok eşik altını listeler', { skip }, async () => {
  const byBarcode = await api('/warehouses/barcode/8690000000015', { token: T.tokens.depo });
  assert.equal(byBarcode.status, 200);
  assert.equal(byBarcode.data.kind, 'PRODUCT');
  assert.equal(byBarcode.data.product.id, T.product);
  assert.ok(byBarcode.data.bins.length >= 1, 'ürünün raf yerleşimi döner');

  const byBin = await api('/warehouses/barcode/A-01', { token: T.tokens.depo });
  assert.equal(byBin.data.kind, 'BIN');
  assert.ok(byBin.data.contents.some((c) => c.product.id === T.product));

  const low = await api('/warehouses/low-stock?below=1000', { token: T.tokens.depo });
  assert.ok(low.data.products.some((p) => p.id === T.product), 'eşik altındaki ürün listelenir');
});

test('sipariş toplama listesi onaylı, sevk bekleyen kalemleri gösterir', { skip }, async () => {
  // Onaylı, stoğu düşülmüş bir sipariş kurulumu (ilişki connect formu — platform bağlamında güvenli; Order.user zorunlu)
  const owner = await P(() => prisma.user.findFirst({ where: { tenantId: T.id, email: `admin@${SLUG}.test` } }));
  const order = await P(() => prisma.order.create({ data: {
    tenant: { connect: { id: T.id } }, company: { connect: { id: T.company } }, warehouse: { connect: { id: T.w1 } }, user: { connect: { id: owner.id } },
    status: 'APPROVED', totalAmount: 100, subtotal: 100,
    items: { create: [{ tenant: { connect: { id: T.id } }, product: { connect: { id: T.product } }, quantity: 5, price: 10, status: 'APPROVED', isStockDeducted: true, stockWarehouseId: T.w1 }] }
  } }));
  const pick = await api('/warehouses/picklist', { token: T.tokens.depo });
  assert.equal(pick.status, 200);
  const found = pick.data.orders.find((o) => o.id === order.id);
  assert.ok(found, 'onaylı sipariş toplama listesinde');
  assert.equal(found.items[0].product.id, T.product);
  assert.equal(found.items[0].remaining, 5);
});

test('"Depo" yetkisi olmayan admin depo uçlarına erişemez; stok her zaman hareketlerle tutarlı', { skip }, async () => {
  // Satışçı (yalnız ORDERS) stok düzeltemez
  assert.equal((await api('/warehouses/adjust', { token: T.tokens.satis, method: 'POST', body: { productId: T.product, quantity: 1, direction: 'IN' } })).status, 403);
  assert.equal((await api('/warehouses/movements', { token: T.tokens.satis })).status, 403);
  // Ama sipariş toplama listesi ORDERS'a da açık
  assert.equal((await api('/warehouses/picklist', { token: T.tokens.satis })).status, 200);

  // Ürünün depolardaki toplamı = Product.stock
  const total = (await wsQty(T.w1, T.product)) + (await wsQty(T.w2, T.product));
  assert.equal(total, await prodStock(T.product), 'depo toplamları ürün stoğuyla tutuyor');
});
