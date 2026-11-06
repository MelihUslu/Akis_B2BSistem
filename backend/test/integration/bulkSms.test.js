/**
 * Toplu SMS (Netgsm taklidi): "Toplu SMS" yetkisi; bayi, bayi olmayan müşteri carisi ve müşteri adayı süzülür, seçilir;
 * numaralar kayıtlardan çözülür (yalnızca cep, aynı numaraya bir kez); kişiselleştirme; ticaride İYS süzgeci
 * (cari tacir 12, aday bireysel 11) ve ret metni; Netgsm hatası ve geçmiş.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { startNetgsmMock } from './netgsmMock.js';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'bsms-a';

let server, base, prisma, runAsPlatform, purgeTenant, netgsm;
const T = { tokens: {} };
const SMS = { username: '8501234567', password: 'dogru-sifre', header: 'TESTFIRMA', types: { dealer: ['ORDER'], staff: [] } };

const api = (path, { token = T.tokens.staff, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const send = (body) => api('/bulk-sms/send', { method: 'POST', body });
const settings = (extra = {}) => api('/sms-settings', { token: T.tokens.admin, method: 'PUT', body: { enabled: true, ...SMS, ...extra } });
const lastRequests = (n) => netgsm.sent.slice(-n);

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  netgsm = await startNetgsmMock();
  process.env.NETGSM_API_URL = netgsm.url;
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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Ege Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true });
  await user({ email: `clerk@${SLUG}.test`, name: 'Sipariş', role: 'ADMIN', permissions: ['ORDERS'] });
  await user({ email: `staff@${SLUG}.test`, name: 'Pazarlama', role: 'ADMIN', permissions: ['SMS'] });
  const company = (data) => P(() => prisma.company.create({ data: { tenantId, status: 'ACTIVE', ...data } }));
  T.dealerA = (await company({ name: 'Alfa Bayi', taxNumber: '4000000001', phone: '0212 444 55 66' })).id;
  await user({ email: `a1@${SLUG}.test`, name: 'Ayşe Alfa', role: 'BAYI', companyId: T.dealerA, isOwner: true, phone: '5321111111' });
  await user({ email: `a2@${SLUG}.test`, name: 'Ali Alfa', role: 'BAYI', companyId: T.dealerA, phone: '5322222222' });
  await P(() => prisma.companyContact.create({ data: { tenantId, companyId: T.dealerA, name: 'Muhasebe', phone: '0533 333 33 33' } }));
  T.dealerB = (await company({ name: 'Beta Bayi', taxNumber: '4000000002' })).id;
  T.dealerC = (await company({ name: 'Pasif Bayi', taxNumber: '4000000003', status: 'PASSIVE', phone: '05399999999' })).id;
  T.custX = (await company({ name: 'Xenon Market', kind: 'CUSTOMER', phone: '0544 444 44 44', authorizedPerson: 'Xavier', tags: ['İstanbul'], currentBalance: -1500 })).id;
  T.custY = (await company({ name: 'Yıldız Gıda', kind: 'CUSTOMER', tags: ['Ankara'] })).id;
  await P(() => prisma.companyContact.create({ data: { tenantId, companyId: T.custY, name: 'Yasemin', phone: '05455555555', isPrimary: true } }));
  const lead = (data) => P(() => prisma.customerLead.create({ data: { tenantId, ...data } }));
  T.lead1 = (await lead({ name: 'Leyla Aday', phone: '0546 666 66 66', source: 'INSTAGRAM', status: 'NEW' })).id;
  T.lead2 = (await lead({ name: 'Aynı Numara', phone: '5321111111', source: 'FORM', status: 'CONTACTED' })).id;
  T.lead3 = (await lead({ name: 'Sabit Hat', phone: '0232 111 22 33', status: 'LOST' })).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const k of ['admin', 'clerk', 'staff']) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `${k}@${SLUG}.test`, password: 'Test12345' } });
    assert.equal(r.status, 200, `${k}: ${r.data?.message}`);
    T.tokens[k] = r.data.token;
  }
  assert.equal((await settings()).status, 200);
});

after(async () => {
  if (skip) return;
  server?.close();
  netgsm?.server.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('yetki ve seçenekler: yalnızca Toplu SMS yetkilisi; etiketler ve aday durumları gelir', { skip }, async () => {
  assert.equal((await api('/bulk-sms/meta', { token: T.tokens.clerk })).status, 403);
  const meta = await api('/bulk-sms/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.data.active, true);
  assert.deepEqual(meta.data.tags, ['Ankara', 'İstanbul']);
  assert.ok(meta.data.leadStatuses.NEW && meta.data.leadSources.INSTAGRAM);
  assert.equal(meta.data.optOut, '');
});

test('alıcılar: yalnızca cep numaraları (önce kullanıcılar, sonra yetkililer), pasif bayi yok; süzgeçler', { skip }, async () => {
  const dealers = await api('/bulk-sms/recipients?source=DEALER');
  const a = dealers.data.rows.find((r) => r.id === T.dealerA);
  assert.deepEqual(a.phones, ['5321111111', '5322222222', '5333333333'], 'sabit hat yok');
  assert.equal(a.contact, 'Ayşe Alfa', 'ana kullanıcı');
  assert.deepEqual(dealers.data.rows.find((r) => r.id === T.dealerB).phones, []);
  assert.ok(!dealers.data.rows.some((r) => r.id === T.dealerC), 'pasif bayi listelenmez');
  assert.equal(dealers.data.withPhone, 1);

  const ist = await api(`/bulk-sms/recipients?source=CUSTOMER&tag=${encodeURIComponent('İstanbul')}`);
  assert.deepEqual(ist.data.rows.map((r) => r.id), [T.custX]);
  assert.deepEqual(ist.data.rows[0].phones, ['5444444444']);
  assert.deepEqual((await api('/bulk-sms/recipients?source=CUSTOMER&debtOnly=true')).data.rows.map((r) => r.id), [T.custX]);
  assert.equal((await api('/bulk-sms/recipients?source=CUSTOMER&noOrderDays=30')).data.rows.length, 2, 'hiç siparişi olmayanlar da');

  const leads = await api('/bulk-sms/recipients?source=LEAD&status=NEW');
  assert.deepEqual(leads.data.rows.map((r) => r.id), [T.lead1]);
  assert.deepEqual((await api('/bulk-sms/recipients?source=LEAD')).data.rows.find((r) => r.id === T.lead3).phones, [], 'sabit hat');
});

test('bilgilendirme: İYS süzgeci yok; kişiselleştirilir; firma başına bir numara; aynı numaraya bir kez; geçmişe yazılır', { skip }, async () => {
  const keys = [`D:${T.dealerA}`, `D:${T.dealerB}`, `C:${T.custX}`, `C:${T.custY}`, `L:${T.lead1}`, `L:${T.lead2}`];
  const res = await send({ kind: 'INFO', text: 'Sayın {yetkili}, {ad}: 1-3 Nisan depomuz kapalı. Bakiye: {bakiye}', keys });
  assert.equal(res.status, 201, res.data?.message);
  assert.equal(res.data.campaign.total, 4, 'Beta numarasız, aday 2 Alfa ile aynı numara');
  const [req] = lastRequests(1);
  assert.equal(req.iysfilter, undefined);
  const byNo = Object.fromEntries(req.messages.map((m) => [m.no, m.msg]));
  assert.deepEqual(Object.keys(byNo).sort(), ['5321111111', '5444444444', '5455555555', '5466666666']);
  assert.match(byNo['5321111111'], /^Sayın Ayşe Alfa, Alfa Bayi: 1-3 Nisan/);
  assert.match(byNo['5444444444'], /Sayın Xavier, Xenon Market: .*1\.500,00.* borç$/);
  assert.match(byNo['5466666666'], /^Sayın Leyla Aday, Leyla Aday:/);

  const all = await send({ kind: 'INFO', text: 'Duyuru', keys: [`D:${T.dealerA}`], allNumbers: true });
  assert.equal(all.data.campaign.total, 3, 'bütün numaralar');

  const list = await api('/bulk-sms/campaigns');
  assert.equal(list.data[1].total, 4);
  assert.equal(list.data[1].createdBy.name, 'Pazarlama');
  const detail = await api(`/bulk-sms/campaigns/${list.data[1].id}`);
  assert.deepEqual(detail.data.recipients.map((r) => r.source).sort(), ['CUSTOMER', 'CUSTOMER', 'DEALER', 'LEAD']);
  assert.ok(detail.data.recipients.every((r) => r.ok));
});

test('ticari: ret metni şart; cari tacir (12), aday bireysel (11) ayrı istekte; ret metni eklenir', { skip }, async () => {
  const noOptOut = await send({ kind: 'COMMERCIAL', text: 'Kampanya', keys: [`D:${T.dealerA}`] });
  assert.equal(noOptOut.status, 400);
  assert.match(noOptOut.data.message, /ret metni/);
  assert.equal((await settings({ optOutText: 'Ret: RET yazip 3434e gonderin B001' })).status, 200);
  assert.equal((await api('/sms-settings', { token: T.tokens.admin })).data.optOut, 'Ret: RET yazip 3434e gonderin B001');

  const before = netgsm.sent.length;
  const res = await send({ kind: 'COMMERCIAL', text: '{ad}: %10 indirim bu hafta!', keys: [`D:${T.dealerA}`, `C:${T.custX}`, `L:${T.lead1}`] });
  assert.equal(res.status, 201, res.data?.message);
  const reqs = netgsm.sent.slice(before);
  assert.deepEqual(reqs.map((r) => r.iysfilter), ['12', '11']);
  assert.deepEqual(reqs[0].messages.map((m) => m.no).sort(), ['5321111111', '5444444444']);
  assert.deepEqual(reqs[1].messages.map((m) => m.no), ['5466666666']);
  assert.ok([...reqs[0].messages, ...reqs[1].messages].every((m) => m.msg.endsWith(' Ret: RET yazip 3434e gonderin B001')));
});

test('doğrulama, Netgsm hatası ve kapalı SMS', { skip }, async () => {
  assert.equal((await send({ kind: 'INFO', text: '   ', keys: [`D:${T.dealerA}`] })).status, 400);
  assert.equal((await send({ kind: 'INFO', text: 'x'.repeat(901), keys: [`D:${T.dealerA}`] })).status, 400);
  assert.equal((await send({ kind: 'INFO', text: 'Merhaba', keys: [] })).status, 400);
  assert.match((await send({ kind: 'INFO', text: 'Merhaba', keys: [`D:${T.dealerB}`] })).data.message, /cep telefonu yok/);

  assert.equal((await settings({ header: 'ONAYSIZ' })).status, 200);
  const failed = await send({ kind: 'INFO', text: 'Merhaba', keys: [`D:${T.dealerA}`, `C:${T.custX}`] });
  assert.equal(failed.status, 502);
  assert.match(failed.data.message, /Gönderici adı/);
  assert.equal(failed.data.campaign.failed, 2);
  const detail = await api(`/bulk-sms/campaigns/${failed.data.campaign.id}`);
  assert.ok(detail.data.recipients.every((r) => !r.ok && /Gönderici adı/.test(r.error)));

  assert.equal((await settings({ enabled: false })).status, 200);
  const off = await send({ kind: 'INFO', text: 'Merhaba', keys: [`D:${T.dealerA}`] });
  assert.equal(off.status, 400);
  assert.match(off.data.message, /SMS kapalı/);
});
