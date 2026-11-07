/**
 * Çek / senet portföyü: çek / senetle tahsilat portföye girer; tahsile verme ve tahsil cariyi değiştirmez; ciro
 * tedarikçiye ödeme yazar; karşılıksız / iade tahsilatı (ciroluysa tedarikçi ödemesini de) ters kaydeder; cari
 * ekranından elle ters kayıt çeki iptal eder ya da ciroyu geri alır. Her adımda bakiye = hareketlerin toplamı.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'cektest-a';

let server, base, prisma, runAsPlatform, purgeTenant;
const T = { tokens: {} };

const api = (path, { token = T.tokens.admin, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const receive = (body) => api(`/partners/${T.customer}/payments`, { method: 'POST', body: { direction: 'IN', method: 'CHECK', dueDate: '2026-12-31', ...body } });
const chequeOf = (paymentId) => P(() => prisma.cheque.findUnique({ where: { paymentId } }));
const act = (id, action, body = {}) => api(`/cheques/${id}/${action}`, { method: 'POST', body });
const balance = async (id) => (await P(() => prisma.company.findUnique({ where: { id } }))).currentBalance;
// Bakiye her zaman hareketlerin toplamı olmalı (alacak +, borç −)
const consistent = async (id) => {
  const rows = await P(() => prisma.financialTransaction.findMany({ where: { companyId: id } }));
  const sum = Math.round(rows.reduce((s, r) => s + (r.type === 'CREDIT' ? r.amount : -r.amount), 0) * 100) / 100;
  assert.equal(await balance(id), sum, `cari ${id}: bakiye hareketlerle tutmuyor`);
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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Çınar Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Muhasebe', role: 'ADMIN', isOwner: true });
  await user({ email: `clerk@${SLUG}.test`, name: 'Satış', role: 'ADMIN', permissions: ['ORDERS'] });
  T.customer = (await P(() => prisma.company.create({ data: { tenantId, kind: 'CUSTOMER', name: 'Yıldız İnşaat', status: 'ACTIVE' } }))).id;
  T.supplier = (await P(() => prisma.company.create({ data: { tenantId, kind: 'SUPPLIER', name: 'Demir Fabrikası', status: 'ACTIVE' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['clerk', 'clerk']]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG }, body: JSON.stringify({ email: `${email}@${SLUG}.test`, password: 'Test12345' }) });
    T.tokens[k] = (await r.json()).token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('çekle tahsilat portföye girer; tahsile verme ve tahsil cariyi değiştirmez; geçersiz geçiş ve yetki', { skip }, async () => {
  const r = await receive({ amount: 1000, reference: 'CK-1001', bankName: 'Ziraat Bankası Kadıköy', drawer: 'Ahmet Usta' });
  assert.equal(r.status, 201, r.data?.message);
  const c = await chequeOf(r.data.payment.id);
  assert.deepEqual([c.kind, c.number, c.bankName, c.drawer, c.amount, c.status], ['CHECK', 'CK-1001', 'Ziraat Bankası Kadıköy', 'Ahmet Usta', 1000, 'PORTFOY']);
  assert.equal(c.dueDate.toISOString().slice(0, 10), '2026-12-31');
  assert.equal(await balance(T.customer), 1000, 'tahsilat cariyi alacaklandırır');
  // Ödeme (para çıkışı) ve nakit portföye girmez
  await api(`/partners/${T.supplier}/payments`, { method: 'POST', body: { direction: 'OUT', method: 'CHECK', amount: 50, dueDate: '2026-12-31' } });
  await api(`/partners/${T.customer}/payments`, { method: 'POST', body: { direction: 'IN', method: 'CASH', amount: 10 } });
  assert.equal(await P(() => prisma.cheque.count({ where: { tenantId: T.id } })), 1);

  assert.equal((await api('/cheques', { token: T.tokens.clerk })).status, 403);
  assert.equal((await act(c.id, 'deposit')).status, 200);
  assert.equal((await act(c.id, 'deposit')).status, 400, 'tahsilde olan tekrar verilmez');
  const done = await act(c.id, 'collect', { note: 'Hesaba geçti' });
  assert.equal(done.data.cheque.status, 'TAHSIL');
  assert.deepEqual(done.data.cheque.history.map((h) => h.status), ['PORTFOY', 'BANKADA', 'TAHSIL']);
  assert.equal(await balance(T.customer), 1010, 'tahsil cariyi değiştirmez');
  assert.equal((await act(c.id, 'bounce')).status, 400, 'tahsil edilmiş çek karşılıksız işaretlenemez');
  assert.equal((await act(c.id, 'yok')).status, 400);
  await consistent(T.customer);
});

test('ciro tedarikçiye ödeme yazar; cirolu çek karşılıksız çıkınca iki taraf da ters kaydedilir', { skip }, async () => {
  const r = await receive({ amount: 500, reference: 'CK-2002' });
  const c = await chequeOf(r.data.payment.id);
  const supplierBefore = await balance(T.supplier);
  const customerBefore = await balance(T.customer);
  assert.equal((await act(c.id, 'endorse')).status, 400, 'tedarikçi seçilmeli');
  assert.equal((await act(c.id, 'endorse', { supplierId: T.customer })).status, 400, 'müşteriye ciro olmaz');
  const e = await act(c.id, 'endorse', { supplierId: T.supplier });
  assert.equal(e.status, 200, e.data?.message);
  assert.deepEqual([e.data.cheque.status, e.data.cheque.endorsedTo.name], ['CIRO', 'Demir Fabrikası']);
  assert.equal(await balance(T.supplier), supplierBefore - 500, 'tedarikçiye ödeme');
  const ch = await P(() => prisma.cheque.findUnique({ where: { id: c.id }, include: { endorsePayment: true } }));
  assert.deepEqual([ch.endorsePayment.direction, ch.endorsePayment.method, ch.endorsePayment.reference], ['OUT', 'CHECK', 'CK-2002']);
  assert.equal((await act(c.id, 'endorse', { supplierId: T.supplier })).status, 400, 'iki kez ciro olmaz');

  const b = await act(c.id, 'bounce', { note: 'Protesto edildi' });
  assert.equal(b.status, 200, b.data?.message);
  assert.equal(b.data.cheque.status, 'KARSILIKSIZ');
  assert.equal(await balance(T.customer), customerBefore - 500, 'müşteri yeniden borçlanır');
  assert.equal(await balance(T.supplier), supplierBefore, 'tedarikçiye borç yeniden doğar');
  const payments = await P(() => prisma.payment.findMany({ where: { id: { in: [ch.paymentId, ch.endorsePaymentId] } } }));
  assert.deepEqual(payments.map((p) => p.status), ['CANCELLED', 'CANCELLED']);
  const reversal = await P(() => prisma.financialTransaction.findFirst({ where: { companyId: T.customer, source: 'REVERSAL' }, orderBy: { id: 'desc' } }));
  assert.match(reversal.description, /Karşılıksız çek · no CK-2002 · Protesto edildi/);
  await consistent(T.customer);
  await consistent(T.supplier);
});

test('senet iade edilince tahsilat ters kaydedilir; elle ters kayıt çeki iptal eder, ciro ödemesinin ters kaydı çeki portföye döndürür', { skip }, async () => {
  const n = await receive({ method: 'NOTE', amount: 300, reference: 'SN-1' });
  const note = await chequeOf(n.data.payment.id);
  const before = await balance(T.customer);
  const ret = await act(note.id, 'return');
  assert.equal(ret.data.cheque.status, 'IADE');
  assert.equal(ret.data.cheque.kindLabel, 'Senet');
  assert.equal(await balance(T.customer), before - 300);

  // Cari ekranından tahsilatın ters kaydı → çek iptal, artık işlem yapılamaz
  const r = await receive({ amount: 200, reference: 'CK-3003' });
  const c = await chequeOf(r.data.payment.id);
  const tx = await P(() => prisma.financialTransaction.findFirst({ where: { paymentId: r.data.payment.id } }));
  assert.equal((await api(`/partners/${T.customer}/transactions/${tx.id}/reverse`, { method: 'POST', body: { reason: 'Yanlış kayıt' } })).status, 200);
  assert.equal((await chequeOf(r.data.payment.id)).status, 'IPTAL');
  assert.equal((await act(c.id, 'deposit')).status, 400);

  // Ciro ödemesi elle ters kaydedilirse çek portföye döner (yeniden ciro edilebilir)
  const r2 = await receive({ amount: 100, reference: 'CK-4004' });
  const c2 = await chequeOf(r2.data.payment.id);
  await act(c2.id, 'endorse', { supplierId: T.supplier });
  const endorsed = await P(() => prisma.cheque.findUnique({ where: { id: c2.id } }));
  const stx = await P(() => prisma.financialTransaction.findFirst({ where: { paymentId: endorsed.endorsePaymentId } }));
  assert.equal((await api(`/partners/${T.supplier}/transactions/${stx.id}/reverse`, { method: 'POST', body: { reason: 'Tedarikçi çeki geri verdi' } })).status, 200);
  const back = await P(() => prisma.cheque.findUnique({ where: { id: c2.id } }));
  assert.deepEqual([back.status, back.endorsedToId, back.endorsePaymentId], ['PORTFOY', null, null]);
  assert.equal((await act(c2.id, 'endorse', { supplierId: T.supplier })).status, 200, 'yeniden ciro');
  await consistent(T.customer);
  await consistent(T.supplier);
});

test('liste ve özet; arama; aynı anda iki işlemden yalnızca biri yürür', { skip }, async () => {
  const r = await receive({ amount: 750, reference: 'CK-5005', drawer: 'Mavi Yapı' });
  const c = await chequeOf(r.data.payment.id);
  const [a, b] = await Promise.all([act(c.id, 'collect'), act(c.id, 'deposit')]);
  assert.equal([a.status, b.status].filter((s) => s === 200).length, 1, `biri yürür: ${a.status}, ${b.status}`);

  const all = await api('/cheques');
  assert.equal(all.status, 200);
  const byStatus = Object.fromEntries(all.data.summary.byStatus.map((s) => [s.status, s.count]));
  assert.deepEqual([byStatus.KARSILIKSIZ, byStatus.IADE, byStatus.IPTAL, byStatus.CIRO], [1, 1, 1, 1]);
  const search = await api('/cheques?q=mavi');
  assert.deepEqual(search.data.cheques.map((x) => x.number), ['CK-5005']);
  assert.deepEqual((await api('/cheques?status=KARSILIKSIZ')).data.cheques.map((x) => x.number), ['CK-2002']);
});
