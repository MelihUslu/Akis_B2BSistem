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
import { startWhatsappMock } from './whatsappMock.js';
import crypto from 'crypto';

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

test('test (sandbox) API anahtarı: okur, yazmaları doğrular ama kaydetmez', { skip }, async () => {
  const a = tenants['itest-a'];
  const created = (await api('/integrations/keys', { tenant: 'itest-a', token: a.token, method: 'POST', body: { name: 'Sandbox', isTest: true } })).data;
  assert.match(created.key, /^akb2b_test_/);
  const v1 = (path, opts = {}) => fetch(`${base}/api/v1${path}`, { method: opts.method || 'GET', headers: { 'X-API-Key': created.key, 'Content-Type': 'application/json' }, body: opts.body && JSON.stringify(opts.body) })
    .then(async (r) => ({ status: r.status, testHeader: r.headers.get('x-test-mode'), data: await r.json() }));
  const before = await runAsPlatform(() => prisma.product.findUnique({ where: { id: a.productId } }));

  const list = await v1('/products');
  assert.equal(list.testHeader, 'true');
  assert.ok(list.data.data.some((p) => p.sku === 'SKU-itest-a')); // gerçek veri okunur

  const stock = await v1('/products/stock', { method: 'PUT', body: [{ sku: 'SKU-itest-a', stock: 9999 }, { sku: 'YOK', stock: 1 }] });
  assert.deepEqual(stock.data, { updated: 1, notFound: ['YOK'], dryRun: true });
  const prices = await v1('/products/prices', { method: 'PUT', body: [{ sku: 'SKU-itest-a', price: 1 }] });
  assert.equal(prices.data.updated, 1);
  const upsert = await v1('/products/upsert', { method: 'POST', body: [{ sku: 'YENI-SANDBOX', name: 'Yeni', price: 5, category: 'Sandbox Kategori' }, { sku: 'EKSIK' }] });
  assert.equal(upsert.data.created, 1);
  assert.equal(upsert.data.errors.length, 1); // doğrulama test modunda da çalışır

  const after = await runAsPlatform(() => prisma.product.findUnique({ where: { id: a.productId } }));
  assert.equal(after.stock, before.stock);
  assert.equal(after.price, before.price);
  assert.equal(await runAsPlatform(() => prisma.product.count({ where: { sku: 'YENI-SANDBOX' } })), 0);
  assert.equal(await runAsPlatform(() => prisma.category.count({ where: { name: 'Sandbox Kategori' } })), 0);

  const sample = await v1('/webhooks/test', { method: 'POST', body: { event: 'order.updated' } });
  assert.ok([202, 400].includes(sample.status)); // webhook varsa 202
  assert.equal((await v1('/webhooks/test', { method: 'POST', body: { event: 'yok.boyle' } })).status, 400);
});

test('hata izleme: aynı hata gruplanır, tarayıcı hatası kaydedilir, kullanıcı hatası (400) kaydedilmez', { skip }, async () => {
  const { recordError } = await import('../../src/services/errorTracker.js');
  const err = new Error(`itest bağlantı koptu id=${Date.now()}`);
  await recordError({ error: err, path: '/api/orders/15' });
  await recordError({ error: new Error(`itest bağlantı koptu id=${Date.now() + 1}`), path: '/api/orders/99', stack: err.stack });
  const rows = await runAsPlatform(() => prisma.errorLog.findMany({ where: { message: { startsWith: 'itest bağlantı' } } }));
  assert.equal(rows.length, 1); // id'ler farklı ama aynı hata
  assert.equal(rows[0].count, 2);

  const r = await fetch(`${base}/api/public/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'itest TypeError: x is undefined', stack: 'at Foo (app.js:1:2)', url: 'http://demo.localhost:5173/admin/orders?q=1' }) });
  assert.equal(r.status, 204);
  await new Promise((res) => setTimeout(res, 100));
  const client = await runAsPlatform(() => prisma.errorLog.findFirst({ where: { message: 'itest TypeError: x is undefined' } }));
  assert.equal(client.source, 'CLIENT');
  assert.equal(client.path, '/admin/orders');

  const before = await runAsPlatform(() => prisma.errorLog.count());
  const form = new FormData();
  form.append('file', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  const up = await fetch(`${base}/api/account/support/upload`, { method: 'POST', headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${tenants['itest-a'].token}` }, body: form });
  assert.equal(up.status, 400);
  assert.equal(await runAsPlatform(() => prisma.errorLog.count()), before);
  await runAsPlatform(() => prisma.errorLog.deleteMany({ where: { message: { startsWith: 'itest' } } }));
});

test('ortak giriş (/giris): şifre doğrulanır, portala tek kullanımlık ve yalnızca o firmada geçerli kodla geçilir', { skip }, async () => {
  const bad = await api('/public/login', { method: 'POST', body: { email: 'admin@itest-a.test', password: 'yanlis' } });
  assert.equal(bad.status, 401);
  const ok = await api('/public/login', { method: 'POST', body: { email: ' ADMIN@itest-a.test ', password: 'Test12345' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.portals.length, 1);
  const [portal] = ok.data.portals;
  assert.equal(portal.slug, 'itest-a');
  assert.equal(portal.role, 'Yönetici');

  const wrongTenant = await api('/auth/handoff', { tenant: 'itest-b', method: 'POST', body: { code: portal.code } });
  assert.equal(wrongTenant.status, 401, 'kod başka firmada geçmez');
  const session = await api('/auth/handoff', { tenant: 'itest-a', method: 'POST', body: { code: portal.code } });
  assert.equal(session.status, 200);
  assert.ok(session.data.token);
  assert.equal(session.data.user.email, 'admin@itest-a.test');
  const me = await api('/auth/me', { tenant: 'itest-a', token: session.data.token });
  assert.equal(me.status, 200);
  const again = await api('/auth/handoff', { tenant: 'itest-a', method: 'POST', body: { code: portal.code } });
  assert.equal(again.status, 401, 'kod ikinci kez kullanılamaz');
  assert.equal((await api('/auth/handoff', { tenant: 'itest-a', method: 'POST', body: { code: 'sahte' } })).status, 401);
});

test('müşteri adayları: talep formu, elle ekleme, filtre, firma ayrımı ve Excel', { skip }, async () => {
  const A = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const B = { tenant: 'itest-b', token: tenants['itest-b'].token };

  const noConsent = await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: { name: 'Ayşe', phone: '0532 111 22 33' } });
  assert.equal(noConsent.status, 400);
  const form = await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: { name: 'Ayşe Yılmaz', phone: '+90 532 111 22 33', request: '10 koli deterjan', k: 'instagram', campaign: 'Kasım reklamı', kvkkConsent: true } });
  assert.equal(form.status, 201);
  // Aynı numara 24 saat içinde tekrar yazarsa talep aynı kayda eklenir
  await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: { name: 'Ayşe Yılmaz', phone: '05321112233', request: '5 koli daha', kvkkConsent: true } });

  const manual = await api('/customer-leads', { ...A, method: 'POST', body: { name: '@mehmet_insaat', phone: '5441234567', source: 'WHATSAPP', request: 'Fiyat listesi istedi' } });
  assert.equal(manual.status, 201);
  assert.equal(manual.data.lead.phone, '05441234567');

  const list = await api('/customer-leads', A);
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 2);
  const ayse = list.data.items.find((l) => l.name === 'Ayşe Yılmaz');
  assert.equal(ayse.phone, '05321112233');
  assert.equal(ayse.source, 'INSTAGRAM');
  assert.equal(ayse.campaign, 'Kasım reklamı');
  assert.match(ayse.request, /10 koli deterjan[\s\S]*5 koli daha/);
  assert.deepEqual(list.data.campaigns, ['Kasım reklamı']);

  const upd = await api(`/customer-leads/${ayse.id}`, { ...A, method: 'PATCH', body: { status: 'ORDERED', note: 'Siparişi alındı' } });
  assert.equal(upd.data.lead.status, 'ORDERED');
  const filtered = await api('/customer-leads?status=ORDERED', A);
  assert.equal(filtered.data.total, 1);
  assert.equal(filtered.data.counts.NEW, 1, 'sekme sayıları durum filtresinden bağımsız');
  assert.equal((await api('/customer-leads?q=532 111', A)).data.items[0].name, 'Ayşe Yılmaz', 'telefonla arama');

  // Başka firma göremez, değiştiremez
  assert.equal((await api('/customer-leads', B)).data.total, 0);
  assert.equal((await api(`/customer-leads/${ayse.id}`, { ...B, method: 'PATCH', body: { status: 'LOST' } })).status, 404);

  const xlsx = await fetch(`${base}/api/customer-leads/export`, { headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` } });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get('content-type'), /spreadsheetml/);

  assert.equal((await api(`/customer-leads/${ayse.id}`, { ...A, method: 'DELETE' })).status, 200);
  assert.equal((await api('/customer-leads', A)).data.total, 1);
});

test('talep formu panelden özelleştirilir: alanlar, ek sorular, yanıtlar Excel sütunu olur', { skip }, async () => {
  const A = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const def = await api('/lead-form', { tenant: 'itest-a' });
  assert.deepEqual(def.data.fields.map((f) => f.key), ['name', 'phone', 'city', 'request'], 'varsayılan alanlar');

  const saved = await api('/customer-leads/form', { ...A, method: 'PUT', body: {
    title: 'Toptan fiyat alın', buttonText: 'Gönder',
    fields: [
      { key: 'name', enabled: false, required: false, label: 'Adınız' }, // ad kapatılamaz
      { key: 'phone', enabled: true, required: true, label: 'Cep telefonu' },
      { key: 'email', enabled: true, required: true, label: 'E-posta' },
      { key: 'city', enabled: false },
      { label: 'Kaç koli?', type: 'number', required: true },
      { label: 'İşletme türü', type: 'select', options: 'Market, Toptancı, Otel', required: false },
      { label: 'Tek seçenekli liste', type: 'select', options: 'Tek' } // geçersiz, atılır
    ]
  } });
  assert.equal(saved.status, 200);
  const keys = saved.data.form.fields.map((f) => f.key);
  assert.equal(saved.data.form.fields.find((f) => f.key === 'name').enabled, true);
  assert.equal(saved.data.form.fields.filter((f) => f.custom).length, 2);
  assert.ok(keys.includes('request'), 'listede olmayan hazır alan geri eklenir');

  const pub = await api('/lead-form', { tenant: 'itest-a' });
  assert.equal(pub.data.title, 'Toptan fiyat alın');
  assert.ok(!pub.data.fields.some((f) => f.key === 'city'), 'kapalı alan formda görünmez');
  const [qty, kind] = pub.data.fields.filter((f) => f.custom);

  const person = { name: 'Ali Veli', phone: '0533 222 33 44', email: 'ali@ornek.com', kvkkConsent: true };
  assert.equal((await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: person })).status, 400, 'zorunlu ek soru boş');
  assert.equal((await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: { ...person, [qty.key]: '5', [kind.key]: 'Kafe' } })).status, 400, 'liste dışı seçim');
  assert.equal((await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: { ...person, email: '', [qty.key]: '5' } })).status, 400, 'zorunlu e-posta');
  const ok = await api('/lead-form', { tenant: 'itest-a', method: 'POST', body: { ...person, city: 'Gizli', [qty.key]: '12', [kind.key]: 'Otel' } });
  assert.equal(ok.status, 201);

  const lead = (await api('/customer-leads?q=Ali Veli', A)).data.items[0];
  assert.equal(lead.email, 'ali@ornek.com');
  assert.equal(lead.city, '', 'kapalı alanın değeri kaydedilmez');
  assert.deepEqual(lead.answers, [{ label: 'Kaç koli?', value: '12' }, { label: 'İşletme türü', value: 'Otel' }]);

  const xlsxRes = await fetch(`${base}/api/customer-leads/export`, { headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` } });
  const { default: xlsx } = await import('xlsx');
  const sheet = xlsx.read(Buffer.from(await xlsxRes.arrayBuffer()));
  const header = xlsx.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1 })[0];
  assert.ok(header.includes('Kaç koli?') && header.includes('İşletme türü'));
});

test('WhatsApp: bağlantı, imzalı webhook, yapay zekâ cevabı, ekibe devretme, ekip yanıtı ve 24 saat kuralı', { skip }, async () => {
  const wa = await startWhatsappMock();
  const env = { AI_PROVIDER: process.env.AI_PROVIDER, WHATSAPP_GRAPH_URL: process.env.WHATSAPP_GRAPH_URL, WHATSAPP_REPLY_DELAY_MS: process.env.WHATSAPP_REPLY_DELAY_MS };
  Object.assign(process.env, { AI_PROVIDER: 'mock', WHATSAPP_GRAPH_URL: wa.url, WHATSAPP_REPLY_DELAY_MS: '0' });
  const A = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const B = { tenant: 'itest-b', token: tenants['itest-b'].token };
  const wait = async (fn, ms = 4000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await new Promise((r) => setTimeout(r, 50)); } };
  try {
    const bad = await api('/whatsapp/channel', { ...A, method: 'PUT', body: { phoneNumberId: '1234567890', accessToken: 'wrong', appSecret: 'app-secret' } });
    assert.equal(bad.status, 400);
    assert.match(bad.data.message, /token/i);
    const ok = await api('/whatsapp/channel', { ...A, method: 'PUT', body: { phoneNumberId: '1234567890', accessToken: 'good-token', appSecret: 'app-secret' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.channel.displayPhone, '+90 555 000 00 00');
    assert.equal((await api('/whatsapp/channel', { ...B, method: 'PUT', body: { phoneNumberId: '1234567890', accessToken: 'good-token', appSecret: 'x' } })).status, 409, 'numara başka firmaya bağlanamaz');
    await api('/whatsapp/channel', { ...A, method: 'PATCH', body: { knowledge: 'Kargo: 2000 TL üzeri ücretsiz.' } });

    const key = ok.data.channel.webhookUrl.split('/').pop();
    const hook = `${base}/api/whatsapp/webhook/${key}`;
    assert.equal((await fetch(`${hook}?hub.mode=subscribe&hub.verify_token=yanlis&hub.challenge=42`)).status, 403);
    assert.equal(await (await fetch(`${hook}?hub.mode=subscribe&hub.verify_token=${ok.data.channel.verifyToken}&hub.challenge=42`)).text(), '42');

    const post = (payload, secret = 'app-secret') => {
      const raw = JSON.stringify(payload);
      const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
      return fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig }, body: raw });
    };
    const inbound = (id, text) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234567890' }, contacts: [{ wa_id: '905321112233', profile: { name: 'Ayşe' } }], messages: [{ id, from: '905321112233', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] });

    assert.equal((await post(inbound('wamid.IN1', 'merhaba'), 'yanlis-anahtar')).status, 401, 'imzasız istek reddedilir');
    assert.equal((await post(inbound('wamid.IN1', 'Merhaba, Ürün itest-a fiyatı nedir?'))).status, 200);
    await post(inbound('wamid.IN1', 'Merhaba, Ürün itest-a fiyatı nedir?')); // Meta aynı mesajı tekrar gönderir

    const convs = await wait(async () => { const r = await api('/whatsapp/conversations', A); return r.data.items.length && r.data; });
    const id = convs.items[0].id;
    const thread = await wait(async () => { const r = await api(`/whatsapp/conversations/${id}`, A); return r.data.messages.some((m) => m.author === 'AI') && r.data; });
    assert.equal(thread.messages.filter((m) => m.author === 'CUSTOMER').length, 1, 'tekrar gelen mesaj bir kez yazılır');
    const ai = thread.messages.find((m) => m.author === 'AI');
    assert.match(ai.body, /Ürün itest-a/, 'katalogdan ürün bulunur');
    assert.equal(ai.status, 'sent');
    assert.equal(wa.sent[0].to, '905321112233');
    assert.equal(thread.lead.status, 'NEW', 'yazan kişi müşteri adaylarına düşer');
    assert.equal((await api('/customer-leads?source=WHATSAPP&q=5321112233', A)).data.total, 1);

    // Durum bildirimi
    await post({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1234567890' }, statuses: [{ id: 'wamid.OUT1', status: 'read' }] } }] }] });
    await wait(async () => (await api(`/whatsapp/conversations/${id}`, A)).data.messages.find((m) => m.waMessageId === 'wamid.OUT1')?.status === 'read');

    // İnsan isteyince ekibe devredilir
    await post(inbound('wamid.IN2', 'Bir yetkiliyle görüşmek istiyorum'));
    const waiting = await wait(async () => { const r = await api('/whatsapp/conversations?filter=waiting', A); return r.data.items.length && r.data; });
    assert.equal(waiting.items[0].status, 'HUMAN');
    const sentBefore = wa.sent.length;
    await post(inbound('wamid.IN3', 'Orada mısınız?'));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(wa.sent.length, sentBefore, 'ekipteki konuşmaya yapay zekâ cevap vermez');

    const reply = await api(`/whatsapp/conversations/${id}/messages`, { ...A, method: 'POST', body: { text: 'Merhaba, ben Mehmet. Yardımcı olayım.' } });
    assert.equal(reply.status, 201);
    assert.equal(wa.sent.at(-1).text.body, 'Merhaba, ben Mehmet. Yardımcı olayım.');
    assert.equal((await api('/whatsapp/conversations?filter=waiting', A)).data.items.length, 0);

    // Başka firma göremez
    assert.equal((await api(`/whatsapp/conversations/${id}`, B)).status, 404, 'başka firmanın konuşması görünmez');
    // 24 saat geçince serbest mesaj gönderilemez
    await runAsPlatform(() => prisma.waConversation.update({ where: { id }, data: { lastInboundAt: new Date(Date.now() - 25 * 3600e3) } }));
    assert.equal((await api(`/whatsapp/conversations/${id}/messages`, { ...A, method: 'POST', body: { text: 'Selam' } })).status, 400);

    const preview = await api('/whatsapp/preview', { ...A, method: 'POST', body: { question: 'Ürün itest-a var mı?' } });
    assert.equal(preview.status, 200);
    assert.match(preview.data.reply, /stokta/);
  } finally {
    wa.server.close();
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test('menü rozetleri: yetkili bölümlerin bekleyen iş sayıları', { skip }, async () => {
  const res = await api('/dashboard/menu-counts', { tenant: 'itest-a', token: tenants['itest-a'].token });
  assert.equal(res.status, 200);
  for (const k of ['orders', 'returns', 'quotes', 'dealers', 'leads', 'whatsapp']) assert.equal(typeof res.data[k], 'number', k);
  assert.equal(res.data.whatsapp, 0, 'ekibin yanıtladığı konuşma beklemiyor');
});

test('dönemsel müşteri raporu: kayıp / risk algoritması, cari özet, zamanlanmış üretim ve bildirim', { skip }, async () => {
  const A = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const tenantId = tenants['itest-a'].id;
  const DAYMS = 864e5;
  const ago = (d) => new Date(Date.now() - d * DAYMS);
  const admin = await runAsPlatform(() => prisma.user.findFirst({ where: { tenantId, email: 'admin@itest-a.test' } }));
  const company = (name, createdDaysAgo = 400) => runAsPlatform(() => prisma.company.create({ data: { tenantId, name, kind: 'DEALER', status: 'ACTIVE', phone: '0532 000 00 00', createdAt: ago(createdDaysAgo) } }));
  const order = (companyId, daysAgo, amount = 1000) => runAsPlatform(() => prisma.order.create({ data: { tenantId, userId: admin.id, companyId, subtotal: amount, totalAmount: amount * 1.2, status: 'COMPLETED', createdAt: ago(daysAgo) } }));

  const regular = await company('Rapor Düzenli Bayi'); // haftada bir alıyordu, 25 gündür almıyor → risk altında
  for (let d = 25; d <= 95; d += 7) await order(regular.id, d, 5000);
  const lost = await company('Rapor Kayıp Bayi'); // 100 gündür almıyor → kaybedildi
  await order(lost.id, 100); await order(lost.id, 130);
  await company('Rapor Hiç Almayan', 30); // hiç sipariş yok
  const fresh = await company('Rapor Yeni Bayi', 5); // ilk siparişi bu hafta
  await order(fresh.id, 2, 2500);
  const steady = await company('Rapor Aktif Bayi'); // 3 günde bir
  for (let d = 1; d <= 60; d += 3) await order(steady.id, d, 800);
  await runAsPlatform(() => prisma.financialTransaction.createMany({ data: [
    { tenantId, companyId: fresh.id, type: 'DEBT', amount: 3000, source: 'ORDER', date: ago(2) },
    { tenantId, companyId: fresh.id, type: 'CREDIT', amount: 1200, source: 'PAYMENT', date: ago(1) }
  ] }));
  await runAsPlatform(() => prisma.company.update({ where: { id: fresh.id }, data: { currentBalance: -1800 } }));

  const iso = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10); // rapor tarihleri Türkiye saatiyle (UTC+3)
  const live = await api(`/reports/periodic/live?from=${iso(ago(6))}&to=${iso(new Date())}`, A);
  assert.equal(live.status, 200);
  const by = Object.fromEntries(live.data.customers.map((c) => [c.name, c]));
  assert.equal(by['Rapor Düzenli Bayi'].status, 'AT_RISK');
  assert.match(by['Rapor Düzenli Bayi'].reason, /7 günde bir.*25 gündür/);
  assert.equal(by['Rapor Kayıp Bayi'].status, 'LOST');
  assert.match(by['Rapor Kayıp Bayi'].reason, /3 aydır/);
  assert.equal(by['Rapor Hiç Almayan'].status, 'NEVER');
  assert.equal(by['Rapor Yeni Bayi'].status, 'NEW');
  assert.equal(by['Rapor Aktif Bayi'].status, 'ACTIVE');
  assert.equal(live.data.callList[0].name, 'Rapor Düzenli Bayi', 'en değerli ve en çok gecikmiş müşteri en üstte');
  assert.ok(!live.data.callList.some((c) => c.name === 'Rapor Aktif Bayi'));
  assert.equal(live.data.cari.debt, 3000);
  assert.equal(live.data.cari.collected, 1200);
  assert.equal(live.data.cari.collectionRate, 40);
  assert.ok(live.data.cari.receivable >= 1800);
  assert.ok(live.data.summary.customers >= 2);
  assert.equal(live.data.trend.unit, 'week');
  assert.equal(live.data.trend.points.length, 8);
  assert.ok(live.data.trend.points.at(-1).customers >= 2, 'son haftada sipariş veren müşteriler');

  // Zamanlanmış üretim: ayar kaydedilir, zamanı gelen rapor bir kez üretilir, yöneticiye bildirim gider
  const set = await api('/reports/periodic/settings', { ...A, method: 'PUT', body: { weekly: { enabled: true, weekday: 1, hour: 9 }, monthly: { enabled: false }, lostDays: 45 } });
  assert.equal(set.status, 200);
  assert.equal(set.data.settings.monthly.enabled, false);
  const { runPeriodicReports } = await import('../../src/services/periodicReportService.js');
  const { runWithTenant } = await import('../../src/utils/prisma.js');
  const monday10 = new Date('2026-11-02T07:00:00Z'); // Pazartesi 10:00 (TR)
  const first = await runWithTenant(tenantId, () => runPeriodicReports(monday10));
  assert.equal(first.length, 1);
  assert.equal(first[0].period, 'WEEKLY');
  assert.equal((await runWithTenant(tenantId, () => runPeriodicReports(monday10))).length, 0, 'aynı dönem ikinci kez üretilmez');
  await new Promise((r) => setTimeout(r, 200));
  const notes = await runAsPlatform(() => prisma.notification.findMany({ where: { userId: admin.id, type: 'REPORT' } }));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].link, `/admin/reports?rapor=${first[0].id}`);

  const list = await api('/reports/periodic', A);
  assert.equal(list.data[0].id, first[0].id);
  const saved = await api(`/reports/periodic/${first[0].id}`, A);
  assert.equal(saved.data.lostDays, 45);
  const xlsxRes = await fetch(`${base}/api/reports/periodic/${first[0].id}/export`, { headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` } });
  const { default: xlsx } = await import('xlsx');
  const book = xlsx.read(Buffer.from(await xlsxRes.arrayBuffer()));
  assert.deepEqual(book.SheetNames, ['Özet', 'Aranacaklar', 'Müşteri durumu', 'En çok alanlar', 'Açık alacaklar']);
  assert.equal((await api(`/reports/periodic/${first[0].id}`, { tenant: 'itest-b', token: tenants['itest-b'].token })).status, 404, 'başka firma göremez');
});

test('özel alan adı: alt alan adı ya da alan adının tamamı (A + www), www eşleşmesi ve sertifika izni', { skip }, async () => {
  const a = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const { loadTenantByHost, invalidateTenantCache } = await import('../../src/middlewares/tenantMiddleware.js');
  process.env.CUSTOM_DOMAIN_IP = '203.0.113.10';
  const plan = await runAsPlatform(() => prisma.plan.update({ where: { code: 'ITEST' }, data: { allowCustomDomain: true } }));
  try {
    // Seçenek ile adres uyuşmazsa açıklayıcı hata
    let res = await api('/account/domain', { ...a, method: 'PUT', body: { domain: 'itest-akis.com', mode: 'subdomain' } });
    assert.equal(res.status, 400);
    res = await api('/account/domain', { ...a, method: 'PUT', body: { domain: 'b2b.itest-akis.com', mode: 'root' } });
    assert.equal(res.status, 400);
    res = await api('/account/domain', { ...a, method: 'PUT', body: { domain: 'www.itest-akis.com', mode: 'subdomain' } });
    assert.equal(res.status, 400);

    // Alt alan adı: CNAME + TXT
    res = await api('/account/domain', { ...a, method: 'PUT', body: { domain: 'b2b.itest-akis.com', mode: 'subdomain' } });
    assert.equal(res.status, 200);
    assert.equal(res.data.mode, 'subdomain');
    assert.deepEqual(res.data.records.map((r) => [r.type, r.host]), [['CNAME', 'b2b'], ['TXT', '_akisb2b.b2b']]);

    // Alan adının tamamı (.com.tr dahil): A @ → sunucu IP'si, www CNAME, TXT
    res = await api('/account/domain', { ...a, method: 'PUT', body: { domain: 'https://itest-akis.com.tr/', mode: 'root' } });
    assert.equal(res.status, 200);
    assert.equal(res.data.domain, 'itest-akis.com.tr');
    assert.equal(res.data.mode, 'root');
    assert.deepEqual(res.data.records.map((r) => [r.type, r.host, r.type === 'A' ? r.value : null]),
      [['A', '@', '203.0.113.10'], ['CNAME', 'www', null], ['TXT', '_akisb2b', null]]);

    // Doğrulanmadan sertifika verilmez; doğrulanınca ana adres ve www aynı firmaya çıkar
    invalidateTenantCache();
    assert.equal((await fetch(`${base}/api/public/domain-check?domain=www.itest-akis.com.tr`)).status, 404);
    await runAsPlatform(() => prisma.tenant.update({ where: { id: tenants['itest-a'].id }, data: { customDomainVerifiedAt: new Date() } }));
    invalidateTenantCache();
    assert.equal((await loadTenantByHost('itest-akis.com.tr'))?.id, tenants['itest-a'].id);
    assert.equal((await loadTenantByHost('www.itest-akis.com.tr'))?.id, tenants['itest-a'].id);
    assert.equal((await fetch(`${base}/api/public/domain-check?domain=www.itest-akis.com.tr`)).status, 200);
    res = await api('/account/domain', a);
    assert.equal(res.data.verified, true);
    assert.ok(!res.data.records.some((r) => r.type === 'TXT'));

    // Alt alan adı modunda www eşleşmez
    await api('/account/domain', { ...a, method: 'PUT', body: { domain: 'b2b.itest-akis.com', mode: 'subdomain' } });
    await runAsPlatform(() => prisma.tenant.update({ where: { id: tenants['itest-a'].id }, data: { customDomainVerifiedAt: new Date() } }));
    invalidateTenantCache();
    assert.equal(await loadTenantByHost('www.b2b.itest-akis.com'), null);

    res = await api('/account/domain', { ...a, method: 'DELETE' });
    assert.equal(res.data.domain, null);
    assert.equal(res.data.mode, 'subdomain');
  } finally {
    await runAsPlatform(() => prisma.plan.update({ where: { id: plan.id }, data: { allowCustomDomain: false } }));
    delete process.env.CUSTOM_DOMAIN_IP;
  }
});

test('stokta olmayan ürün için teklif talebi (ayarla) ve Gel-Al sipariş: zaman kuralı, hazır, teslim, kargo yok', { skip }, async () => {
  const a = tenants['itest-a'];
  const admin = { tenant: 'itest-a', token: a.token };
  const bcrypt = (await import('bcrypt')).default;
  const { company, outId, inId } = await runAsPlatform(async () => {
    const c = await prisma.company.create({ data: { tenantId: a.id, name: 'Gel-Al Bayi', status: 'ACTIVE', riskLimit: 100000, taxNumber: '2222222222' } });
    await prisma.user.create({ data: { tenantId: a.id, companyId: c.id, email: 'gelal@itest-a.test', password: await bcrypt.hash('Test12345', 4), name: 'Gel-Al', role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() } });
    const category = await prisma.category.findFirst({ where: { tenantId: a.id } });
    const out = await prisma.product.create({ data: { tenantId: a.id, name: 'Tükenmiş Matkap', sku: 'GA-OUT', price: 100, stock: 0, categoryId: category.id } });
    const inp = await prisma.product.create({ data: { tenantId: a.id, name: 'Stoklu Vida', sku: 'GA-IN', price: 10, stock: 50, categoryId: category.id } });
    return { company: c, outId: out.id, inId: inp.id };
  });
  const login = await api('/auth/login', { tenant: 'itest-a', method: 'POST', body: { email: 'gelal@itest-a.test', password: 'Test12345' } });
  const dealer = { tenant: 'itest-a', token: login.data.token };
  const setSetting = (key, value) => api('/settings', { ...admin, method: 'POST', body: { key, value } });

  try {
    // Varsayılan: kapalı
    let portal = await api('/settings/portal', dealer);
    assert.equal(portal.status, 200);
    assert.equal(portal.data.quoteOutOfStock, false);
    assert.equal(portal.data.pickup.enabled, false);

    // 1) Teklif: ayar kapalıyken stokta olmayan ürün reddedilir, stoklu ürün kabul edilir
    let res = await api('/quotes', { ...dealer, method: 'POST', body: { items: [{ productId: outId, quantity: 5 }] } });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Tükenmiş Matkap stokta yok/);
    assert.equal((await api('/quotes', { ...dealer, method: 'POST', body: { items: [{ productId: inId, quantity: 5 }] } })).status, 201);

    // Ayar açık: talep alınır, kalem uyarılı, sipariş oluşmaz, stok değişmez
    await setSetting('quote_out_of_stock', 'true');
    assert.equal((await api('/settings/portal', dealer)).data.quoteOutOfStock, true);
    const ordersBefore = await runAsPlatform(() => prisma.order.count({ where: { companyId: company.id } }));
    res = await api('/quotes', { ...dealer, method: 'POST', body: { items: [{ productId: outId, quantity: 12 }, { productId: inId, quantity: 3 }], note: 'Acil' } });
    assert.equal(res.status, 201, res.data?.message);
    const quote = await runAsPlatform(() => prisma.quoteRequest.findUnique({ where: { id: res.data.quote.id }, include: { items: { orderBy: { sortOrder: 'asc' } } } }));
    assert.equal(quote.status, 'PENDING');
    assert.equal(quote.items[0].quantity, 12);
    assert.match(quote.items[0].warnings[0], /stokta yoktu/);
    assert.equal(quote.items[1].warnings, null);
    assert.equal(await runAsPlatform(() => prisma.order.count({ where: { companyId: company.id } })), ordersBefore);
    assert.equal((await runAsPlatform(() => prisma.product.findUnique({ where: { id: outId } }))).stock, 0);

    // 2) Gel-Al: kapalıyken seçilemez
    const soon = (h) => new Date(Date.now() + h * 3600e3).toISOString();
    const pickupOrder = (body) => api('/orders', { ...dealer, method: 'POST', body: { items: [{ productId: inId, quantity: 4 }], paymentMethod: 'CURRENT_ACCOUNT', deliveryMethod: 'PICKUP', ...body } });
    res = await pickupOrder({ pickupAt: soon(24) });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /Gel-Al/);

    await setSetting('pickup_enabled', 'true');
    await setSetting('pickup_lead_hours', '3');
    await setSetting('pickup_address', 'Merkez Depo, Organize Sanayi 5. Cadde');
    portal = await api('/settings/portal', dealer);
    assert.deepEqual(portal.data.pickup, { enabled: true, address: 'Merkez Depo, Organize Sanayi 5. Cadde', hours: '', leadHours: 3 });

    // Zaman kuralları: boş, geçmiş / çok yakın, 60 günden uzak
    assert.equal((await pickupOrder({})).status, 400);
    res = await pickupOrder({ pickupAt: soon(1) });
    assert.equal(res.status, 400);
    assert.match(res.data.message, /en erken 3 saat/);
    assert.equal((await pickupOrder({ pickupAt: soon(24 * 61) })).status, 400);

    const at = soon(26);
    res = await pickupOrder({ pickupAt: at });
    assert.equal(res.status, 201, res.data?.message);
    const id = res.data.id;
    const order = await runAsPlatform(() => prisma.order.findUnique({ where: { id } }));
    assert.equal(order.deliveryMethod, 'PICKUP');
    assert.equal(order.pickupAt.toISOString(), at);
    assert.equal(order.shippingAddress, null);
    assert.equal(order.totalAmount, 48); // 4 × 10 + %20 KDV — kargo ücreti yok

    // Onaydan önce hazır yapılamaz; onayda stok düşer (mevcut kural)
    assert.equal((await api(`/orders/${id}/ready`, { ...admin, method: 'PATCH' })).status, 400);
    const items = await runAsPlatform(() => prisma.orderItem.findMany({ where: { orderId: id } }));
    res = await api(`/orders/${id}/partial-approve`, { ...admin, method: 'PATCH', body: { itemStatuses: items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) } });
    assert.equal(res.status, 200, res.data?.message);
    assert.equal((await runAsPlatform(() => prisma.product.findUnique({ where: { id: inId } }))).stock, 46);

    // Kargoya verilemez, kargo gönderisi oluşturulamaz
    assert.equal((await api(`/orders/${id}/ship`, { ...admin, method: 'PATCH', body: { trackingNumber: '123', cargoCompany: 'ARAS' } })).status, 400);

    res = await api(`/orders/${id}/ready`, { ...admin, method: 'PATCH' });
    assert.equal(res.status, 200, res.data?.message);
    assert.equal(res.data.order.status, 'READY_FOR_PICKUP');
    assert.ok(res.data.order.readyAt);
    let note = null;
    for (let i = 0; i < 20 && !note; i++) {
      note = await runAsPlatform(() => prisma.notification.findFirst({ where: { title: 'Siparişiniz teslim almaya hazır', user: { companyId: company.id } } }));
      if (!note) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(note, 'bayiye hazır bildirimi');

    // Bayi kendi siparişinde Gel-Al bilgisini görür
    res = await api(`/orders/${id}`, dealer);
    assert.equal(res.data.deliveryMethod, 'PICKUP');
    assert.equal(res.data.status, 'READY_FOR_PICKUP');

    res = await api(`/orders/${id}/complete`, { ...admin, method: 'PATCH' });
    assert.equal(res.status, 200, res.data?.message);
    assert.equal(res.data.order.status, 'COMPLETED');

    // Ayar kapatılınca yeni Gel-Al siparişi alınmaz; kargo siparişi her zamanki gibi
    await setSetting('pickup_enabled', 'false');
    assert.equal((await pickupOrder({ pickupAt: soon(26) })).status, 400);
  } finally {
    for (const key of ['quote_out_of_stock', 'pickup_enabled', 'pickup_lead_hours', 'pickup_address']) {
      await runAsPlatform(() => prisma.setting.deleteMany({ where: { tenantId: a.id, key } }));
    }
  }
});

test('gelir-gider: kayıt, KDV, aylık/yıllık özet ve karşılaştırma, bütçe, düzenli kayıt, belge, firma ayrımı, Excel', { skip }, async () => {
  const A = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const B = { tenant: 'itest-b', token: tenants['itest-b'].token };
  const tenantId = tenants['itest-a'].id;
  const month = '2026-03';
  const add = (body, who = A) => api('/cash', { ...who, method: 'POST', body });

  // Doğrulama
  assert.equal((await add({ type: 'OUT', category: 'Kira', amount: 0, date: '2026-03-05' })).status, 400);
  assert.equal((await add({ type: 'X', category: 'Kira', amount: 10 })).status, 400);
  assert.equal((await add({ type: 'OUT', category: '', amount: 10 })).status, 400);
  assert.equal((await add({ type: 'OUT', category: 'Tedarikçi ödemeleri', amount: 10 })).status, 400); // caride otomatik

  const rent = await add({ type: 'OUT', category: 'Kira', amount: '15.000,50', vatRate: 20, date: '2026-03-01', method: 'BANK', description: 'Mart kirası' });
  assert.equal(rent.status, 201, rent.data?.message);
  assert.equal(rent.data.entry.amount, 15000.5);
  await add({ type: 'OUT', category: 'Maaş / SGK', amount: 40000, date: '2026-03-31', method: 'BANK' });
  await add({ type: 'OUT', category: 'Yakıt / araç', amount: 2500, vatRate: 20, date: '2026-02-20' }); // önceki ay
  await add({ type: 'IN', category: 'Hurda / ikinci el satış', amount: 3000, vatRate: 20, date: '2026-03-15', method: 'CASH' });
  await add({ type: 'OUT', category: 'Kira', amount: 999, date: '2026-03-10' }, B); // başka firma

  // Carilerden tahsilat ve tedarikçi ödemesi özete otomatik girer (cari kayıtları değişmez)
  const companyId = await runAsPlatform(async () => (await prisma.company.create({ data: { tenantId, name: 'Kasa Bayi', status: 'ACTIVE' } })).id);
  await runAsPlatform(() => prisma.payment.createMany({ data: [
    { tenantId, companyId, amount: 20000, method: 'WIRE_TRANSFER', direction: 'IN', paymentDate: new Date(2026, 2, 12, 10) },
    { tenantId, companyId, amount: 100, currency: 'USD', rate: 40, method: 'WIRE_TRANSFER', direction: 'OUT', paymentDate: new Date(2026, 2, 13, 10) },
    { tenantId, companyId, amount: 5000, method: 'POS', direction: 'IN', status: 'FAILED', paymentDate: new Date(2026, 2, 14, 10) }
  ] }));
  const balanceBefore = (await runAsPlatform(() => prisma.company.findUnique({ where: { id: companyId } }))).currentBalance;

  // Bütçe: Kira 10.000 (aşıldı), Reklam 5.000 (harcama yok)
  assert.equal((await api('/cash/budgets', { ...A, method: 'PUT', body: { budgets: { Kira: '10000', Reklam: 5000, Boş: '' } } })).status, 200);

  let res = await api(`/cash?month=${month}`, A);
  assert.equal(res.status, 200);
  assert.equal(res.data.period, 'month');
  assert.equal(res.data.entries.length, 3);
  const s = res.data.summary;
  assert.deepEqual({ ...s, vat: undefined }, { income: 23000, expense: 59000.5, net: -36000.5, collections: 20000, otherIncome: 3000, supplierPayments: 4000, expenses: 55000.5, vat: undefined });
  assert.deepEqual(s.vat, { input: 2500.08, output: 500 });
  assert.equal(res.data.previous.expense, 2500); // Şubat
  assert.equal(res.data.previous.partial, false); // biten ay: önceki ayın tamamıyla
  assert.equal((await api('/cash', A)).data.previous.partial, true); // süren ay: önceki ayın aynı günlerine kadar
  const cat = Object.fromEntries(res.data.categories.map((c) => [c.category, c]));
  assert.equal(cat.Kira.budget, 10000);
  assert.equal(cat.Reklam.amount, 0);
  assert.equal(cat['Tedarikçi ödemeleri'].amount, 4000);
  assert.equal(res.data.trend.length, 12);
  assert.equal(res.data.trend.at(-1).key, month);
  assert.equal(res.data.flow.length, 31);
  assert.equal(res.data.flow.at(-1).cumulative, -36000.5); // 31 Mart Türkiye günü Mart'ta kalır
  assert.ok(!res.data.entries.some((e) => e.amount === 999));
  assert.equal((await runAsPlatform(() => prisma.company.findUnique({ where: { id: companyId } }))).currentBalance, balanceBefore);

  // Yıllık görünüm: bütçe ×12, 12 ay
  res = await api('/cash?period=year&year=2026', A);
  assert.equal(res.data.period, 'year');
  assert.equal(res.data.flow.length, 12);
  assert.equal(res.data.summary.expenses, 57500.5);
  assert.equal(res.data.categories.find((c) => c.category === 'Kira').budget, 120000);

  // Belge: yükle, indir, başka firma göremez, kaldır
  const id = rent.data.entry.id;
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('%PDF-1.4 fis')], { type: 'application/pdf' }), 'kira-fisi.pdf');
  const up = await fetch(`${base}/api/cash/${id}/file`, { method: 'POST', headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` }, body: fd });
  assert.equal(up.status, 201);
  const bad = new FormData();
  bad.append('file', new Blob(['<script>'], { type: 'text/html' }), 'x.html');
  assert.equal((await fetch(`${base}/api/cash/${id}/file`, { method: 'POST', headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` }, body: bad })).status, 400);
  const dl = await fetch(`${base}/api/cash/${id}/file`, { headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` } });
  assert.equal(dl.status, 200);
  assert.match(await dl.text(), /%PDF/);
  assert.equal((await fetch(`${base}/api/cash/${id}/file`, { headers: { 'X-Tenant': 'itest-b', Authorization: `Bearer ${B.token}` } })).status, 404);
  assert.equal((await api(`/cash?month=${month}`, A)).data.entries.find((e) => e.id === id).hasFile, true);
  assert.equal((await api(`/cash/${id}/file`, { ...A, method: 'DELETE' })).status, 200);

  // Güncelle / sil: başka firma dokunamaz
  assert.equal((await api(`/cash/${id}`, { ...B, method: 'PUT', body: { type: 'OUT', category: 'Kira', amount: 1 } })).status, 404);
  assert.equal((await api(`/cash/${id}`, { ...B, method: 'DELETE' })).status, 404);
  assert.equal((await api(`/cash/${id}`, { ...A, method: 'PUT', body: { type: 'OUT', category: 'Kira', amount: 16000, date: '2026-03-01' } })).status, 200);
  assert.equal((await api(`/cash?month=${month}`, A)).data.summary.expenses, 56000);

  // Düzenli kayıt: günü geçtiyse bu ayınki hemen oluşur; tekrar çalışmada çift kayıt olmaz
  const { runRecurringCash } = await import('../../src/controllers/cashController.js');
  const { runWithTenant } = await import('../../src/utils/prisma.js');
  assert.equal((await api('/cash/recurring', { ...A, method: 'POST', body: { type: 'OUT', category: 'İnternet', amount: 500, dayOfMonth: 31 } })).status, 400);
  const rule = await api('/cash/recurring', { ...A, method: 'POST', body: { type: 'OUT', category: 'İnternet', amount: 500, vatRate: 20, dayOfMonth: 1 } });
  assert.equal(rule.status, 201, rule.data?.message);
  const ruleEntries = () => runAsPlatform(() => prisma.cashEntry.count({ where: { recurringId: rule.data.recurring.id } }));
  assert.equal(await ruleEntries(), 1);
  await runWithTenant(tenantId, () => runRecurringCash());
  assert.equal(await ruleEntries(), 1);
  // Gelecek ay: yeni kayıt
  const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1, 2);
  await runWithTenant(tenantId, () => runRecurringCash(nextMonth));
  assert.equal(await ruleEntries(), 2);
  // Durdurulan kural kayıt üretmez; listede görünür
  assert.equal((await api(`/cash/recurring/${rule.data.recurring.id}`, { ...A, method: 'PUT', body: { isActive: false } })).status, 200);
  const later = new Date(); later.setMonth(later.getMonth() + 2, 2);
  await runWithTenant(tenantId, () => runRecurringCash(later));
  assert.equal(await ruleEntries(), 2);
  assert.ok((await api(`/cash?month=${month}`, A)).data.recurring.some((r) => r.id === rule.data.recurring.id && !r.isActive));
  assert.equal((await api(`/cash/recurring/${rule.data.recurring.id}`, { ...B, method: 'DELETE' })).status, 404);
  // "Her ay tekrarla" ile eklenen kayıt kural oluşturur, aynı ay için ikinci kayıt üretmez
  const rep = await add({ type: 'OUT', category: 'Muhasebe', amount: 3000, date: localToday(), repeat: true });
  assert.ok(rep.data.entry.recurringId);
  await runWithTenant(tenantId, () => runRecurringCash());
  assert.equal(await runAsPlatform(() => prisma.cashEntry.count({ where: { recurringId: rep.data.entry.recurringId } })), 1);
  assert.equal((await api(`/cash/recurring/${rule.data.recurring.id}`, { ...A, method: 'DELETE' })).status, 200);
  assert.equal(await runAsPlatform(() => prisma.cashEntry.count({ where: { tenantId, category: 'İnternet' } })), 2); // geçmiş kayıtlar kalır

  const xl = await fetch(`${base}/api/cash/export?month=${month}`, { headers: { 'X-Tenant': 'itest-a', Authorization: `Bearer ${A.token}` } });
  assert.equal(xl.status, 200);
  assert.match(xl.headers.get('content-disposition'), /gelir-gider-2026-03\.xlsx/);

  assert.equal((await api(`/cash/${id}`, { ...A, method: 'DELETE' })).status, 200);
  assert.equal((await api('/cash?month=2026-13', A)).status, 400);
});

const localToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

test('gelir-gider: 30 günlük nakit tahmini (alacak, tedarikçi borcu, çek, gecikmiş) ve bütçe bildirimi', { skip }, async () => {
  const A = { tenant: 'itest-a', token: tenants['itest-a'].token };
  const tenantId = tenants['itest-a'].id;
  const day = 864e5;
  await runAsPlatform(async () => {
    const dealer = await prisma.company.create({ data: { tenantId, name: 'Tahmin Bayi', kind: 'DEALER', status: 'ACTIVE', currentBalance: -1000, paymentTermDays: 15 } });
    await prisma.financialTransaction.create({ data: { tenantId, companyId: dealer.id, type: 'DEBT', amount: 1000, source: 'MANUAL', date: new Date(Date.now() - 5 * day) } }); // vade +10 gün
    const late = await prisma.company.create({ data: { tenantId, name: 'Gecikmiş Bayi', kind: 'DEALER', status: 'ACTIVE', currentBalance: -300, paymentTermDays: 0 } });
    await prisma.financialTransaction.create({ data: { tenantId, companyId: late.id, type: 'DEBT', amount: 300, source: 'MANUAL', date: new Date(Date.now() - 60 * day) } });
    const supplier = await prisma.company.create({ data: { tenantId, name: 'Tahmin Tedarikçi', kind: 'SUPPLIER', status: 'ACTIVE', currentBalance: 400, paymentTermDays: 7 } });
    await prisma.financialTransaction.create({ data: { tenantId, companyId: supplier.id, type: 'CREDIT', amount: 400, source: 'MANUAL', date: new Date() } });
    await prisma.payment.create({ data: { tenantId, companyId: dealer.id, amount: 250, method: 'CHECK', direction: 'IN', dueDate: new Date(Date.now() + 3 * day), bankName: 'Ziraat' } });
  });
  const balances = await runAsPlatform(() => prisma.company.findMany({ where: { tenantId, name: { startsWith: 'Tahmin' } }, select: { currentBalance: true } }));

  const res = await api('/cash/forecast', A);
  assert.equal(res.status, 200, res.data?.message);
  const find = (label, source) => res.data.items.find((x) => x.label.startsWith(label) && x.source === source);
  assert.equal(find('Tahmin Bayi', 'RECEIVABLE').amount, 1000);
  assert.equal(find('Tahmin Bayi', 'RECEIVABLE').type, 'IN');
  assert.equal(find('Tahmin Tedarikçi', 'PAYABLE').amount, 400);
  assert.equal(find('Tahmin Tedarikçi', 'PAYABLE').type, 'OUT');
  assert.equal(find('Tahmin Bayi · Ziraat', 'CHECK').amount, 250);
  assert.ok(!res.data.items.some((x) => x.label === 'Gecikmiş Bayi'));
  assert.ok(res.data.overdue.receivable >= 300);
  assert.equal(res.data.daily.length, 31);
  assert.equal(res.data.daily.at(-1).cumulative, res.data.totals.net);
  // Cari bakiyeleri değişmedi (yalnızca okunur)
  assert.deepEqual(await runAsPlatform(() => prisma.company.findMany({ where: { tenantId, name: { startsWith: 'Tahmin' } }, select: { currentBalance: true } })), balances);

  // Bütçe bildirimi: %90 ve aşım, her eşik ayda bir kez
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  await api('/cash/budgets', { ...A, method: 'PUT', body: { budgets: { 'Ofis / kırtasiye': 1000 } } });
  const notes = async () => {
    await new Promise((r) => setTimeout(r, 300));
    return runAsPlatform(() => prisma.notification.findMany({ where: { tenantId, type: 'BUDGET' }, select: { title: true } }));
  };
  await api('/cash', { ...A, method: 'POST', body: { type: 'OUT', category: 'Ofis / kırtasiye', amount: 950, date: today } });
  let list = await notes();
  assert.equal(list.filter((n) => /%95'i kullanıldı/.test(n.title)).length, 1);
  await api('/cash', { ...A, method: 'POST', body: { type: 'OUT', category: 'Ofis / kırtasiye', amount: 100, date: today } });
  await api('/cash', { ...A, method: 'POST', body: { type: 'OUT', category: 'Ofis / kırtasiye', amount: 10, date: today } });
  list = await notes();
  assert.equal(list.filter((n) => /bütçesi aşıldı/.test(n.title)).length, 1);
  assert.equal(list.filter((n) => /kullanıldı/.test(n.title)).length, 1);
});
