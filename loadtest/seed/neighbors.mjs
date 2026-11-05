/**
 * "Gürültülü komşu" testi için komşu firmalar (yalnızca akis_load): N küçük firma, her birinde yöneticiler, bayiler,
 * ürünler ve geçmiş siparişler. Büyük firma (yuktest) seed.mjs ile ayrıca üretilir; bu betik ona dokunmaz.
 * Oturum anahtarları .data/neighbors.json: [{ slug, admins: [...], dealers: [...] }]
 *   docker exec -w /app akis_loadtest_backend node /loadtest/seed/neighbors.mjs     # FIRMS=99 DEALERS=15 PRODUCTS=300 ORDERS=800
 */
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(`${process.env.APP_DIR || '/app'}/package.json`);
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

if (!/\/akis_load(\?|$)/.test(process.env.DATABASE_URL || '')) { console.error('Güvenlik: DATABASE_URL akis_load veritabanını göstermeli.'); process.exit(1); }
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET gerekli.'); process.exit(1); }

const N = (k, d) => parseInt(process.env[k] || d, 10);
const FIRMS = N('FIRMS', 99), DEALERS = N('DEALERS', 15), PRODUCTS = N('PRODUCTS', 300), ORDERS = N('ORDERS', 800);
const OUT = process.env.OUT || '/loadtest/.data';
const prisma = new PrismaClient();
const DAY = 864e5;
const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} sn] ${m}`);
const WORDS = ['Matkap', 'Vida', 'Somun', 'Pense', 'Tornavida', 'Anahtar', 'Boya', 'Fırça', 'Kablo', 'Priz', 'Eldiven', 'Bot', 'Set'];

const main = async () => {
  const plan = await prisma.plan.upsert({ where: { code: 'LOADTEST' }, update: {}, create: { code: 'LOADTEST', name: 'Yük testi', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false } });
  const password = await bcrypt.hash('Yuktest12345', 6);
  const out = [];
  for (let f = 1; f <= FIRMS; f++) {
    const slug = `komsu-${String(f).padStart(2, '0')}`;
    const old = await prisma.tenant.findUnique({ where: { slug } });
    if (old) { console.error(`"${slug}" zaten var; önce reset.sh ile sıfırlayın.`); process.exit(1); }
    const tenant = await prisma.tenant.create({ data: { slug, name: `Komşu Firma ${f}`, contactEmail: `info@${slug}.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 365 * DAY) } });
    const tenantId = tenant.id;
    await prisma.user.createMany({ data: [0, 1].map((i) => ({ tenantId, email: `admin${i}@${slug}.test`, password, name: `Yönetici ${i}`, role: 'ADMIN', isOwner: i === 0, permissions: i === 0 ? undefined : ['ORDERS', 'CATALOG', 'FINANCE', 'DEALERS'], emailVerifiedAt: new Date() })) });
    await prisma.company.createMany({ data: Array.from({ length: DEALERS }, (_, i) => ({ tenantId, name: `${slug} Bayi ${i}`, kind: 'DEALER', status: 'ACTIVE', riskLimit: 200000, paymentTermDays: 30, taxNumber: String(2000000000 + f * 1000 + i) })) });
    const companies = await prisma.company.findMany({ where: { tenantId }, select: { id: true }, orderBy: { id: 'asc' } });
    await prisma.user.createMany({ data: companies.map((c, i) => ({ tenantId, companyId: c.id, email: `bayi${i}@${slug}.test`, password, name: `Bayi ${i}`, role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() })) });
    const cats = await Promise.all(['El Aletleri', 'Elektrik', 'Boya', 'Tesisat'].map((name) => prisma.category.create({ data: { tenantId, name } })));
    await prisma.product.createMany({ data: Array.from({ length: PRODUCTS }, (_, i) => ({ tenantId, name: `${pick(WORDS)} ${i}`, sku: `${slug}-${i}`, price: Math.round((20 + rnd() * 2000) * 100) / 100, stock: Math.round(rnd() * 400), unit: 'adet', categoryId: pick(cats).id, isActive: true })) });
    const products = await prisma.product.findMany({ where: { tenantId }, select: { id: true, price: true } });
    const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true, role: true, companyId: true }, orderBy: { id: 'asc' } });
    const dealers = users.filter((u) => u.role === 'BAYI');
    const drafts = Array.from({ length: ORDERS }, () => {
      const d = pick(dealers);
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const p = pick(products); return { productId: p.id, quantity: 1 + Math.floor(rnd() * 10), price: p.price }; });
      const subtotal = Math.round(lines.reduce((t, l) => t + l.price * l.quantity, 0) * 100) / 100;
      const at = new Date(Date.now() - rnd() * 365 * DAY);
      return { lines, row: { tenantId, userId: d.id, companyId: d.companyId, subtotal, vatAmount: Math.round(subtotal * 20) / 100, totalAmount: Math.round(subtotal * 120) / 100, debitedAmount: Math.round(subtotal * 120) / 100, status: 'COMPLETED', paymentMethod: 'CURRENT_ACCOUNT', createdAt: at, approvedAt: at } };
    });
    const orders = await prisma.order.createManyAndReturn({ data: drafts.map((x) => x.row), select: { id: true } });
    await prisma.orderItem.createMany({ data: orders.flatMap((o, k) => drafts[k].lines.map((l) => ({ tenantId, orderId: o.id, productId: l.productId, quantity: l.quantity, price: l.price, vatRate: 20, status: 'APPROVED' }))) });
    const sign = (u) => jwt.sign({ id: u.id, role: u.role, companyId: u.companyId || null, tenantId }, process.env.JWT_SECRET, { expiresIn: '12h' });
    out.push({ slug, admins: users.filter((u) => u.role === 'ADMIN').map(sign), dealers: dealers.map(sign) });
    if (f % 10 === 0 || f === FIRMS) log(`${f} firma`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/neighbors.json`, JSON.stringify(out));
  await prisma.$executeRawUnsafe('ANALYZE');
  log(`bitti: ${FIRMS} firma, oturumlar ${OUT}/neighbors.json`);
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
