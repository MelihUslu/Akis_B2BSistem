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

  const entries = await runAsPlatform(() => prisma.cashEntry.findMany({ where: { tenantId: T.a, sourceRef: `STAFF_CLAIM:${claim.id}` } }));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].type, 'OUT');
  assert.equal(entries[0].category, 'Personel masrafı');
  assert.equal(entries[0].amount, 1250.5);
  assert.equal(entries[0].method, 'BANK');
  assert.ok(entries[0].storedName, 'fiş gelir-gider kaydına da eklenmeli');
  const paid = ok(await call('GET', '/hr/claims?status=PAID', { as: 'hrm' })).rows[0];
  assert.equal(paid.paidByName, 'fin');
  assert.equal(paid.cashEntryId, entries[0].id);

  // Gelir-giderden değiştirilemez / silinemez (ödeme Personel Yönetimi'nden geri alınır)
  assert.equal((await call('DELETE', `/cash/${entries[0].id}`, { as: 'fin' })).status, 409);
  assert.equal((await call('PUT', `/cash/${entries[0].id}`, { as: 'fin', body: { type: 'OUT', category: 'Diğer', amount: 1, date: '2026-11-04' } })).status, 409);
  assert.equal((await call('DELETE', `/cash/${entries[0].id}/file`, { as: 'fin' })).status, 409);

  // Geri al → kayıt silinir, talep yeniden ödeme bekler; tekrar ödenebilir
  ok(await call('POST', `/hr/claims/${claim.id}/unpay`, { as: 'fin' }));
  assert.equal(await runAsPlatform(() => prisma.cashEntry.count({ where: { tenantId: T.a, sourceRef: `STAFF_CLAIM:${claim.id}` } })), 0);
  assert.equal((await call('POST', `/hr/claims/${claim.id}/unpay`, { as: 'fin' })).status, 409);
  ok(await call('POST', `/hr/claims/${claim.id}/pay`, { as: 'owner', body: { method: 'CASH' } }));

  // Eşzamanlı iki ödeme: yalnızca biri kaydedilir
  ok(await call('POST', `/hr/claims/${advance.id}/approve`, { as: 'owner' }));
  const results = await Promise.all([1, 2, 3].map(() => call('POST', `/hr/claims/${advance.id}/pay`, { as: 'fin', body: { method: 'CASH' } })));
  assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));
  assert.equal(await runAsPlatform(() => prisma.cashEntry.count({ where: { tenantId: T.a, sourceRef: `STAFF_CLAIM:${advance.id}` } })), 1);
  const adv = await runAsPlatform(() => prisma.cashEntry.findFirst({ where: { sourceRef: `STAFF_CLAIM:${advance.id}` } }));
  assert.equal(adv.category, 'Personel avansı');

  // Reddedilen ödenemez; B firması A'nın taleplerine dokunamaz
  const rej = ok(await call('POST', '/hr/me/claims', { as: 'staff', body: { type: 'EXPENSE', amount: '50', description: 'Kırtasiye' } }), 201).claim;
  ok(await call('POST', `/hr/claims/${rej.id}/reject`, { as: 'hrm', body: { reason: 'Fiş yok' } }));
  assert.equal((await call('POST', `/hr/claims/${rej.id}/pay`, { as: 'fin', body: { method: 'CASH' } })).status, 400);
  assert.equal((await call('POST', `/hr/claims/${claim.id}/unpay`, { as: 'ownerB' })).status, 404);
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
  assert.equal(t.paidByName, 'fin');
  const entry = await runAsPlatform(() => prisma.cashEntry.findFirst({ where: { sourceRef: `STAFF_BONUS:${T.salesTarget.id}` } }));
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

test('pasif personel yeni talep açamaz; modül kapanınca personel de erişemez', { skip }, async () => {
  ok(await call('PUT', `/hr/employees/${T.staffEmp.id}`, { as: 'hrm', body: { name: 'Depo Personeli', userId: U.staff.id, department: 'Depo', isActive: false } }));
  assert.equal((await call('POST', '/hr/me/leaves', { as: 'staff', body: { type: 'ANNUAL', startDate: '2027-01-04', endDate: '2027-01-05' } })).status, 403);
  assert.equal(ok(await call('GET', '/hr/me/leaves', { as: 'staff' })).length > 0, true); // geçmişini görür
  ok(await call('POST', '/settings', { as: 'owner', body: { key: 'hr_enabled', value: 'false' } }));
  assert.equal((await call('GET', '/hr/me', { as: 'plas' })).status, 403);
  assert.equal((await call('GET', '/hr/claims', { as: 'fin' })).status, 403);
});
