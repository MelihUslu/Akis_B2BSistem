import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@akis.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const bayiEmail = process.env.BAYI_EMAIL || 'bayi@akis.com';
  const bayiPassword = process.env.BAYI_PASSWORD || 'bayi123';

  const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
  const hashedBayiPassword = await bcrypt.hash(bayiPassword, 10);

  // Create Admin
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

  // Create Bayi
  await prisma.user.upsert({
    where: { email: bayiEmail },
    update: {},
    create: {
      email: bayiEmail,
      password: hashedBayiPassword,
      name: 'Örnek Bayi',
      role: 'BAYI',
    },
  });

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
