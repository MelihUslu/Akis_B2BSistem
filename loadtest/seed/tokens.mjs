/**
 * Yük testi oturum anahtarlarını yeniler (seed.mjs'nin anahtarları 12 saat geçerli): veriyi yeniden üretmeden,
 * akis_load'daki mevcut kullanıcılar için loadtest/.data/tokens.json'u baştan yazar (sıra seed.mjs'deki gibi).
 *   docker exec akis_loadtest_backend node /loadtest/seed/tokens.mjs
 */
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(`${process.env.APP_DIR || '/app'}/package.json`);
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

if (!/\/akis_load(\?|$)/.test(process.env.DATABASE_URL || '')) { console.error('Güvenlik: DATABASE_URL akis_load veritabanını göstermeli.'); process.exit(1); }
if (!process.env.JWT_SECRET) { console.error('JWT_SECRET gerekli (yük testi backend\'iyle aynı).'); process.exit(1); }

const SLUG = process.env.TENANT || 'yuktest';
const OUT = process.env.OUT || '/loadtest/.data';
const prisma = new PrismaClient();
try {
  const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (!tenant) throw new Error(`${SLUG} firması yok; önce seed.mjs`);
  const users = (role) => prisma.user.findMany({ where: { tenantId: tenant.id, role }, select: { id: true, companyId: true }, orderBy: { id: 'asc' } });
  const [admins, dealers] = await Promise.all([users('ADMIN'), users('BAYI')]);
  const sign = (u, role) => jwt.sign({ id: u.id, role, companyId: u.companyId || null, tenantId: tenant.id }, process.env.JWT_SECRET, { expiresIn: '12h' });
  fs.writeFileSync(`${OUT}/tokens.json`, JSON.stringify({ tenant: SLUG, admins: admins.map((u) => sign(u, 'ADMIN')), dealers: dealers.map((u) => sign(u, 'BAYI')), companies: dealers.map((u) => u.companyId) }));
  console.log(`oturum anahtarları yenilendi: ${admins.length} yönetici, ${dealers.length} bayi (12 saat geçerli)`);
} finally {
  await prisma.$disconnect();
}
