/**
 * Kimlik doğrulama sertleştirmeleri:
 *   - Oturum belirteci: imzasız (alg none), yanlış anahtarla, süresi dolmuş, içeriği değiştirilmiş belirteç reddedilir;
 *     2FA / giriş aktarımı biletleri oturum yerine geçmez.
 *   - Hesap başına hatalı giriş kilidi: 10 hatalı denemeden sonra doğru şifre de 15 dk reddedilir; diğer hesap etkilenmez.
 *   - Yöneticinin şifre sıfırlaması açık oturumları kapatır; firma sahibinin şifresini sahibi olmayan sıfırlayamaz.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'kimlik-a';

let server, base, prisma, runAsPlatform, purgeTenant, JWT_SECRET, issueChallenge, issueHandoff, hashApiKey;
const T = {};
const P = (fn) => runAsPlatform(fn);
const api = (path, { token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  ({ JWT_SECRET } = await import('../../src/config.js'));
  ({ issueChallenge } = await import('../../src/services/twoFactorService.js'));
  ({ issueHandoff } = await import('../../src/services/loginHandoff.js'));
  ({ hashApiKey } = await import('../../src/middlewares/apiKeyAuth.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Dogru12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const t = T.tenant = (await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Kimlik A', contactEmail: 'a@kimlik.test', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }))).id;
  const mk = (email, extra) => P(() => prisma.user.create({ data: { tenantId: t, email, password, name: email.split('@')[0], role: 'ADMIN', emailVerifiedAt: new Date(), ...extra } }));
  T.owner = await mk('sahip@kimlik.test', { isOwner: true });
  T.settings = await mk('ayar@kimlik.test', { isOwner: false, permissions: ['SETTINGS'] });
  T.member = await mk('uye@kimlik.test', { isOwner: false, permissions: ['ORDERS'] });
  T.victim = await mk('hedef@kimlik.test', { isOwner: false, permissions: ['ORDERS'] });
  T.other = await mk('diger@kimlik.test', { isOwner: false, permissions: ['ORDERS'] });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  // Oturum belirteçleri gerçek girişle alınır (iat, giriş anı)
  const login = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: 'Dogru12345' } })).data.token;
  T.ownerToken = await login('sahip@kimlik.test');
  T.settingsToken = await login('ayar@kimlik.test');
  T.memberToken = await login('uye@kimlik.test');
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.tenant) await purgeTenant(T.tenant).catch(() => {});
  await prisma.$disconnect();
});

test('oturum belirteci: imzasız, yanlış anahtar, süresi dolmuş, değiştirilmiş ve başka tür biletler reddedilir', { skip }, async () => {
  const claims = { id: T.owner.id, role: 'ADMIN', companyId: null, tenantId: T.tenant };
  assert.equal((await api('/auth/me', { token: T.ownerToken })).status, 200);

  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, iat: Math.floor(Date.now() / 1000) })}.`;
  assert.equal((await api('/auth/me', { token: none })).status, 401, 'alg none');
  assert.equal((await api('/auth/me', { token: jwt.sign(claims, 'baska-anahtar') })).status, 401, 'yanlış anahtar');
  assert.equal((await api('/auth/me', { token: jwt.sign(claims, JWT_SECRET, { algorithm: 'HS512' }) })).status, 401, 'HS256 dışı algoritma');
  assert.equal((await api('/auth/me', { token: jwt.sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }, JWT_SECRET) })).status, 401, 'süresi dolmuş');

  // Üye belirtecinin içeriği sahibin numarasıyla değiştirilir, imza aynı kalır
  const [h, , s] = T.memberToken.split('.');
  const forged = `${h}.${b64({ ...jwt.decode(T.memberToken), id: T.owner.id })}.${s}`;
  assert.equal((await api('/auth/me', { token: forged })).status, 401, 'değiştirilmiş içerik');

  // 2FA bileti ve giriş aktarım kodu aynı anahtarla imzalı ama oturum değildir
  assert.equal((await api('/auth/me', { token: issueChallenge({ id: T.owner.id, tenantId: T.tenant }) })).status, 401, '2FA bileti');
  assert.equal((await api('/auth/me', { token: issueHandoff({ id: T.owner.id, tenantId: T.tenant }) })).status, 401, 'giriş aktarım kodu');
  // Numarası olmayan / tür alanı taşıyan belirteç
  assert.equal((await api('/auth/me', { token: jwt.sign({ ...claims, typ: 'login-handoff' }, JWT_SECRET) })).status, 401);
  assert.equal((await api('/auth/me', { token: jwt.sign({ ...claims, id: String(T.owner.id) }, JWT_SECRET) })).status, 401);
});

test('hesap başına hatalı giriş kilidi: 10 hatadan sonra doğru şifre de reddedilir, diğer hesap girer', { skip }, async () => {
  for (let i = 0; i < 10; i++) {
    const r = await api('/auth/login', { method: 'POST', body: { email: 'hedef@kimlik.test', password: `yanlis${i}` } });
    assert.equal(r.status, 401);
  }
  const locked = await api('/auth/login', { method: 'POST', body: { email: 'HEDEF@kimlik.test ', password: 'Dogru12345' } });
  assert.equal(locked.status, 429);
  assert.match(locked.data.message, /15 dakika/);
  assert.equal((await api('/auth/login', { method: 'POST', body: { email: 'diger@kimlik.test', password: 'Dogru12345' } })).status, 200);
  // Olmayan hesap da aynı yanıtı alır (e-posta kayıtlı mı anlaşılmaz)
  const ghost = await api('/auth/login', { method: 'POST', body: { email: 'yok@kimlik.test', password: 'x' } });
  assert.equal(ghost.status, 401);
  assert.equal(ghost.data.message, 'Geçersiz e-posta veya şifre.');
});

test('yönetici şifre sıfırlaması açık oturumu kapatır; sahibin şifresini sahibi olmayan sıfırlayamaz', { skip }, async () => {
  assert.equal((await api('/auth/me', { token: T.memberToken })).status, 200);
  await new Promise((r) => setTimeout(r, 1100)); // oturum belirteci saniye hassasiyetinde (iat)
  const reset = await api(`/team/admins/${T.member.id}/reset-password`, { token: T.settingsToken, method: 'POST' });
  assert.equal(reset.status, 200, reset.data?.message);
  assert.equal(reset.data.password, undefined, 'yeni şifre yanıtta dönmez (yalnızca kişinin e-postasına gider)');
  const after = await api('/auth/me', { token: T.memberToken });
  assert.equal(after.status, 401);

  const owner = await api(`/team/admins/${T.owner.id}/reset-password`, { token: T.settingsToken, method: 'POST' });
  assert.equal(owner.status, 403);
  assert.equal((await api('/auth/me', { token: T.ownerToken })).status, 200);
});

test('girdi doğrulaması ve yanıt başlıkları: geçersiz parametre 400, bilinmeyen adres JSON 404, API yanıtı önbelleğe alınmaz', { skip }, async () => {
  const key = 'akb2b_kimlikTestAnahtari0123456789abcdef';
  await P(() => prisma.apiKey.create({ data: { tenantId: T.tenant, name: 'test', isTest: false, prefix: key.slice(0, 12), keyHash: hashApiKey(key) } }));
  const erp = (path) => fetch(`${base}/api/v1${path}`, { headers: { 'X-API-Key': key } }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
  // OWASP ZAP taramasında 500 dönenler (12 Kasım)
  assert.equal((await erp('/products?updatedSince=updatedSince')).status, 400);
  assert.match((await erp('/orders?since=dun')).data.message, /since geçerli bir tarih/);
  assert.equal((await erp('/orders/1697073157907137540')).status, 400);
  assert.equal((await erp('/companies?page=4446942665819272109.owasp.org&limit=100')).status, 200);
  assert.equal((await erp('/products?updatedSince=2026-11-01')).status, 200);

  const unknown = await fetch(`${base}/api/yok-boyle-bir-uc`, { headers: { 'X-Tenant': SLUG } });
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /application\/json/);
  const outside = await fetch(`${base}/latest/meta-data/`, { method: 'PUT' });
  assert.equal(outside.status, 404);
  assert.match(outside.headers.get('content-type'), /application\/json/);

  const me = await fetch(`${base}/api/auth/me`, { headers: { 'X-Tenant': SLUG, Authorization: `Bearer ${T.ownerToken}` } });
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.equal(me.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(me.headers.get('x-powered-by'), null);
});
