/**
 * Kiracı izolasyonu: bir firmanın kullanıcısı başka firmanın verisini göremez / değiştiremez.
 * Ayrı bir test veritabanı gerekir (çalıştırırken tablolar oluşturulur, sonunda test verisi silinir):
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';

let server, base, prisma, runAsPlatform, purgeTenant;
const tenants = {};

const api = (path, { tenant, token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(tenant && { 'X-Tenant': tenant }), ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

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
  const password = await bcrypt.hash('Test12345', 4);
  for (const slug of ['itest-a', 'itest-b']) {
    await runAsPlatform(async () => {
      const old = await prisma.tenant.findUnique({ where: { slug } });
      if (old) await purgeTenant(old.id);
    });
    const tenant = await runAsPlatform(() => prisma.tenant.create({
      data: { slug, name: slug, contactEmail: `${slug}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) }
    }));
    await runAsPlatform(() => prisma.user.create({ data: { tenantId: tenant.id, email: `admin@${slug}.test`, password, name: 'Admin', role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() } }));
    const category = await runAsPlatform(() => prisma.category.create({ data: { tenantId: tenant.id, name: `Kategori ${slug}` } }));
    const product = await runAsPlatform(() => prisma.product.create({ data: { tenantId: tenant.id, name: `Ürün ${slug}`, sku: `SKU-${slug}`, price: 10, categoryId: category.id } }));
    tenants[slug] = { id: tenant.id, productId: product.id };
  }

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const slug of Object.keys(tenants)) {
    const res = await api('/auth/login', { tenant: slug, method: 'POST', body: { email: `admin@${slug}.test`, password: 'Test12345' } });
    tenants[slug].token = res.data.token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  for (const t of Object.values(tenants)) await purgeTenant(t.id).catch(() => {});
  await prisma.$disconnect();
});

test('firma A yalnızca kendi ürünlerini görür', { skip }, async () => {
  const res = await api('/products?isAdmin=true', { tenant: 'itest-a', token: tenants['itest-a'].token });
  assert.equal(res.status, 200);
  const list = Array.isArray(res.data) ? res.data : res.data.data;
  assert.ok(list.length >= 1);
  assert.ok(list.every((p) => p.sku !== 'SKU-itest-b'));
});

test('firma A’nın oturumu firma B adresinde reddedilir', { skip }, async () => {
  const res = await api('/products', { tenant: 'itest-b', token: tenants['itest-a'].token });
  assert.equal(res.status, 401);
});

test('firma A, B’nin ürününü güncelleyemez / silemez', { skip }, async () => {
  const id = tenants['itest-b'].productId;
  const upd = await api(`/products/${id}`, { tenant: 'itest-a', token: tenants['itest-a'].token, method: 'PATCH', body: { name: 'ele geçirildi' } });
  assert.equal(upd.status, 404);
  const del = await api(`/products/${id}`, { tenant: 'itest-a', token: tenants['itest-a'].token, method: 'DELETE' });
  assert.equal(del.status, 404);
  const still = await runAsPlatform(() => prisma.product.findUnique({ where: { id } }));
  assert.equal(still.name, 'Ürün itest-b');
});

test('firma bağlamı olmadan veritabanı sorgusu yapılamaz', { skip }, async () => {
  await assert.rejects(() => prisma.product.findMany());
});

test('olmayan firma adresi 404', { skip }, async () => {
  const res = await api('/tenant/public', { tenant: 'yok-boyle-firma' });
  assert.equal(res.status, 404);
});

test('satış raporu: kupon orantılı düşülür, iptal kalem sayılmaz, diğer firma görmez', { skip }, async () => {
  const a = tenants['itest-a'];
  const day = new Date().toLocaleDateString('sv-SE'); // yerel tarih (YYYY-MM-DD)
  await runAsPlatform(async () => {
    await prisma.product.update({ where: { id: a.productId }, data: { costPrice: 6, currency: 'TL' } });
    const company = await prisma.company.create({ data: { tenantId: a.id, name: 'Rapor Bayi', status: 'ACTIVE' } });
    const user = await prisma.user.findFirst({ where: { tenantId: a.id } });
    await prisma.order.create({
      data: {
        tenantId: a.id, companyId: company.id, userId: user.id, status: 'APPROVED', totalAmount: 0, discountAmount: 20,
        items: { create: [
          { tenantId: a.id, productId: a.productId, quantity: 10, price: 10, vatRate: 20, status: 'APPROVED' },
          { tenantId: a.id, productId: a.productId, quantity: 5, price: 10, vatRate: 20, status: 'CANCELLED' }
        ] }
      }
    });
  });
  const res = await api(`/reports/sales?from=${day}&to=${day}`, { tenant: 'itest-a', token: a.token });
  assert.equal(res.status, 200);
  // 10 × 10 = 100, 20 TL kupon → 80 ciro; maliyet 10 × 6 = 60 → kâr 20 (%25)
  assert.equal(res.data.summary.revenue, 80);
  assert.equal(res.data.summary.quantity, 10);
  assert.equal(res.data.summary.grossProfit, 20);
  assert.equal(res.data.summary.margin, 25);
  assert.equal(res.data.dealers[0].name, 'Rapor Bayi');

  const other = await api(`/reports/sales?from=${day}&to=${day}`, { tenant: 'itest-b', token: tenants['itest-b'].token });
  assert.equal(other.data.summary.revenue, 0);
});
