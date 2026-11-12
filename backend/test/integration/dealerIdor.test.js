/**
 * Aynı firmadaki bayiler arası ayrım (IDOR): bayi, başka bayinin siparişini, teklifini, adresini, şablonunu, onay
 * talebini, kullanıcısını ve bildirimini numarasıyla göremez / değiştiremez. Bayinin ana kullanıcı olmayan çalışanı
 * ana kullanıcıya ait işleri (kullanıcı yönetimi, onay) yapamaz. Listeler yalnızca bayinin kendi kayıtlarını verir.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'idor-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = {};
const P = (fn) => runAsPlatform(fn);
const api = (path, { as, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${T.tokens[as]}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const denied = (r) => [401, 403, 404].includes(r.status) || (r.status === 400 && !/başarı/i.test(r.data?.message || ''));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const { JWT_SECRET } = await import('../../src/config.js');
  const { default: app } = await import('../../src/app.js');

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const t = T.tenant = (await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'IDOR A', contactEmail: 'a@idor.test', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }))).id;
  const db = (fn) => P(() => fn(prisma));

  const c1 = await db((p) => p.company.create({ data: { tenantId: t, name: 'Bir Bayi', status: 'ACTIVE' } }));
  const c2 = await db((p) => p.company.create({ data: { tenantId: t, name: 'İki Bayi (hedef)', status: 'ACTIVE' } }));
  const user = (companyId, isOwner, name) => db((p) => p.user.create({ data: { tenantId: t, companyId, role: 'BAYI', isOwner, name, email: `${name.toLowerCase().replace(/\W/g, '')}@idor.test`, password: 'x', emailVerifiedAt: new Date() } }));
  const u1 = await user(c1.id, true, 'BirSahip');
  const s1 = await user(c1.id, false, 'BirCalisan');
  const s1b = await user(c1.id, false, 'BirCalisanIki');
  const u2 = await user(c2.id, true, 'IkiSahip');
  const s2 = await user(c2.id, false, 'IkiCalisan');
  const sign = (u) => jwt.sign({ id: u.id, role: u.role, companyId: u.companyId, tenantId: t }, JWT_SECRET, { expiresIn: '1h' });
  T.tokens = { d1: sign(u1), s1: sign(s1), d2: sign(u2) };
  T.u1 = u1.id; T.s1b = s1b.id; T.s2 = s2.id; T.c1 = c1.id; T.c2 = c2.id;

  // Hedef bayinin (İki Bayi) kayıtları
  T.order2 = (await db((p) => p.order.create({ data: { tenantId: t, companyId: c2.id, userId: u2.id, subtotal: 100, vatAmount: 20, totalAmount: 120, status: 'PENDING' } }))).id;
  T.order1 = (await db((p) => p.order.create({ data: { tenantId: t, companyId: c1.id, userId: u1.id, subtotal: 10, vatAmount: 2, totalAmount: 12, status: 'PENDING' } }))).id;
  T.quote2 = (await db((p) => p.quoteRequest.create({ data: { tenantId: t, number: 9001, companyId: c2.id, userId: u2.id, status: 'SENT', validUntil: new Date(Date.now() + 7 * 864e5) } }))).id;
  T.addr2 = (await db((p) => p.deliveryAddress.create({ data: { tenantId: t, companyId: c2.id, title: 'İki depo', contactName: 'X', phone: '0', city: 'X', district: 'X', line: 'X' } }))).id;
  T.tpl2 = (await db((p) => p.orderTemplate.create({ data: { tenantId: t, companyId: c2.id, userId: u2.id, name: 'İki şablon', items: [] } }))).id;
  T.req2 = (await db((p) => p.orderRequest.create({ data: { tenantId: t, companyId: c2.id, userId: s2.id, payload: { items: [] }, total: 50, itemCount: 1 } }))).id;
  T.req1 = (await db((p) => p.orderRequest.create({ data: { tenantId: t, companyId: c1.id, userId: s1b.id, payload: { items: [] }, total: 50, itemCount: 1 } }))).id;
  T.notif2 = (await db((p) => p.notification.create({ data: { tenantId: t, userId: u2.id, type: 'SYSTEM', title: 'İki gizli', message: 'x' } }))).id;
  await db((p) => p.payment.create({ data: { tenantId: t, companyId: c2.id, userId: u2.id, amount: 77, method: 'TRANSFER', status: 'COMPLETED' } }));

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.tenant) await purgeTenant(T.tenant).catch(() => {});
  await prisma.$disconnect();
});

test('bayi başka bayinin siparişini göremez, faturasını alamaz, iptal edemez', { skip }, async () => {
  assert.ok(denied(await api(`/orders/${T.order2}`, { as: 'd1' })));
  assert.ok(denied(await api(`/orders/${T.order2}/invoice`, { as: 'd1' })));
  assert.ok(denied(await api(`/orders/${T.order2}/invoice/pdf`, { as: 'd1' })));
  assert.ok(denied(await api(`/orders/${T.order2}/cancel`, { as: 'd1', method: 'PATCH', body: {} })));
  assert.equal((await P(() => prisma.order.findUnique({ where: { id: T.order2 } }))).status, 'PENDING');
  const list = await api('/orders', { as: 'd1' });
  assert.equal(list.status, 200);
  const ids = (list.data.data || list.data.orders || list.data).map((o) => o.id);
  assert.ok(ids.includes(T.order1) && !ids.includes(T.order2));
  // Kendi siparişi açılır (karşılaştırma)
  assert.equal((await api(`/orders/${T.order1}`, { as: 'd1' })).status, 200);
});

test('bayi başka bayinin teklifini göremez, kabul / iletme / iptal edemez', { skip }, async () => {
  for (const [method, path] of [['GET', ''], ['GET', '/document'], ['POST', '/accept'], ['POST', '/forward'], ['POST', '/feedback'], ['POST', '/cancel']]) {
    const r = await api(`/quotes/${T.quote2}${path}`, { as: 'd1', method, body: method === 'POST' ? { message: 'x' } : undefined });
    assert.ok(denied(r), `${method} /quotes/:id${path} → ${r.status}`);
  }
  assert.equal((await P(() => prisma.quoteRequest.findUnique({ where: { id: T.quote2 } }))).status, 'SENT');
  const list = await api('/quotes', { as: 'd1' });
  assert.ok(!JSON.stringify(list.data).includes('"number":9001'));
});

test('bayi başka bayinin adresini, şablonunu, onay talebini, bildirimini değiştiremez', { skip }, async () => {
  assert.ok(denied(await api(`/addresses/${T.addr2}`, { as: 'd1', method: 'PATCH', body: { title: 'ele geçirildi' } })));
  assert.ok(denied(await api(`/addresses/${T.addr2}`, { as: 'd1', method: 'DELETE' })));
  assert.equal((await P(() => prisma.deliveryAddress.findUnique({ where: { id: T.addr2 } }))).title, 'İki depo');

  assert.ok(denied(await api(`/lists/templates/${T.tpl2}`, { as: 'd1', method: 'PATCH', body: { name: 'ele geçirildi' } })));
  assert.ok(denied(await api(`/lists/templates/${T.tpl2}`, { as: 'd1', method: 'DELETE' })));
  assert.equal((await P(() => prisma.orderTemplate.findUnique({ where: { id: T.tpl2 } }))).name, 'İki şablon');

  for (const action of ['approve', 'reject', 'cancel']) {
    assert.ok(denied(await api(`/order-requests/${T.req2}/${action}`, { as: 'd1', method: 'POST', body: { reason: 'x' } })), action);
  }
  assert.equal((await P(() => prisma.orderRequest.findUnique({ where: { id: T.req2 } }))).status, 'PENDING');

  await api(`/notifications/${T.notif2}/read`, { as: 'd1', method: 'PATCH' });
  assert.equal((await P(() => prisma.notification.findUnique({ where: { id: T.notif2 } }))).isRead, false);
  const mine = await api('/notifications', { as: 'd1' });
  assert.ok(!JSON.stringify(mine.data).includes('İki gizli'));
});

test('bayi başka bayinin kullanıcısını yönetemez; çalışan ana kullanıcı işlerini yapamaz', { skip }, async () => {
  assert.ok(denied(await api(`/team/my-company/${T.s2}`, { as: 'd1', method: 'PATCH', body: { isActive: false } })));
  assert.ok(denied(await api(`/team/my-company/${T.s2}/reset-password`, { as: 'd1', method: 'POST' })));
  assert.equal((await P(() => prisma.user.findUnique({ where: { id: T.s2 } }))).isActive, true);

  // Ana kullanıcı olmayan çalışan: diğer çalışanı pasifleştiremez, şifresini sıfırlayamaz, onay talebine karar veremez
  assert.ok(denied(await api(`/team/my-company/${T.s1b}`, { as: 's1', method: 'PATCH', body: { isActive: false } })));
  assert.ok(denied(await api(`/team/my-company/${T.s1b}/reset-password`, { as: 's1', method: 'POST' })));
  assert.ok(denied(await api(`/team/my-company/${T.u1}`, { as: 's1', method: 'PATCH', body: { isActive: false } })));
  assert.ok(denied(await api(`/order-requests/${T.req1}/approve`, { as: 's1', method: 'POST' })));
  assert.equal((await P(() => prisma.user.findUnique({ where: { id: T.s1b } }))).isActive, true);
  assert.equal((await P(() => prisma.orderRequest.findUnique({ where: { id: T.req1 } }))).status, 'PENDING');
});

test('bayi listeleri yalnızca kendi kayıtları: tahsilat, cari ekstre, adres, iade', { skip }, async () => {
  const pay = await api('/payments', { as: 'd1' });
  assert.equal(pay.status, 200);
  assert.ok(!JSON.stringify(pay.data).includes('"amount":77'));
  const st = await api('/finance/my-statement', { as: 'd1' });
  assert.ok(!JSON.stringify(st.data || {}).includes('İki Bayi'));
  const addr = await api('/addresses', { as: 'd1' });
  assert.ok(!JSON.stringify(addr.data).includes('İki depo'));
  // companyId parametresiyle başka bayinin verisi istenemez
  const forced = await api(`/payments?companyId=${T.c2}`, { as: 'd1' });
  assert.ok(!JSON.stringify(forced.data).includes('"amount":77'));
  const forcedOrders = await api(`/orders?companyId=${T.c2}`, { as: 'd1' });
  assert.ok(!JSON.stringify(forcedOrders.data).includes(`"id":${T.order2},`));
});
