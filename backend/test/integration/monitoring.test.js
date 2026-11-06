/**
 * Platform izleme: istek metrikleri, ERP API istek kaydı, arka plan işi ve dış servis kaydı, platform uçları.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';

let server, base, prisma, runAsPlatform, purgeTenant, monitoring, platformToken;
const T = {};
// Her çalıştırmada farklı ad: önceki çalıştırmaların kayıtları sayıları etkilemesin
const JOB = `itest-iş-${Date.now()}`;
const SVC = `itest-servis-${Date.now()}`;

const api = (path, { tenant, token, method = 'GET', body, headers = {} } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(tenant && { 'X-Tenant': tenant }), ...(token && { Authorization: `Bearer ${token}` }), ...headers },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.PLATFORM_ALERT_EMAIL = '';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  monitoring = await import('../../src/services/monitoring.js');
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const jwt = (await import('jsonwebtoken')).default;

  const plan = await runAsPlatform(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  const password = await bcrypt.hash('Test12345', 4);
  const slug = 'mtest-a';
  await runAsPlatform(async () => {
    const old = await prisma.tenant.findUnique({ where: { slug } });
    if (old) await purgeTenant(old.id);
  });
  const tenant = await runAsPlatform(() => prisma.tenant.create({
    data: { slug, name: 'İzleme Test', contactEmail: `${slug}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) }
  }));
  await runAsPlatform(() => prisma.user.create({ data: { tenantId: tenant.id, email: `admin@${slug}.test`, password, name: 'Admin', role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() } }));
  T.id = tenant.id;
  const admin = await runAsPlatform(async () => (await prisma.user.findFirst({ where: { email: 'itest-platform@x.test', tenantId: null } }))
    || prisma.user.create({ data: { email: 'itest-platform@x.test', password, name: 'Platform Test', role: 'SUPER_ADMIN', tenantId: null } }));
  platformToken = jwt.sign({ id: admin.id, role: 'SUPER_ADMIN', tenantId: null }, process.env.JWT_SECRET, { expiresIn: '1h' });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  T.token = (await api('/auth/login', { tenant: slug, method: 'POST', body: { email: `admin@${slug}.test`, password: 'Test12345' } })).data.token;
});

after(async () => {
  if (skip) return;
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('istek metrikleri uç kalıbıyla toplanır, aynı dakikaya eklenen değerler birleşir', { skip }, async () => {
  await monitoring.flushMetrics(); // önceki testlerden kalanlar
  for (let i = 0; i < 3; i++) await api(`/orders/${900000 + i}`, { tenant: 'mtest-a', token: T.token });
  await api('/products', { tenant: 'mtest-a', token: T.token });
  await new Promise((r) => setTimeout(r, 50));
  await monitoring.flushMetrics();
  await api('/orders/123456', { tenant: 'mtest-a', token: T.token });
  await new Promise((r) => setTimeout(r, 50));
  await monitoring.flushMetrics();

  const rows = await prisma.$queryRaw`SELECT SUM("count")::int AS count, SUM("clientErrors")::int AS "clientErrors" FROM "RequestMetric" WHERE "route" = '/api/orders/:id' AND "minute" >= NOW() - INTERVAL '5 minutes'`;
  assert.ok(rows[0].count >= 4, JSON.stringify(rows));
  assert.ok(rows[0].clientErrors >= 4);
  const raw = await prisma.requestMetric.count({ where: { route: { contains: '900000' } } });
  assert.equal(raw, 0, 'ham yol değil kalıp saklanmalı');
});

test('ERP API istekleri firma, anahtar ve hata mesajıyla kaydedilir', { skip }, async () => {
  const key = (await api('/integrations/keys', { tenant: 'mtest-a', token: T.token, method: 'POST', body: { name: 'ERP izleme' } })).data.key;
  const v1 = (path, opts = {}) => fetch(`${base}/api/v1${path}`, { method: opts.method || 'GET', headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) });
  assert.equal((await v1('/products')).status, 200);
  const bad = await v1('/orders/999999');
  assert.equal(bad.status, 404);
  await new Promise((r) => setTimeout(r, 100));

  const logs = await prisma.apiRequestLog.findMany({ where: { tenantId: T.id }, orderBy: { id: 'asc' } });
  assert.equal(logs.length, 2);
  assert.equal(logs[0].apiKeyName, 'ERP izleme');
  assert.equal(logs[0].statusCode, 200);
  assert.equal(logs[1].statusCode, 404);
  assert.ok(logs[1].error, 'hata mesajı yakalanmalı');

  const list = await api(`/platform/monitoring/api-requests?tenantId=${T.id}&status=fail`, { token: platformToken });
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 1);
  assert.equal(list.data.rows[0].tenantName, 'İzleme Test');
});

test('arka plan işi ve dış servis: hata kaydedilir ve aynen fırlatılır', { skip }, async () => {
  const started = new Date();
  await assert.rejects(monitoring.trackJob(JOB, async () => { throw new Error('bozuk iş'); }), /bozuk iş/);
  assert.equal(await monitoring.trackJob(JOB, async () => 42), 42);
  const runs = await prisma.jobRun.findMany({ where: { name: JOB, startedAt: { gte: started } }, orderBy: { id: 'desc' } });
  assert.equal(runs.length, 2);
  assert.equal(runs[0].ok, true);
  assert.equal(runs[1].ok, false);
  assert.match(runs[1].error, /bozuk iş/);

  const err = Object.assign(new Error('kapalı'), { status: 503 });
  await assert.rejects(monitoring.trackExternal(SVC, 'ping', async () => { throw err; }), /kapalı/);
  await monitoring.trackExternal(SVC, 'ping', async () => 'ok');
  await new Promise((r) => setTimeout(r, 100));
  // Kayıt beklemeden yazıldığı için sıra garanti değil
  const calls = await prisma.externalCall.findMany({ where: { service: SVC, createdAt: { gte: started } } });
  assert.equal(calls.length, 2);
  assert.ok(calls.some((c) => c.ok));
  assert.equal(calls.find((c) => !c.ok).statusCode, 503);

  const o = await api('/platform/monitoring/overview?hours=1', { token: platformToken });
  assert.equal(o.status, 200);
  const job = o.data.jobs.find((j) => j.name === JOB);
  assert.equal(job.failures, 1);
  assert.equal(job.last.ok, true);
  const svc = o.data.external.find((e) => e.service === SVC);
  assert.equal(svc.failures, 1);
  assert.match(svc.lastError, /kapalı/);
  assert.ok(o.data.totals.requests > 0);

});

test('izleme uçları yalnızca platform yöneticisine açık', { skip }, async () => {
  assert.equal((await api('/platform/monitoring/overview')).status, 401);
  assert.equal((await api('/platform/monitoring/overview', { token: T.token })).status, 403);
});

test('günlük özet: sorunlar konu satırına ve metne yansır', { skip }, async () => {
  const { buildDigest } = await import('../../src/services/monitoringReport.js');
  const d = await buildDigest();
  assert.match(d.subject, /kontrol edilmesi gerekenler/); // itest-iş ve itest-servis hata verdi
  assert.ok(d.text.includes(JOB));
  assert.ok(d.text.includes(SVC));
});

test('bildirim temizliği: okunmuşlar 90, okunmamışlar 180 günde silinir; yeni ve tekrar anahtarlı olanlar kalır', { skip }, async () => {
  const { cleanupNotifications, NOTIFICATION_RETENTION_DAYS, UNREAD_NOTIFICATION_RETENTION_DAYS } = await import('../../src/services/notificationService.js');
  const user = await runAsPlatform(() => prisma.user.findFirst({ where: { tenantId: T.id } }));
  const old = new Date(Date.now() - (NOTIFICATION_RETENTION_DAYS + 1) * 86400000);
  const recent = new Date(Date.now() - (NOTIFICATION_RETENTION_DAYS - 1) * 86400000);
  const veryOld = new Date(Date.now() - (UNREAD_NOTIFICATION_RETENTION_DAYS + 1) * 86400000);
  const rows = {
    oldRead: { createdAt: old, isRead: true },
    oldUnread: { createdAt: old, isRead: false },
    recentRead: { createdAt: recent, isRead: true },
    oldReadKeyed: { createdAt: old, isRead: true, dedupeKey: `itest-temizlik:${Date.now()}` }, // ör. vade hatırlatması
    veryOldUnread: { createdAt: veryOld, isRead: false },
    veryOldUnreadKeyed: { createdAt: veryOld, isRead: false, dedupeKey: `itest-temizlik-2:${Date.now()}` }
  };
  const ids = {};
  for (const [k, v] of Object.entries(rows)) {
    ids[k] = (await runAsPlatform(() => prisma.notification.create({ data: { tenantId: T.id, userId: user.id, type: 'SYSTEM', title: 'itest temizlik', message: '-', ...v } }))).id;
  }
  await cleanupNotifications({ batch: 1 }); // parça parça silme sona kadar devam eder
  const left = new Set((await runAsPlatform(() => prisma.notification.findMany({ where: { id: { in: Object.values(ids) } }, select: { id: true } }))).map((n) => n.id));
  assert.equal(left.has(ids.oldRead), false);
  assert.ok(left.has(ids.oldUnread), '180 günden yeni okunmamış kalmalı');
  assert.equal(left.has(ids.veryOldUnread), false, '180 günden eski okunmamış silinmeli');
  assert.ok(left.has(ids.veryOldUnreadKeyed), 'tekrar anahtarlı okunmamış da kalmalı');
  assert.ok(left.has(ids.recentRead), '90 günden yeni kalmalı');
  assert.ok(left.has(ids.oldReadKeyed), 'tekrar anahtarlı kalmalı (yoksa hatırlatma yeniden gider)');
});

test('firma verisi silinince izleme kayıtları da silinir (KVKK)', { skip }, async () => {
  await monitoring.recordExternal({ service: SVC, operation: 'firma', ok: true, durationMs: 1, tenantId: T.id });
  assert.ok(await prisma.externalCall.count({ where: { tenantId: T.id } }) > 0);
  assert.ok(await prisma.apiRequestLog.count({ where: { tenantId: T.id } }) > 0);
  await purgeTenant(T.id);
  assert.equal(await prisma.externalCall.count({ where: { tenantId: T.id } }), 0);
  assert.equal(await prisma.apiRequestLog.count({ where: { tenantId: T.id } }), 0);
  T.id = null;
});
