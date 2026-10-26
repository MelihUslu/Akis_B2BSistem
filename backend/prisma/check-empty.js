import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

// Paket tablosu boşsa veritabanı ilk kez kuruluyordur → seed çalıştırılır
async function main() {
  try {
    console.log(await prisma.plan.count());
  } catch (error) {
    console.log(0);
  } finally {
    await prisma.$disconnect();
  }
}

main();
