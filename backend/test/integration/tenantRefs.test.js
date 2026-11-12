/**
 * Firmalar arası ilişki denetimi (veritabanı tetikleyicileri, migration 20261209120000_firma_iliski_denetimi):
 * bir firmanın kaydı başka firmanın kaydına bağlanamaz. İstekten gelen ilişki numarası (kategori, alternatif ürün…)
 * doğrulanmadan yazılsa da veritabanı reddeder. Şemadaki her firma → firma ilişkisinin tetikleyicisi olduğu da denetlenir
 * (yeni ilişki eklenip tetikleyicisi unutulursa bu test düşer).
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUGS = ['iliski-a', 'iliski-b'];

let server, base, prisma, basePrisma, runAsPlatform, runWithTenant, purgeTenant, Prisma;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUGS[0], Authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, basePrisma, runAsPlatform, runWithTenant } = await import('../../src/utils/prisma.js'));
  ({ Prisma } = await import('@prisma/client'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  for (const slug of SLUGS) await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug } }); if (old) await purgeTenant(old.id); });
    T.a = (await P(() => prisma.tenant.create({ data: { slug: SLUGS[0], name: 'Alfa Toptan', contactEmail: 'a@iliski.test', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }))).id;
  T.b = (await P(() => prisma.tenant.create({ data: { slug: SLUGS[1], name: 'Beta Toptan', contactEmail: 'b@iliski.test', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }))).id;
  T.userA = (await P(() => prisma.user.create({ data: { tenantId: T.a, email: 'admin@iliski-a.test', password, name: 'Alfa Yönetici', role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() } }))).id;
  T.catA = (await P(() => prisma.category.create({ data: { tenantId: T.a, name: 'Alfa Kategori' } }))).id;
  T.catB = (await P(() => prisma.category.create({ data: { tenantId: T.b, name: 'BETA GİZLİ KATEGORİ' } }))).id;
  T.prodA = (await P(() => prisma.product.create({ data: { tenantId: T.a, categoryId: T.catA, name: 'Alfa Ürün', sku: 'IL-A', price: 10, stock: 5 } }))).id;
  T.prodB = (await P(() => prisma.product.create({ data: { tenantId: T.b, categoryId: T.catB, name: 'BETA GİZLİ ÜRÜN', sku: 'IL-B', price: 99, stock: 5 } }))).id;
  T.companyB = (await P(() => prisma.company.create({ data: { tenantId: T.b, name: 'Beta Bayi', status: 'ACTIVE' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUGS[0] }, body: JSON.stringify({ email: 'admin@iliski-a.test', password: 'Test12345' }) });
  T.tokens.admin = (await r.json()).token;
});

after(async () => {
  if (skip) return;
  server?.close();
  for (const id of [T.a, T.b]) if (id) await purgeTenant(id).catch(() => {});
  await prisma.$disconnect();
});

test('şemadaki her firma → firma ilişkisinin tetikleyicisi var', { skip }, async () => {
  const tenantModels = new Set(Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === 'tenantId')).map((m) => m.name));
  const expected = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    if (!tenantModels.has(m.name)) continue;
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationFromFields?.length || !tenantModels.has(f.type)) continue;
      const fk = f.relationFromFields[0];
      if (fk !== 'tenantId') expected.push(`tenant_ref_${m.name}_${fk}`);
    }
  }
  const rows = await basePrisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'tenant_ref_%' AND NOT tgisinternal`;
  const have = new Set(rows.map((r) => r.tgname));
  assert.deepEqual(expected.filter((n) => !have.has(n)), [], 'tetikleyicisi olmayan firma ilişkisi');
  assert.ok(expected.length >= 90);
});

test('API: ürün başka firmanın kategorisine ya da ürününe bağlanamaz (önceden bağlanabiliyordu)', { skip }, async () => {
  const create = await api('/products', { token: T.tokens.admin, method: 'POST', body: { name: 'Sızma Denemesi', sku: 'IL-X', price: 1, categoryId: T.catB } });
  assert.notEqual(create.status, 201, 'başka firmanın kategorisiyle ürün oluşmamalı');
  assert.equal(await P(() => prisma.product.count({ where: { sku: 'IL-X' } })), 0);

  const alt = await api('/products', { token: T.tokens.admin, method: 'POST', body: { name: 'Sızma 2', sku: 'IL-Y', price: 1, alternativeToId: T.prodB } });
  assert.notEqual(alt.status, 201);

  const link = await api('/products/link-alternative', { token: T.tokens.admin, method: 'POST', body: { productId: T.prodA, alternativeId: T.prodB } });
  assert.equal(link.status, 400);
  const prod = await P(() => prisma.product.findUnique({ where: { id: T.prodA } }));
  assert.equal(prod.alternativeToId, null);

  const upd = await api(`/products/${T.prodA}`, { token: T.tokens.admin, method: 'PUT', body: { categoryId: T.catB } });
  assert.notEqual(upd.status, 200);
  assert.equal((await P(() => prisma.product.findUnique({ where: { id: T.prodA } }))).categoryId, T.catA);

  // Aynı firmada bağlantı çalışır
  assert.equal((await api('/products/link-alternative', { token: T.tokens.admin, method: 'POST', body: { productId: T.prodA, alternativeId: T.prodA } })).status, 200);
});

test('veritabanı: firma bağlamında başka firmanın kaydına bağ reddedilir; işlem içinde yeni kayda bağ çalışır', { skip }, async () => {
  await assert.rejects(
    runWithTenant(T.a, async () => await prisma.deliveryAddress.create({ data: { companyId: T.companyB, title: 'X', contactName: 'X', phone: '0', city: 'X', district: 'X', line: 'X' } })),
    (e) => /tenant_ref|Foreign key|P2003|23503/i.test(String(e.message) + String(e.code))
  );
  // Ham SQL de kapsanır
  await assert.rejects(basePrisma.$executeRaw`UPDATE "Product" SET "categoryId" = ${T.catB} WHERE id = ${T.prodA}`, /tenant_ref/);
  // İşlem içinde: önce sipariş, sonra ona bağlı kalem (aynı firma) — tetikleyici henüz kaydedilmemiş siparişi görür
  const ok = await runWithTenant(T.a, async () => {
    const company = await prisma.company.create({ data: { name: 'Alfa Bayi', status: 'ACTIVE' } });
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { companyId: company.id, userId: T.userA, subtotal: 10, vatAmount: 2, totalAmount: 12, status: 'PENDING' } });
      await tx.orderItem.create({ data: { tenantId: T.a, orderId: order.id, productId: T.prodA, quantity: 1, price: 10, vatRate: 20 } });
      return order.id;
    });
  });
  assert.ok(ok);
});
