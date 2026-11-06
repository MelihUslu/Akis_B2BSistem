/**
 * Toplu e-posta (sahte SMTP taşıyıcısı): "Toplu e-posta" yetkisi; adres sırası (kullanıcılar, yetkililer, carinin
 * e-postası); arka planda gönderim, kişiselleştirme, firma adı ve yanıt adresi; abonelikten çıkma bağlantısı ve
 * List-Unsubscribe; çıkan adres elenir; ticari dipnot; günlük sınır; kendine deneme; yarıda kalan gönderime devam.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';
const SLUG = 'bmail-a';

let server, base, prisma, runAsPlatform, purgeTenant, mail, setMailTransportForTests;
const T = { tokens: {} };
const sent = []; // sahte SMTP'ye giden e-postalar

const api = (path, { token = T.tokens.staff, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': SLUG, Authorization: `Bearer ${token}` },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const P = (fn) => runAsPlatform(fn);
const until = async (fn, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100))) if (await fn()) return true;
  return false;
};
const sendAndWait = async (body) => {
  const res = await api('/bulk-mail/send', { method: 'POST', body });
  if (res.status !== 202) return res;
  assert.ok(await until(async () => (await api(`/bulk-mail/campaigns/${res.data.campaign.id}`)).data.status === 'DONE'), 'gönderim bitti');
  return { ...res, detail: (await api(`/bulk-mail/campaigns/${res.data.campaign.id}`)).data };
};
const to = (address) => sent.filter((m) => m.to === address);
const tokenOf = (html) => /\/api\/public\/unsubscribe\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/.exec(html)[1];

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.BULK_MAIL_PER_MINUTE = '60000';
  process.env.MAIL_FROM = 'Akis B2B <bildirim@akis.test>';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  ({ setMailTransportForTests } = await import('../../src/services/mailService.js'));
  mail = await import('../../src/services/bulkMailService.js');
  setMailTransportForTests({ sendMail: async (m) => { sent.push(m); return { messageId: `m${sent.length}` }; } });
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug: SLUG } }); if (old) await purgeTenant(old.id); });
  const tenant = await P(() => prisma.tenant.create({ data: { slug: SLUG, name: 'Marmara Toptan', contactEmail: 'satis@marmara.test', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
  const tenantId = T.id = tenant.id;
  const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
  await user({ email: `clerk@${SLUG}.test`, name: 'Sipariş', role: 'ADMIN', permissions: ['ORDERS'] });
  await user({ email: `staff@${SLUG}.test`, name: 'Pazarlama', role: 'ADMIN', permissions: ['EMAIL'] });
  const company = (data) => P(() => prisma.company.create({ data: { tenantId, status: 'ACTIVE', ...data } }));
  T.dealerA = (await company({ name: 'Alfa Bayi', taxNumber: '5000000001', email: 'info@alfa.test' })).id;
  await user({ email: 'ayse@alfa.test', name: 'Ayşe Alfa', role: 'BAYI', companyId: T.dealerA, isOwner: true });
  await user({ email: 'ali@alfa.test', name: 'Ali Alfa', role: 'BAYI', companyId: T.dealerA });
  await P(() => prisma.companyContact.create({ data: { tenantId, companyId: T.dealerA, name: 'Muhasebe', email: 'muhasebe@alfa.test' } }));
  T.custX = (await company({ name: 'Xenon Market', kind: 'CUSTOMER', email: 'Xenon@Market.test', authorizedPerson: 'Xavier', currentBalance: -1500 })).id;
  T.custY = (await company({ name: 'Yıldız Gıda', kind: 'CUSTOMER' })).id; // adresi yok
  T.lead1 = (await P(() => prisma.customerLead.create({ data: { tenantId, name: 'Leyla Aday', email: 'leyla@aday.test', phone: '05461112233' } }))).id;

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const k of ['clerk', 'staff']) {
    const r = await api('/auth/login', { method: 'POST', body: { email: `${k}@${SLUG}.test`, password: 'Test12345' } });
    assert.equal(r.status, 200, `${k}: ${r.data?.message}`);
    T.tokens[k] = r.data.token;
  }
});

after(async () => {
  if (skip) return;
  setMailTransportForTests?.(null);
  server?.close();
  if (T.id) await purgeTenant(T.id).catch(() => {});
  await prisma.$disconnect();
});

test('yetki ve alıcılar: yalnızca Toplu e-posta yetkilisi; adres sırası kullanıcılar → yetkililer → carinin e-postası', { skip }, async () => {
  assert.equal((await api('/bulk-mail/meta', { token: T.tokens.clerk })).status, 403);
  const meta = await api('/bulk-mail/meta');
  assert.equal(meta.data.active, true);
  assert.equal(meta.data.replyTo, 'satis@marmara.test');
  assert.equal(meta.data.limits.remaining, 2000);

  const dealers = await api('/bulk-mail/recipients?source=DEALER');
  assert.deepEqual(dealers.data.rows.find((r) => r.id === T.dealerA).emails, ['ayse@alfa.test', 'ali@alfa.test', 'muhasebe@alfa.test', 'info@alfa.test']);
  const customers = await api('/bulk-mail/recipients?source=CUSTOMER');
  assert.deepEqual(customers.data.rows.find((r) => r.id === T.custX).emails, ['xenon@market.test'], 'küçük harfe çevrilir');
  assert.equal(customers.data.withEmail, 1, 'adresi olmayan sayılmaz');
  assert.ok(!('phones' in customers.data.rows[0]), 'telefonlar gönderilmez');
});

test('gönderim: arka planda biter; kişiselleştirilir; firma adı, yanıt adresi, abonelikten çıkma bağlantısı ve başlıkları', { skip }, async () => {
  const res = await sendAndWait({ kind: 'INFO', subject: '{ad} için Nisan duyurusu', body: 'Sayın {yetkili},\n\nBakiyeniz: {bakiye}\nAyrıntı: https://ornek.test/duyuru', keys: [`D:${T.dealerA}`, `C:${T.custX}`, `C:${T.custY}`, `L:${T.lead1}`] });
  assert.equal(res.status, 202, res.data?.message);
  assert.equal(res.data.campaign.total, 3, 'adresi olmayan Yıldız elenir; firma başına bir adres');
  assert.equal(res.detail.sent, 3);
  assert.ok(res.detail.recipients.every((r) => r.status === 'SENT'));

  const [x] = to('xenon@market.test');
  assert.equal(x.subject, 'Xenon Market için Nisan duyurusu');
  assert.match(x.from, /^"Marmara Toptan" </);
  assert.equal(x.replyTo, 'satis@marmara.test');
  assert.match(x.html, /Sayın Xavier,/);
  assert.match(x.html, /1\.500,00 borç/);
  assert.match(x.html, /<a href="https:\/\/ornek\.test\/duyuru"/, 'bağlantı tıklanır');
  assert.match(x.text, /Abonelikten çıkmak için: http/);
  assert.match(x.headers['List-Unsubscribe'], /^<http.*\/api\/public\/unsubscribe\/.+>$/);
  assert.equal(x.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(!/ticari ileti/.test(x.html), 'bilgilendirmede ticari dipnot yok');
  assert.equal(to('ayse@alfa.test').length, 1, 'bayide ana kullanıcıya');
  assert.equal(to('ali@alfa.test').length, 0);
});

test('abonelikten çıkma: bağlantı ve tek tık; çıkan adres elenir, firmanın sıradaki adresine geçilir', { skip }, async () => {
  const ayse = to('ayse@alfa.test')[0];
  const page = await fetch(`${base}/api/public/unsubscribe/${tokenOf(ayse.html)}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Abonelikten çıktınız.*Marmara Toptan.*ayse@alfa\.test/s);
  assert.equal((await fetch(`${base}/api/public/unsubscribe/${tokenOf(to('leyla@aday.test')[0].html)}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' })).status, 200);
  assert.equal((await fetch(`${base}/api/public/unsubscribe/sahte.imza`)).status, 400);
  // Çok baytlı karakterli imza (32 karakter, 64 bayt) 500 değil 400 dönmeli
  assert.equal((await fetch(`${base}/api/public/unsubscribe/${tokenOf(ayse.html).split('.')[0]}.${encodeURIComponent('ç'.repeat(32))}`)).status, 400);

  const rows = (await api('/bulk-mail/recipients?source=DEALER')).data.rows;
  assert.deepEqual(rows.find((r) => r.id === T.dealerA).optedOut, ['ayse@alfa.test']);
  const res = await sendAndWait({ kind: 'COMMERCIAL', subject: 'Kampanya', body: '%10 indirim', keys: [`D:${T.dealerA}`, `L:${T.lead1}`] });
  assert.equal(res.data.campaign.total, 1, 'aday elendi (tek adresi çıktı)');
  assert.equal(to('ali@alfa.test').length, 1, 'Ayşe çıktı, sıradaki Ali');
  assert.equal(to('ayse@alfa.test').length, 1);
  assert.match(to('ali@alfa.test')[0].html, /Bu bir ticari iletidir/);
  assert.match((await api('/bulk-mail/send', { method: 'POST', body: { kind: 'INFO', subject: 'x', body: 'y', keys: [`L:${T.lead1}`] } })).data.message, /abonelikten çıkmışlar/);
});

test('kendine deneme, doğrulama ve günlük sınır', { skip }, async () => {
  const before = sent.length;
  const t = await api('/bulk-mail/test', { method: 'POST', body: { kind: 'INFO', subject: '{ad} deneme', body: 'Merhaba {yetkili}', keys: [`C:${T.custX}`] } });
  assert.equal(t.status, 200, t.data?.message);
  assert.equal(sent.length, before + 1);
  assert.equal(sent.at(-1).to, `staff@${SLUG}.test`);
  assert.equal(sent.at(-1).subject, '[Deneme] Xenon Market deneme');

  assert.equal((await api('/bulk-mail/send', { method: 'POST', body: { kind: 'INFO', subject: '', body: 'y', keys: [`C:${T.custX}`] } })).status, 400);
  assert.equal((await api('/bulk-mail/send', { method: 'POST', body: { kind: 'INFO', subject: 'x', body: 'y'.repeat(10_001), keys: [`C:${T.custX}`] } })).status, 400);
  process.env.BULK_MAIL_DAILY_LIMIT = '4'; // bugün 4 adres kullanıldı
  const limited = await api('/bulk-mail/send', { method: 'POST', body: { kind: 'INFO', subject: 'x', body: 'y', keys: [`C:${T.custX}`] } });
  assert.equal(limited.status, 400);
  assert.match(limited.data.message, /Günlük toplu e-posta sınırı 4 adres; bugün 0 kaldı/);
  delete process.env.BULK_MAIL_DAILY_LIMIT;
});

test('yarıda kalan gönderim: "gönderiliyor"da kalan bilinmiyor diye hatalı, bekleyenlerden devam edilir', { skip }, async () => {
  const campaign = await P(() => prisma.mailCampaign.create({ data: { tenantId: T.id, kind: 'INFO', subject: 'Yarım', body: 'Devam', total: 2 } }));
  await P(() => prisma.mailCampaignRecipient.createMany({ data: [
    { tenantId: T.id, campaignId: campaign.id, source: 'CUSTOMER', sourceId: T.custX, name: 'Xenon Market', email: 'xenon@market.test', status: 'SENDING' },
    { tenantId: T.id, campaignId: campaign.id, source: 'DEALER', sourceId: T.dealerA, name: 'Alfa Bayi', email: 'muhasebe@alfa.test' }
  ] }));
  await P(() => prisma.$executeRaw`UPDATE "MailCampaign" SET "updatedAt" = now() - interval '10 minutes' WHERE id = ${campaign.id}`);
  await P(() => prisma.$executeRaw`UPDATE "MailCampaignRecipient" SET "updatedAt" = now() - interval '10 minutes' WHERE "campaignId" = ${campaign.id}`);
  assert.equal(await mail.resumeStaleCampaigns(), 1);
  const detail = (await api(`/bulk-mail/campaigns/${campaign.id}`)).data;
  assert.equal(detail.status, 'DONE');
  assert.equal(detail.sent, 1);
  assert.equal(detail.failed, 1);
  assert.match(detail.recipients.find((r) => r.email === 'xenon@market.test').error, /bilinmiyor/);
  assert.equal(to('muhasebe@alfa.test').length, 1);
});

test('SMTP bir adresi reddederse yalnızca o adres hatalı; gönderim sürer', { skip }, async () => {
  setMailTransportForTests({ sendMail: async (m) => {
    if (m.to === 'xenon@market.test') throw new Error('550 Mailbox unavailable');
    sent.push(m);
    return { messageId: `m${sent.length}` };
  } });
  const res = await sendAndWait({ kind: 'INFO', subject: 'Duyuru', body: 'Merhaba', keys: [`C:${T.custX}`, `D:${T.dealerA}`] });
  assert.equal(res.status, 202, res.data?.message);
  assert.equal(res.detail.sent, 1);
  assert.equal(res.detail.failed, 1);
  assert.match(res.detail.recipients.find((r) => r.email === 'xenon@market.test').error, /550 Mailbox unavailable/);
  assert.equal(res.detail.recipients.find((r) => r.email === 'ali@alfa.test').status, 'SENT');
});

test('SMTP tanımlı değilse gönderim başlamaz', { skip }, async () => {
  setMailTransportForTests(null);
  const smtp = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  const res = await api('/bulk-mail/send', { method: 'POST', body: { kind: 'INFO', subject: 'x', body: 'y', keys: [`C:${T.custX}`] } });
  assert.equal(res.status, 400);
  assert.match(res.data.message, /SMTP/);
  if (smtp) process.env.SMTP_HOST = smtp;
});
