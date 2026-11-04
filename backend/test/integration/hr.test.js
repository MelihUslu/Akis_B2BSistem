/**
 * Personel yönetimi: modül aç / kapa, erişim (bayi, yetkisiz personel, plasiyer), firma izolasyonu, personel kartı,
 * izin ve masraf / avans onay akışları, kendi talebini onaylama engeli, ödeme (Finans) ve mükerrer ödeme engeli,
 * gelir-gider bağı, prim hesabı (iptal, kısmi onay, iade, bayi adına sipariş, tahsilat), kapanış ve ödeme, duyurular.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';

let server, base, prisma, runAsPlatform, purgeTenant;
const U = {}; // kullanıcılar: { id, role, companyId, tenantId, slug }
const T = {};

// Önceki ay (dönemi bitmiş) ve iki ay önce: Türkiye saatiyle
const now = new Date();
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const P1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const P2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const CUR = ym(now);
const mid = (period) => { const [y, m] = period.split('-').map(Number); return new Date(y, m - 1, 15, 12); };

const call = async (method, path, { as, body, form } = {}) => {
  const u = U[as];
  const headers = { 'X-Tenant': u.slug, Authorization: `Bearer ${jwt.sign({ id: u.id, role: u.role, companyId: u.companyId, tenantId: u.tenantId }, process.env.JWT_SECRET)}` };
  if (body && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${path}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
};
const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };
// Talebin / primin gelir-gider kayıtları (her ödeme kendi kaydını açar: STAFF_PAY:<ödeme>)
const cashOf = (where) => runAsPlatform(async () => {
  const payments = await prisma.staffPayment.findMany({ where });
  return prisma.cashEntry.findMany({ where: { sourceRef: { in: payments.map((p) => `STAFF_PAY:${p.id}`) } }, orderBy: { id: 'asc' } });
});

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const { default: app } = await import('../../src/app.js');

  const plan = await runAsPlatform(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  for (const slug of ['hr-a', 'hr-b']) {
    await runAsPlatform(async () => { const old = await prisma.tenant.findUnique({ where: { slug } }); if (old) await purgeTenant(old.id); });
  }
  await runAsPlatform(async () => {
    const tenant = (slug) => prisma.tenant.create({ data: { slug, name: slug, contactEmail: `info@${slug}.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } });
    const a = await tenant('hr-a');
    const b = await tenant('hr-b');
    T.a = a.id;
    const user = async (key, t, role, extra = {}) => {
      const u = await prisma.user.create({ data: { tenantId: t.id, email: `${key}@${t.slug}.test`, password: 'x', name: key, role, emailVerifiedAt: new Date(), ...extra } });
      U[key] = { id: u.id, role, companyId: u.companyId, tenantId: t.id, slug: t.slug };
    };
    await user('owner', a, 'ADMIN', { isOwner: true });
    await user('hrm', a, 'ADMIN', { permissions: ['HR'] });
    await user('fin', a, 'ADMIN', { permissions: ['FINANCE'] });
    await user('staff', a, 'ADMIN', { permissions: [] });
    await user('plas', a, 'PLASIYER');
    await user('ownerB', b, 'ADMIN', { isOwner: true });

    const dealer = await prisma.company.create({ data: { tenantId: a.id, name: 'Bayi A', taxNumber: '4444444444', status: 'ACTIVE', plasiyerId: U.plas.id } });
    const other = await prisma.company.create({ data: { tenantId: a.id, name: 'Bayi Plasiyersiz', taxNumber: '5555555555', status: 'ACTIVE' } });
    await user('bayi', a, 'BAYI', { companyId: dealer.id });
    U.bayi.companyId = dealer.id;

    // Satışlar: önceki ay (P1)
    const category = await prisma.category.create({ data: { tenantId: a.id, name: 'Genel' } });
    const product = await prisma.product.create({ data: { tenantId: a.id, name: 'Ürün', sku: 'HR-1', price: 500, stock: 100, categoryId: category.id } });
    const order = (companyId, status, subtotal, extra = {}) => prisma.order.create({
      data: { tenantId: a.id, userId: U.bayi.id, companyId, status, subtotal, totalAmount: subtotal * 1.2, approvedAt: mid(P1), ...extra }
    });
    const o1 = await order(dealer.id, 'APPROVED', 10000);
    await order(dealer.id, 'CANCELLED', 5000); // iptal: sayılmaz
    await order(dealer.id, 'PARTIAL_APPROVED', 3000, { discountAmount: 200 }); // kısmi onay: onaylanan kalemler, kupon düşülür
    await order(dealer.id, 'APPROVED', 7000, { approvedAt: mid(CUR) }); // başka ay
    await order(dealer.id, 'PENDING', 9000, { approvedAt: null }); // onaylanmamış
    // Yönetici personelin bayi adına girdiği sipariş (plasiyeri olmayan bayi): personelin satışı, plasiyerin değil
    await order(other.id, 'APPROVED', 2500, { userId: U.staff.id, channel: 'STAFF' });
    // İade: P1'de onaylanan, o1'in 2 adedi × 500 = 1000
    const item = await prisma.orderItem.create({ data: { tenantId: a.id, orderId: o1.id, productId: product.id, quantity: 20, price: 500 } });
    await prisma.returnRequest.create({ data: { tenantId: a.id, companyId: dealer.id, userId: U.bayi.id, orderId: o1.id, orderItemId: item.id, productId: product.id, quantity: 2, reason: 'Kusurlu', status: 'APPROVED', createdAt: mid(P1) } });

    // Tahsilatlar: P2 (TL + dövizli; iptal edilen sayılmaz; plasiyeri olmayan bayininki sayılmaz)
    const pay = (companyId, amount, extra = {}) => prisma.payment.create({ data: { tenantId: a.id, companyId, amount, method: 'CASH', direction: 'IN', status: 'COMPLETED', paymentDate: mid(P2), ...extra } });
    await pay(dealer.id, 4000);
    await pay(dealer.id, 100, { currency: 'USD', rate: 40 });
    await pay(dealer.id, 999, { status: 'CANCELLED' });
    await pay(other.id, 3000);
  });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  await runAsPlatform(async () => {
    for (const slug of ['hr-a', 'hr-b']) { const t = await prisma.tenant.findUnique({ where: { slug } }); if (t) await purgeTenant(t.id); }
  });
  server?.close();
  await prisma?.$disconnect();
});

test('modül kapalıyken uçlar reddedilir; yalnızca Ayarlar yetkilisi açar', { skip }, async () => {
  assert.equal(ok(await call('GET', '/hr/status', { as: 'staff' })).enabled, false);
  const off = await call('GET', '/hr/employees', { as: 'owner' });
  assert.equal(off.status, 403);
  assert.equal(off.body.code, 'MODULE_DISABLED');
  assert.equal((await call('POST', '/settings', { as: 'hrm', body: { key: 'hr_enabled', value: 'true' } })).status, 403);
  ok(await call('POST', '/settings', { as: 'owner', body: { key: 'hr_enabled', value: 'true' } }));
  ok(await call('POST', '/settings', { as: 'ownerB', body: { key: 'hr_enabled', value: 'true' } }));
  const tenant = await fetch(`${base}/api/tenant/public`, { headers: { 'X-Tenant': 'hr-a' } }).then((r) => r.json());
  assert.deepEqual(tenant.modules, { hr: true });
});

test('erişim: bayi giremez, yetkisiz personel yönetemez, plasiyer yalnızca kendi alanını görür', { skip }, async () => {
  assert.equal((await call('GET', '/hr/me', { as: 'bayi' })).status, 403);
  assert.equal((await call('GET', '/hr/employees', { as: 'bayi' })).status, 403);
  assert.equal((await call('GET', '/hr/employees', { as: 'staff' })).status, 403);
  assert.equal((await call('GET', '/hr/employees', { as: 'plas' })).status, 403);
  assert.equal((await call('GET', '/hr/leaves', { as: 'fin' })).status, 403);
  // Kartı olmayan personel: kendi alanı "kart yok" der
  const none = await call('GET', '/hr/me', { as: 'plas' });
  assert.equal(none.status, 404);
  assert.equal(none.body.code, 'NO_EMPLOYEE');
});

test('yetkisiz ekip üyesi (personel hesabı) firma özetini ve aramayı görmez', { skip }, async () => {
  const dash = await call('GET', '/dashboard', { as: 'staff' });
  assert.equal(dash.status, 403);
  assert.equal(dash.body.code, 'NO_DASHBOARD');
  assert.deepEqual(ok(await call('GET', '/search?q=Bayi', { as: 'staff' })), { products: [], companies: [], orders: [] });
  ok(await call('GET', '/dashboard', { as: 'owner' }));
  assert.ok(ok(await call('GET', '/search?q=Bayi', { as: 'owner' })).companies.length > 0);
  // Yalnızca Personel yetkisi: bayi / sipariş araması yok
  assert.equal(ok(await call('GET', '/search?q=Bayi', { as: 'hrm' })).companies.length, 0);
});

test('personel kartı: hesap bağlama kuralları ve firma izolasyonu', { skip }, async () => {
  const mk = (as, body) => call('POST', '/hr/employees', { as, body });
  T.staffEmp = ok(await mk('hrm', { name: 'Depo Personeli', userId: U.staff.id, department: 'Depo', title: 'Depocu', hireDate: '2025-03-01', phone: '0532 111 11 11' }), 201).employee;
  T.plasEmp = ok(await mk('hrm', { name: 'Saha Plasiyeri', userId: U.plas.id, department: 'Satış', title: 'Plasiyer' }), 201).employee;
  T.hrmEmp = ok(await mk('owner', { name: 'İK Sorumlusu', userId: U.hrm.id, department: 'Yönetim' }), 201).employee;
  T.noAccount = ok(await mk('hrm', { name: 'Hesapsız Personel', department: 'Depo' }), 201).employee;
  assert.equal(T.staffEmp.user.id, U.staff.id);

  assert.equal((await mk('hrm', { name: 'Bayi', userId: U.bayi.id })).status, 400); // bayi hesabı bağlanamaz
  assert.equal((await mk('hrm', { name: 'İkinci kart', userId: U.staff.id })).status, 400); // bir hesap bir kart
  assert.equal((await mk('hrm', { name: 'Başka firma', userId: U.ownerB.id })).status, 400); // başka firmanın hesabı bulunamaz

  // B firması A'nın personelini göremez, düzenleyemez
  ok(await call('POST', '/hr/employees', { as: 'ownerB', body: { name: 'B Personeli', userId: U.ownerB.id } }), 201);
  const listB = ok(await call('GET', '/hr/employees', { as: 'ownerB' }));
  assert.deepEqual(listB.map((e) => e.name), ['B Personeli']);
  assert.equal((await call('PUT', `/hr/employees/${T.staffEmp.id}`, { as: 'ownerB', body: { name: 'Ele geçirildi' } })).status, 404);
  const listA = ok(await call('GET', '/hr/employees', { as: 'hrm' }));
  assert.equal(listA.length, 4);

  const users = ok(await call('GET', '/hr/linkable-users', { as: 'hrm' }));
  assert.ok(users.every((u) => ['ADMIN', 'PLASIYER'].includes(u.role)));
  assert.ok(!users.some((u) => u.id === U.staff.id)); // bağlı hesap listede yok
  const depts = ok(await call('GET', '/hr/departments', { as: 'hrm' }));
  assert.deepEqual(depts.map((d) => d.name), ['Depo', 'Satış', 'Yönetim']);
});

test('izin: talep, çakışma, onay / gerekçeli ret, karar kaydı ve bildirim', { skip }, async () => {
  // 2026-12-07 Pazartesi … 2026-12-13 Pazar → 5 iş günü
  const leave = ok(await call('POST', '/hr/me/leaves', { as: 'staff', body: { type: 'ANNUAL', startDate: '2026-12-07', endDate: '2026-12-13', note: 'Tatil' } }), 201).leave;
  assert.equal(leave.days, 5);
  assert.equal((await call('POST', '/hr/me/leaves', { as: 'staff', body: { type: 'EXCUSE', startDate: '2026-12-10', endDate: '2026-12-10' } })).status, 400); // çakışma
  assert.equal((await call('POST', '/hr/me/leaves', { as: 'staff', body: { type: 'EXCUSE', startDate: '2026-12-19', endDate: '2026-12-20' } })).status, 400); // hafta sonu

  assert.equal((await call('POST', `/hr/leaves/${leave.id}/approve`, { as: 'staff' })).status, 403); // yetkisiz
  assert.equal((await call('POST', `/hr/leaves/${leave.id}/approve`, { as: 'ownerB' })).status, 404); // başka firma
  assert.equal((await call('POST', `/hr/leaves/${leave.id}/reject`, { as: 'hrm', body: { reason: '' } })).status, 400); // gerekçe zorunlu
  ok(await call('POST', `/hr/leaves/${leave.id}/approve`, { as: 'hrm' }));
  assert.equal((await call('POST', `/hr/leaves/${leave.id}/reject`, { as: 'hrm', body: { reason: 'Geç kaldı' } })).status, 409); // ikinci karar

  const mine = ok(await call('GET', '/hr/me/leaves', { as: 'staff' }));
  assert.equal(mine[0].status, 'APPROVED');
  assert.equal(mine[0].decidedByName, 'hrm');
  assert.ok(mine[0].decidedAt);
  const note = await runAsPlatform(() => prisma.notification.findFirst({ where: { userId: U.staff.id, type: 'HR', title: 'İzin talebiniz onaylandı' } }));
  assert.ok(note, 'personele bildirim gitmeli');
  const audit = await runAsPlatform(() => prisma.auditLog.findFirst({ where: { tenantId: T.a, action: 'İzin talebi onaylandı', actorId: U.hrm.id } }));
  assert.ok(audit, 'onay işlem kaydına yazılmalı');

  // Ret gerekçesiyle; personel bekleyen talebini iptal eder
  const second = ok(await call('POST', '/hr/me/leaves', { as: 'plas', body: { type: 'SICK', startDate: '2026-12-14', endDate: '2026-12-15' } }), 201).leave;
  ok(await call('POST', `/hr/leaves/${second.id}/reject`, { as: 'hrm', body: { reason: 'Rapor eksik' } }));
  const rejected = ok(await call('GET', '/hr/me/leaves', { as: 'plas' }))[0];
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.rejectReason, 'Rapor eksik');
  const third = ok(await call('POST', '/hr/me/leaves', { as: 'plas', body: { type: 'EXCUSE', startDate: '2026-12-16', endDate: '2026-12-16' } }), 201).leave;
  ok(await call('POST', `/hr/me/leaves/${third.id}/cancel`, { as: 'plas' }));
  assert.equal((await call('POST', `/hr/me/leaves/${leave.id}/cancel`, { as: 'plas' })).status, 400); // başkasının talebi

  // Personel yetkilisi kendi talebini onaylayamaz; firma sahibi onaylar
  const own = ok(await call('POST', '/hr/me/leaves', { as: 'hrm', body: { type: 'ANNUAL', startDate: '2026-12-21', endDate: '2026-12-22' } }), 201).leave;
  assert.equal((await call('POST', `/hr/leaves/${own.id}/approve`, { as: 'hrm' })).status, 403);
  ok(await call('POST', `/hr/leaves/${own.id}/approve`, { as: 'owner' }));

  // B firması A'nın izinlerini görmez
  assert.equal(ok(await call('GET', '/hr/leaves', { as: 'ownerB' })).rows.length, 0);
});

test('masraf / avans: onay ödeme değildir; ödeme Finans yetkisiyle, gelir-gidere bir kez yazılır', { skip }, async () => {
  const form = new FormData();
  form.append('type', 'EXPENSE');
  form.append('amount', '1.250,50');
  form.append('date', '2026-11-02');
  form.append('description', 'Müşteri ziyareti yakıt');
  form.append('file', new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), 'fis.pdf');
  const claim = ok(await call('POST', '/hr/me/claims', { as: 'staff', form }), 201).claim;
  assert.equal(claim.amount, 1250.5);
  assert.equal(claim.hasFile, true);
  const advance = ok(await call('POST', '/hr/me/claims', { as: 'plas', body: { type: 'ADVANCE', amount: '3000', description: 'Yol avansı' } }), 201).claim;

  // Fiş: sahibi ve yetkililer indirir, başka personel indiremez
  assert.equal((await call('GET', `/hr/claims/${claim.id}/file`, { as: 'staff' })).status, 200);
  assert.equal((await call('GET', `/hr/claims/${claim.id}/file`, { as: 'fin' })).status, 200);
  assert.equal((await call('GET', `/hr/claims/${claim.id}/file`, { as: 'plas' })).status, 404);

  // Onaylanmadan ödenemez; onay ödeme sayılmaz
  assert.equal((await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'fin', body: { method: 'BANK' } })).status, 400);
  ok(await call('POST', `/hr/claims/${claim.id}/approve`, { as: 'hrm' }));
  const approved = ok(await call('GET', '/hr/me/claims', { as: 'staff' })).find((c) => c.id === claim.id);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.paidAt, null);
  assert.equal(ok(await call('GET', '/hr/claims?status=TO_PAY', { as: 'fin' })).toPayTotal, 1250.5);

  // Ödeme: Personel yetkisi yetmez (Finans); ödeme şekli zorunlu
  assert.equal((await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'hrm', body: { method: 'BANK' } })).status, 403);
  assert.equal((await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'fin', body: {} })).status, 400);
  ok(await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'fin', body: { method: 'BANK', date: '2026-11-04' } }));
  assert.equal((await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'fin', body: { method: 'BANK' } })).status, 409); // ikinci ödeme

  const entries = await cashOf({ claimId: claim.id });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, 'OUT');
  assert.equal(entries[0].category, 'Personel masrafı');
  assert.equal(entries[0].amount, 1250.5);
  assert.equal(entries[0].method, 'BANK');
  assert.ok(entries[0].storedName, 'fiş gelir-gider kaydına da eklenmeli');
  const paid = ok(await call('GET', '/hr/claims?status=PAID', { as: 'hrm' })).rows[0];
  assert.equal(paid.payments.length, 1);
  assert.equal(paid.payments[0].createdByName, 'fin');
  assert.equal(paid.payments[0].method, 'BANK');
  assert.equal(paid.remaining, 0);

  // Gelir-giderden değiştirilemez / silinemez (ödeme Personel Yönetimi'nden geri alınır)
  assert.equal((await call('DELETE', `/cash/${entries[0].id}`, { as: 'fin' })).status, 409);
  assert.equal((await call('PUT', `/cash/${entries[0].id}`, { as: 'fin', body: { type: 'OUT', category: 'Diğer', amount: 1, date: '2026-11-04' } })).status, 409);
  assert.equal((await call('DELETE', `/cash/${entries[0].id}/file`, { as: 'fin' })).status, 409);

  // Geri al → kayıt silinir, talep yeniden ödeme bekler; tekrar ödenebilir
  assert.equal((await call('DELETE', `/hr/payments/${paid.payments[0].id}`, { as: 'hrm' })).status, 403); // Finans
  ok(await call('DELETE', `/hr/payments/${paid.payments[0].id}`, { as: 'fin' }));
  assert.equal(await runAsPlatform(() => prisma.cashEntry.count({ where: { tenantId: T.a, sourceRef: `STAFF_PAY:${paid.payments[0].id}` } })), 0);
  assert.equal((await call('DELETE', `/hr/payments/${paid.payments[0].id}`, { as: 'fin' })).status, 404);
  assert.equal(ok(await call('GET', '/hr/claims?status=TO_PAY', { as: 'fin' })).toPayTotal, 1250.5); // yeniden ödeme bekler
  ok(await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'owner', body: { method: 'CASH' } }));

  // Eşzamanlı iki ödeme: yalnızca biri kaydedilir
  ok(await call('POST', `/hr/claims/${advance.id}/approve`, { as: 'owner' }));
  const results = await Promise.all([1, 2, 3].map(() => call('POST', `/hr/claims/${advance.id}/pay`, { as: 'fin', body: { method: 'CASH' } })));
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));
  const advEntries = await cashOf({ claimId: advance.id });
  assert.equal(advEntries.length, 1);
  assert.equal(advEntries[0].category, 'Personel avansı');

  // Reddedilen ödenemez; B firması A'nın taleplerine dokunamaz
  const rej = ok(await call('POST', '/hr/me/claims', { as: 'staff', body: { type: 'EXPENSE', amount: '50', description: 'Kırtasiye' } }), 201).claim;
  ok(await call('POST', `/hr/claims/${rej.id}/reject`, { as: 'hrm', body: { reason: 'Fiş yok' } }));
  assert.equal((await call('POST', `/hr/claims/${rej.id}/pay`, { as: 'fin', body: { method: 'CASH' } })).status, 400);
  const ownPayment = await runAsPlatform(() => prisma.staffPayment.findFirst({ where: { claimId: claim.id } }));
  assert.equal((await call('DELETE', `/hr/payments/${ownPayment.id}`, { as: 'ownerB' })).status, 404);
  assert.equal(ok(await call('GET', '/hr/claims', { as: 'ownerB' })).rows.length, 0);
});

test('prim: satışlar siparişlerden (iptal, kısmi onay, iade, bayi adına sipariş), tahsilat seçeneği', { skip }, async () => {
  // Geçmiş aylar için hedefler (önceki ay oluşturulmuş gibi); API geçmiş aya hedef açtırmaz
  const past = await runAsPlatform(() => Promise.all([
    prisma.staffTarget.create({ data: { tenantId: T.a, employeeId: T.plasEmp.id, period: P1, targetAmount: 10000, bonusRate: 5, basis: 'SALES' } }),
    prisma.staffTarget.create({ data: { tenantId: T.a, employeeId: T.plasEmp.id, period: P2, targetAmount: 8000, bonusRate: 2, basis: 'COLLECTION' } }),
    prisma.staffTarget.create({ data: { tenantId: T.a, employeeId: T.staffEmp.id, period: P1, targetAmount: 5000, bonusRate: 3, basis: 'SALES' } })
  ]));
  T.salesTarget = past[0];
  T.collectTarget = past[1];
  T.missTarget = past[2];
  assert.equal((await call('POST', '/hr/targets', { as: 'hrm', body: { employeeId: T.plasEmp.id, period: P1, targetAmount: 1, bonusRate: 1 } })).status, 400);

  const p1 = ok(await call('GET', `/hr/targets?period=${P1}`, { as: 'hrm' }));
  const plasP1 = p1.find((t) => t.employeeId === T.plasEmp.id);
  // 10.000 + (3.000 − 200) − iade 1.000 = 11.800; iptal, bekleyen ve başka aydaki sayılmaz
  assert.equal(plasP1.achieved, 11800);
  assert.equal(plasP1.calculatedBonus, 590); // hedef tuttu: %5
  assert.equal(plasP1.paidBonus, 0);
  const staffP1 = p1.find((t) => t.employeeId === T.staffEmp.id);
  assert.equal(staffP1.achieved, 2500); // bayi adına girdiği sipariş
  assert.equal(staffP1.calculatedBonus, 0); // hedef (5.000) tutmadı

  const p2 = ok(await call('GET', `/hr/targets?period=${P2}`, { as: 'hrm' }))[0];
  assert.equal(p2.achieved, 8000); // 4.000 TL + 100 USD × 40; iptal edilen ve başka bayininki sayılmaz
  assert.equal(p2.calculatedBonus, 160);

  // Personel kendi hedefini görür, başkasınınkini görmez
  const mine = ok(await call('GET', '/hr/me/targets', { as: 'plas' }));
  assert.deepEqual(mine.map((t) => t.period).sort(), [P2, P1].sort());
  assert.ok(ok(await call('GET', '/hr/me/targets', { as: 'staff' })).every((t) => t.employeeId === T.staffEmp.id));

  // Bu ay için hedef API'den; hesabı olmayan personele ve aynı aya ikinci hedef verilemez
  const cur = ok(await call('POST', '/hr/targets', { as: 'hrm', body: { employeeId: T.plasEmp.id, period: CUR, targetAmount: '20000', bonusRate: '4', basis: 'SALES' } }), 201).target;
  assert.equal(cur.achieved, 7000);
  assert.equal((await call('POST', '/hr/targets', { as: 'hrm', body: { employeeId: T.plasEmp.id, period: CUR, targetAmount: 1, bonusRate: 1 } })).status, 409);
  assert.equal((await call('POST', '/hr/targets', { as: 'hrm', body: { employeeId: T.noAccount.id, period: CUR, targetAmount: 1, bonusRate: 1 } })).status, 400);
  assert.equal((await call('POST', `/hr/targets/${cur.id}/close`, { as: 'hrm' })).status, 400); // ay bitmedi
  ok(await call('PUT', `/hr/targets/${cur.id}`, { as: 'hrm', body: { basis: 'COLLECTION' } }));
});

test('prim: kapanışta sabitlenir, hesaplanan ve ödenen ayrı; ödeme bir kez', { skip }, async () => {
  ok(await call('POST', `/hr/targets/${T.salesTarget.id}/close`, { as: 'hrm' }));
  assert.equal((await call('POST', `/hr/targets/${T.salesTarget.id}/close`, { as: 'hrm' })).status, 409);
  assert.equal((await call('PUT', `/hr/targets/${T.salesTarget.id}`, { as: 'hrm', body: { bonusRate: 50 } })).status, 400); // kapalı

  // Kapanıştan sonra gelen iade kapalı dönemi değiştirmez
  await runAsPlatform(async () => {
    const item = await prisma.orderItem.findFirst({ where: { tenantId: T.a } });
    const order = await prisma.order.findUnique({ where: { id: item.orderId } });
    await prisma.returnRequest.create({ data: { tenantId: T.a, companyId: order.companyId, userId: U.bayi.id, orderId: order.id, orderItemId: item.id, productId: item.productId, quantity: 4, reason: 'Geç', status: 'APPROVED', createdAt: mid(P1) } });
  });
  let t = ok(await call('GET', `/hr/targets?period=${P1}`, { as: 'fin' })).find((x) => x.id === T.salesTarget.id);
  assert.equal(t.status, 'CLOSED');
  assert.equal(t.achieved, 11800);
  assert.equal(t.calculatedBonus, 590);
  assert.equal(t.paidBonus, 0);

  assert.equal((await call('POST', `/hr/targets/${T.salesTarget.id}/pay`, { as: 'hrm', body: { method: 'BANK' } })).status, 403); // Finans
  ok(await call('POST', `/hr/targets/${T.salesTarget.id}/pay`, { as: 'fin', body: { method: 'BANK' } }));
  assert.equal((await call('POST', `/hr/targets/${T.salesTarget.id}/pay`, { as: 'fin', body: { method: 'BANK' } })).status, 409);
  t = ok(await call('GET', '/hr/me/targets', { as: 'plas' })).find((x) => x.id === T.salesTarget.id);
  assert.equal(t.paidBonus, 590);
  assert.equal(t.payments[0].createdByName, 'fin');
  const [entry] = await cashOf({ targetId: T.salesTarget.id });
  assert.equal(entry.category, 'Personel primi');
  assert.equal(entry.amount, 590);

  // Hedef tutmadı: kapanır ama ödenecek prim yok
  ok(await call('POST', `/hr/targets/${T.missTarget.id}/close`, { as: 'hrm' }));
  assert.equal((await call('POST', `/hr/targets/${T.missTarget.id}/pay`, { as: 'fin', body: { method: 'CASH' } })).status, 400);
  // Açık (kapanmamış) dönemin primi ödenemez
  assert.equal((await call('POST', `/hr/targets/${T.collectTarget.id}/pay`, { as: 'fin', body: { method: 'CASH' } })).status, 400);
});

test('duyurular: tüm personele ya da departmana; bildirim yalnızca hedef kitleye', { skip }, async () => {
  ok(await call('POST', '/hr/announcements', { as: 'hrm', body: { title: 'Bayram tatili', body: 'Ofis 3 gün kapalı.' } }), 201);
  ok(await call('POST', '/hr/announcements', { as: 'hrm', body: { title: 'Satış toplantısı', body: 'Pazartesi 09:00', departments: ['Satış'] } }), 201);
  assert.equal((await call('POST', '/hr/announcements', { as: 'staff', body: { title: 'Yetkisiz', body: 'x' } })).status, 403);

  const plas = ok(await call('GET', '/hr/me/announcements', { as: 'plas' })).map((a) => a.title);
  const staff = ok(await call('GET', '/hr/me/announcements', { as: 'staff' })).map((a) => a.title);
  assert.deepEqual(plas.sort(), ['Bayram tatili', 'Satış toplantısı'].sort());
  assert.deepEqual(staff, ['Bayram tatili']);
  const notes = await runAsPlatform(() => prisma.notification.findMany({ where: { tenantId: T.a, title: 'Duyuru: Satış toplantısı' } }));
  assert.deepEqual(notes.map((n) => n.userId), [U.plas.id]);
  assert.equal(ok(await call('GET', '/hr/me/announcements', { as: 'ownerB' })).length, 0); // B firması görmez
});

// Gün hesabı için: işe girişi bugünden 6 yıl 1 ay önce (6 yıl dönümü geçti: 5 × 14 + 20 = 90 gün hak)
const shift = (d, { y = 0, m = 0 } = {}) => { const x = new Date(d); x.setFullYear(x.getFullYear() + y, x.getMonth() + m); return x; };
const ymd = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

test('personel rolü: hesap kartından açılır, yalnızca personel alanına girer, yönetici sayısına dahil değil', { skip }, async () => {
  const hire = shift(now, { y: -6, m: -1 });
  T.pers = ok(await call('POST', '/hr/employees', { as: 'hrm', body: { name: 'Ece Depo', email: 'ece@hr-a.test', department: 'Depo', hireDate: ymd(hire), managerId: T.plasEmp.id } }), 201).employee;
  const admins = await runAsPlatform(() => prisma.user.count({ where: { tenantId: T.a, role: 'ADMIN' } }));
  const created = ok(await call('POST', `/hr/employees/${T.pers.id}/account`, { as: 'hrm', body: {} }), 201);
  assert.ok(created.password, 'e-posta gönderilemeyince geçici şifre bir kez döner');
  assert.equal((await call('POST', `/hr/employees/${T.pers.id}/account`, { as: 'hrm', body: {} })).status, 400); // ikinci hesap yok
  const user = await runAsPlatform(() => prisma.user.findFirst({ where: { tenantId: T.a, email: 'ece@hr-a.test' } }));
  assert.equal(user.role, 'PERSONEL');
  assert.equal(await runAsPlatform(() => prisma.user.count({ where: { tenantId: T.a, role: 'ADMIN' } })), admins);
  U.pers = { id: user.id, role: 'PERSONEL', companyId: null, tenantId: T.a, slug: 'hr-a' };

  // Şifreyle giriş; yalnızca personel alanı
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': 'hr-a' }, body: JSON.stringify({ email: 'ece@hr-a.test', password: created.password }) }).then((r) => r.json());
  assert.equal(login.user.role, 'PERSONEL');
  ok(await call('GET', '/hr/me', { as: 'pers' }));
  ok(await call('GET', '/notifications', { as: 'pers' }));
  for (const path of ['/dashboard', '/orders', '/products', '/companies', '/cash', '/search?q=a', '/plasiyer/dealers']) {
    assert.equal((await call('GET', path, { as: 'pers' })).status, 403, path);
  }
  assert.equal((await call('GET', '/hr/employees', { as: 'pers' })).status, 403);
});

test('izin hakkı: yasal süre, firma hakkı, devir; tatiller, Cumartesi, yarım gün, avans izin', { skip }, async () => {
  let me = ok(await call('GET', '/hr/me', { as: 'pers' }));
  assert.equal(me.leaveBalance.serviceYears, 6);
  assert.equal(me.leaveBalance.earned, 90); // 1–5. yıl 14, 6. yıl 20
  assert.equal(me.leaveBalance.remaining, 90);
  assert.equal(me.leaveBalance.next.days, 20);
  assert.equal(me.employee.manager.name, 'Saha Plasiyeri');

  // Firma daha fazla veriyorsa o geçerli (yasal sürenin altı sayılmaz); devir girilince öncesi sayılmaz
  ok(await call('PUT', `/hr/employees/${T.pers.id}`, { as: 'hrm', body: { ...T.pers, userId: U.pers.id, hireDate: ymd(shift(now, { y: -6, m: -1 })), annualLeaveDays: 24, leaveCarryDate: ymd(shift(now, { m: -2 })), leaveCarryDays: 10 } }));
  me = ok(await call('GET', '/hr/me', { as: 'pers' }));
  assert.equal(me.leaveBalance.earned, 24); // yalnızca devirden sonraki yıl dönümü (6. yıl: max(20, 24))
  assert.equal(me.leaveBalance.remaining, 34);
  assert.equal(me.leaveBalance.carry.days, 10);
  ok(await call('PUT', `/hr/employees/${T.pers.id}`, { as: 'hrm', body: { ...T.pers, userId: U.pers.id, hireDate: ymd(shift(now, { y: -6, m: -1 })), annualLeaveDays: 10, leaveCarryDate: '', leaveCarryDays: '' } }));
  assert.equal(ok(await call('GET', '/hr/me', { as: 'pers' })).leaveBalance.earned, 90); // 10 < yasal süre: yasal süre

  const preview = (q) => call('GET', `/hr/me/leave-preview?${new URLSearchParams(q)}`, { as: 'pers' }).then(ok);
  // 27 Ekim 2027 Çarşamba (1) + 28 Ekim arife (0,5) + 29 Ekim Cumhuriyet Bayramı (0)
  const oct = await preview({ type: 'ANNUAL', startDate: '2027-10-27', endDate: '2027-10-29' });
  assert.equal(oct.days, 1.5);
  assert.deepEqual(oct.holidays.map((h) => h.date), ['2027-10-28', '2027-10-29']);
  // Firma tatil listesi (dini bayram) ve Cumartesi
  assert.equal((await call('PUT', '/hr/settings', { as: 'staff', body: {} })).status, 403);
  ok(await call('PUT', '/hr/settings', { as: 'hrm', body: { saturdayWorkday: false, allowNegativeLeave: false, holidays: [{ date: '2027-03-09', name: 'Ramazan Bayramı', half: false }, { date: '2027-03-08', name: 'Arife', half: true }] } }));
  assert.equal((await preview({ type: 'ANNUAL', startDate: '2027-03-08', endDate: '2027-03-13' })).days, 3.5); // Pzt yarım, Salı tatil, Çar–Cum 3, Cmt yok
  ok(await call('PUT', '/hr/settings', { as: 'hrm', body: { saturdayWorkday: true, allowNegativeLeave: false, holidays: [] } }));
  assert.equal((await preview({ type: 'ANNUAL', startDate: '2027-03-08', endDate: '2027-03-13' })).days, 6);
  ok(await call('PUT', '/hr/settings', { as: 'hrm', body: { saturdayWorkday: false, allowNegativeLeave: false, holidays: [] } }));
  // Yarım gün: yalnızca tek gün
  assert.equal((await preview({ type: 'EXCUSE', startDate: '2027-03-10', endDate: '2027-03-10', half: 'PM' })).days, 0.5);
  assert.equal((await call('GET', `/hr/me/leave-preview?${new URLSearchParams({ type: 'EXCUSE', startDate: '2027-03-10', endDate: '2027-03-11', half: 'AM' })}`, { as: 'pers' })).status, 400);
  const half = ok(await call('POST', '/hr/me/leaves', { as: 'pers', body: { type: 'EXCUSE', startDate: '2027-03-10', endDate: '2027-03-10', half: 'AM' } }), 201).leave;
  assert.equal(half.days, 0.5);
  assert.equal(half.half, 'AM');

  // Bakiye: 90 gün; 91 iş günlük yıllık izin reddedilir, avans izne izin verilince açılır
  const long = { type: 'ANNUAL', startDate: '2028-01-03', endDate: '2028-05-15' };
  const big = await preview(long);
  assert.ok(big.days > 90 && big.exceeds, JSON.stringify(big));
  assert.equal((await call('POST', '/hr/me/leaves', { as: 'pers', body: long })).status, 400);
  ok(await call('PUT', '/hr/settings', { as: 'hrm', body: { saturdayWorkday: false, allowNegativeLeave: true, holidays: [] } }));
  const avans = ok(await call('POST', '/hr/me/leaves', { as: 'pers', body: long }), 201).leave;
  ok(await call('POST', `/hr/me/leaves/${avans.id}/cancel`, { as: 'pers' }));
  ok(await call('PUT', '/hr/settings', { as: 'hrm', body: { saturdayWorkday: false, allowNegativeLeave: false, holidays: [] } }));

  // Onaylanan yıllık izin bakiyeden düşer
  const annual = ok(await call('POST', '/hr/me/leaves', { as: 'pers', body: { type: 'ANNUAL', startDate: '2027-04-05', endDate: '2027-04-09' } }), 201).leave;
  assert.equal(ok(await call('GET', '/hr/me', { as: 'pers' })).leaveBalance.available, 85);
  T.persAnnual = annual;
  const listed = ok(await call('GET', '/hr/leaves?status=PENDING', { as: 'hrm' })).rows.find((l) => l.id === annual.id);
  assert.equal(listed.balance.remaining, 90);
});

test('departman yöneticisi: yalnızca kendi ekibinin taleplerine karar verir, bildirimi o alır', { skip }, async () => {
  // Talep bildirimi yöneticiye (plasiyer) gider
  const note = await runAsPlatform(() => prisma.notification.findFirst({ where: { userId: U.plas.id, title: 'Yeni izin talebi', message: { contains: 'Ece Depo' } } }));
  assert.ok(note, 'yöneticiye bildirim gitmeli');
  assert.equal(note.link, '/plasiyer/personel?tab=team');

  const team = ok(await call('GET', '/hr/team', { as: 'plas' }));
  assert.deepEqual(team.members.map((m) => m.name), ['Ece Depo']);
  assert.ok(team.leaves.some((l) => l.id === T.persAnnual.id));
  // Yönetici kendi ekibine karar verir; başkasının talebine veremez
  ok(await call('POST', `/hr/leaves/${T.persAnnual.id}/approve`, { as: 'plas' }));
  assert.equal(ok(await call('GET', '/hr/me', { as: 'pers' })).leaveBalance.remaining, 85);
  const other = ok(await call('POST', '/hr/me/leaves', { as: 'hrm', body: { type: 'EXCUSE', startDate: '2027-02-01', endDate: '2027-02-01' } }), 201).leave;
  assert.equal((await call('POST', `/hr/leaves/${other.id}/approve`, { as: 'plas' })).status, 403);
  assert.equal((await call('GET', '/hr/leaves', { as: 'plas' })).status, 403); // firma geneli liste Personel yetkisinde
  // Yönetici ekibinin masrafını onaylar, ödeyemez (Finans)
  const exp = ok(await call('POST', '/hr/me/claims', { as: 'pers', body: { type: 'EXPENSE', amount: '120', description: 'Kargo bandı' } }), 201).claim;
  ok(await call('POST', `/hr/claims/${exp.id}/approve`, { as: 'plas' }));
  assert.equal((await call('POST', `/hr/claims/${exp.id}/pay`, { as: 'plas', body: { method: 'CASH' } })).status, 403);
  // Yönetici hesabı olmayan personel yönetici yapılamaz; kişi kendi yöneticisi olamaz
  assert.equal((await call('PUT', `/hr/employees/${T.pers.id}`, { as: 'hrm', body: { ...T.pers, userId: U.pers.id, managerId: T.noAccount.id } })).status, 400);
  assert.equal((await call('PUT', `/hr/employees/${T.pers.id}`, { as: 'hrm', body: { ...T.pers, userId: U.pers.id, managerId: T.pers.id } })).status, 400);
});

test('kısmi ödeme ve avans mahsubu: kalan aşılmaz, avans masraftan düşülür, iade ve maaş kesintisiyle kapanır', { skip }, async () => {
  const claim = (body) => call('POST', '/hr/me/claims', { as: 'pers', body }).then((r) => ok(r, 201).claim);
  const pay = (id, body, as = 'fin') => call('POST', `/hr/claims/${id}/pay`, { as, body });
  const adv = await claim({ type: 'ADVANCE', amount: '3000', description: 'Yol avansı' });
  ok(await call('POST', `/hr/claims/${adv.id}/approve`, { as: 'hrm' }));
  // Ödenmemiş avans kapatılamaz / mahsup edilemez
  assert.equal((await call('POST', `/hr/claims/${adv.id}/settle`, { as: 'fin', body: { kind: 'PAYROLL' } })).status, 409);

  ok(await pay(adv.id, { method: 'BANK', amount: '1000' }));
  let row = ok(await call('GET', '/hr/claims?status=TO_PAY', { as: 'fin' })).rows.find((c) => c.id === adv.id);
  assert.equal(row.paidAmount, 1000);
  assert.equal(row.remaining, 2000);
  assert.equal(row.paidAt, null);
  assert.equal((await pay(adv.id, { method: 'BANK', amount: '2500' })).status, 409); // kalanı aşıyor
  ok(await pay(adv.id, { method: 'CASH' })); // kalanın tamamı
  row = ok(await call('GET', '/hr/claims?status=OPEN_ADVANCE', { as: 'fin' })).rows.find((c) => c.id === adv.id);
  assert.ok(row.paidAt);
  assert.equal(row.open, 3000);
  assert.equal((await cashOf({ claimId: adv.id })).length, 2);

  // Eşzamanlı kısmi ödemeler sırayla: 900'lük masrafa 3 × 400 → ikisi geçer, üçüncüsü kalanı aşar
  const exp = await claim({ type: 'EXPENSE', amount: '900', description: 'Toplantı yemeği' });
  ok(await call('POST', `/hr/claims/${exp.id}/approve`, { as: 'hrm' }));
  const results = await Promise.all([1, 2, 3].map(() => pay(exp.id, { method: 'CASH', amount: '400' })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 200, 409]);
  assert.equal((await cashOf({ claimId: exp.id })).length, 2);

  // Avanstan mahsup: 1.200'lük masraf açık avanstan düşülür, nakit çıkmaz
  const offset = await claim({ type: 'EXPENSE', amount: '1200', description: 'Otel' });
  ok(await call('POST', `/hr/claims/${offset.id}/approve`, { as: 'hrm' }));
  assert.equal((await pay(adv.id, { method: 'ADVANCE' })).status, 409); // avans zaten ödendi
  ok(await pay(offset.id, { method: 'ADVANCE' }));
  assert.equal((await cashOf({ claimId: offset.id })).length, 0);
  row = ok(await call('GET', '/hr/claims?status=OPEN_ADVANCE', { as: 'fin' })).rows.find((c) => c.id === adv.id);
  assert.equal(row.open, 1800);
  assert.equal(row.settlements[0].kind, 'OFFSET');
  const big = await claim({ type: 'EXPENSE', amount: '5000', description: 'Uçak' });
  ok(await call('POST', `/hr/claims/${big.id}/approve`, { as: 'hrm' }));
  assert.equal((await pay(big.id, { method: 'ADVANCE' })).status, 400); // açık avans yetmez

  // Kalan avans: 500 nakit iade (gelir kaydı) + 1.300 maaştan kesinti → kapanır
  ok(await call('POST', `/hr/claims/${adv.id}/settle`, { as: 'fin', body: { kind: 'REFUND', amount: '500', method: 'CASH' } }));
  const refund = await runAsPlatform(() => prisma.cashEntry.findFirst({ where: { tenantId: T.a, category: 'Personel avans iadesi' } }));
  assert.equal(refund.type, 'IN');
  assert.equal(refund.amount, 500);
  assert.equal((await call('POST', `/hr/claims/${adv.id}/settle`, { as: 'fin', body: { kind: 'PAYROLL', amount: '2000' } })).status, 409); // açıktan fazla
  ok(await call('POST', `/hr/claims/${adv.id}/settle`, { as: 'fin', body: { kind: 'PAYROLL' } }));
  const closed = ok(await call('GET', '/hr/claims?status=ALL', { as: 'fin' })).rows.find((c) => c.id === adv.id);
  assert.equal(closed.open, 0);
  assert.deepEqual(closed.settlements.map((p) => p.kind), ['OFFSET', 'REFUND', 'PAYROLL']);
  assert.equal(ok(await call('GET', '/hr/me', { as: 'pers' })).openAdvance, 0);

  // Geri alma: kesinti geri alınınca avans açılır; mahsubu olan avansın ödemesi önce onlar geri alınmadan geri alınamaz
  const payroll = closed.settlements.find((p) => p.kind === 'PAYROLL');
  ok(await call('DELETE', `/hr/payments/${payroll.id}`, { as: 'fin' }));
  assert.equal(ok(await call('GET', '/hr/me', { as: 'pers' })).openAdvance, 1300);
  // Ödenen 3.000, kapanan 1.700 (mahsup 1.200 + iade 500): 2.000'lik ödeme geri alınırsa kapananı karşılamaz
  const advPayout = closed.payments.find((p) => p.kind === 'PAYOUT' && p.amount === 2000);
  assert.equal((await call('DELETE', `/hr/payments/${advPayout.id}`, { as: 'fin' })).status, 409);
  // Personel kendi ödemelerini görür
  const mine = ok(await call('GET', '/hr/me/claims', { as: 'pers' })).find((c) => c.id === adv.id);
  assert.equal(mine.payments.length, 2);
  assert.equal(mine.open, 1300);
});

test('pasif personelin personel hesabı da kapanır', { skip }, async () => {
  ok(await call('PUT', `/hr/employees/${T.pers.id}`, { as: 'hrm', body: { ...T.pers, userId: U.pers.id, isActive: false } }));
  const user = await runAsPlatform(() => prisma.user.findFirst({ where: { id: U.pers.id } }));
  assert.equal(user.isActive, false);
  assert.equal((await call('GET', '/hr/me', { as: 'pers' })).status, 401);
});

test('pasif personel yeni talep açamaz; modül kapanınca personel de erişemez', { skip }, async () => {
  ok(await call('PUT', `/hr/employees/${T.staffEmp.id}`, { as: 'hrm', body: { name: 'Depo Personeli', userId: U.staff.id, department: 'Depo', isActive: false } }));
  assert.equal((await call('POST', '/hr/me/leaves', { as: 'staff', body: { type: 'ANNUAL', startDate: '2027-01-04', endDate: '2027-01-05' } })).status, 403);
  assert.equal(ok(await call('GET', '/hr/me/leaves', { as: 'staff' })).length > 0, true); // geçmişini görür
  ok(await call('POST', '/settings', { as: 'owner', body: { key: 'hr_enabled', value: 'false' } }));
  assert.equal((await call('GET', '/hr/me', { as: 'plas' })).status, 403);
  assert.equal((await call('GET', '/hr/claims', { as: 'fin' })).status, 403);
});
