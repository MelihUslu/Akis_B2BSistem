/**
 * Yük testi verisi: AYRI bir veritabanına (akis_load) gerçekçi hacimde firma verisi üretir ve
 * test kullanıcıları için oturum anahtarlarını loadtest/.data/tokens.json dosyasına yazar.
 * Geliştirme veritabanına dokunmaz; DATABASE_URL "akis_load" değilse çalışmaz.
 *
 *   docker exec -e DATABASE_URL=…/akis_load -e JWT_SECRET=… -e OUT=/loadtest/.data akis-backend node /loadtest/seed/seed.mjs
 * Boyutlar: ADMINS=1000 DEALERS=1000 PRODUCTS=5000 ORDERS=60000 (ortam değişkeniyle değiştirilebilir)
 */
import fs from 'fs';
import { createRequire } from 'module';

// Paketler backend'in node_modules klasöründen yüklenir (betik loadtest/ altında durur)
const require = createRequire(`${process.env.APP_DIR || '/app'}/package.json`);
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const url = process.env.DATABASE_URL || '';
if (!/\/akis_load(\?|$)/.test(url)) { console.error('Güvenlik: DATABASE_URL akis_load veritabanını göstermeli.'); process.exit(1); }
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET gerekli (yük testi backend\'iyle aynı).'); process.exit(1); }

const N = (k, d) => parseInt(process.env[k] || d, 10);
const ADMINS = N('ADMINS', 1000), DEALERS = N('DEALERS', 1000), PRODUCTS = N('PRODUCTS', 5000), ORDERS = N('ORDERS', 60000);
const SLUG = process.env.TENANT || 'yuktest';
const OUT = process.env.OUT || '/loadtest/.data';
const prisma = new PrismaClient();
const DAY = 864e5;
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} sn] ${m}`);

const WORDS = ['Matkap', 'Vida', 'Somun', 'Pense', 'Tornavida', 'Anahtar', 'Boya', 'Fırça', 'Kablo', 'Priz', 'Eldiven', 'Bot', 'Gözlük', 'Baret', 'Zımpara', 'Silikon', 'Dübel', 'Menteşe', 'Kilit', 'Hortum', 'Musluk', 'Testere', 'Çekiç', 'Metre', 'Su Terazisi', 'Spiral', 'Kompresör', 'Kaynak Teli', 'Merdiven', 'Halat'];
const ADJ = ['Profesyonel', 'Endüstriyel', 'Ekonomik', 'Paslanmaz', 'Galvaniz', 'Akülü', 'Darbeli', 'Mini', 'XL', 'Set'];
const PERMS = ['CATALOG', 'ORDERS', 'QUOTES', 'QUOTE_PRICING', 'QUOTE_APPROVAL', 'DEALERS', 'FINANCE', 'SETTINGS', 'LEADS', 'MESSAGES'];

const main = async () => {
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (existing) { console.error(`"${SLUG}" zaten var. Önce veritabanını sıfırlayın (reset.sh) ya da TENANT ile başka ad verin.`); process.exit(1); }
  const plan = await prisma.plan.upsert({ where: { code: 'LOADTEST' }, update: {}, create: { code: 'LOADTEST', name: 'Yük testi', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false } });
  const tenant = await prisma.tenant.create({ data: { slug: SLUG, name: 'Yük Testi Hırdavat', contactEmail: `info@${SLUG}.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 365 * DAY) } });
  const tenantId = tenant.id;
  const password = await bcrypt.hash('Yuktest12345', 6);
  log(`firma ${SLUG} (#${tenantId})`);

  // Yöneticiler: 1 sahip + tam yetkili personel
  await prisma.user.createMany({ data: Array.from({ length: ADMINS }, (_, i) => ({ tenantId, email: `admin${i}@${SLUG}.test`, password, name: `Yönetici ${i}`, role: 'ADMIN', isOwner: i === 0, permissions: i === 0 ? undefined : PERMS, emailVerifiedAt: new Date() })) });
  const admins = await prisma.user.findMany({ where: { tenantId, role: 'ADMIN' }, select: { id: true }, orderBy: { id: 'asc' } });
  log(`${admins.length} yönetici`);

  // Bayiler ve kullanıcıları
  const groups = ['STANDART', 'GOLD', 'VIP'];
  await prisma.company.createMany({ data: Array.from({ length: DEALERS }, (_, i) => ({ tenantId, name: `Bayi ${String(i).padStart(4, '0')} Hırdavat`, kind: 'DEALER', status: 'ACTIVE', riskLimit: 50000 + Math.round(rnd() * 20) * 25000, paymentTermDays: pick([0, 15, 30, 45, 60]), dealerGroup: pick(groups), taxNumber: String(1000000000 + i), phone: `0532 ${String(i).padStart(7, '0')}` })) });
  const companies = await prisma.company.findMany({ where: { tenantId }, select: { id: true, paymentTermDays: true }, orderBy: { id: 'asc' } });
  await prisma.user.createMany({ data: companies.map((c, i) => ({ tenantId, companyId: c.id, email: `bayi${i}@${SLUG}.test`, password, name: `Bayi Kullanıcı ${i}`, role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() })) });
  const dealers = await prisma.user.findMany({ where: { tenantId, role: 'BAYI' }, select: { id: true, companyId: true }, orderBy: { id: 'asc' } });
  log(`${companies.length} bayi firması, ${dealers.length} bayi kullanıcısı`);

  // Kategoriler ve ürünler
  const roots = await Promise.all(['El Aletleri', 'Elektrikli Aletler', 'İş Güvenliği', 'Bağlantı Elemanları', 'Boya', 'Elektrik', 'Tesisat', 'Bahçe'].map((name) => prisma.category.create({ data: { tenantId, name } })));
  const leaves = [];
  for (const r of roots) for (let k = 0; k < 4; k++) leaves.push(await prisma.category.create({ data: { tenantId, name: `${r.name} ${k + 1}`, parentId: r.id } }));
  await prisma.product.createMany({ data: Array.from({ length: PRODUCTS }, (_, i) => {
    const price = Math.round((20 + rnd() * 4980) * 100) / 100;
    const hot = i < 5; // eşzamanlılık testinin "sıcak" ürünleri (id 1-5): her zaman aktif ve az stoklu
    return { tenantId, name: `${pick(ADJ)} ${pick(WORDS)} ${i}`, sku: `YT-${String(i).padStart(5, '0')}`, barcode: String(8690000000000 + i), price, costPrice: Math.round(price * (0.55 + rnd() * 0.25) * 100) / 100, stock: hot ? 50 + Math.round(rnd() * 250) : rnd() < 0.08 ? 0 : Math.round(rnd() * 500), brand: pick(['Akis', 'Bosch', 'Makita', 'Stanley', 'Kale', 'Polisan']), unit: 'adet', categoryId: pick(leaves).id, isActive: hot || rnd() > 0.03 };
  }) });
  const products = await prisma.product.findMany({ where: { tenantId }, select: { id: true, price: true }, orderBy: { id: 'asc' } });
  log(`${leaves.length + roots.length} kategori, ${products.length} ürün`);

  // Siparişler: son 12 ay, ağırlıklı olarak tamamlanmış; her biri 1–5 kalem
  const STATUSES = [['COMPLETED', 0.62], ['SHIPPED', 0.1], ['APPROVED', 0.08], ['PARTIAL_APPROVED', 0.03], ['PENDING', 0.07], ['CANCELLED', 0.1]];
  const status = () => { let x = rnd(); for (const [s, p] of STATUSES) { if ((x -= p) <= 0) return s; } return 'COMPLETED'; };
  const debts = new Map();
  const pendingQty = new Map(); // bekleyen siparişlerdeki miktar (stok ayırma kuralı: stoğu aşamaz)
  let created = 0;
  for (const part of chunk(Array.from({ length: ORDERS }, (_, i) => i), 2000)) {
    const drafts = part.map(() => {
      const d = pick(dealers);
      const createdAt = new Date(Date.now() - Math.pow(rnd(), 1.4) * 365 * DAY);
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => { const p = pick(products); return { productId: p.id, quantity: 1 + Math.floor(rnd() * 20), price: p.price }; });
      const subtotal = Math.round(lines.reduce((t, l) => t + l.price * l.quantity, 0) * 100) / 100;
      const st = status();
      const approved = !['PENDING', 'CANCELLED'].includes(st);
      return { d, lines, row: { tenantId, userId: d.id, companyId: d.companyId, subtotal, vatAmount: Math.round(subtotal * 0.2 * 100) / 100, totalAmount: Math.round(subtotal * 1.2 * 100) / 100, debitedAmount: approved ? Math.round(subtotal * 1.2 * 100) / 100 : 0, paymentMethod: rnd() < 0.8 ? 'CURRENT_ACCOUNT' : 'WIRE_TRANSFER', status: st, createdAt, approvedAt: approved ? new Date(createdAt.getTime() + 3600e3) : null, shippedAt: ['SHIPPED', 'COMPLETED'].includes(st) ? new Date(createdAt.getTime() + DAY) : null } };
    });
    const orders = await prisma.order.createManyAndReturn({ data: drafts.map((x) => x.row), select: { id: true, companyId: true, totalAmount: true, approvedAt: true, status: true } });
    const items = [];
    const txs = [];
    orders.forEach((o, k) => {
      drafts[k].lines.forEach((l) => items.push({ tenantId, orderId: o.id, productId: l.productId, quantity: l.quantity, price: l.price, vatRate: 20, status: 'APPROVED' }));
      if (o.status === 'PENDING') drafts[k].lines.forEach((l) => pendingQty.set(l.productId, (pendingQty.get(l.productId) || 0) + l.quantity));
      if (o.approvedAt) {
        txs.push({ tenantId, companyId: o.companyId, orderId: o.id, type: 'DEBT', amount: o.totalAmount, source: 'ORDER', date: o.approvedAt, description: `#AK-${o.id} sipariş onayı` });
        debts.set(o.companyId, (debts.get(o.companyId) || 0) + o.totalAmount);
      }
    });
    for (const c of chunk(items, 5000)) await prisma.orderItem.createMany({ data: c });
    await prisma.financialTransaction.createMany({ data: txs });
    created += orders.length;
    if (created % 10000 === 0 || created === ORDERS) log(`${created} sipariş`);
  }

  // Stok ayırma: bekleyen siparişler stoğu aşmasın (gerçekte sipariş anında engellenir); gerekirse stok artırılır
  const raise = [];
  const pendingProducts = [];
  for (const ids of chunk([...pendingQty.keys()], 10000)) pendingProducts.push(...await prisma.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, stock: true } })); // parametre sınırı 32.767
  for (const p of pendingProducts) {
    const need = pendingQty.get(p.id);
    if (p.stock < need) raise.push({ id: p.id, stock: need + Math.round(rnd() * 100) });
  }
  for (const c of chunk(raise, 200)) await prisma.$transaction(c.map((r) => prisma.product.update({ where: { id: r.id }, data: { stock: r.stock } })));
  log(`${raise.length} ürünün stoğu bekleyen siparişleri karşılayacak kadar artırıldı`);

  // Tahsilatlar: borcun %70–100'ü ödenmiş; kalan bakiye carilere yazılır (yaşlandırma ve risk ekranları için)
  const pays = [];
  const balances = [];
  for (const [companyId, debt] of debts) {
    const paid = Math.round(debt * (0.7 + rnd() * 0.3) * 100) / 100;
    pays.push({ tenantId, companyId, type: 'CREDIT', amount: paid, source: 'PAYMENT', date: new Date(Date.now() - rnd() * 30 * DAY), description: 'Tahsilat' });
    balances.push({ companyId, balance: Math.round((paid - debt) * 100) / 100 });
  }
  for (const c of chunk(pays, 5000)) await prisma.financialTransaction.createMany({ data: c });
  for (const c of chunk(balances, 200)) await prisma.$transaction(c.map((b) => prisma.company.update({ where: { id: b.companyId }, data: { currentBalance: b.balance } })));
  log(`${pays.length} tahsilat, cari bakiyeler`);

  // Oturum anahtarları (yük testi backend'iyle aynı JWT_SECRET)
  const sign = (u, role) => jwt.sign({ id: u.id, role, companyId: u.companyId || null, tenantId }, process.env.JWT_SECRET, { expiresIn: '12h' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/tokens.json`, JSON.stringify({ tenant: SLUG, admins: admins.map((u) => sign(u, 'ADMIN')), dealers: dealers.map((u) => sign(u, 'BAYI')), companies: dealers.map((u) => u.companyId) }));
  log(`oturum anahtarları: ${OUT}/tokens.json (${admins.length} yönetici, ${dealers.length} bayi)`);
  await prisma.$executeRawUnsafe('ANALYZE');
  log('bitti');
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
