import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@akis.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
  const hashedBayiPassword = await bcrypt.hash('bayi123', 10);

  // 1. Create Admin
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedAdminPassword,
      name: 'Sistem Yöneticisi',
      role: 'ADMIN',
    },
  });

  // 2. Create Categories
  const categories = [
    { name: 'Elektrikli El Aletleri', sortOrder: 1 },
    { name: 'Bahçe ve Peyzaj', sortOrder: 2 },
    { name: 'İş Güvenliği', sortOrder: 3 },
    { name: 'El Aletleri', sortOrder: 4 },
  ];

  const createdCategories = [];
  for (const cat of categories) {
    const c = await prisma.category.create({ data: cat });
    createdCategories.push(c);
  }

  // 3. Create Companies (Dealers)
  const companies = [
    { name: 'Akis Teknik Hırdavat Ltd.', taxNumber: '1234567890', taxOffice: 'Boğaziçi', authorizedPerson: 'Ahmet Akis', phone: '05551112233', status: 'ACTIVE', riskLimit: 50000, currentBalance: -15000 },
    { name: 'Usta Yapı Market A.Ş.', taxNumber: '9876543210', taxOffice: 'Kadıköy', authorizedPerson: 'Mehmet Usta', phone: '05552223344', status: 'ACTIVE', riskLimit: 100000, currentBalance: 0 },
    { name: 'Güven İş Güvenliği', taxNumber: '4567891230', taxOffice: 'Mecidiyeköy', authorizedPerson: 'Selin Güven', phone: '05553334455', status: 'ACTIVE', riskLimit: 25000, currentBalance: 5000 },
    { name: 'Modern Bahçe Dünyası', taxNumber: '7891234560', taxOffice: 'Üsküdar', authorizedPerson: 'Caner Bahçe', phone: '05554445566', status: 'ACTIVE', riskLimit: 40000, currentBalance: -2500 },
  ];

  for (const comp of companies) {
    const createdComp = await prisma.company.create({ data: comp });
    // Create a user for each company
    await prisma.user.create({
      data: {
        email: `bayi${createdComp.id}@akis.com`,
        password: hashedBayiPassword,
        name: `${createdComp.authorizedPerson}`,
        role: 'BAYI',
        companyId: createdComp.id
      }
    });
  }

  // 4. Create Products
  const products = [
    { 
      name: 'Akis 18V Kömürsüz Matkap', 
      sku: 'AK-18-MATKAP', 
      brand: 'Akis PRO', 
      price: 4500, 
      costPrice: 3200, 
      stock: 45, 
      unit: 'Adet', 
      categoryId: createdCategories[0].id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1504148455328-497c5efdf156?q=80&w=500']),
      longDesc: 'Profesyonel kullanım için tasarlanmış yüksek torklu kömürsüz motor teknolojisine sahip matkap.'
    },
    { 
      name: 'Peyzaj Tipi Çim Biçme Makinesi', 
      sku: 'PY-200-CIM', 
      brand: 'Akis Garden', 
      price: 12500, 
      costPrice: 9000, 
      stock: 12, 
      unit: 'Adet', 
      categoryId: createdCategories[1].id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1592819695396-064b95e2a660?q=80&w=500']),
      longDesc: 'Geniş alanlar için ideal, ayarlanabilir kesim yüksekliğine sahip benzinli çim biçme makinesi.'
    },
    { 
      name: 'S1P Çelik Burunlu İş Botu', 
      sku: 'IG-SB-BOT', 
      brand: 'SafeStep', 
      price: 1200, 
      costPrice: 850, 
      stock: 120, 
      unit: 'Çift', 
      categoryId: createdCategories[2].id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=500']),
      longDesc: 'Dayanıklı deri yapı, çelik burun koruması ve kaymaz taban özellikleri ile tam güvenlik sağlar.'
    },
    { 
      name: '7 Parça Yıldız Anahtar Takımı', 
      sku: 'EA-7-ANAHTAR', 
      brand: 'Akis Hand', 
      price: 850, 
      costPrice: 550, 
      stock: 250, 
      unit: 'Takım', 
      categoryId: createdCategories[3].id,
      images: JSON.stringify(['https://images.unsplash.com/photo-1530124560676-44b291d9dccb?q=80&w=500']),
      longDesc: 'Krom-vanadyum çeliğinden üretilmiş, uzun ömürlü ve hassas ölçülü anahtar takımı.'
    }
  ];

  for (const prod of products) {
    await prisma.product.create({ data: prod });
  }

  console.log('Seed verileri başarıyla oluşturuldu.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
