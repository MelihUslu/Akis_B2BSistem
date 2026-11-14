/**
 * Akkuş asistanı: yapay zekâ niyeti işleme çevirir ama YALNIZ yetkili işlemi önerir; yazma işlemleri onay için hazırlanır,
 * doğrudan çalıştırılmaz. Yapay zekâ sahte sağlayıcıyla taklit edilir (gerçek çağrı yok). navigate ekran listesiyle doğrulanır.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'akkustest-a';

let server, base, prisma, runAsPlatform, purgeTenant, setAiProviderForTests;
const T = { tokens: {} };

const chat = (message, token = T.tokens.owner) => fetch(`${base}/api/assistant/chat`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}` },
  body: JSON.stringify({ message, history: [] })
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);

// Sahte yapay zekâ: kullanıcı mesajına göre yapılandırılmış yanıt döndürür (gerçek Claude çağrısı yok)
const fakeProvider = {
  name: 'test', mock: false,
  generateJson: async ({ input }) => {
    const msg = String(input?.message || '');
    if (/gider/i.test(msg)) return { reply: 'Gideri hazırladım.', intent: 'action', navigateTo: '', action: { type: 'add_cash_entry', fields: [{ key: 'type', value: 'OUT' }, { key: 'category', value: 'Kira' }, { key: 'amount', value: '3000' }] } };
    if (/bayi ekle/i.test(msg)) return { reply: 'Bayiyi hazırladım.', intent: 'action', navigateTo: '', action: { type: 'create_dealer', fields: [{ key: 'name', value: 'Yıldız Ltd' }, { key: 'email', value: 'yildiz@firma.test' }] } };
    if (/siparişleri aç/i.test(msg)) return { reply: 'Siparişlere götürüyorum.', intent: 'navigate', navigateTo: '/admin/orders', action: { type: '', fields: [] } };
    if (/bilinmeyen ekran/i.test(msg)) return { reply: 'Gidiyorum.', intent: 'navigate', navigateTo: '/admin/gizli-panel', action: { type: '', fields: [] } };
    return { reply: 'Merhaba, nasıl yardımcı olabilirim?', intent: 'answer', navigateTo: '', action: { type: '', fields: [] } };
  }
};

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  // aiStatus().enabled true olsun (sahte sağlayıcı döndürülsün); anahtar hiç kullanılmaz çünkü setAiProviderForTests devrede
  process.env.AI_PROVIDER = 'anthropic';
  process.env.AI_API_KEY = process.env.AI_API_KEY || 'test-key-kullanilmaz';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  ({ setAiProviderForTests } = await import('../../src/services/ai/index.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  setAiProviderForTests(fakeProvider);

  const plan = await P(() => prisma.plan.upsert({ where: { code: 'ITEST' }, update: {}, create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false } }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Akkuş Test', contactEmail: `${SLUG}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `owner@${SLUG}.test`, name: 'Patron', role: 'ADMIN', isOwner: true });
  await user({ email: `satis@${SLUG}.test`, name: 'Satışçı', role: 'ADMIN', permissions: ['ORDERS'] });

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [k, email] of [['owner', 'owner'], ['satis', 'satis']]) {
    const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG }, body: JSON.stringify({ email: `${email}@${SLUG}.test`, password: 'Test12345' }) });
    T.tokens[k] = (await r.json()).token;
  }
});

after(async () => {
  if (skip) return;
  setAiProviderForTests?.(null);
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('yetkili kullanıcıya işlem hazırlanır (çalıştırılmaz); yetkisize önerilmez', { skip }, async () => {
  // Owner (tüm yetkiler): gider işlemi hazırlanır
  const r = await chat('3000 TL kira gideri ekle');
  assert.equal(r.status, 200, r.data?.message);
  assert.equal(r.data.intent, 'action');
  assert.equal(r.data.action.endpoint, '/cash');
  assert.deepEqual([r.data.action.body.type, r.data.action.body.category, r.data.action.body.amount], ['OUT', 'Kira', 3000]);
  assert.match(r.data.action.summary, /Gider/);

  // İşlem yalnız HAZIRLANDI; kasada kayıt OLUŞMAMALI (onay ön yüzden gelir)
  assert.equal(await P(() => prisma.cashEntry.count({ where: { tenantId: T.id } })), 0, 'asistan işlemi kendisi çalıştırmaz');

  // Yalnız ORDERS yetkili kullanıcı: FINANCE olmadığı için işlem önerilmez → answer
  const r2 = await chat('3000 TL kira gideri ekle', T.tokens.satis);
  assert.equal(r2.data.intent, 'answer');
  assert.equal(r2.data.action, null);
});

test('bayi ekleme işlemi yetkiye bağlı; navigate ekran listesiyle doğrulanır', { skip }, async () => {
  // Owner DEALERS yetkili: bayi işlemi hazırlanır
  const r = await chat('Yıldız Ltd bayi ekle');
  assert.equal(r.data.intent, 'action');
  assert.deepEqual([r.data.action.endpoint, r.data.action.body.name, r.data.action.body.email], ['/companies', 'Yıldız Ltd', 'yildiz@firma.test']);

  // ORDERS yetkili kullanıcı bayi ekleyemez → answer
  assert.equal((await chat('Yıldız Ltd bayi ekle', T.tokens.satis)).data.intent, 'answer');

  // Geçerli yönlendirme
  const nav = await chat('siparişleri aç');
  assert.deepEqual([nav.data.intent, nav.data.navigate], ['navigate', '/admin/orders']);

  // Bilinmeyen/izinsiz ekrana yönlendirme reddedilir → answer (ekran listesi dışı)
  const bad = await chat('bilinmeyen ekran');
  assert.equal(bad.data.intent, 'answer');
  assert.equal(bad.data.navigate, null);
});

test('durum ucu ve boş mesaj', { skip }, async () => {
  const s = await fetch(`${base}/api/assistant/status`, { headers: { 'X-Tenant': SLUG, Authorization: `Bearer ${T.tokens.owner}` } }).then((r) => r.json());
  assert.equal(typeof s.enabled, 'boolean');
  const empty = await chat('   ');
  assert.equal(empty.status, 400);
});
