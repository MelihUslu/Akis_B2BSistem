/**
 * Tanıtım sitesi: site ayarları, canlı sohbet (kural tabanlı ve yapay zekâ), temsilci devralma, demo talebi.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
let server, base, prisma, platformToken, ai;
const created = { sessions: [], leads: [] };

const call = (path, { method = 'GET', body, token } = {}) => fetch(`${base}/api${path}`, {
  method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.PLATFORM_ALERT_EMAIL = '';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  const mod = await import('../../src/utils/prisma.js');
  prisma = mod.basePrisma;
  ai = await import('../../src/services/ai/index.js');
  const { default: app } = await import('../../src/app.js');
  const bcrypt = (await import('bcrypt')).default;
  const jwt = (await import('jsonwebtoken')).default;
  const admin = await mod.runAsPlatform(async () => (await prisma.user.findFirst({ where: { email: 'itest-platform@x.test', tenantId: null } }))
    || prisma.user.create({ data: { email: 'itest-platform@x.test', password: await bcrypt.hash('x', 4), name: 'Platform Test', role: 'SUPER_ADMIN', tenantId: null } }));
  platformToken = jwt.sign({ id: admin.id, role: 'SUPER_ADMIN', tenantId: null }, process.env.JWT_SECRET, { expiresIn: '1h' });
  await prisma.siteSetting.deleteMany();
  await prisma.plan.upsert({ where: { code: 'STEST' }, update: { isPublic: true, isActive: true }, create: { code: 'STEST', name: 'Site Test', priceMonthly: 1000, priceYearly: 10000, maxDealers: 10, maxProducts: 100, maxAdmins: 1, isPublic: true } });
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (skip) return;
  ai?.setAiProviderForTests(null);
  server?.close();
  await prisma.lead.deleteMany({ where: { id: { in: created.leads } } });
  await prisma.chatSession.deleteMany({ where: { id: { in: created.sessions } } });
  await prisma.siteSetting.deleteMany();
  await prisma.plan.deleteMany({ where: { code: 'STEST' } });
  await prisma.$disconnect();
});

const startChat = async () => {
  const r = await call('/public/chat', { method: 'POST', body: { pageUrl: 'http://test/', utm: { utm_source: 'google', utm_campaign: 'kampanya', evil: 'x' } } });
  assert.equal(r.status, 201);
  created.sessions.push(r.data.id);
  return r.data;
};

test('site ayarları: varsayılanlar, kayıt, herkese açık görünümde gizli alanlar yok', { skip }, async () => {
  const pub = await call('/public/site');
  assert.equal(pub.data.chatbot.enabled, true);
  assert.equal(pub.data.demo.enabled, false);
  const saved = await call('/platform/site', { method: 'PUT', token: platformToken, body: { company: { legalName: 'Test Ltd.', phone: '0850 000 00 00' }, chatbot: { knowledge: 'GİZLİ NOT', quickReplies: ['a', 'b'] }, demo: { enabled: true, url: 'https://demo.test', dealerEmail: 'b@d.test', dealerPassword: 'p' } } });
  assert.equal(saved.data.company.legalName, 'Test Ltd.');
  const after = await call('/public/site');
  assert.equal(after.data.company.phone, '0850 000 00 00');
  assert.equal(after.data.demo.url, 'https://demo.test');
  assert.equal(after.data.chatbot.knowledge, undefined, 'bot ek bilgisi ziyaretçiye gönderilmez');
  assert.equal((await call('/platform/site')).status, 401, 'platform ayarları oturumsuz okunamaz');
});

test('sohbet (yapay zekâ yok): kural tabanlı yanıt, iletişim bilgisiyle talep ve reklam kaynağı', { skip }, async () => {
  const s = await startChat();
  assert.equal(s.messages[0].role, 'BOT');
  const price = await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'Fiyatlar nedir?' } });
  assert.equal(price.data.messages.length, 2);
  assert.match(price.data.messages[1].text, /KDV hariç/);
  const human = await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'Biriyle görüşmek istiyorum' } });
  assert.match(human.data.messages[1].text, /0850 000 00 00/);
  await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'Ben Ayşe, numaram 0532 111 22 33' } });
  const lead = await prisma.lead.findUnique({ where: { chatSessionId: s.id } });
  created.leads.push(lead.id);
  assert.equal(lead.name, 'Ayşe');
  assert.equal(lead.phone, '0532 111 22 33');
  assert.deepEqual(lead.utm, { utm_source: 'google', utm_campaign: 'kampanya' }, 'yalnızca izinli reklam parametreleri');
  const session = await prisma.chatSession.findUnique({ where: { id: s.id } });
  assert.equal(session.needsHuman, true);
});

test('temsilci devralınca bot susar, bota geri verilince yanıtlar', { skip }, async () => {
  const s = await startChat();
  await call(`/platform/chats/${s.id}/messages`, { method: 'POST', token: platformToken, body: { text: 'Merhaba, ben temsilci.' } });
  const r = await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'ERP ile çalışır mı?' } });
  assert.equal(r.data.messages.length, 1, 'temsilci varken bot yanıt vermez');
  const seen = await call(`/public/chat/${s.id}`);
  assert.ok(seen.data.messages.some((m) => m.role === 'AGENT'));
  await call(`/platform/chats/${s.id}`, { method: 'PATCH', token: platformToken, body: { status: 'BOT' } });
  const again = await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'ERP ile çalışır mı?' } });
  assert.match(again.data.messages[1].text, /API/);
  await call(`/platform/chats/${s.id}`, { method: 'PATCH', token: platformToken, body: { status: 'CLOSED' } });
  assert.equal((await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'merhaba' } })).status, 409);
  const list = await call('/platform/chats', { token: platformToken });
  assert.ok(list.data.data.some((c) => c.id === s.id));
});

test('sohbet (yapay zekâ): bilgiler istemde, talep yapay zekânın çıkardığı bilgiden; hata olursa kural yanıtı', { skip }, async () => {
  const env = { ...process.env };
  process.env.AI_PROVIDER = 'anthropic'; process.env.AI_API_KEY = 'test'; process.env.AI_DAILY_LIMIT = '0';
  let seen;
  ai.setAiProviderForTests({ generateJson: async (req) => { seen = req; return { reply: 'Merhaba Mehmet Bey, ekibimiz arayacak.', handoff: false, lead: { name: 'Mehmet Kaya', company: 'Kaya Yapı', phone: '', email: 'mehmet@kaya.test' } }; } });
  try {
    const s = await startChat();
    const r = await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'Kaya Yapıdan Mehmet, mehmet@kaya.test' } });
    assert.equal(r.data.messages[1].text, 'Merhaba Mehmet Bey, ekibimiz arayacak.');
    assert.match(seen.system, /GİZLİ NOT/, 'platformun ek bilgisi isteme eklenir');
    assert.match(seen.system, /KDV hariç/);
    const lead = await prisma.lead.findUnique({ where: { chatSessionId: s.id } });
    created.leads.push(lead.id);
    assert.equal(lead.company, 'Kaya Yapı');
    ai.setAiProviderForTests({ generateJson: async () => { throw new Error('servis yok'); } });
    const fb = await call(`/public/chat/${s.id}/messages`, { method: 'POST', body: { text: 'kargo entegrasyonu var mı' } });
    assert.match(fb.data.messages[1].text, /Yurtiçi/, 'yapay zekâ hata verince kural tabanlı yanıt');
  } finally {
    process.env = env;
    ai.setAiProviderForTests(null);
  }
});

test('demo talep formu: onay ve iletişim zorunlu; platformda durum ve not güncellenir', { skip }, async () => {
  assert.equal((await call('/public/leads', { method: 'POST', body: { name: 'A', phone: '0532' } })).status, 400, 'KVKK onayı olmadan');
  assert.equal((await call('/public/leads', { method: 'POST', body: { name: 'A', consent: true } })).status, 400, 'iletişim bilgisi olmadan');
  const ok = await call('/public/leads', { method: 'POST', body: { name: 'Ali', company: 'Ali Ltd', email: 'ali@x.test', message: '50 bayi', consent: true, utm: { utm_source: 'meta' } } });
  assert.equal(ok.status, 201);
  created.leads.push(ok.data.id);
  const upd = await call(`/platform/leads/${ok.data.id}`, { method: 'PATCH', token: platformToken, body: { status: 'CONTACTED', note: 'Arandı' } });
  assert.equal(upd.data.status, 'CONTACTED');
  const list = await call('/platform/leads?status=CONTACTED', { token: platformToken });
  assert.ok(list.data.data.some((l) => l.id === ok.data.id && l.utm.utm_source === 'meta'));
});
