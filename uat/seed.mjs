/**
 * UAT verisi: AYRI bir veritabanına (akis_uat) iki firma, yönetici, senaryo bayileri ve ürünler yazar.
 * Geliştirme veritabanına dokunmaz; DATABASE_URL "akis_uat" değilse çalışmaz. run.sh içinden çağrılır:
 *   docker exec -w /app akis_uat_backend node /uat/seed.mjs
 */
import { createRequire } from 'module';
import { TENANT, OTHER_TENANT, PASSWORD, ADMIN, PLASIYER, DEALERS, OTHER_DEALER, PRODUCTS, PICKUP } from './data.mjs';

// Paketler backend'in node_modules klasöründen yüklenir (betik uat/ altında durur)
const require = createRequire('/app/package.json');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

if (!/\/akis_uat(\?|$)/.test(process.env.DATABASE_URL || '')) {
  console.error('Güvenlik: DATABASE_URL akis_uat veritabanını göstermeli.');
  process.exit(1);
}

const prisma = new PrismaClient();
const YEAR = 365 * 864e5;

const main = async () => {
  const plan = await prisma.plan.create({ data: { code: 'UAT', name: 'UAT', priceMonthly: 0, priceYearly: 0, maxDealers: -1, maxProducts: -1, maxAdmins: -1, isPublic: false } });
  const password = await bcrypt.hash(PASSWORD, 6);
  const tenant = (slug, name) => prisma.tenant.create({ data: { slug, name, contactEmail: `info@${slug}.test`, planId: plan.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + YEAR) } });

  const t = await tenant(TENANT, 'UAT Hırdavat A.Ş.');
  await prisma.user.create({ data: { tenantId: t.id, email: ADMIN.email, password, name: ADMIN.name, role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() } });
  const plasiyer = await prisma.user.create({ data: { tenantId: t.id, email: PLASIYER.email, password, name: PLASIYER.name, role: 'PLASIYER', emailVerifiedAt: new Date() } });
  const admin = await prisma.user.findFirst({ where: { tenantId: t.id, email: ADMIN.email } });
  // Senaryoların oturumları için kullanıcı kimlikleri (run.sh günlükten okur; global-setup oturum anahtarını imzalar)
  const sessions = [
    { key: 'admin', id: admin.id, name: admin.name, email: admin.email, role: 'ADMIN', companyId: null, isOwner: true },
    { key: 'plasiyer', id: plasiyer.id, name: plasiyer.name, email: plasiyer.email, role: 'PLASIYER', companyId: null, isOwner: false }
  ];

  let tax = 1000000000;
  for (const [key, d] of Object.entries(DEALERS)) {
    const c = await prisma.company.create({ data: { tenantId: t.id, name: d.company, kind: 'DEALER', status: 'ACTIVE', taxNumber: String(tax++), riskLimit: d.riskLimit, netDiscount: d.netDiscount, paymentTermDays: 30, ...(d.plasiyer && { plasiyerId: plasiyer.id }) } });
    const u = await prisma.user.create({ data: { tenantId: t.id, companyId: c.id, email: d.email, password, name: `${d.company} Yetkilisi`, role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() } });
    sessions.push({ key, id: u.id, name: u.name, email: u.email, role: 'BAYI', companyId: c.id, isOwner: true });
    await prisma.deliveryAddress.create({ data: { tenantId: t.id, companyId: c.id, title: 'Merkez', contactName: 'Depo Sorumlusu', phone: '0532 000 00 00', city: 'İstanbul', district: 'Kadıköy', line: 'Moda Cad. No:1', isDefault: true } });
  }

  const cat = await prisma.category.create({ data: { tenantId: t.id, name: 'El Aletleri' } });
  await prisma.product.createMany({ data: Object.values(PRODUCTS).map((p, i) => ({ tenantId: t.id, categoryId: cat.id, name: p.name, sku: p.sku, price: p.price, stock: p.stock, vatRate: 20, unit: 'Adet', brand: 'Akis', sortOrder: i })) });

  const settings = { pickup_enabled: 'true', pickup_address: PICKUP.address, pickup_hours: PICKUP.hours, pickup_lead_hours: '2', quote_out_of_stock: 'true' };
  await prisma.setting.createMany({ data: Object.entries(settings).map(([key, value]) => ({ tenantId: t.id, key, value })) });

  // İkinci firma ve bayisi (firmalar arası yalıtım senaryosu)
  const o = await tenant(OTHER_TENANT, 'Diğer Firma');
  const oc = await prisma.company.create({ data: { tenantId: o.id, name: OTHER_DEALER.company, kind: 'DEALER', status: 'ACTIVE', taxNumber: '9000000000' } });
  await prisma.user.create({ data: { tenantId: o.id, companyId: oc.id, email: OTHER_DEALER.email, password, name: 'Diğer Bayi', role: 'BAYI', isOwner: true, emailVerifiedAt: new Date() } });

  console.log(`UAT_USERS ${JSON.stringify({ tenantId: t.id, users: sessions })}`);
  console.log(`UAT verisi hazır: ${TENANT} (#${t.id}) · ${Object.keys(DEALERS).length} bayi · ${Object.keys(PRODUCTS).length} ürün · ${OTHER_TENANT} (#${o.id})`);
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
