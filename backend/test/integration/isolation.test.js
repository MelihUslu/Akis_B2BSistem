/**
 * Kiracı izolasyonu: bir firmanın kullanıcısı başka firmanın verisini göremez / değiştiremez.
 * Ayrı bir test veritabanı gerekir (çalıştırırken tablolar oluşturulur, sonunda test verisi silinir):
 *   TEST_DATABASE_URL=postgresql://akis:...@localhost:5433/akis_test npm run test:integration
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';
import { startParasutMock } from './parasutMock.js';
import { startYurticiMock } from './yurticiMock.js';

const DB = process.env.TEST_DATABASE_URL;
const skip = !DB && 'TEST_DATABASE_URL tanımlı değil';

let server, base, prisma, runAsPlatform, purgeTenant, parasut, yurtici;
const tenants = {};

const api = (path, { tenant, token, method = 'GET', body } = {}) => fetch(`${base}/api${path}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(tenant && { 'X-Tenant': tenant }), ...(token && { Authorization: `Bearer ${token}` }) },
  body: body && JSON.stringify(body)
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = DB;
  parasut = await startParasutMock({ eInvoiceVkns: ['1234567890'] });
  process.env.PARASUT_API_URL = parasut.url;
  yurtici = await startYurticiMock();
  process.env.YURTICI_TEST_URL = yurtici.url;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  ({ default: prisma, runAsPlatform } = await import('../../src/utils/prisma.js'));
  ({ purgeTenant } = await import('../../src/services/tenantDataService.js'));
  const bcrypt = (await import('bcrypt')).default;
  const { default: app } = await import('../../src/app.js');

  const plan = await runAsPlatform(() => prisma.plan.upsert({
    where: { code: 'ITEST' }, update: {},
    create: { code: 'ITEST', name: 'Test', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false }
  }));
  const password = await bcrypt.hash('Test12345', 4);
  for (const slug of ['itest-a', 'itest-b']) {
    await runAsPlatform(async () => {
      const old = await prisma.tenant.findUnique({ where: { slug } });
      if (old) await purgeTenant(old.id);
    });
    const tenant = await runAsPlatform(() => prisma.tenant.create({
      data: { slug, name: slug, contactEmail: `${slug}@x.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 86400000) }
    }));
    await runAsPlatform(() => prisma.user.create({ data: { tenantId: tenant.id, email: `admin@${slug}.test`, password, name: 'Admin', role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() } }));
    const category = await runAsPlatform(() => prisma.category.create({ data: { tenantId: tenant.id, name: `Kategori ${slug}` } }));
    const product = await runAsPlatform(() => prisma.product.create({ data: { tenantId: tenant.id, name: `Ürün ${slug}`, sku: `SKU-${slug}`, price: 10, categoryId: category.id } }));
    tenants[slug] = { id: tenant.id, productId: product.id };
  }

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const slug of Object.keys(tenants)) {
    const res = await api('/auth/login', { tenant: slug, method: 'POST', body: { email: `admin@${slug}.test`, password: 'Test12345' } });
    tenants[slug].token = res.data.token;
  }
});

after(async () => {
  if (skip) return;
  server?.close();
  parasut?.server.close();
  yurtici?.server.close();
  for (const t of Object.values(tenants)) await purgeTenant(t.id).catch(() => {});
  await prisma.$disconnect();
});

test('firma A yalnızca kendi ürünlerini görür', { skip }, async () => {
  const res = await api('/products?isAdmin=true', { tenant: 'itest-a', token: tenants['itest-a'].token });
  assert.equal(res.status, 200);
  const list = Array.isArray(res.data) ? res.data : res.data.data;
  assert.ok(list.length >= 1);
  assert.ok(list.every((p) => p.sku !== 'SKU-itest-b'));
});

test('firma A’nın oturumu firma B adresinde reddedilir', { skip }, async () => {
  const res = await api('/products', { tenant: 'itest-b', token: tenants['itest-a'].token });
  assert.equal(res.status, 401);
});

test('firma A, B’nin ürününü güncelleyemez / silemez', { skip }, async () => {
  const id = tenants['itest-b'].productId;
  const upd = await api(`/products/${id}`, { tenant: 'itest-a', token: tenants['itest-a'].token, method: 'PATCH', body: { name: 'ele geçirildi' } });
  assert.equal(upd.status, 404);
  const del = await api(`/products/${id}`, { tenant: 'itest-a', token: tenants['itest-a'].token, method: 'DELETE' });
  assert.equal(del.status, 404);
  const still = await runAsPlatform(() => prisma.product.findUnique({ where: { id } }));
  assert.equal(still.name, 'Ürün itest-b');
});

test('firma bağlamı olmadan veritabanı sorgusu yapılamaz', { skip }, async () => {
  await assert.rejects(() => prisma.product.findMany());
});

test('olmayan firma adresi 404', { skip }, async () => {
  const res = await api('/tenant/public', { tenant: 'yok-boyle-firma' });
  assert.equal(res.status, 404);
});

test('satış raporu: kupon orantılı düşülür, iptal kalem sayılmaz, diğer firma görmez', { skip }, async () => {
  const a = tenants['itest-a'];
  const day = new Date().toLocaleDateString('sv-SE'); // yerel tarih (YYYY-MM-DD)
  await runAsPlatform(async () => {
    await prisma.product.update({ where: { id: a.productId }, data: { costPrice: 6, currency: 'TL' } });
    const company = await prisma.company.create({ data: { tenantId: a.id, name: 'Rapor Bayi', status: 'ACTIVE' } });
    const user = await prisma.user.findFirst({ where: { tenantId: a.id } });
    await prisma.order.create({
      data: {
        tenantId: a.id, companyId: company.id, userId: user.id, status: 'APPROVED', totalAmount: 0, discountAmount: 20,
        items: { create: [
          { tenantId: a.id, productId: a.productId, quantity: 10, price: 10, vatRate: 20, status: 'APPROVED' },
          { tenantId: a.id, productId: a.productId, quantity: 5, price: 10, vatRate: 20, status: 'CANCELLED' }
        ] }
      }
    });
  });
  const res = await api(`/reports/sales?from=${day}&to=${day}`, { tenant: 'itest-a', token: a.token });
  assert.equal(res.status, 200);
  // 10 × 10 = 100, 20 TL kupon → 80 ciro; maliyet 10 × 6 = 60 → kâr 20 (%25)
  assert.equal(res.data.summary.revenue, 80);
  assert.equal(res.data.summary.quantity, 10);
  assert.equal(res.data.summary.grossProfit, 20);
  assert.equal(res.data.summary.margin, 25);
  assert.equal(res.data.dealers[0].name, 'Rapor Bayi');

  const other = await api(`/reports/sales?from=${day}&to=${day}`, { tenant: 'itest-b', token: tenants['itest-b'].token });
  assert.equal(other.data.summary.revenue, 0);
});

test('e-fatura (Paraşüt): ayar, bağlantı testi, e-fatura mükellefine kesme, PDF, bayinin görmesi', { skip }, async () => {
  const a = tenants['itest-a'];
  const admin = { tenant: 'itest-a', token: a.token };
  const creds = { provider: 'PARASUT', autoOn: 'MANUAL', clientId: 'cid', clientSecret: 'csec', username: 'u@x', password: 'yanlis', companyId: '555' };

  const bad = await api('/invoicing/test', { ...admin, method: 'POST', body: creds });
  assert.equal(bad.status, 400);
  assert.match(bad.data.message, /hatalı/);
  const ok = await api('/invoicing/test', { ...admin, method: 'POST', body: { ...creds, password: 'dogru' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.companies[0].id, '555');
  assert.equal((await api('/invoicing', { ...admin, method: 'PUT', body: { ...creds, password: 'dogru' } })).status, 200);
  const saved = await api('/invoicing', admin);
  assert.equal(saved.data.configured, true);
  assert.equal(saved.data.hasPassword, true);
  assert.equal(saved.data.password, undefined); // şifre geri gönderilmez

  const order = await runAsPlatform(async () => {
    const company = await prisma.company.create({ data: { tenantId: a.id, name: 'Fatura Bayi', taxNumber: '1234567890', taxOffice: 'Kadıköy', status: 'ACTIVE' } });
    const user = await prisma.user.findFirst({ where: { tenantId: a.id } });
    return prisma.order.create({
      data: { tenantId: a.id, companyId: company.id, userId: user.id, status: 'APPROVED', totalAmount: 120, discountAmount: 0,
        items: { create: [{ tenantId: a.id, productId: a.productId, quantity: 2, price: 50, vatRate: 20, status: 'APPROVED' }] } }
    });
  });
  const issued = await api(`/orders/${order.id}/invoice?wait=true`, { ...admin, method: 'POST' });
  assert.equal(issued.status, 200, issued.data?.message);
  assert.equal(issued.data.invoice.status, 'ISSUED');
  assert.equal(issued.data.invoice.number, 'GIB2026000000123');
  assert.equal(issued.data.invoice.documentType, 'E_FATURA');

  // Paraşüt'e giden fatura satırı ve alıcının e-fatura adresi
  const inv = parasut.calls.find((c) => c.method === 'POST' && c.path.endsWith('/sales_invoices'));
  assert.equal(inv.body.data.relationships.details.data[0].attributes.quantity, 2);
  assert.equal(inv.body.data.relationships.details.data[0].attributes.unit_price, 50);
  assert.ok(parasut.calls.some((c) => c.path.endsWith('/e_invoices') && c.body.data.attributes.to === 'urn:mail:defaultpk@x'));

  const again = await api(`/orders/${order.id}/invoice?wait=true`, { ...admin, method: 'POST' });
  assert.equal(again.status, 400); // ikinci kez kesilmez
  const pdf = await api(`/orders/${order.id}/invoice/pdf`, admin);
  assert.equal(pdf.data.url, 'https://pdf.example/77.pdf');

  // Diğer firma bu siparişin faturasına erişemez
  assert.equal((await api(`/orders/${order.id}/invoice`, { tenant: 'itest-b', token: tenants['itest-b'].token })).status, 404);
});

test('e-fatura: ERP / elle fatura numarası', { skip }, async () => {
  const a = tenants['itest-a'];
  const admin = { tenant: 'itest-a', token: a.token };
  const order = await runAsPlatform(async () => {
    const company = await prisma.company.findFirst({ where: { tenantId: a.id, name: 'Rapor Bayi' } });
    const user = await prisma.user.findFirst({ where: { tenantId: a.id } });
    return prisma.order.create({ data: { tenantId: a.id, companyId: company.id, userId: user.id, status: 'SHIPPED', totalAmount: 10, items: { create: [{ tenantId: a.id, productId: a.productId, quantity: 1, price: 10, vatRate: 0 }] } } });
  });
  assert.equal((await api(`/orders/${order.id}/invoice`, { ...admin, method: 'PUT', body: { number: '' } })).status, 400);
  assert.equal((await api(`/orders/${order.id}/invoice`, { ...admin, method: 'PUT', body: { number: 'A-1', pdfUrl: 'javascript:alert(1)' } })).status, 400);
  const res = await api(`/orders/${order.id}/invoice`, { ...admin, method: 'PUT', body: { number: 'ERP-2026-55', documentType: 'E_ARSIV', pdfUrl: 'https://erp.example/55.pdf' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.invoice.provider, 'MANUAL');
  const pdf = await api(`/orders/${order.id}/invoice/pdf`, admin);
  assert.equal(pdf.data.url, 'https://erp.example/55.pdf');
});

test('platform abonelik faturası: ödeme kaydedilince Paraşüt\'te kesilir (KDV ayrıştırılır)', { skip }, async () => {
  Object.assign(process.env, { PARASUT_CLIENT_ID: 'cid', PARASUT_CLIENT_SECRET: 'csec', PARASUT_USERNAME: 'p@x', PARASUT_PASSWORD: 'dogru', PARASUT_COMPANY_ID: '555' });
  const { recordSuccessfulPayment } = await import('../../src/services/subscriptionService.js');
  const a = tenants['itest-a'];
  const before = parasut.calls.length;
  const { payment } = await runAsPlatform(async () => {
    const tenant = await prisma.tenant.findUnique({ where: { id: a.id } });
    const plan = await prisma.plan.findUnique({ where: { code: 'ITEST' } });
    return recordSuccessfulPayment({ tenant, plan, cycle: 'MONTHLY', amount: 1200, method: 'MANUAL', reference: `itest-${Date.now()}` });
  });
  let final;
  for (let i = 0; i < 20 && final?.invoiceStatus !== 'ISSUED'; i++) {
    await new Promise((r) => setTimeout(r, 150));
    final = await runAsPlatform(() => prisma.subscriptionPayment.findUnique({ where: { id: payment.id } }));
  }
  assert.equal(final.invoiceStatus, 'ISSUED', final.invoiceError);
  assert.equal(final.invoiceNumber, 'GIB2026000000123');
  const line = parasut.calls.slice(before).find((c) => c.method === 'POST' && c.path.endsWith('/sales_invoices')).body.data.relationships.details.data[0].attributes;
  assert.equal(line.unit_price, 1000); // 1200 KDV dahil → 1000 + %20
  assert.equal(line.vat_rate, 20);
  for (const k of ['PARASUT_CLIENT_ID', 'PARASUT_CLIENT_SECRET', 'PARASUT_USERNAME', 'PARASUT_PASSWORD', 'PARASUT_COMPANY_ID']) delete process.env[k];
});

test('teslimat adresi + kargo (Yurtiçi): adres, siparişe kopyalama, gönderi, takip no ile kargoda, teslim', { skip }, async () => {
  const a = tenants['itest-a'];
  const admin = { tenant: 'itest-a', token: a.token };
  // Bayi kullanıcısı ve adresleri
  const bcrypt = (await import('bcrypt')).default;
  const company = await runAsPlatform(async () => {
    const c = await prisma.company.create({ data: { tenantId: a.id, name: 'Kargo Bayi', status: 'ACTIVE', riskLimit: 100000, taxNumber: '1111111111' } });
    await prisma.user.create({ data: { tenantId: a.id, companyId: c.id, email: 'bayi@itest-a.test', password: await bcrypt.hash('Test12345', 4), name: 'Bayi', role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() } });
    return c;
  });
  const login = await api('/auth/login', { tenant: 'itest-a', method: 'POST', body: { email: 'bayi@itest-a.test', password: 'Test12345' } });
  const dealer = { tenant: 'itest-a', token: login.data.token };

  assert.equal((await api('/addresses', { ...dealer, method: 'POST', body: { title: 'Depo' } })).status, 400);
  const first = await api('/addresses', { ...dealer, method: 'POST', body: { title: 'Merkez', contactName: 'Ali', phone: '05550000000', city: 'İstanbul', district: 'Kadıköy', line: 'Atatürk Caddesi No:1' } });
  assert.equal(first.data.address.isDefault, true); // ilk adres varsayılan
  const second = await api('/addresses', { ...dealer, method: 'POST', body: { title: 'Ankara Şube', contactName: 'Veli', phone: '05551111111', city: 'Ankara', district: 'Çankaya', line: 'Kızılay Meydanı No:5', isDefault: true } });
  const list = await api('/addresses', dealer);
  assert.equal(list.data.filter((x) => x.isDefault).length, 1);
  assert.equal(list.data[0].id, second.data.address.id);
  // Başka firmanın bayisi bu adresi göremez
  const foreign = await api(`/addresses/${first.data.address.id}`, { tenant: 'itest-b', token: tenants['itest-b'].token, method: 'DELETE' });
  assert.ok(foreign.status >= 400);
  assert.ok(await runAsPlatform(() => prisma.deliveryAddress.findUnique({ where: { id: first.data.address.id } })));

  const order = await api('/orders', { ...dealer, method: 'POST', body: { items: [{ productId: a.productId, quantity: 1 }], paymentMethod: 'WIRE_TRANSFER', addressId: first.data.address.id } });
  assert.equal(order.status, 201, order.data?.message);
  assert.equal(order.data.shippingAddress.city, 'İstanbul');
  // Adres sonradan değişse de sipariş eski adresi korur
  await api(`/addresses/${first.data.address.id}`, { ...dealer, method: 'PATCH', body: { city: 'İzmir' } });
  const saved = await runAsPlatform(() => prisma.order.findUnique({ where: { id: order.data.id } }));
  assert.equal(saved.shippingAddress.city, 'İstanbul');

  // Kargo ayarı: yanlış şifre reddedilir, doğrusu kaydedilir
  assert.equal((await api('/cargo-settings/test', { ...admin, method: 'POST', body: { username: 'YKTEST', password: 'x' } })).status, 400);
  assert.equal((await api('/cargo-settings', { ...admin, method: 'PUT', body: { provider: 'YURTICI', mode: 'TEST', username: 'YKTEST', password: 'YK' } })).status, 200);

  const id = order.data.id;
  assert.equal((await api(`/orders/${id}/shipment`, { ...admin, method: 'POST' })).status, 400); // onaylanmadan olmaz
  await runAsPlatform(() => prisma.order.update({ where: { id }, data: { status: 'APPROVED' } }));
  const created = await api(`/orders/${id}/shipment`, { ...admin, method: 'POST' });
  assert.equal(created.status, 200, created.data?.message);
  assert.equal(created.data.order.shipmentKey, `AK${id}`);

  let r = await api(`/orders/${id}/shipment/refresh`, { ...admin, method: 'POST' });
  assert.equal(r.data.order.status, 'APPROVED'); // kargo henüz teslim almadı
  r = await api(`/orders/${id}/shipment/refresh`, { ...admin, method: 'POST' });
  assert.equal(r.data.order.status, 'SHIPPED');
  assert.equal(r.data.order.trackingNumber, `YKAK${id}`);
  r = await api(`/orders/${id}/shipment/refresh`, { ...admin, method: 'POST' });
  assert.equal(r.data.order.status, 'COMPLETED');
  assert.ok(company.id);
});

test('çoklu depo: ilk depoya aktarım, depodan sipariş karşılama, iptal, transfer, ERP, silme', { skip }, async () => {
  const b = tenants['itest-b'];
  const admin = { tenant: 'itest-b', token: b.token };
  const pid = b.productId;
  const stockOf = () => runAsPlatform(() => prisma.product.findUnique({ where: { id: pid } })).then((p) => p.stock);
  const whStock = (warehouseId) => runAsPlatform(() => prisma.warehouseStock.findUnique({ where: { warehouseId_productId: { warehouseId, productId: pid } } })).then((r) => r?.quantity ?? 0);

  await runAsPlatform(() => prisma.product.update({ where: { id: pid }, data: { stock: 10 } }));
  const ist = (await api('/warehouses', { ...admin, method: 'POST', body: { name: 'İstanbul', code: 'ist' } })).data.warehouse;
  assert.equal(ist.isDefault, true);
  assert.equal(ist.code, 'IST');
  assert.equal(await whStock(ist.id), 10); // mevcut stok ilk depoya aktarıldı
  const ank = (await api('/warehouses', { ...admin, method: 'POST', body: { name: 'Ankara', code: 'ANK' } })).data.warehouse;
  assert.equal((await api('/warehouses', { ...admin, method: 'POST', body: { name: 'Kopya', code: 'ANK' } })).status, 400);

  // Ürün formundan depo bazında stok
  await api(`/products/${pid}`, { ...admin, method: 'PATCH', body: { warehouseStocks: [{ warehouseId: ist.id, quantity: 4 }, { warehouseId: ank.id, quantity: 6 }] } });
  assert.equal(await stockOf(), 10);

  // Ankara deposundan 5 adetlik sipariş
  const order = await runAsPlatform(async () => {
    const company = await prisma.company.create({ data: { tenantId: b.id, name: 'Depo Bayi', status: 'ACTIVE' } });
    const user = await prisma.user.findFirst({ where: { tenantId: b.id } });
    return prisma.order.create({ data: { tenantId: b.id, companyId: company.id, userId: user.id, status: 'PENDING', totalAmount: 50, items: { create: [{ tenantId: b.id, productId: pid, quantity: 5, price: 10, vatRate: 0 }] } }, include: { items: true } });
  });
  const itemId = order.items[0].id;
  // İstanbul'da 4 adet var → yetersiz
  const short = await api(`/orders/${order.id}/partial-approve`, { ...admin, method: 'PATCH', body: { warehouseId: ist.id, itemStatuses: [{ itemId, status: 'APPROVED' }] } });
  assert.equal(short.status, 400);
  assert.match(short.data.message, /stok: 4/);
  const ok = await api(`/orders/${order.id}/partial-approve`, { ...admin, method: 'PATCH', body: { warehouseId: ank.id, itemStatuses: [{ itemId, status: 'APPROVED' }] } });
  assert.equal(ok.status, 200, ok.data?.message);
  assert.equal(await whStock(ank.id), 1);
  assert.equal(await whStock(ist.id), 4);
  assert.equal(await stockOf(), 5);
  // Kalem iptali → stok Ankara'ya geri döner
  await api(`/orders/${order.id}/partial-approve`, { ...admin, method: 'PATCH', body: { itemStatuses: [{ itemId, status: 'CANCELLED' }] } });
  assert.equal(await whStock(ank.id), 6);
  assert.equal(await stockOf(), 10);

  // Transfer
  assert.equal((await api('/warehouses/transfer', { ...admin, method: 'POST', body: { productId: pid, fromWarehouseId: ist.id, toWarehouseId: ank.id, quantity: 50 } })).status, 400);
  assert.equal((await api('/warehouses/transfer', { ...admin, method: 'POST', body: { productId: pid, fromWarehouseId: ist.id, toWarehouseId: ank.id, quantity: 3 } })).status, 200);
  assert.equal(await whStock(ist.id), 1);
  assert.equal(await whStock(ank.id), 9);
  assert.equal(await stockOf(), 10);

  // Formdan toplam stok girilirse fark varsayılan depoya yazılır
  await api(`/products/${pid}`, { ...admin, method: 'PATCH', body: { stock: 15 } });
  assert.equal(await whStock(ist.id), 6);
  assert.equal(await stockOf(), 15);

  // Ankara deposu silinir → stoğu İstanbul'a taşınır, toplam aynı
  assert.equal((await api(`/warehouses/${ank.id}`, { ...admin, method: 'DELETE' })).status, 200);
  assert.equal(await whStock(ist.id), 15);
  assert.equal(await stockOf(), 15);
});

test('bildirimler: personel yalnızca yetkili olduğu konuda bildirim alır; e-posta tercihleri kaydedilir', { skip }, async () => {
  const a = tenants['itest-a'];
  const { notifyAdmins } = await import('../../src/services/notificationService.js');
  const { runWithTenant } = await import('../../src/utils/prisma.js');
  const bcrypt = (await import('bcrypt')).default;
  const staff = await runAsPlatform(async () => prisma.user.create({ data: { tenantId: a.id, email: 'katalog@itest-a.test', password: await bcrypt.hash('Test12345', 4), name: 'Katalogcu', role: 'ADMIN', permissions: ['CATALOG'] } }));
  const owner = await runAsPlatform(() => prisma.user.findFirst({ where: { tenantId: a.id, isOwner: true, role: 'ADMIN' } }));
  await runWithTenant(a.id, () => notifyAdmins({ type: 'ORDER', title: 'itest yeni sipariş', message: 'x' }));
  await runWithTenant(a.id, () => notifyAdmins({ type: 'STOCK', title: 'itest stok', message: 'x' }));
  const got = (userId) => runAsPlatform(() => prisma.notification.findMany({ where: { userId, title: { startsWith: 'itest' } } })).then((l) => l.map((n) => n.type).sort());
  assert.deepEqual(await got(owner.id), ['ORDER', 'STOCK']);
  assert.deepEqual(await got(staff.id), ['STOCK']);

  const admin = { tenant: 'itest-a', token: a.token };
  const prefs = await api('/auth/notification-prefs', admin);
  assert.equal(prefs.data.prefs.ORDER, true); // varsayılan açık
  assert.ok(prefs.data.types.some((t) => t.id === 'ORDER'));
  assert.ok(!prefs.data.types.some((t) => t.id === 'PAYMENT_DUE')); // bayiye özel tür yöneticiye gösterilmez
  const saved = await api('/auth/notification-prefs', { ...admin, method: 'PUT', body: { prefs: { ORDER: false, HACK: true } } });
  assert.equal(saved.data.prefs.ORDER, false);
  assert.equal(saved.data.prefs.HACK, undefined);
});

test('ERP API: OpenAPI belgesi, siparişte adres/fatura, kargo durumu ortak akıştan', { skip }, async () => {
  const a = tenants['itest-a'];
  const spec = await fetch(`${base}/api/v1/openapi.json`).then((r) => r.json());
  assert.equal(spec.openapi, '3.1.0');
  assert.ok(spec.paths['/orders/{id}/invoice'].put);

  const key = (await api('/integrations/keys', { tenant: 'itest-a', token: a.token, method: 'POST', body: { name: 'ERP test' } })).data;
  const raw = key.key || key.apiKey || key.token;
  assert.ok(raw, JSON.stringify(key));
  const v1 = (path, opts = {}) => fetch(`${base}/api/v1${path}`, { method: opts.method || 'GET', headers: { 'X-API-Key': raw, 'Content-Type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) }).then(async (r) => ({ status: r.status, data: await r.json() }));

  const order = await runAsPlatform(async () => {
    const company = await prisma.company.findFirst({ where: { tenantId: a.id, name: 'Kargo Bayi' } });
    const user = await prisma.user.findFirst({ where: { tenantId: a.id, companyId: company.id } });
    return prisma.order.create({ data: { tenantId: a.id, companyId: company.id, userId: user.id, status: 'APPROVED', totalAmount: 10, shippingAddress: { title: 'Depo', city: 'Bursa', district: 'Nilüfer', line: 'Organize Sanayi 1. Cad.' }, items: { create: [{ tenantId: a.id, productId: a.productId, quantity: 1, price: 10, vatRate: 0 }] } } });
  });
  const got = await v1(`/orders/${order.id}`);
  assert.equal(got.data.shippingAddress.city, 'Bursa');
  assert.equal(got.data.invoice, null);
  const shipped = await v1(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'SHIPPED', trackingNumber: 'ARAS123', cargoCompany: 'aras' } });
  assert.equal(shipped.data.status, 'SHIPPED');
  // Bildirim arka planda oluşur (asıl işlemi bekletmez); kısa süre beklenir
  let n = 0;
  for (let i = 0; i < 20 && !n; i++) {
    await new Promise((r) => setTimeout(r, 50));
    n = await runAsPlatform(() => prisma.notification.count({ where: { title: 'Siparişiniz kargoya verildi', message: { contains: 'ARAS123' } } }));
  }
  assert.ok(n >= 1); // bayiye bildirim ortak akıştan gitti
  assert.equal((await v1(`/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'COMPLETED' } })).data.status, 'COMPLETED');
  assert.equal((await v1(`/orders/${order.id}/invoice`, { method: 'PUT', body: { number: 'ERP-1' } })).status, 200);
  assert.equal((await v1(`/orders/${order.id}`)).data.invoice.number, 'ERP-1');
});

test('webhook kuyruğu: hata kaydedilir, zamanı gelince yeniden denenir, elle yeniden gönderilir, imza doğru', { skip }, async () => {
  const http = await import('http');
  const crypto = await import('crypto');
  const received = [];
  let failNext = 1;
  const receiver = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      received.push({ body: raw, sig: req.headers['x-webhook-signature'], event: req.headers['x-webhook-event'] });
      if (failNext-- > 0) { res.writeHead(500); return res.end(); }
      res.writeHead(200); res.end('ok');
    });
  });
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  const a = tenants['itest-a'];
  const admin = { tenant: 'itest-a', token: a.token };
  const created = await api('/integrations/webhooks', { ...admin, method: 'POST', body: { url: `http://127.0.0.1:${receiver.address().port}/hook`, events: ['order.updated'] } });
  assert.equal(created.status, 201, created.data?.message);
  const hook = created.data.webhook || created.data;
  const secret = (await runAsPlatform(() => prisma.webhook.findUnique({ where: { id: hook.id } }))).secret;

  const { emitEvent, processWebhookQueue } = await import('../../src/services/webhookService.js');
  emitEvent(a.id, 'order.updated', { id: 1, status: 'SHIPPED' });
  emitEvent(a.id, 'order.created', { id: 2 }); // abonelik yok → gönderilmez
  const deliveries = () => runAsPlatform(() => prisma.webhookDelivery.findMany({ where: { webhookId: hook.id } }));
  let list = [];
  for (let i = 0; i < 40 && !(list[0]?.attempts >= 1 && list[0].status !== 'SENDING'); i++) { await new Promise((r) => setTimeout(r, 50)); list = await deliveries(); }
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'PENDING'); // ilk deneme 500 → sıraya alındı
  assert.equal(list[0].lastStatusCode, 500);
  assert.ok(list[0].nextAttemptAt > new Date(Date.now() + 30_000)); // ~1 dk sonra

  // Zamanı gelince kuyruk işi yeniden dener
  await runAsPlatform(() => prisma.webhookDelivery.update({ where: { id: list[0].id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } }));
  await processWebhookQueue();
  list = await deliveries();
  assert.equal(list[0].status, 'SUCCESS');
  assert.equal(list[0].attempts, 2);

  // İmza: aynı gövdenin HMAC-SHA256'sı; iki denemede gövde aynı
  const last = received.at(-1);
  assert.equal(last.sig, crypto.createHmac('sha256', secret).update(last.body).digest('hex'));
  assert.equal(received[0].body, last.body);

  // Panel: gönderim kaydı ve elle yeniden gönderme
  const log = await api(`/integrations/webhooks/${hook.id}/deliveries`, admin);
  assert.equal(log.data.data[0].status, 'SUCCESS');
  const again = await api(`/integrations/deliveries/${list[0].id}/redeliver`, { ...admin, method: 'POST' });
  assert.equal(again.data.delivery.status, 'SUCCESS');
  assert.equal(received.length, 3);
  receiver.close();
});
