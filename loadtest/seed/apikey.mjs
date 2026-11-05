/**
 * ERP API yük testi (erp.js) için API anahtarları (yalnızca akis_load): yük testi firmasına iki anahtar
 * (stok ve fiyat senkronu ayrı entegrasyonlar gibi) ve bir komşu firmaya bir anahtar. Anahtarlar .data/apikeys.json'a yazılır.
 *   docker exec -w /app akis_loadtest_backend node /loadtest/seed/apikey.mjs     # TENANT=yuktest
 */
import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(`${process.env.APP_DIR || '/app'}/package.json`);
const { PrismaClient } = require('@prisma/client');

if (!/\/akis_load(\?|$)/.test(process.env.DATABASE_URL || '')) { console.error('Güvenlik: DATABASE_URL akis_load veritabanını göstermeli.'); process.exit(1); }

const SLUG = process.env.TENANT || 'yuktest';
const OUT = process.env.OUT || '/loadtest/.data';
const prisma = new PrismaClient();
const hash = (key) => crypto.createHash('sha256').update(key).digest('hex');

const issue = async (tenantId, name) => {
  const key = `akb2b_${crypto.randomBytes(24).toString('base64url')}`;
  await prisma.apiKey.create({ data: { tenantId, name, prefix: key.slice(0, 12), keyHash: hash(key) } });
  return key;
};

const main = async () => {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) { console.error(`"${SLUG}" firması yok: önce seed.mjs.`); process.exit(1); }
  // Komşu firma: aynı IP'den gelen başka bir firmanın ERP'si (entegratör sunucusu); yoksa ikinci bir test firması açılır
  const plan = await prisma.plan.findFirst({ where: { code: 'LOADTEST' } });
  const other = await prisma.tenant.upsert({
    where: { slug: 'erp-komsu' }, update: {},
    create: { slug: 'erp-komsu', name: 'ERP Komşu Firma', contactEmail: 'info@erp-komsu.test', planId: plan?.id ?? tenant.planId, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 365 * 864e5) }
  });
  const out = {
    tenant: SLUG,
    stock: await issue(tenant.id, 'Yük testi: stok senkronu'),
    price: await issue(tenant.id, 'Yük testi: fiyat senkronu'),
    neighbor: await issue(other.id, 'Yük testi: komşu ERP')
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/apikeys.json`, JSON.stringify(out));
  console.log(`API anahtarları: ${OUT}/apikeys.json (${SLUG}: 2, erp-komsu: 1)`);
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
