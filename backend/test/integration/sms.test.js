/**
 * SMS bildirimi (Netgsm, taklit sunucu): firma kendi hesabını bağlar, açar / kapatır; bilgiler şifreli; seçilen türdeki
 * bildirim cep telefonu olan ve kapatmamış kullanıcıya SMS olarak gider; Netgsm hatası SMS ayarlarında görünür.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { startNetgsmMock } from './netgsmMock.js';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'stest-a';

let server, base, prisma, runAsPlatform, purgeTenant, netgsm;
const T = { tokens: {} };
const GOOD = { username: '8501234567', password: 'dogru-sifre', header: 'TESTFIRMA' };

const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const until = async (fn, ms = 4000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return true;
  return false;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Gönderilen SMS'ler (numara → metin)
const smsTo = (phone) => netgsm.sent.flatMap((b) => b.messages.filter((m) => m.no === phone).map((m) => ({ ...m, header: b.msgheader, encoding: b.encoding })));
const order = () => api('/orders', { token: T.tokens.dealer, method: 'POST', body: { items: [{ productId: T.product, quantity: 1 }], paymentMethod: 'CURRENT_ACCOUNT', addressId: T.address } });
const approve = async (id) => {
  const o = await P(() => prisma.order.findUnique({ where: { id }, include: { items: true } }));
  return api(`/orders/${id}/partial-approve`, { token: T.tokens.admin, method: 'PATCH', body: { itemStatuses: o.items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) } });
};
const settings = (body) => api('/sms-settings', { token: T.tokens.admin, method: 'PUT', body });

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
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Deniz Toptan', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  T.adminId = (await user({ email: `admin@${SLUG}.test`, name: 'Yönetici', role: 'ADMIN', isOwner: true })).id;
  await user({ email: `clerk@${SLUG}.test`, name: 'Satış', role: 'ADMIN', permissions: ['ORDERS'] });
  T.company = (await P(() => prisma.company.create({ data: { tenantId, name: 'Kuzey Market', status: 'ACTIVE', riskLimit: 1_000_000, taxNumber: '3000000001' } }))).id;
  T.dealerId = (await user({ email: `bayi@${SLUG}.test`, name: 'Kuzey Market Yetkilisi', role: 'BAYI', companyId: T.company, isOwner: true })).id;
  T.address = (await P(() => prisma.deliveryAddress.create({ data: { tenantId, companyId: T.company, title: 'Merkez', contactName: 'Ali', phone: '0555', city: 'İzmir', district: 'Bornova', line: 'No:1', isDefault: true } }))).id;
  const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'Genel' } }));
  T.product = (await P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, name: 'Koli Bandı', sku: 'S-BANT', price: 50, stock: 1000, vatRate: 20, unit: 'Adet' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['admin', 'admin'], ['clerk', 'clerk'], ['dealer', 'bayi']]) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `${email}@${SLUG}.test`, password: 'Test12345' } });
    assert.equal(r.status, 200, `${email}: ${r.data?.message}`);
    T.tokens[k] = r.data.token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  netgsm?.server.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('SMS ayarları: yalnızca Ayarlar yetkilisi; bilgiler doğrulanır, şifreli saklanır, şifre geri dönmez; deneme SMS\'i', { skip }, async () => {
  assert.equal((await api('/sms-settings', { token: T.tokens.dealer })).status, 403);
  assert.equal((await api('/sms-settings', { token: T.tokens.clerk })).status, 403);
  const empty = await api('/sms-settings', { token: T.tokens.admin });
  assert.equal(empty.data.enabled, false);
  assert.equal(empty.data.configured, false);
  assert.deepEqual(empty.data.types, { dealer: ['ORDER', 'PAYMENT', 'PAYMENT_DUE'], staff: ['ORDER'] }, 'varsayılan türler');

  const wrong = await api('/sms-settings/headers', { token: T.tokens.admin, method: 'POST', body: { username: GOOD.username, password: 'yanlis' } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.message, /Kullanıcı adı \/ şifre hatalı/);
  const headers = await api('/sms-settings/headers', { token: T.tokens.admin, method: 'POST', body: { username: GOOD.username, password: GOOD.password } });
  assert.deepEqual(headers.data.headers, ['TESTFIRMA']);

  assert.equal((await settings({ enabled: true, username: GOOD.username, password: GOOD.password })).status, 400, 'gönderici adı şart');
  const saved = await settings({ enabled: true, ...GOOD, types: { dealer: ['ORDER', 'PAYMENT', 'HR'], staff: ['ORDER'] } });
  assert.equal(saved.status, 200, saved.data?.message);
  const tenant = await P(() => prisma.tenant.findUnique({ where: { id: T.id } }));
  assert.ok(tenant.smsConfigEnc && !tenant.smsConfigEnc.includes('dogru-sifre'), 'şifreli saklanır');
  const got = await api('/sms-settings', { token: T.tokens.admin });
  assert.equal(got.data.active, true);
  assert.equal(got.data.hasPassword, true);
  assert.ok(!JSON.stringify(got.data).includes('dogru-sifre'), 'şifre geri dönmez');
  assert.deepEqual(got.data.types.dealer, ['ORDER', 'PAYMENT'], 'izin verilmeyen tür (HR) atılır');

  assert.equal((await api('/sms-settings/test', { token: T.tokens.admin, method: 'POST', body: { phone: '12345' } })).status, 400);
  const sent = await api('/sms-settings/test', { token: T.tokens.admin, method: 'POST', body: { phone: '0555 123 45 67' } }); // şifre kayıtlıdan
  assert.equal(sent.status, 200, sent.data?.message);
  const [msg] = smsTo('5551234567');
  assert.equal(msg.header, 'TESTFIRMA');
  assert.equal(msg.encoding, 'TR');
  assert.match(msg.msg, /^Deniz Toptan: /);
});

test('cep telefonu: profilde ve bayi kullanıcılarında biçimi düzeltilir, geçersizi reddedilir; SMS tercihleri firmanın açtığı türler', { skip }, async () => {
  const me = await api('/auth/notification-prefs', { token: T.tokens.dealer, method: 'PUT', body: { phone: '+90 (532) 111 22 33' } });
  assert.equal(me.status, 200, me.data?.message);
  assert.equal(me.data.phone, '5321112233');
  assert.equal((await api('/auth/notification-prefs', { token: T.tokens.dealer, method: 'PUT', body: { phone: '0212 444 55 66' } })).status, 400, 'sabit hat olmaz');
  const prefs = await api('/auth/notification-prefs', { token: T.tokens.dealer });
  assert.equal(prefs.data.sms.available, true);
  assert.deepEqual(prefs.data.sms.types.map((t) => t.id), ['ORDER', 'PAYMENT']);
  assert.deepEqual(prefs.data.sms.prefs, { ORDER: true, PAYMENT: true });
  assert.ok(prefs.data.prefs.ORDER !== undefined, 'e-posta tercihleri aynen');

  const added = await api(`/companies/${T.company}/users`, { token: T.tokens.admin, method: 'POST', body: { name: 'Şube', email: `sube@${SLUG}.test`, phone: '0532 999 88 77' } });
  assert.equal(added.status, 201, added.data?.message);
  assert.equal(added.data.user.phone, '5329998877');
  T.branchId = added.data.user.id;
  assert.equal((await api(`/team/my-company/${T.branchId}`, { token: T.tokens.dealer, method: 'PATCH', body: { phone: 'abc' } })).status, 400);
  assert.equal((await api(`/team/my-company/${T.branchId}`, { token: T.tokens.dealer, method: 'PATCH', body: { phone: '' } })).status, 200);
  assert.equal((await P(() => prisma.user.findUnique({ where: { id: T.branchId } }))).phone, null, 'boş bırakılınca silinir');
});

test('bildirim SMS\'i: seçilen türde, telefonu olan ve kapatmayan kullanıcıya; kapalıyken, kullanıcı kapatınca, tür seçilmemişken gitmez', { skip }, async () => {
  await api('/auth/notification-prefs', { token: T.tokens.admin, method: 'PUT', body: { phone: '5051234567' } });

  // Yeni sipariş → yöneticiye (ekip: ORDER açık), onay → bayiye; telefonu olmayan şube kullanıcısına gitmez
  const o = await order();
  assert.equal(o.status, 201, o.data?.message);
  assert.ok(await until(() => smsTo('5051234567').length === 1), 'yöneticiye yeni sipariş SMS\'i');
  assert.match(smsTo('5051234567')[0].msg, new RegExp(`Deniz Toptan: Yeni sipariş\\. .*#AK-${o.data.id}.* http://${SLUG}\\.`));
  assert.ok((await approve(o.data.id)).status === 200);
  assert.ok(await until(() => smsTo('5321112233').length === 1), 'bayiye onay SMS\'i');
  assert.ok(smsTo('5321112233')[0].msg.includes(`/bayi/orders`), 'bağlantı siparişlere gider');
  assert.ok(smsTo('5321112233')[0].msg.length <= 300, 'en fazla 2 boy');

  // Bayi sipariş SMS'ini kapatır → onayda bayiye gitmez (yöneticiye yeni sipariş yine gider)
  await api('/auth/notification-prefs', { token: T.tokens.dealer, method: 'PUT', body: { smsPrefs: { ORDER: false } } });
  const o2 = await order();
  assert.ok(await until(() => smsTo('5051234567').length === 2));
  await approve(o2.data.id);
  await sleep(1000);
  assert.equal(smsTo('5321112233').length, 1, 'kullanıcı kapattı');

  // Firma ekibe sipariş SMS'ini kapatır (tür seçilmemiş) → yöneticiye gitmez
  await settings({ enabled: true, types: { dealer: ['ORDER'], staff: [] } });
  await order();
  await sleep(1000);
  assert.equal(smsTo('5051234567').length, 2, 'tür seçilmemiş');

  // SMS kapalı → hiç gitmez; bilgiler durur, yeniden açılabilir
  await settings({ enabled: false, types: { dealer: ['ORDER'], staff: ['ORDER'] } });
  await order();
  await sleep(1000);
  assert.equal(smsTo('5051234567').length, 2, 'kapalı');
  const off = await api('/sms-settings', { token: T.tokens.admin });
  assert.equal(off.data.configured, true);
  assert.equal(off.data.active, false);
  assert.equal((await api('/auth/notification-prefs', { token: T.tokens.dealer })).data.sms.available, false);
});

test('Netgsm hatası SMS ayarlarında görünür; bağlantı kaldırılınca bilgiler silinir', { skip }, async () => {
  await settings({ enabled: true, header: 'ONAYSIZ', types: { dealer: [], staff: ['ORDER'] } }); // hesapta tanımsız başlık
  const before = netgsm.sent.length;
  await order();
  assert.ok(await until(async () => (await api('/sms-settings', { token: T.tokens.admin })).data.stats.failed > 0), 'hata kaydı');
  assert.equal(netgsm.sent.length, before);
  const s = await api('/sms-settings', { token: T.tokens.admin });
  assert.match(s.data.stats.lastError.message, /Gönderici adı/);
  assert.ok(s.data.stats.sent >= 4);
  assert.equal(s.data.phones.staff, 1);

  assert.equal((await settings({ disconnect: true })).status, 200);
  const gone = await api('/sms-settings', { token: T.tokens.admin });
  assert.equal(gone.data.configured, false);
  assert.equal(gone.data.enabled, false);
});
