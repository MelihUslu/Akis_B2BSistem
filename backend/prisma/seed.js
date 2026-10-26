import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const prisma = new PrismaClient();

// Varsayılan paketler (fiyatlar KDV dahil TRY; Platform panelinden değiştirilebilir). -1 = sınırsız
const PLANS = [
  { code: 'STARTER', name: 'Başlangıç', description: 'Küçük bayi ağları için', priceMonthly: 1490, priceYearly: 14900, maxDealers: 25, maxProducts: 500, maxAdmins: 2, trialDays: 14, sortOrder: 1 },
  { code: 'PRO', name: 'Profesyonel', description: 'Büyüyen dağıtım ağları için', priceMonthly: 3490, priceYearly: 34900, maxDealers: 150, maxProducts: 5000, maxAdmins: 5, trialDays: 14, sortOrder: 2 },
  { code: 'ENTERPRISE', name: 'Kurumsal', description: 'Sınırsız bayi ve ürün, özel alan adı', priceMonthly: 7990, priceYearly: 79900, maxDealers: -1, maxProducts: -1, maxAdmins: -1, allowCustomDomain: true, trialDays: 14, sortOrder: 3 }
];

const DAY = 24 * 60 * 60 * 1000;

async function seedDemoTenant(plan) {
  if (await prisma.tenant.findUnique({ where: { slug: 'demo' } })) return;

  const tenant = await prisma.tenant.create({
    data: { slug: 'demo', name: 'Demo Hırdavat', contactEmail: 'demo@example.com', planId: plan.id, status: 'TRIAL', trialEndsAt: new Date(Date.now() + 30 * DAY) }
  });
  const t = { tenantId: tenant.id };
  const adminPassword = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD || 'demo12345', 10);
  const bayiPassword = await bcrypt.hash(process.env.DEMO_BAYI_PASSWORD || 'bayi12345', 10);

  await prisma.user.create({ data: { ...t, email: 'admin@demo.com', password: adminPassword, name: 'Demo Yönetici', role: 'ADMIN', isOwner: true, emailVerifiedAt: new Date() } });

  const categories = [];
  for (const [i, name] of ['Elektrikli El Aletleri', 'Bahçe ve Peyzaj', 'İş Güvenliği', 'El Aletleri'].entries()) {
    categories.push(await prisma.category.create({ data: { ...t, name, sortOrder: i + 1 } }));
  }

  for (const c of [
    { name: 'Teknik Hırdavat Ltd.', taxNumber: '1234567890', authorizedPerson: 'Ahmet Yılmaz', riskLimit: 50000, currentBalance: -15000 },
    { name: 'Usta Yapı Market A.Ş.', taxNumber: '9876543210', authorizedPerson: 'Mehmet Usta', riskLimit: 100000, currentBalance: 0 }
  ]) {
    const company = await prisma.company.create({ data: { ...t, ...c, status: 'ACTIVE' } });
    await prisma.user.create({ data: { ...t, email: `bayi${company.id}@demo.com`, password: bayiPassword, name: c.authorizedPerson, role: 'BAYI', isOwner: true, companyId: company.id, emailVerifiedAt: new Date() } });
  }

  const products = [
    { name: 'Akü 18V Kömürsüz Matkap', sku: 'MTK-18V', brand: 'Demo PRO', price: 4500, costPrice: 3200, stock: 45, categoryId: categories[0].id },
    { name: 'Benzinli Çim Biçme Makinesi', sku: 'CIM-200', brand: 'Demo Garden', price: 250, currency: 'USD', costPrice: 180, stock: 12, categoryId: categories[1].id },
    { name: 'S1P Çelik Burunlu İş Botu', sku: 'BOT-S1P', brand: 'SafeStep', price: 1200, costPrice: 850, stock: 120, unit: 'Çift', categoryId: categories[2].id },
    { name: '7 Parça Yıldız Anahtar Takımı', sku: 'ANH-7', brand: 'Demo Hand', price: 850, costPrice: 550, stock: 250, unit: 'Takım', moq: 6, stepQuantity: 6, categoryId: categories[3].id }
  ];
  for (const [i, p] of products.entries()) {
    await prisma.product.create({ data: { ...t, ...p, images: '[]', sortOrder: i } });
  }
  console.log('[Seed] Demo kiracı oluşturuldu: demo (admin@demo.com)');
}

async function main() {
  // 1. Paketler (varsa dokunulmaz)
  for (const plan of PLANS) {
    await prisma.plan.upsert({ where: { code: plan.code }, update: {}, create: plan });
  }

  // 2. Platform sahibi (SUPER_ADMIN) — .env: PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD
  const email = (process.env.PLATFORM_ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (email && password) {
    const exists = await prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN', tenantId: null } });
    if (!exists) {
      await prisma.user.create({
        data: { email, password: await bcrypt.hash(password, 10), name: process.env.PLATFORM_ADMIN_NAME || 'Platform Yöneticisi', role: 'SUPER_ADMIN', emailVerifiedAt: new Date() }
      });
      console.log(`[Seed] Platform yöneticisi oluşturuldu: ${email}`);
    }
  } else {
    console.warn('[Seed] PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD tanımlı değil, platform yöneticisi oluşturulmadı.');
  }

  // 3. İsteğe bağlı demo kiracı (SEED_DEMO=true)
  if (process.env.SEED_DEMO === 'true') {
    await seedDemoTenant(await prisma.plan.findUnique({ where: { code: 'PRO' } }));
  }

  console.log('[Seed] Tamamlandı.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
