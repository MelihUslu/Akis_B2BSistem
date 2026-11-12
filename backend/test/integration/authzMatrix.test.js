/**
 * Yetki matrisi: uygulamadaki BÜTÜN uçlar (Express yönlendiricisinden çıkarılır) her rol / kişi için denenir.
 *   - Oturum isteyen her uç: oturumsuz, başka firmanın oturumu ve platform oturumu 401 alır.
 *   - Koruyucusu (checkRole, requirePermission, requireDealer…) izin vermeyen kişi 401 / 403 alır; uç hiç çalışmaz.
 *   - İzin verilen kişi GET uçlarında 401 / 403 almaz ve sunucu hatası (5xx) oluşmaz.
 *   - Dosya yükleme hiçbir uçta kimlik doğrulamadan önce çalışmaz.
 *   - Oturumsuz açılan uçların listesi aşağıdaki gözden geçirilmiş listeyle aynıdır: yeni bir herkese açık uç
 *     eklenirse test düşer, liste bilerek güncellenir.
 * Beklenen sonuç koruyucuların allows(user) bilgisinden hesaplanır (middlewares/authMiddleware.js → guard).
 * AUTHZ_OUT=dosya.md verilirse uç → kim girebilir tablosu yazılır (docs/guvenlik/yetki-matrisi.md).
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import fs from 'fs';
import Router from 'router';
import jwt from 'jsonwebtoken';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUGS = ['yetki-a', 'yetki-b'];

// Bağlanan yönlendiricinin yolu Layer'da saklanmaz; uygulama yüklenmeden önce use() sarılıp yol kaydedilir
const originalUse = Router.prototype.use;
Router.prototype.use = function use(...args) {
  const from = this.stack.length;
  const result = originalUse.apply(this, args);
  const mount = typeof args[0] === 'string' ? args[0] : '/';
  for (let i = from; i < this.stack.length; i++) this.stack[i].mountPath = mount;
  return result;
};

// Koruyucudan sonra uçun kendi içinde reddettiği durumlar (bilinçli, gözden geçirildi)
const HANDLER_CHECKS = new Set([
  'staff GET /api/orders/export', // fiyat yetkisi olmayan bayi çalışanı tutarlı sipariş listesini indiremez
  'admin GET /api/dashboard/' // hiç yetkisi olmayan ekip üyesi firma özetini görmez
]);

// Oturumsuz açılabilen uçlar (gözden geçirildi: giriş / kayıt / şifre sıfırlama, herkese açık bağlantılar —
// imzalı ya da tahmin edilemez anahtarla —, ödeme sağlayıcısı bildirimleri, durum ve belge uçları)
const PUBLIC = new Set([
  // Giriş, şifre sıfırlama, 2FA, kayıt (hız sınırlı; hesap başına hatalı deneme kilidi)
  'POST /api/auth/login', 'POST /api/auth/2fa/verify', 'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password', 'POST /api/auth/google', 'POST /api/auth/handoff',
  'POST /api/platform/auth/login', 'POST /api/platform/auth/2fa/verify', 'POST /api/platform/auth/forgot-password',
  'POST /api/platform/auth/reset-password', 'POST /api/public/login', 'POST /api/public/find-portal',
  'POST /api/public/google/portals', 'GET /api/public/google/start', 'GET /api/public/google/callback',
  'POST /api/public/signup', 'POST /api/public/verify-email', 'POST /api/public/resend-verification',
  'GET /api/public/slug-available', 'GET /api/public/portal',
  // Tahmin edilemez anahtarlı bağlantılar (24-32 bayt rastgele ya da imzalı)
  'GET /api/quote-links/:token', 'POST /api/quote-links/:token/respond', 'GET /api/statement-links/:token',
  'POST /api/statement-links/:token/respond', 'GET /api/public/feed/:token', 'GET /api/public/unsubscribe/:token',
  'POST /api/public/unsubscribe/:token', 'GET /api/public/chat/:id', 'POST /api/public/chat/:id/messages',
  'POST /api/public/chat/:id/contact',
  // Ödeme sağlayıcısı ve WhatsApp bildirimleri (imza ya da sağlayıcıdan yeniden sorgu ile doğrulanır)
  'POST /api/public/iyzico/callback', 'POST /api/public/iyzico/webhook', 'POST /api/public/pos/callback',
  'POST /api/public/paytr/notify/:slug', 'GET /api/whatsapp/webhook/:key', 'POST /api/whatsapp/webhook/:key',
  // Tanıtım sitesi, başvuru / talep formları, firma görünümü, durum ve belge
  'GET /api/public/site', 'POST /api/public/chat', 'POST /api/public/leads',
  'GET /api/public/plans', 'GET /api/public/domain-check', 'POST /api/public/client-errors',
  'POST /api/dealer-applications', 'GET /api/lead-form', 'POST /api/lead-form',
  'GET /api/tenant/public', 'GET /api/v1/openapi.json', 'GET /health',
  'GET /health/ready'
]);

let server, base, prisma, runAsPlatform, purgeTenant, auth, verifyToken, verifyPlatform, apiKeyAuth;
const T = {};
const P = (fn) => runAsPlatform(fn);
const routes = [];

const sample = (path) => path.replace(/:(\w+)/g, (m, name) => (/id$/i.test(name) ? '999999' : 'x')).replace(/\*\w+/g, 'x');

function walk(stack, prefix, inherited) {
  const chain = [...inherited];
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const handlers = layer.route.stack.map((l) => l.handle);
      for (const p of paths) {
        for (const method of Object.keys(layer.route.methods).filter((m) => m !== '_all')) {
          routes.push({ method: method.toUpperCase(), path: prefix + p, chain: [...chain, ...handlers] });
        }
      }
    } else if (Array.isArray(layer.handle?.stack)) {
      walk(layer.handle.stack, prefix + (layer.mountPath === '/' ? '' : layer.mountPath || ''), chain);
    } else if (!layer.mountPath || layer.mountPath === '/') {
      chain.push(layer.handle);
    }
  }
}

const kind = (route) => {
  if (route.chain.includes(verifyPlatform)) return 'platform';
  if (route.chain.includes(apiKeyAuth)) return 'apikey';
  if (route.chain.includes(verifyToken)) return 'tenant';
  return 'public';
};

// admin: yetkisi olmayan ekip üyesi; katalog: yalnızca Ürünler yetkisi; staff: bütün yetkileri kapalı bayi çalışanı
const PERSONAS = ['anon', 'foreign', 'platform', 'owner', 'admin', 'katalog', 'dealer', 'staff', 'plasiyer', 'personel'];

// Kişinin bu uçta izinli olup olmadığı (koruyuculardan hesaplanır)
const expectedAllowed = (route, persona) => {
  const k = kind(route);
  if (k === 'public') return true;
  if (k === 'apikey') return false; // API anahtarı bu testte kullanılmaz
  if (k === 'platform') return persona === 'platform';
  if (['anon', 'foreign', 'platform'].includes(persona)) return false;
  const user = T.users[persona];
  if (user.role === 'PLASIYER' && !auth.PLASIYER_PATHS.some((p) => route.path.startsWith(p))) return false;
  if (user.role === 'PERSONEL' && !auth.PERSONEL_PATHS.some((p) => route.path.startsWith(p))) return false;
  const from = route.chain.indexOf(verifyToken);
  return route.chain.slice(from + 1).every((fn) => typeof fn.allows !== 'function' || fn.allows(user));
};

const call = async (route, persona) => {
  const headers = { 'Content-Type': 'application/json' };
  if (!route.path.startsWith('/api/platform')) headers['X-Tenant'] = SLUGS[0];
  if (persona !== 'anon') headers.Authorization = `Bearer ${T.tokens[persona]}`;
  try {
    const r = await fetch(`${base}${sample(route.path)}`, {
      method: route.method, headers,
      body: ['GET', 'HEAD'].includes(route.method) ? undefined : '{}',
      redirect: 'manual', signal: AbortSignal.timeout(8000)
    });
    await r.arrayBuffer().catch(() => {});
    return r.status;
  } catch (e) {
    return e.name === 'TimeoutError' ? 'timeout' : `error:${e.message}`;
  }
};

const pool = async (items, size, fn) => {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const n = i++; out[n] = await fn(items[n]); } }));
  return out;
};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  auth = await import('../../src/middlewares/authMiddleware.js');
  ({ verifyToken, verifyPlatform } = auth);
  ({ apiKeyAuth } = await import('../../src/middlewares/apiKeyAuth.js'));
  const { JWT_SECRET } = await import('../../src/config.js');
  const { default: app } = await import('../../src/app.js');

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  for (const slug of SLUGS) await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug } }); if (old) await purgeTenant(old.id); });
  const tenant = (slug, name) => P(() => prisma.tenant.create({ data: { slug, name, contactEmail: `${slug}@yetki.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  T.a = (await tenant(SLUGS[0], 'Yetki A')).id;
  T.b = (await tenant(SLUGS[1], 'Yetki B')).id;
  await P(() => prisma.setting.create({ data: { tenantId: T.a, key: 'hr_enabled', value: 'true' } }));
  const company = await P(() => prisma.company.create({ data: { tenantId: T.a, name: 'Yetki Bayi', status: 'ACTIVE' } }));

  const mk = (tenantId, role, extra = {}) => P(() => prisma.user.create({
    data: { tenantId, email: `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@yetki.test`, password: 'x', name: role, role, emailVerifiedAt: new Date(), ...extra }
  }));
  const users = {
    owner: await mk(T.a, 'ADMIN', { isOwner: true }),
    admin: await mk(T.a, 'ADMIN', { isOwner: false, permissions: [] }),
    katalog: await mk(T.a, 'ADMIN', { isOwner: false, permissions: ['CATALOG'] }),
    dealer: await mk(T.a, 'BAYI', { isOwner: true, companyId: company.id }),
    staff: await mk(T.a, 'BAYI', { isOwner: false, companyId: company.id, dealerDeny: ['PRICES', 'FINANCE', 'RETURNS', 'ADDRESSES'], orderApproval: 'BLOCKED' }),
    plasiyer: await mk(T.a, 'PLASIYER'),
    personel: await mk(T.a, 'PERSONEL')
  };
  const foreign = await mk(T.b, 'ADMIN', { isOwner: true });
  const platform = await P(() => prisma.user.create({ data: { tenantId: null, email: `platform-${Date.now()}@yetki.test`, password: 'x', name: 'Platform', role: 'SUPER_ADMIN' } }));
  T.platformUser = platform.id;

  const sign = (u) => jwt.sign({ id: u.id, role: u.role, companyId: u.companyId ?? null, tenantId: u.tenantId }, JWT_SECRET, { expiresIn: '1h' });
  T.users = Object.fromEntries(Object.entries(users).map(([k, u]) => [k, {
    id: u.id, role: u.role, companyId: u.companyId, isOwner: u.isOwner, permissions: Array.isArray(u.permissions) ? u.permissions : [],
    dealerDeny: u.dealerDeny || [], orderApproval: u.orderApproval, orderApprovalLimit: u.orderApprovalLimit
  }]));
  T.tokens = { ...Object.fromEntries(Object.entries(users).map(([k, u]) => [k, sign(u)])), foreign: sign(foreign), platform: sign(platform) };

  walk(app.router.stack, '', []);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  Router.prototype.use = originalUse;
  server?.close();
  for (const id of [T.a, T.b]) if (id) await purgeTenant(id).catch(() => {});
  if (T.platformUser) await P(() => prisma.user.delete({ where: { id: T.platformUser } })).catch(() => {});
  await prisma.$disconnect();
});

test('uç envanteri çıkarıldı; dosya yükleme kimlik doğrulamadan önce çalışmaz', { skip }, () => {
  assert.ok(routes.length > 300, `yalnızca ${routes.length} uç bulundu`);
  const early = routes.filter((r) => {
    const up = r.chain.findIndex((fn) => fn.isUpload);
    if (up < 0) return false;
    const guardAt = r.chain.findIndex((fn) => fn === verifyToken || fn === verifyPlatform || fn === apiKeyAuth);
    return guardAt < 0 || up < guardAt;
  }).map((r) => `${r.method} ${r.path}`);
  assert.deepEqual(early, []);
});

test('oturumsuz açılan uçlar gözden geçirilmiş listeyle aynı', { skip }, () => {
  const open = routes.filter((r) => kind(r) === 'public').map((r) => `${r.method} ${r.path}`).sort();
  assert.deepEqual(open.filter((r) => !PUBLIC.has(r)), [], 'listede olmayan herkese açık uç');
  assert.deepEqual([...PUBLIC].filter((r) => !open.includes(r)), [], 'artık bulunmayan uç listede');
});

test('her uç × her kişi: izinsiz olan 401 / 403 alır, izinli olan GET uçlarında reddedilmez, 5xx yok', { skip, timeout: 600_000 }, async () => {
  const cases = [];
  for (const route of routes.filter((r) => kind(r) !== 'public')) {
    for (const persona of PERSONAS) {
      const allowed = expectedAllowed(route, persona);
      if (allowed && route.method !== 'GET') continue; // izinli yazma uçları çalıştırılmaz
      cases.push({ route, persona, allowed });
    }
  }
  const statuses = await pool(cases, 8, (c) => call(c.route, c.persona));
  const leaks = [], falseDeny = [], errors = [];
  cases.forEach((c, i) => {
    const s = statuses[i];
    const label = `${c.persona} ${c.route.method} ${c.route.path} → ${s}`;
    if (typeof s !== 'number') { if (s !== 'timeout' || !c.allowed) errors.push(label); return; }
    if (s >= 500) errors.push(label);
    else if (!c.allowed && ![401, 403].includes(s)) leaks.push(label);
    else if (c.allowed && [401, 403].includes(s) && !HANDLER_CHECKS.has(`${c.persona} ${c.route.method} ${c.route.path}`)) falseDeny.push(label);
  });

  if (process.env.AUTHZ_OUT) {
    const who = (r) => PERSONAS.filter((p) => expectedAllowed(r, p)).join(', ') || '—';
    const rows = routes.map((r) => `| ${r.method} | \`${r.path}\` | ${kind(r) === 'public' ? 'herkes' : who(r)} |`);
    fs.writeFileSync(process.env.AUTHZ_OUT, `| Yöntem | Uç | Girebilen |\n|---|---|---|\n${rows.join('\n')}\n`);
  }
  console.log(`# ${routes.length} uç, ${cases.length} deneme`);
  assert.deepEqual(leaks, [], 'izinsiz kişi uca ulaştı');
  assert.deepEqual(errors, [], 'sunucu hatası');
  assert.deepEqual(falseDeny, [], 'izinli kişi reddedildi');
});
