/**
 * Google ile giriş: başlatma → Google (taklit token ucu) → dönüş → bilet → oturum.
 * Firma girişi ve ortak giriş (/giris), tek kullanımlık bilet, tarayıcı çerezi bağı, iptal / doğrulanmamış e-posta,
 * hesap eşleşmesi, iki aşamalı doğrulama, doğrulama bekleyen e-posta.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { execSync } from 'child_process';
import jwt from 'jsonwebtoken';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

let server, base, prisma, runAsPlatform, purgeTenant, mock;
const T = {};
const codes = new Map(); // taklit Google: yetki kodu → kimlik belirtecindeki bilgiler

const startGoogleMock = () => new Promise((resolve) => {
  const calls = [];
  const s = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = Object.fromEntries(new URLSearchParams(raw));
      calls.push(body);
      const claims = codes.get(body.code);
      res.writeHead(claims && body.client_secret === 'test-secret' ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(claims && body.client_secret === 'test-secret'
        ? { access_token: 'x', id_token: jwt.sign(claims, 'google-imzasi-kontrol-edilmez') }
        : { error: 'invalid_grant', error_description: 'Bad Request' }));
    });
  });
  s.listen(0, '127.0.0.1', () => resolve({ server: s, calls, url: `http://127.0.0.1:${s.address().port}/token` }));
});

let seq = 0;
// Tarayıcının yapacağı yolculuk: başlat → (Google'da hesap seçimi) → dönüş adresi; dönen sayfa adresi ve # parçası
const google = async ({ portal, claims = {}, cookie = true, error } = {}) => {
  const start = await fetch(`${base}/api/public/google/start${portal ? `?portal=${portal}` : ''}`, { redirect: 'manual' });
  const to = new URL(start.headers.get('location'));
  if (to.hostname !== 'accounts.google.com') return { start, target: to.href, hash: new URLSearchParams(to.hash.slice(1)) };
  const code = `kod-${++seq}`;
  codes.set(code, { iss: 'https://accounts.google.com', aud: CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, nonce: to.searchParams.get('nonce'), email_verified: true, ...claims });
  const query = error ? `error=${error}` : `code=${code}`;
  const back = await fetch(`${base}/api/public/google/callback?${query}&state=${encodeURIComponent(to.searchParams.get('state'))}`, {
    redirect: 'manual', headers: cookie ? { Cookie: start.headers.getSetCookie()[0].split(';')[0] } : {}
  });
  const target = back.headers.get('location');
  return { start, to, target, hash: new URLSearchParams(new URL(target).hash.slice(1)) };
};

const post = (path, body, tenant) => fetch(`${base}/api${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(tenant && { 'X-Tenant': tenant }) }, body: JSON.stringify(body)
}).then(async (r) => ({ status: r.status, body: await r.json() }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const { default: app } = await import('../../src/app.js');
  mock = await startGoogleMock();

  const plan = await runAsPlatform(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  for (const slug of ['gtest-a', 'gtest-b']) {
    await runAsPlatform(async () => { const old = await prisma.tenant.findUnique({ where: { slug } }); if (old) await purgeTenant(old.id); });
  }
  const mkTenant = (slug, name) => runAsPlatform(() => prisma.tenant.create({
    data: { slug, name, contactEmail: `info@${slug}.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) }
  }));
  const a = await mkTenant('gtest-a', 'Google Test A');
  const b = await mkTenant('gtest-b', 'Google Test B');
  T.a = a.id;
  await runAsPlatform(async () => {
    const user = (tenantId, email, role, extra = {}) => prisma.user.create({ data: { tenantId, email, password: 'kullanilmaz', name: email.split('@')[0], role, emailVerifiedAt: new Date(), ...extra } });
    await user(a.id, 'yonetici@gmail.test', 'ADMIN', { isOwner: true });
    await user(a.id, 'iki@gmail.test', 'ADMIN', { twoFactorEnabled: true });
    await user(a.id, 'dogrulanmamis@gmail.test', 'ADMIN', { emailVerifiedAt: null, emailVerifyToken: 'x'.repeat(64) });
    const company = await prisma.company.create({ data: { tenantId: a.id, name: 'Bayi A', taxNumber: '2222222222', status: 'ACTIVE' } });
    await user(a.id, 'bayi@gmail.test', 'BAYI', { companyId: company.id });
    // Aynı e-posta iki portalda: ortak girişte portal seçilir
    const companyB = await prisma.company.create({ data: { tenantId: b.id, name: 'Bayi B', taxNumber: '3333333333', status: 'ACTIVE' } });
    await user(b.id, 'bayi@gmail.test', 'BAYI', { companyId: companyB.id });
  });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  delete process.env.GOOGLE_CLIENT_ID;
  await runAsPlatform(async () => {
    for (const slug of ['gtest-a', 'gtest-b']) { const t = await prisma.tenant.findUnique({ where: { slug } }); if (t) await purgeTenant(t.id); }
  });
  server?.close();
  mock?.server.close();
  await prisma?.$disconnect();
});

test('ayar yoksa düğme gizli, başlatma giriş sayfasına hata koduyla döner', { skip }, async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  const site = await fetch(`${base}/api/tenant/public`, { headers: { 'X-Tenant': 'gtest-a' } }).then((r) => r.json());
  assert.equal(site.googleLogin, false);
  const r = await google({ portal: 'gtest-a' });
  assert.equal(r.target, 'http://gtest-a.localhost:5173/login#google_error=disabled');

  Object.assign(process.env, { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: 'test-secret', GOOGLE_TOKEN_URL: mock.url });
  assert.equal((await fetch(`${base}/api/tenant/public`, { headers: { 'X-Tenant': 'gtest-a' } }).then((x) => x.json())).googleLogin, true);
  assert.equal((await fetch(`${base}/api/public/site`).then((x) => x.json())).googleLogin, true);
});

test('başlatma: Google adresi ve tarayıcıya bağlayan çerez', { skip }, async () => {
  const start = await fetch(`${base}/api/public/google/start?portal=gtest-a`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const to = new URL(start.headers.get('location'));
  assert.equal(to.origin + to.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(to.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(to.searchParams.get('scope'), 'openid email profile');
  assert.match(to.searchParams.get('redirect_uri'), /\/api\/public\/google\/callback$/);
  const cookie = start.headers.getSetCookie()[0];
  assert.match(cookie, new RegExp(`^akis_g=${to.searchParams.get('nonce')};`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test('firma girişi: Google → bilet → oturum; bilet ikinci kez kullanılamaz', { skip }, async () => {
  const r = await google({ portal: 'gtest-a', claims: { email: 'Yonetici@Gmail.test', name: 'Yönetici' } });
  assert.ok(r.target.startsWith('http://gtest-a.localhost:5173/login#google='), r.target);
  const ticket = r.hash.get('google');

  const first = await post('/auth/google', { ticket }, 'gtest-a');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.token);
  assert.equal(first.body.user.role, 'ADMIN');
  assert.equal(mock.calls.at(-1).client_id, CLIENT_ID);

  const again = await post('/auth/google', { ticket }, 'gtest-a');
  assert.equal(again.status, 401);

  const log = await runAsPlatform(() => prisma.auditLog.findFirst({ where: { tenantId: T.a, action: 'Giriş yapıldı (Google)' } }));
  assert.ok(log, 'işlem kaydında Google girişi görünmeli');
});

test('bilet yalnızca başlatıldığı portalda geçer', { skip }, async () => {
  const forA = (await google({ portal: 'gtest-a', claims: { email: 'bayi@gmail.test' } })).hash.get('google');
  assert.equal((await post('/auth/google', { ticket: forA }, 'gtest-b')).status, 401);
  const forRoot = (await google({ claims: { email: 'bayi@gmail.test' } })).hash.get('google');
  assert.equal((await post('/auth/google', { ticket: forRoot }, 'gtest-a')).status, 401);
});

test('dönüş başka tarayıcıda açılırsa (çerez yok) ya da iptal edilirse giriş olmaz', { skip }, async () => {
  const other = await google({ portal: 'gtest-a', claims: { email: 'yonetici@gmail.test' }, cookie: false });
  assert.equal(other.target, 'http://gtest-a.localhost:5173/login#google_error=expired');
  const cancelled = await google({ portal: 'gtest-a', error: 'access_denied' });
  assert.equal(cancelled.target, 'http://gtest-a.localhost:5173/login#google_error=cancelled');
});

test('doğrulanmamış Google e-postası ve başka uygulamaya ait belirteç reddedilir', { skip }, async () => {
  const unverified = await google({ portal: 'gtest-a', claims: { email: 'yonetici@gmail.test', email_verified: false } });
  assert.equal(unverified.hash.get('google_error'), 'unverified');
  const wrongApp = await google({ portal: 'gtest-a', claims: { email: 'yonetici@gmail.test', aud: 'baska-uygulama' } });
  assert.equal(wrongApp.hash.get('google_error'), 'failed');
});

test('hesap yoksa açılmaz; iki aşamalı doğrulama yine istenir; bekleyen e-posta doğrulanır', { skip }, async () => {
  const none = await post('/auth/google', { ticket: (await google({ portal: 'gtest-a', claims: { email: 'yabanci@gmail.test' } })).hash.get('google') }, 'gtest-a');
  assert.equal(none.status, 401);
  assert.equal(none.body.code, 'GOOGLE_NO_ACCOUNT');
  assert.equal(none.body.email, 'yabanci@gmail.test');

  const twoFactor = await post('/auth/google', { ticket: (await google({ portal: 'gtest-a', claims: { email: 'iki@gmail.test' } })).hash.get('google') }, 'gtest-a');
  assert.equal(twoFactor.body.twoFactorRequired, true);
  assert.ok(twoFactor.body.challenge);
  assert.equal(twoFactor.body.token, undefined);

  const pending = await post('/auth/google', { ticket: (await google({ portal: 'gtest-a', claims: { email: 'dogrulanmamis@gmail.test' } })).hash.get('google') }, 'gtest-a');
  assert.equal(pending.status, 200, JSON.stringify(pending.body));
  const user = await runAsPlatform(() => prisma.user.findFirst({ where: { tenantId: T.a, email: 'dogrulanmamis@gmail.test' } }));
  assert.equal(user.emailVerifyToken, null);
  assert.ok(user.emailVerifiedAt);
});

test('ortak giriş: e-postanın kayıtlı olduğu portallar aktarım koduyla döner', { skip }, async () => {
  const r = await google({ claims: { email: 'bayi@gmail.test' } });
  assert.ok(r.target.startsWith('http://localhost:5173/giris#google='), r.target);
  const res = await post('/public/google/portals', { ticket: r.hash.get('google') });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.portals.map((p) => p.slug).sort(), ['gtest-a', 'gtest-b']);

  const portal = res.body.portals.find((p) => p.slug === 'gtest-b');
  const session = await post('/auth/handoff', { code: portal.code }, 'gtest-b');
  assert.equal(session.status, 200, JSON.stringify(session.body));
  assert.equal(session.body.user.role, 'BAYI');

  const none = await post('/public/google/portals', { ticket: (await google({ claims: { email: 'yabanci@gmail.test' } })).hash.get('google') });
  assert.equal(none.status, 404);
  assert.match(none.body.message, /yabanci@gmail\.test/);
});
