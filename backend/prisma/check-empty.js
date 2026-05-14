import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function main() {
  try {
    const count = await prisma.user.count();
    console.log(count);
  } catch (error) {
    // If table doesn't exist yet, return 0
    console.log(0);
  } finally {
    await prisma.$disconnect();
  }
}

main();
