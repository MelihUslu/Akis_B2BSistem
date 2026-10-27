/**
 * Akıllı teklif modülü: fiyatlama, yapay zekâ taslağı (örnek sağlayıcı), yetki / onay, sürüm kopyası,
 * müşteri bağlantısı, siparişe dönüştürme ve firma izolasyonu.
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';

let server, base, prisma, runAsPlatform, purgeTenant, setAiProviderForTests, AiError;
const T = {};
const valid = () => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

const api = (path, { tenant = 'qtest-a', token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', 'X-Tenant': tenant, ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

const login = async (tenant, email) => (await api('/auth/login', { tenant, method: 'POST', body: { email, password: 'Test12345' } })).data.token;
const P = (fn) => runAsPlatform(fn);

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  process.env.AI_PROVIDER = 'mock';
  process.env.AI_DAILY_LIMIT = '0';
  process.env.FX_FIXED = 'USD:40,EUR:45';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  ({ setAiProviderForTests, AiError } = await import('../../src/services/ai/index.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');
  const password = await bcrypt.hash('Test12345', 4);

  const plan = await P(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));

  for (const slug of ['qtest-a', 'qtest-b']) {
    await P(async () => { const old = await prisma.tenant.findUnique({ where: { slug } }); if (old) await purgeTenant(old.id); });
    const tenant = await P(() => prisma.tenant.create({ data: { slug, name: `Tedarikçi ${slug} Ambalaj Sanayi ve Ticaret A.Ş.`, contactEmail: `${slug}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) } }));
    const tenantId = tenant.id;
    const user = (data) => P(() => prisma.user.create({ data: { tenantId, password, emailVerifiedAt: new Date(), ...data } }));
    await user({ email: `owner@${slug}.test`, name: 'Firma Sahibi', role: 'ADMIN', isOwner: true });
    await user({ email: `clerk@${slug}.test`, name: 'Satış Asistanı', role: 'ADMIN', permissions: ['QUOTES'] });
    await user({ email: `seller@${slug}.test`, name: 'Satış Temsilcisi', role: 'ADMIN', permissions: ['QUOTES', 'QUOTE_PRICING'] });
    const company = await P(() => prisma.company.create({ data: { tenantId, name: 'ABC Kafe Gıda Ltd. Şti.', status: 'ACTIVE', riskLimit: 1_000_000, taxNumber: `${tenantId}1111111` } }));
    await user({ email: `bayi@${slug}.test`, name: 'Bayi Kullanıcı', role: 'BAYI', companyId: company.id });

    const cat = await P(() => prisma.category.create({ data: { tenantId, name: 'Kullan At Ürünler' } }));
    const product = (data) => P(() => prisma.product.create({ data: { tenantId, categoryId: cat.id, currency: 'TRY', vatRate: 20, ...data } }));
    // Özel varyant adı "Hacim" ve paket dönüşümü (1 Koli = 50 Adet) ana üründe
    const cupMaster = await product({ name: 'Karton Bardak', sku: `CUP-${slug}`, price: 2, unit: 'Adet', packUnit: 'Koli', packSize: 50, stock: 0 });
    const option = await P(() => prisma.productOption.create({ data: { tenantId, productId: cupMaster.id, name: 'Hacim' } }));
    const v8 = await P(() => prisma.productOptionValue.create({ data: { tenantId, optionId: option.id, value: '8 oz' } }));
    const v12 = await P(() => prisma.productOptionValue.create({ data: { tenantId, optionId: option.id, value: '12 oz' } }));
    const cup8 = await product({ name: 'Karton Bardak', sku: `CUP8-${slug}`, price: 2, unit: 'Adet', stock: 5000, isMaster: false, parentId: cupMaster.id });
    const cup12 = await product({ name: 'Karton Bardak', sku: `CUP12-${slug}`, price: 2.5, unit: 'Adet', stock: 10, isMaster: false, parentId: cupMaster.id });
    await P(() => prisma.productVariantValue.createMany({ data: [{ tenantId, variantId: cup8.id, optionValueId: v8.id }, { tenantId, variantId: cup12.id, optionValueId: v12.id }] }));
    const lid = await product({ name: 'Bardak Kapağı 80 mm', sku: `LID80-${slug}`, price: 0.8, unit: 'Adet', stock: 3000, costPrice: 0.5 });
    await P(() => prisma.productCompatibility.create({ data: { tenantId, productId: cupMaster.id, compatibleId: lid.id } }));
    const napkin = await product({ name: 'Peçete 1 Katlı', sku: `NAP1-${slug}`, price: 1.5, unit: 'Paket', stock: 40 });
    await P(() => prisma.specialPrice.create({ data: { tenantId, productId: napkin.id, companyId: company.id, price: 1.2 } }));

    T[slug] = { tenantId, companyId: company.id, cup8: cup8.id, cup12: cup12.id, lid: lid.id, napkin: napkin.id };
  }

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const slug of Object.keys(T)) {
    for (const who of ['owner', 'clerk', 'seller', 'bayi']) T[slug][who] = await login(slug, `${who}@${slug}.test`);
  }
});

after(async () => {
  if (skip) return;
  setAiProviderForTests?.(null);
  server?.close();
  for (const t of Object.values(T)) await purgeTenant(t.tenantId).catch(() => {});
  await prisma.$disconnect();
});

const A = () => T['qtest-a'];

// Taslak oluşturup gönderir; teklif kimliğini döndürür
const sentQuote = async (items, token = A().owner) => {
  const c = await api('/quotes/draft', { token, method: 'POST', body: { companyId: A().companyId, title: 'Kafe açılışı – Şubat siparişi', validUntil: valid(), paymentTerms: '30 gün vadeli', items } });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const s = await api(`/quotes/${c.data.id}/submit`, { token, method: 'POST' });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  return c.data.id;
};

test('müşteriye özel fiyat ve teklif iskontosu backend fiyat motoruyla hesaplanır', { skip }, async () => {
  const res = await api('/quotes/price', { token: A().seller, method: 'POST', body: { companyId: A().companyId, items: [{ productId: A().napkin, quantity: 10, discountRate: 5 }] } });
  assert.equal(res.status, 200);
  const [line] = res.data.lines;
  assert.equal(line.basePrice, 1.2); // bayiye özel fiyat (liste 1.5)
  assert.equal(line.unitPrice, 1.14); // %5 teklif iskontosu
  assert.equal(line.lineTotal, 11.4);
  assert.equal(res.data.totals.vatAmount, 2.28);
  assert.equal(res.data.totals.total, 13.68);
});

test('yapay zekâ taslağı: özel varyant + koli dönüşümü, uyumlu kapak, bulunamayan ürün', { skip }, async () => {
  const res = await api('/quotes/ai/draft', { token: A().owner, method: 'POST', body: { companyId: A().companyId, text: 'ABC firmasına 20 koli 8 oz karton bardak, uyumlu kapak ve 15 adet uzay mekiği' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.mock, true);
  const [cup, lid, missing] = res.data.lines;
  assert.equal(cup.productId, A().cup8);
  assert.equal(cup.variantLabel, 'Hacim: 8 oz');
  assert.equal(cup.quantity, 1000); // 20 Koli × 50 Adet
  assert.match(cup.matchReason, /20 koli × 50 = 1000 Adet/i);
  assert.equal(lid.productId, A().lid);
  assert.equal(lid.matchStatus, 'REVIEW'); // miktar belirtilmedi → kesinleşmez
  assert.equal(missing.productId, null);
  assert.equal(missing.matchStatus, 'UNMATCHED');
  assert.ok(res.data.questions.some((q) => /miktar/i.test(q.question)));
});

test('eşleşmeyen / teyitsiz kalem varken teklif gönderilemez', { skip }, async () => {
  const c = await api('/quotes/draft', { token: A().owner, method: 'POST', body: { companyId: A().companyId, validUntil: valid(), items: [{ requestText: 'uzay mekiği', quantity: 1 }, { productId: A().lid, quantity: 100, matchStatus: 'REVIEW' }] } });
  const s = await api(`/quotes/${c.data.id}/submit`, { token: A().owner, method: 'POST' });
  assert.equal(s.status, 400);
  assert.equal(s.data.blockers.length, 2);
});

test('iskonto yetkisi: yetkisiz fiyat değişikliği reddedilir, sınırı aşan teklif onaya düşer', { skip }, async () => {
  const body = { companyId: A().companyId, items: [{ productId: A().napkin, quantity: 10, discountRate: 20 }] };
  assert.equal((await api('/quotes/price', { token: A().clerk, method: 'POST', body })).status, 403);
  assert.equal((await api('/quotes/draft', { token: A().clerk, method: 'POST', body })).status, 403);

  const c = await api('/quotes/draft', { token: A().seller, method: 'POST', body: { ...body, validUntil: valid() } });
  const s = await api(`/quotes/${c.data.id}/submit`, { token: A().seller, method: 'POST' });
  assert.equal(s.data.status, 'PENDING_APPROVAL');
  assert.match(s.data.reasons[0], /%20 iskonto/);
  // Onay yetkisi olmayan onaylayamaz; firma sahibi onaylayınca gönderilir
  assert.equal((await api(`/quotes/${c.data.id}/approve`, { token: A().seller, method: 'POST' })).status, 403);
  assert.equal((await api(`/quotes/${c.data.id}/approve`, { token: A().owner, method: 'POST' })).status, 200);
  const d = await api(`/quotes/${c.data.id}`, { token: A().owner });
  assert.equal(d.data.status, 'QUOTED');
  assert.equal(d.data.approvedByName, 'Firma Sahibi');
});

test('maliyetin altındaki fiyat yönetici onayı gerektirir', { skip }, async () => {
  const res = await api('/quotes/price', { token: A().seller, method: 'POST', body: { companyId: A().companyId, items: [{ productId: A().lid, quantity: 10, manualPrice: true, unitPrice: 0.4 }] } });
  assert.ok(res.data.lines[0].belowCost);
  assert.equal(res.data.approvalRequired, true);
});

test('gönderilen teklif sonradan katalog fiyatı değişse de değişmez; sipariş teklif fiyatıyla oluşur', { skip }, async () => {
  const id = await sentQuote([{ productId: A().cup8, quantity: 500, matchStatus: 'MATCHED' }]);
  await P(() => prisma.product.update({ where: { id: A().cup8 }, data: { price: 9 } }));
  const share = await api(`/quotes/${id}/share`, { token: A().owner, method: 'POST', body: {} });
  const token = share.data.url.split('/teklif/')[1];
  const view = await api(`/quote-links/${token}`);
  // 500 adet ≥ miktar indirimi eşiği (varsayılan 10 adet, %5): 2 × 0,95 = 1,90
  assert.equal(view.data.document.items[0].unitPrice, 1.9);
  assert.equal(view.data.document.totals.total, 1140);
  assert.equal(view.data.document.items[0].costPrice, undefined);

  const acc = await api(`/quote-links/${token}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: view.data.revision, name: 'Ayşe Yılmaz' } });
  assert.equal(acc.status, 200);
  const conv = await api(`/quotes/${id}/convert`, { token: A().owner, method: 'POST', body: { paymentMethod: 'WIRE_TRANSFER' } });
  assert.equal(conv.status, 201, JSON.stringify(conv.data));
  const order = await P(() => prisma.order.findUnique({ where: { id: conv.data.orderId }, include: { items: true } }));
  assert.equal(order.items[0].price, 1.9); // katalog fiyatı 9'a çıktı, teklif fiyatı korundu
  assert.equal(order.totalAmount, 1140);
  const quote = await P(() => prisma.quoteRequest.findUnique({ where: { id } }));
  assert.equal(quote.orderId, order.id);
  await P(() => prisma.product.update({ where: { id: A().cup8 }, data: { price: 2 } }));
});

test('revizyon: eski sürüm ve süresi dolmuş teklif kabul edilemez', { skip }, async () => {
  const id = await sentQuote([{ productId: A().napkin, quantity: 10 }]);
  const token = (await api(`/quotes/${id}/share`, { token: A().owner, method: 'POST', body: {} })).data.url.split('/teklif/')[1];
  assert.equal((await api(`/quotes/${id}/revise`, { token: A().owner, method: 'POST' })).status, 200);
  // Revizyon hazırlanırken müşteri eski sürümü kabul edemez
  const during = await api(`/quote-links/${token}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: 1, name: 'Ayşe Yılmaz' } });
  assert.equal(during.status, 409);
  assert.equal((await api(`/quote-links/${token}`)).data.status, 'REVISING');

  assert.equal((await api(`/quotes/${id}`, { token: A().owner, method: 'PUT', body: { validUntil: valid(), items: [{ productId: A().napkin, quantity: 20 }] } })).status, 200);
  assert.equal((await api(`/quotes/${id}/submit`, { token: A().owner, method: 'POST' })).status, 200);
  const stale = await api(`/quote-links/${token}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: 1, name: 'Ayşe Yılmaz' } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'STALE_REVISION');
  const view = await api(`/quote-links/${token}`);
  assert.equal(view.data.revision, 2);
  assert.equal(view.data.document.items[0].quantity, 20);

  await P(() => prisma.quoteRequest.update({ where: { id }, data: { validUntil: new Date(Date.now() - 1000) } }));
  const expired = await api(`/quote-links/${token}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: 2, name: 'Ayşe Yılmaz' } });
  assert.equal(expired.status, 409);
  assert.equal(expired.data.code, 'EXPIRED');
});

test('yetersiz stokta dönüştürme açık onay ister; aynı tekliften çift sipariş oluşmaz', { skip }, async () => {
  const id = await sentQuote([{ productId: A().cup12, quantity: 100, matchStatus: 'MATCHED' }]); // stok 10
  const token = (await api(`/quotes/${id}/share`, { token: A().owner, method: 'POST', body: {} })).data.url.split('/teklif/')[1];
  await api(`/quote-links/${token}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: 1, name: 'Ayşe Yılmaz' } });

  const first = await api(`/quotes/${id}/convert`, { token: A().owner, method: 'POST', body: { paymentMethod: 'WIRE_TRANSFER' } });
  assert.equal(first.status, 409);
  assert.equal(first.data.code, 'CONFIRM_REQUIRED');
  assert.ok(first.data.warnings.some((w) => /stok 10/.test(w)));

  const results = await Promise.all([1, 2, 3].map(() => api(`/quotes/${id}/convert`, { token: A().owner, method: 'POST', body: { paymentMethod: 'WIRE_TRANSFER', confirmWarnings: true } })));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  const orders = await P(() => prisma.order.count({ where: { tenantId: A().tenantId, items: { some: { productId: A().cup12 } } } }));
  assert.equal(orders, 1);
});

test('bayi portalı: taslağı görmez, gönderilen sürümü kabul edince tek sipariş oluşur', { skip }, async () => {
  const draft = await api('/quotes/draft', { token: A().owner, method: 'POST', body: { companyId: A().companyId, validUntil: valid(), items: [{ productId: A().napkin, quantity: 5 }] } });
  assert.equal((await api(`/quotes/${draft.data.id}`, { token: A().bayi })).status, 404);
  assert.ok((await api('/quotes', { token: A().bayi })).data.every((q) => q.id !== draft.data.id));

  const id = await sentQuote([{ productId: A().napkin, quantity: 5 }]);
  const mine = await api(`/quotes/${id}`, { token: A().bayi });
  assert.equal(mine.data.canRespond, true);
  assert.equal(mine.data.document.customer.name, 'ABC Kafe Gıda Ltd. Şti.');
  const [a, b] = await Promise.all([1, 2].map(() => api(`/quotes/${id}/accept`, { token: A().bayi, method: 'POST', body: { revision: 1, paymentMethod: 'CURRENT_ACCOUNT' } })));
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
});

test('firma izolasyonu: başka firmanın teklifi, ürünü ve bağlantısı erişilemez', { skip }, async () => {
  const id = await sentQuote([{ productId: A().napkin, quantity: 3 }]);
  const token = (await api(`/quotes/${id}/share`, { token: A().owner, method: 'POST', body: {} })).data.url.split('/teklif/')[1];
  const B = T['qtest-b'];
  assert.equal((await api(`/quotes/${id}`, { tenant: 'qtest-b', token: B.owner })).status, 404);
  assert.equal((await api(`/quotes/${id}/convert`, { tenant: 'qtest-b', token: B.owner, method: 'POST', body: { confirmWarnings: true } })).status, 404);
  assert.equal((await api(`/quote-links/${token}`, { tenant: 'qtest-b' })).status, 404);
  // A'nın tokeni B adresinde geçmez
  assert.equal((await api('/quotes', { tenant: 'qtest-b', token: A().owner })).status, 401);
  // B, A'nın ürününü teklife koyamaz; katalog aramasında A'nın ürünleri çıkmaz
  const priced = await api('/quotes/price', { tenant: 'qtest-b', token: B.owner, method: 'POST', body: { companyId: B.companyId, items: [{ productId: A().napkin, quantity: 1 }] } });
  assert.equal(priced.data.lines[0].productId, null);
  assert.equal((await api('/quotes/price', { tenant: 'qtest-b', token: B.owner, method: 'POST', body: { companyId: A().companyId, items: [] } })).status, 404);
  const search = await api('/quotes/catalog?q=peçete', { tenant: 'qtest-b', token: B.owner });
  assert.ok(search.data.length >= 1 && search.data.every((p) => p.sku.endsWith('qtest-b')));
});

test('yapay zekâ hataları: zaman aşımı, geçersiz yanıt ve katalog dışı öneri güvenle ele alınır', { skip }, async () => {
  const draft = (text = '10 paket peçete') => api('/quotes/ai/draft', { token: A().owner, method: 'POST', body: { companyId: A().companyId, text } });
  try {
    setAiProviderForTests({ name: 'test', mock: true, generateJson: async () => { throw new AiError('TIMEOUT'); } });
    const timeout = await draft();
    assert.equal(timeout.status, 504);
    assert.match(timeout.data.message, /manuel/);

    setAiProviderForTests({ name: 'test', mock: true, generateJson: async () => ({ hello: 'world' }) });
    assert.equal((await draft()).status, 502);

    // Başka firmanın ürün kimliğini öneren yanıt reddedilir
    setAiProviderForTests({
      name: 'test', mock: true,
      generateJson: async ({ task }) => (task === 'extract'
        ? { items: [{ text: '10 paket peçete', quantity: 10, unit: 'paket', searchTerms: ['peçete'], attributes: [], brand: '', compatibleWithItem: -1 }], questions: [] }
        : { lines: [{ itemIndex: 0, productId: T['qtest-b'].napkin, quantity: 10, unit: 'paket', certain: true, reason: 'x', warnings: [], alternativeIds: [] }], questions: [] })
    });
    const foreign = await draft();
    assert.equal(foreign.status, 200);
    assert.equal(foreign.data.lines[0].productId, null);
    assert.match(foreign.data.lines[0].matchReason, /reddedildi/);
  } finally {
    setAiProviderForTests(null);
  }
});

test('teklif belgesi Türkçe karakterleri ve uzun ürün adlarını korur', { skip }, async () => {
  const longName = 'Çift Katlı Şeffaf Ğ Kapaklı Isıya Dayanıklı Özel Baskılı Gıdaya Uygun Kraft Kâğıt Bardak İçecek Ürünü '.repeat(2).trim();
  await P(() => prisma.product.update({ where: { id: A().lid }, data: { name: longName } }));
  const id = await sentQuote(Array.from({ length: 40 }, () => ({ productId: A().lid, quantity: 10 })));
  const doc = await api(`/quotes/${id}/document`, { token: A().bayi });
  assert.equal(doc.status, 200);
  assert.equal(doc.data.document.items.length, 40);
  assert.equal(doc.data.document.items[0].name, longName);
  assert.match(doc.data.document.seller.name, /Sanayi ve Ticaret/);
});

test('cari hesaplar: portal dışı müşteri bayi ekranlarına karışmaz, teklif alıp siparişe dönüşür', { skip }, async () => {
  const created = await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'CUSTOMER', name: 'Ahmet Yılmaz (perakende)', contacts: [{ name: 'Ahmet Yılmaz', email: 'ahmet@musteri.test', isPrimary: true }] } });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const customerId = created.data.id;

  const dealers = await api('/companies', { token: A().owner });
  assert.ok(dealers.data.every((c) => c.kind === 'DEALER'));
  const list = await api('/partners?kind=CUSTOMER', { token: A().owner });
  assert.ok(list.data.data.some((c) => c.id === customerId));
  assert.equal(list.data.counts.CUSTOMER >= 1, true);

  // Portal kullanıcısı açılamaz; bayi düzenleme ucundan değiştirilemez
  assert.equal((await api(`/companies/${customerId}/users`, { token: A().owner, method: 'POST', body: { name: 'X', email: 'x@x.test' } })).status, 404);
  assert.equal((await api(`/companies/${customerId}`, { token: A().owner, method: 'PATCH', body: { riskLimit: 5 } })).status, 404);

  const c = await api('/quotes/draft', { token: A().owner, method: 'POST', body: { companyId: customerId, validUntil: valid(), items: [{ productId: A().napkin, quantity: 4 }] } });
  assert.equal((await api(`/quotes/${c.data.id}/submit`, { token: A().owner, method: 'POST' })).status, 200);
  const mail = await api(`/quotes/${c.data.id}/email`, { token: A().owner, method: 'POST', body: {} });
  assert.equal(mail.data.total, 1); // yetkili kişinin e-postasına (SMTP yoksa gönderilemedi denir)
  const token = mail.data.url.split('/teklif/')[1];
  await api(`/quote-links/${token}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: 1, name: 'Ahmet Yılmaz' } });
  const conv = await api(`/quotes/${c.data.id}/convert`, { token: A().owner, method: 'POST', body: { paymentMethod: 'WIRE_TRANSFER', confirmWarnings: true } });
  assert.equal(conv.status, 201, JSON.stringify(conv.data));
});

test('cari hesaplar: tedarikçi, yetkiler ve silme kuralları', { skip }, async () => {
  // Teklif personeli yalnızca müşteri açabilir, cari listesini göremez
  assert.equal((await api('/partners', { token: A().clerk, method: 'POST', body: { kind: 'CUSTOMER', name: 'Hızlı Müşteri' } })).status, 201);
  assert.equal((await api('/partners', { token: A().clerk, method: 'POST', body: { kind: 'SUPPLIER', name: 'Tedarikçi' } })).status, 403);
  assert.equal((await api('/partners', { token: A().clerk })).status, 403);
  assert.equal((await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'DEALER', name: 'Bayi' } })).status, 400);
  assert.equal((await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'CUSTOMER', name: '' } })).status, 400);

  const sup = await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'SUPPLIER', name: 'Kâğıt Hammadde A.Ş.', taxNumber: '9990001112', riskLimit: 5000 } });
  assert.equal(sup.status, 201);
  assert.equal(sup.data.riskLimit, 0); // tedarikçide risk limiti tutulmaz
  assert.equal((await api('/quotes/price', { token: A().owner, method: 'POST', body: { companyId: sup.data.id, items: [] } })).status, 400);

  // Alış faturası: tedarikçi alacaklanır; ekstre mevcut uçtan
  assert.equal((await api('/finance/transaction', { token: A().owner, method: 'POST', body: { companyId: sup.data.id, type: 'CREDIT', amount: 1500, description: 'Alış faturası' } })).status, 201);
  const detail = await api(`/partners/${sup.data.id}`, { token: A().owner });
  assert.equal(detail.data.currentBalance, 1500);
  assert.equal((await api(`/finance/statement/${sup.data.id}`, { token: A().owner })).status, 200);

  const del = await api(`/partners/${sup.data.id}`, { token: A().owner, method: 'DELETE' });
  assert.equal(del.data.archived, true);
  const fresh = await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'SUPPLIER', name: 'Silinecek' } });
  assert.equal((await api(`/partners/${fresh.data.id}`, { token: A().owner, method: 'DELETE' })).data.archived, undefined);

  assert.equal((await api(`/partners/${detail.data.id}`, { tenant: 'qtest-b', token: T['qtest-b'].owner })).status, 404);
});

const form = (path, { token, fields = {}, file, fileName = 'f.xlsx', tenant = 'qtest-a' }) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file]), fileName);
  return fetch(`${base}/api${path}`, { method: 'POST', headers: { 'X-Tenant': tenant, Authorization: `Bearer ${token}` }, body: fd })
    .then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
};

test('cari defteri: tahsilat makbuzu, ters kayıt, filtre ve yaşlandırma', { skip }, async () => {
  const c = await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'CUSTOMER', name: 'Defter Müşterisi', paymentTermDays: 30 } });
  const id = c.data.id;
  // 1000 borç (manuel, 60 gün önceye tarihlenemez → bugünkü), sonra 400 nakit tahsilat
  await api('/finance/transaction', { token: A().owner, method: 'POST', body: { companyId: id, type: 'DEBT', amount: 1000, description: 'Fatura A-1' } });
  const pay = await api(`/partners/${id}/payments`, { token: A().owner, method: 'POST', body: { direction: 'IN', method: 'CASH', amount: 400 } });
  assert.equal(pay.status, 201, JSON.stringify(pay.data));
  assert.ok(pay.data.payment.receiptNo >= 1);
  assert.equal((await api(`/partners/${id}/payments`, { token: A().owner, method: 'POST', body: { direction: 'IN', method: 'CHECK', amount: 10 } })).status, 400); // çekte vade zorunlu
  assert.equal((await api(`/partners/${id}/payments`, { token: A().clerk, method: 'POST', body: { direction: 'IN', method: 'CASH', amount: 1 } })).status, 403);

  let tx = await api(`/partners/${id}/transactions`, { token: A().owner });
  assert.equal(tx.data.balance, -600);
  assert.equal(tx.data.rows[0].source, 'PAYMENT');
  const filtered = await api(`/partners/${id}/transactions?source=PAYMENT`, { token: A().owner });
  assert.equal(filtered.data.rows.length, 1);
  assert.equal(filtered.data.totals.credit, 400);

  // Tahsilatın ters kaydı: bakiye geri döner, makbuz iptal olur, ikinci kez yapılamaz
  const payTx = tx.data.rows[0].id;
  assert.equal((await api(`/partners/${id}/transactions/${payTx}/reverse`, { token: A().owner, method: 'POST', body: {} })).status, 400); // neden zorunlu
  assert.equal((await api(`/partners/${id}/transactions/${payTx}/reverse`, { token: A().owner, method: 'POST', body: { reason: 'Yanlış cari' } })).status, 200);
  assert.equal((await api(`/partners/${id}/transactions/${payTx}/reverse`, { token: A().owner, method: 'POST', body: { reason: 'tekrar' } })).status, 400);
  tx = await api(`/partners/${id}/transactions`, { token: A().owner });
  assert.equal(tx.data.balance, -1000);
  const receipt = await api(`/partners/payments/${pay.data.payment.id}`, { token: A().owner });
  assert.equal(receipt.data.status, 'CANCELLED');

  const aging = await api('/finance/aging', { token: A().owner });
  const row = aging.data.rows.find((r) => r.id === id);
  assert.equal(row.total, 1000);
  assert.equal(row.notDue, 1000); // 30 gün vadeli, bugünkü borç
  const xlsx = await fetch(`${base}/api/partners/${id}/transactions/export`, { headers: { 'X-Tenant': 'qtest-a', Authorization: `Bearer ${A().owner}` } });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get('content-type'), /spreadsheet/);
});

test('cari Excel: şablon, önizleme, aktarma (açılış bakiyesi), dışa aktarma ve filtreler', { skip }, async () => {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { 'Tür': 'Müşteri', 'Cari Kodu': 'IMP-1', 'Unvan': 'Aktarım Kafe', 'Açılış Borcu': 2500, 'Etiketler': 'İzmir, Toptan', 'Yetkili Adı': 'Zeynep Ak', 'Yetkili E-posta': 'zeynep@kafe.test' },
    { 'Tür': 'Tedarikçi', 'Cari Kodu': 'IMP-2', 'Unvan': 'Aktarım Hammadde', 'Açılış Alacağı': 700 },
    { 'Tür': 'Uzaylı', 'Unvan': 'Hatalı Satır' },
    { 'Tür': 'Müşteri', 'Cari Kodu': 'IMP-1', 'Unvan': 'Tekrar Eden' }
  ]), 'Cariler');
  const file = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const preview = await form('/partners/import?dryRun=1', { token: A().owner, file });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.deepEqual(preview.data.summary, { create: 2, update: 0, skip: 0, error: 2 });
  assert.equal((await api('/partners?q=Aktarım', { token: A().owner })).data.data.length, 0); // önizleme kaydetmez

  const done = await form('/partners/import', { token: A().owner, file });
  assert.equal(done.data.summary.create, 2);
  const list = await api('/partners?q=Aktarım&sort=name', { token: A().owner });
  const cafe = list.data.data.find((c) => c.externalCode === 'IMP-1');
  assert.equal(cafe.currentBalance, -2500);
  assert.deepEqual(cafe.tags, ['İzmir', 'Toptan']);
  assert.equal(cafe.contacts[0].name, 'Zeynep Ak');
  assert.equal(list.data.data.find((c) => c.externalCode === 'IMP-2').currentBalance, 700);

  // İkinci aktarım günceller, açılış bakiyesini tekrar yazmaz
  const again = await form('/partners/import', { token: A().owner, file });
  assert.equal(again.data.summary.update, 2);
  assert.equal((await api(`/partners/${cafe.id}`, { token: A().owner })).data.currentBalance, -2500);

  assert.equal((await api('/partners?tag=İzmir', { token: A().owner })).data.data.length, 1);
  assert.ok((await api('/partners?balance=debtor&kind=CUSTOMER', { token: A().owner })).data.data.every((c) => c.currentBalance < 0));
  const meta = await api('/partners/meta', { token: A().owner });
  assert.ok(meta.data.tags.includes('Toptan'));
  const exp = await fetch(`${base}/api/partners/export?tag=Toptan`, { headers: { 'X-Tenant': 'qtest-a', Authorization: `Bearer ${A().owner}` } });
  const rows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(await exp.arrayBuffer())).Sheets.Cariler);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Bakiye Durumu'], 'Borçlu');
});

test('cari: bayiye dönüştürme, notlar, gizli belgeler, ekstre bağlantısıyla mutabakat', { skip }, async () => {
  const c = await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'CUSTOMER', name: 'Dönüşecek Müşteri', email: 'donusen@x.test' } });
  const id = c.data.id;

  // Not + hatırlatma (geçmiş tarih → zamanlanmış iş bildirim üretir)
  const note = await api(`/partners/${id}/notes`, { token: A().owner, method: 'POST', body: { body: 'Aradım, cuma ödeyecek', remindAt: new Date(Date.now() - 60000).toISOString() } });
  assert.equal(note.status, 201);
  const { runPartnerReminders } = await import('../../src/services/notificationService.js');
  const { runWithTenant } = await import('../../src/utils/prisma.js');
  await runWithTenant(A().tenantId, () => runPartnerReminders());
  const notes = await P(() => prisma.notification.findMany({ where: { tenantId: A().tenantId, type: 'REMINDER' } }));
  assert.ok(notes.some((n) => n.title.includes('Dönüşecek Müşteri')));
  assert.equal((await api('/partners?reminder=mine', { token: A().owner })).data.data.some((p) => p.id === id), true);

  // Belge: yetkiyle indirilir, /uploads üzerinden açılmaz
  const up = await form(`/partners/${id}/documents`, { token: A().owner, file: Buffer.from('%PDF-1.4 test'), fileName: 'vergi-levhasi.pdf' });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const dl = await fetch(`${base}/api/partners/${id}/documents/${up.data.id}`, { headers: { 'X-Tenant': 'qtest-a', Authorization: `Bearer ${A().owner}` } });
  assert.equal(dl.status, 200);
  assert.equal((await fetch(`${base}/uploads/private/partners/${up.data.storedName}`)).status, 404);
  assert.equal((await form(`/partners/${id}/documents`, { token: A().owner, file: Buffer.from('<script>'), fileName: 'x.html' })).status, 400);
  assert.equal((await fetch(`${base}/api/partners/${id}/documents/${up.data.id}`, { headers: { 'X-Tenant': 'qtest-b', Authorization: `Bearer ${T['qtest-b'].owner}` } })).status, 404);

  // Ekstre bağlantısı → mutabakat (bir kez)
  await api('/finance/transaction', { token: A().owner, method: 'POST', body: { companyId: id, type: 'DEBT', amount: 320, description: 'Fatura B-7' } });
  const link = await api(`/partners/${id}/statement-link`, { token: A().owner, method: 'POST', body: { send: true } });
  assert.equal(link.status, 201, JSON.stringify(link.data));
  assert.equal(link.data.total, 1); // cari e-postasına
  const token = link.data.url.split('/ekstre/')[1];
  const view = await api(`/statement-links/${token}`);
  assert.equal(view.data.balance, -320);
  assert.equal(view.data.transactions.length, 1);
  assert.equal((await api(`/statement-links/${token}`, { tenant: 'qtest-b' })).status, 404);
  assert.equal((await api(`/statement-links/${token}/respond`, { method: 'POST', body: { response: 'AGREED', name: 'Ali Mali' } })).status, 200);
  assert.equal((await api(`/statement-links/${token}/respond`, { method: 'POST', body: { response: 'DISPUTED', name: 'Ali Mali', note: 'x' } })).status, 409);
  const recs = await api('/finance/reconciliations', { token: A().owner });
  assert.ok(recs.data.some((r) => r.company.id === id && r.responderName === 'Ali Mali'));

  // Bayiye dönüştür: portal girişi açılır, geçmiş korunur, bayi listesine geçer
  assert.equal((await api(`/partners/${id}/convert-to-dealer`, { token: A().clerk, method: 'POST', body: {} })).status, 403);
  const conv = await api(`/partners/${id}/convert-to-dealer`, { token: A().owner, method: 'POST', body: { password: 'Gizli12345' } });
  assert.equal(conv.status, 200, JSON.stringify(conv.data));
  assert.ok((await api('/companies', { token: A().owner })).data.some((d) => d.id === id));
  const login = await api('/auth/login', { method: 'POST', body: { email: 'donusen@x.test', password: 'Gizli12345' } });
  assert.ok(login.data.token);
  const my = await api('/finance/my-statement', { token: login.data.token });
  assert.equal(my.data.company.currentBalance, -320);
});

test('dövizli cari: USD fiyatlı ürün USD cariye liste fiyatıyla, tahsilat kurla, raporlar para birimine göre', { skip }, async () => {
  const usdProduct = await P(() => prisma.product.create({ data: { tenantId: A().tenantId, name: 'İthal Pompa', sku: 'USD-PUMP', price: 100, currency: 'USD', vatRate: 20, stock: 50 } }));
  const c = await api('/partners', { token: A().owner, method: 'POST', body: { kind: 'CUSTOMER', name: 'Dolar Müşterisi', currency: 'USD', riskLimit: 5000 } });
  assert.equal(c.status, 201);
  const id = c.data.id;
  assert.equal(c.data.currency, 'USD');

  // Teklif (TL: 100 USD × 40 = 4000 TL, 2 adet, KDV %20) → kabul → sipariş → onay: cariye 240 USD borç
  const q = await api('/quotes/draft', { token: A().owner, method: 'POST', body: { companyId: id, validUntil: valid(), items: [{ productId: usdProduct.id, quantity: 2 }] } });
  assert.equal((await api(`/quotes/${q.data.id}/submit`, { token: A().owner, method: 'POST' })).status, 200);
  const share = await api(`/quotes/${q.data.id}/share`, { token: A().owner, method: 'POST', body: {} });
  await api(`/quote-links/${share.data.url.split('/teklif/')[1]}/respond`, { method: 'POST', body: { type: 'ACCEPTED', revision: 1, name: 'Ali' } });
  const conv = await api(`/quotes/${q.data.id}/convert`, { token: A().owner, method: 'POST', body: { paymentMethod: 'CURRENT_ACCOUNT', confirmWarnings: true } });
  assert.equal(conv.status, 201, JSON.stringify(conv.data));
  const order = await P(() => prisma.order.findUnique({ where: { id: conv.data.orderId }, include: { items: true } }));
  assert.equal(order.totalAmount, 9600);
  assert.equal(order.fxRates.USD, 40);
  // Kur değişse bile sipariş kendi kuruyla işlenir
  process.env.FX_FIXED = 'USD:42,EUR:45';
  const appr = await api(`/orders/${order.id}/partial-approve`, { token: A().owner, method: 'PATCH', body: { itemStatuses: order.items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) } });
  assert.equal(appr.status, 200, JSON.stringify(appr.data));
  let tx = await api(`/partners/${id}/transactions`, { token: A().owner });
  assert.equal(tx.data.balance, -240);
  assert.equal(tx.data.rows[0].currency, 'USD');
  assert.equal(tx.data.rows[0].rate, 40);
  assert.equal(tx.data.rows[0].amountTRY, 9600);

  // TL tahsilat (kur 42): 4200 TL → 100 USD; USD tahsilat: 40 USD
  const p1 = await api(`/partners/${id}/payments`, { token: A().owner, method: 'POST', body: { direction: 'IN', method: 'WIRE_TRANSFER', amount: 4200, currency: 'TRY' } });
  assert.equal(p1.status, 201, JSON.stringify(p1.data));
  assert.equal(p1.data.payment.accountAmount, 100);
  const p2 = await api(`/partners/${id}/payments`, { token: A().owner, method: 'POST', body: { direction: 'IN', method: 'CASH', amount: 40, currency: 'USD', rate: 41.5 } });
  assert.equal(p2.data.payment.accountAmount, 40);
  assert.equal((await api(`/partners/${id}/payments`, { token: A().owner, method: 'POST', body: { direction: 'IN', method: 'CASH', amount: 1, currency: 'EUR' } })).status, 400);
  tx = await api(`/partners/${id}/transactions`, { token: A().owner });
  assert.equal(tx.data.balance, -100);
  assert.equal(tx.data.rows[0].amountTRY, 1660); // 40 × 41,5

  // Ters kayıt orijinal kurla
  const usdPay = tx.data.rows[0];
  await api(`/partners/${id}/transactions/${usdPay.id}/reverse`, { token: A().owner, method: 'POST', body: { reason: 'deneme' } });
  tx = await api(`/partners/${id}/transactions`, { token: A().owner });
  assert.equal(tx.data.balance, -140);
  assert.equal(tx.data.rows[0].rate, 41.5);

  // Hareketi olan carinin para birimi değişmez
  assert.equal((await api(`/partners/${id}`, { token: A().owner, method: 'PATCH', body: { name: 'Dolar Müşterisi', currency: 'EUR' } })).status, 400);

  // Kur farkı (bilgi) ve raporlar
  const detail = await api(`/partners/${id}`, { token: A().owner });
  assert.equal(detail.data.summary.fx.currency, 'USD');
  assert.equal(detail.data.summary.fx.balanceTRY, -5880); // 140 × 42
  const summary = await api('/finance/summary', { token: A().owner });
  const usd = summary.data.receivable.byCurrency.find((g) => g.currency === 'USD');
  assert.ok(usd && usd.amount >= 140);
  const aging = await api('/finance/aging', { token: A().owner });
  assert.ok(aging.data.totalsByCurrency.USD.total >= 140);
  assert.equal(aging.data.rows.find((r) => r.id === id).currency, 'USD');

  // Risk limiti USD: kullanılabilir = 5000 − 140 = 4860 USD
  const { availableCredit } = await import('../../src/services/pricingService.js');
  const company = await P(() => prisma.company.findUnique({ where: { id } }));
  const credit = await (await import('../../src/utils/prisma.js')).runWithTenant(A().tenantId, () => availableCredit(prisma, company));
  assert.equal(credit.available, 4860);
  assert.equal(credit.availableTRY, 204120);
  process.env.FX_FIXED = 'USD:40,EUR:45';
});
