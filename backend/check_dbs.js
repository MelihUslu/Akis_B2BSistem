import { PrismaClient } from '@prisma/client';

async function check(url) {
    const prisma = new PrismaClient({
        datasources: {
            db: {
                url: url
            }
        }
    });
    try {
        const count = await prisma.product.count();
        const catCount = await prisma.category.count();
        console.log(`DB: ${url} -> Products: ${count}, Categories: ${catCount}`);
    } catch (e) {
        console.log(`DB: ${url} -> Error: ${e.message}`);
    } finally {
        await prisma.$disconnect();
    }
}

async function run() {
    await check('file:./dev.db');
    await check('file:./prisma/dev.db');
}

run();
