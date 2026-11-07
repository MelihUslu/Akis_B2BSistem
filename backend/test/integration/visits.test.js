/**
 * Plasiyer saha ziyareti: plasiyer yalnızca kendi aktif bayilerine plan açar ve ziyaret kaydeder (sonuç, not, konum,
 * sonraki ziyaret); planlı ziyaret kaydedilince yapıldı olur; bayi listesinde son / sıradaki ziyaret; yönetim raporu
 * plasiyer özetini ve 30 gündür ziyaret edilmeyen bayileri verir; yetki sınırları.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'ziyaret-a';

let server, base, prisma, runAsPlatform, purgeTenant, localDay;
const T = { tokens: {} };

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const day = (n) => localDay(new Date(Date.now() + n * 864e5));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  ({ localDay } = await import('../../src/utils/dates.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Saha Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  await user({ email: `clerk@${SLUG}.test`, name: 'Sipariş', role: 'ADMIN', permissions: ['ORDERS'] });
  T.p1 = (await user({ email: `ali@${SLUG}.test`, name: 'Ali Saha', role: 'PLASIYER' })).id;
  T.p2 = (await user({ email: `veli@${SLUG}.test`, name: 'Veli Saha', role: 'PLASIYER' })).id;
  const dealer = (name, plasiyerId, status = 'ACTIVE') => P(() => prisma.company.create({ data: { tenantId, name, status, plasiyerId } }));
  T.d1 = (await dealer('Akın Yapı', T.p1)).id;
  T.d2 = (await dealer('Bora Market', T.p1)).id;
  T.d3 = (await dealer('Cem Ticaret', T.p2)).id;
  T.d4 = (await dealer('Pasif Bayi', T.p1, 'PASSIVE')).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['clerk', 'clerk'], ['p1', 'ali'], ['p2', 'veli']]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG }, body: JSON.stringify({ email: `${email}@${SLUG}.test`, password: 'Test12345' }) });
    const data = await r.json();
    assert.equal(r.status, 200, `${email}: ${data.message}`);
    T.tokens[k] = data.token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('plan: yalnızca kendi aktif bayisine; aynı güne iki plan yok; geçmiş gün ve geçersiz tarih olmaz', { skip }, async () => {
  const ok = await api('/plasiyer/visits', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d1, plannedFor: day(1), note: 'Yeni katalog' } });
  assert.equal(ok.status, 201, ok.data?.message);
  T.plan1 = ok.data.visit.id;
  assert.equal((await api('/plasiyer/visits', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d1, plannedFor: day(1) } })).status, 400, 'aynı gün');
  assert.equal((await api('/plasiyer/visits', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d3, plannedFor: day(1) } })).status, 404, 'başkasının bayisi');
  assert.equal((await api('/plasiyer/visits', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d4, plannedFor: day(1) } })).status, 404, 'pasif bayi');
  assert.equal((await api('/plasiyer/visits', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d2, plannedFor: day(-1) } })).status, 400, 'geçmiş gün');
  assert.equal((await api('/plasiyer/visits', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d2, plannedFor: '07.11.2026' } })).status, 400);
  assert.equal((await api('/plasiyer/visits', { token: T.tokens.admin, method: 'POST', body: { companyId: T.d2, plannedFor: day(1) } })).status, 403, 'yalnızca plasiyer');
});

test('ziyaret kaydı: planlı ziyaret yapıldı olur (konum, sonraki ziyaret); plansız ziyaret; doğrulama', { skip }, async () => {
  const body = { visitId: T.plan1, result: 'ORDER', note: '3 koli silikon istedi', lat: 41.0082, lng: 28.9784, accuracy: 18.6, nextVisitOn: day(7) };
  assert.equal((await api('/plasiyer/visits/check-in', { token: T.tokens.p2, method: 'POST', body })).status, 404, 'başkasının planı');
  const r = await api('/plasiyer/visits/check-in', { token: T.tokens.p1, method: 'POST', body });
  assert.equal(r.status, 201, r.data?.message);
  assert.match(r.data.message, /sonraki ziyaret planlandı/);
  assert.deepEqual([r.data.visit.status, r.data.visit.result, r.data.visit.lat, r.data.visit.lng, r.data.visit.accuracy, r.data.visit.note], ['DONE', 'ORDER', 41.0082, 28.9784, 19, '3 koli silikon istedi']);
  assert.equal(localDay(r.data.next.plannedFor), day(7));
  assert.equal((await api('/plasiyer/visits/check-in', { token: T.tokens.p1, method: 'POST', body })).status, 404, 'aynı plan ikinci kez');

  const free = await api('/plasiyer/visits/check-in', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d2, result: 'NO_CONTACT' } });
  assert.equal(free.status, 201);
  assert.equal(free.data.visit.lat, null, 'konum isteğe bağlı');
  assert.equal((await api('/plasiyer/visits/check-in', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d2, result: 'GITTIM' } })).status, 400);
  assert.equal((await api('/plasiyer/visits/check-in', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d2, result: 'INFO', lat: 120, lng: 30 } })).status, 400);
  assert.equal((await api('/plasiyer/visits/check-in', { token: T.tokens.p1, method: 'POST', body: { companyId: T.d3, result: 'INFO' } })).status, 404);
});

test('plasiyer listesi: ziyaretler ve bayi kartında son / sıradaki ziyaret; plan iptali', { skip }, async () => {
  const mine = await api('/plasiyer/visits', { token: T.tokens.p1 });
  assert.equal(mine.data.today, day(0));
  assert.deepEqual(mine.data.visits.map((v) => [v.company.name, v.status]).sort(), [['Akın Yapı', 'DONE'], ['Akın Yapı', 'PLANNED'], ['Bora Market', 'DONE']]);
  assert.equal(mine.data.results.ORDER, 'Sipariş alındı');
  const dealers = (await api('/plasiyer/dealers', { token: T.tokens.p1 })).data;
  const d1 = dealers.find((d) => d.id === T.d1);
  assert.ok(d1.lastVisitAt);
  assert.equal(localDay(d1.nextVisitOn), day(7));
  assert.equal(dealers.find((d) => d.id === T.d2).nextVisitOn, null);

  const next = mine.data.visits.find((v) => v.status === 'PLANNED');
  assert.equal((await api(`/plasiyer/visits/${next.id}/cancel`, { token: T.tokens.p2, method: 'POST' })).status, 404);
  assert.equal((await api(`/plasiyer/visits/${next.id}/cancel`, { token: T.tokens.p1, method: 'POST' })).status, 200);
  assert.equal((await P(() => prisma.visit.findUnique({ where: { id: next.id } }))).status, 'CANCELLED');
});

test('yönetim raporu: plasiyer özeti, ziyaret edilmeyen bayiler, filtre ve yetki', { skip }, async () => {
  // Cem Ticaret'e 40 gün önce gidilmiş: hâlâ "ziyaret edilmeyen"; Bora'ya bugün gidildi
  await P(() => prisma.visit.create({ data: { tenantId: T.id, userId: T.p2, companyId: T.d3, status: 'DONE', result: 'INFO', doneAt: new Date(Date.now() - 40 * 864e5) } }));
  assert.equal((await api('/visits', { token: T.tokens.clerk })).status, 403);
  assert.equal((await api('/visits', { token: T.tokens.p1 })).status, 403);
  const r = await api('/visits', { token: T.tokens.admin });
  assert.equal(r.status, 200, r.data?.message);
  const ali = r.data.summary.find((p) => p.id === T.p1);
  assert.deepEqual([ali.done, ali.visitedDealers, ali.dealers, ali.byResult.ORDER, ali.byResult.NO_CONTACT], [2, 2, 2, 1, 1]);
  const veli = r.data.summary.find((p) => p.id === T.p2);
  assert.deepEqual([veli.done, veli.dealers], [0, 1], '40 gün önceki ziyaret varsayılan 30 günlük aralıkta değil');
  assert.deepEqual(r.data.stale.map((d) => d.name), ['Cem Ticaret']);
  assert.equal(r.data.stale[0].plasiyer, 'Veli Saha');

  const only = await api(`/visits?userId=${T.p2}&from=${day(-60)}&to=${day(0)}`, { token: T.tokens.admin });
  assert.deepEqual(only.data.summary.map((p) => p.name), ['Veli Saha']);
  assert.deepEqual(only.data.visits.map((v) => v.company.name), ['Cem Ticaret']);
  assert.equal(only.data.visits[0].resultLabel, 'Bilgilendirme / tanıtım');
});
