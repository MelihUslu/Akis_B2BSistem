/**
 * Bayi kataloğu: sıralama, yalnızca stoktakiler, üst kategori seçilince alt kategori ürünleri, sayfalama.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = {};

const get = (path) => fetch(`${base}/api${path}`, { headers: { 'X-Tenant': 'ctest-a', Authorization: `Bearer ${T.token}` } }).then((r) => r.json());
const names = (res) => { if (!res.data) throw new Error(JSON.stringify(res)); return res.data.map((p) => p.name); };

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');

  const plan = await runAsPlatform(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await runAsPlatform(async () => { const old = await prisma.tenant.findUnique({ where: { slug: 'ctest-a' } }); if (old) await purgeTenant(old.id); });
  const tenant = await runAsPlatform(() => prisma.tenant.create({
    data: { slug: 'ctest-a', name: 'Katalog Test', contactEmail: 'c@x.test', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) }
  }));
  T.id = tenant.id;
  await runAsPlatform(async () => {
    const company = await prisma.company.create({ data: { tenantId: tenant.id, name: 'Bayi', taxNumber: '1111111111', riskLimit: 100000, status: 'ACTIVE' } });
    await prisma.user.create({ data: { tenantId: tenant.id, companyId: company.id, email: 'bayi@ctest.test', password: await bcrypt.hash('Test12345', 4), name: 'Bayi', role: 'BAYI', emailVerifiedAt: new Date() } });
    const root = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Hırdavat' } });
    const child = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Vida', parentId: root.id } });
    const other = await prisma.category.create({ data: { tenantId: tenant.id, name: 'Bahçe' } });
    const mk = (name, price, stock, categoryId, extra = {}) => prisma.product.create({ data: { tenantId: tenant.id, name, sku: `C-${name}`, price, stock, categoryId, ...extra } });
    await mk('Çekiç', 300, 5, root.id);
    await mk('Vida M4', 10, 0, child.id);
    await mk('Hortum', 150, 20, other.id);
    // Varyantlı: ana üründe stok yok, varyantta var → stoktakilerde görünmeli
    const master = await mk('Eldiven', 50, 0, other.id);
    await mk('Eldiven L', 50, 7, other.id, { isMaster: false, parentId: master.id });
    T.root = root.id;
  });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': 'ctest-a' }, body: JSON.stringify({ email: 'bayi@ctest.test', password: 'Test12345' }) }).then((r) => r.json());
  assert.ok(login.token, JSON.stringify(login));
  T.token = login.token;
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('katalog: fiyat ve ada göre sıralama', { skip }, async () => {
  assert.deepEqual(names(await get('/products?sort=price_asc')), ['Vida M4', 'Eldiven', 'Hortum', 'Çekiç']);
  assert.deepEqual(names(await get('/products?sort=price_desc')), ['Çekiç', 'Hortum', 'Eldiven', 'Vida M4']);
  assert.equal(names(await get('/products?sort=name'))[0], 'Çekiç');
  assert.equal((await get('/products?sort=bilinmeyen')).data.length, 4, 'bilinmeyen sıralama varsayılana düşer');
});

test('katalog: yalnızca stoktakiler (varyantlı ürün varyant stoğuyla sayılır), aramayla birlikte', { skip }, async () => {
  const inStock = names(await get('/products?inStock=true&sort=name'));
  assert.deepEqual(inStock.sort(), ['Eldiven', 'Hortum', 'Çekiç'].sort());
  assert.ok(!inStock.includes('Vida M4'));
  assert.deepEqual(names(await get('/products?inStock=true&search=vida')), []);
  assert.deepEqual(names(await get('/products?search=vida')), ['Vida M4']);
});

test('katalog: üst kategori seçilince alt kategori ürünleri de gelir', { skip }, async () => {
  assert.deepEqual(names(await get(`/products?categoryId=${T.root}&sort=name`)).sort(), ['Vida M4', 'Çekiç'].sort());
  const cats = await fetch(`${base}/api/categories`, { headers: { 'X-Tenant': 'ctest-a', Authorization: `Bearer ${T.token}` } }).then((r) => r.json());
  const root = cats.find((c) => c.id === T.root);
  assert.equal(root.children[0].name, 'Vida');
  assert.equal(root.children[0]._count.products, 1);
});

test('katalog: sayfalama tekrar etmeden tüm ürünleri verir', { skip }, async () => {
  const p1 = await get('/products?limit=3&page=1&sort=name');
  const p2 = await get('/products?limit=3&page=2&sort=name');
  assert.equal(p1.pagination.total, 4);
  assert.equal(p1.pagination.pages, 2);
  assert.equal(new Set([...names(p1), ...names(p2)]).size, 4);
});
