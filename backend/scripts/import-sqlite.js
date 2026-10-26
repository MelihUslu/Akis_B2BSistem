/**
 * Eski tek firmalı SQLite veritabanını PostgreSQL'e yeni bir kiracı olarak aktarır.
 *
 * Kullanım (Node 22.5+ gerekir, yerel makinede çalıştırın):
 *   DATABASE_URL=postgresql://... node scripts/import-sqlite.js <sqlite-dosyası> <slug> "<Firma Adı>" [PLAN_KODU]
 *   örn: node scripts/import-sqlite.js prisma/dev.db akis "Akis Hırdavat" PRO
 *
 * Tüm kayıtlar yeni ID'lerle oluşturulur, ilişkiler eşlenir. Kiracı ACTIVE ve 1 yıllık dönemle açılır.
 */
import { DatabaseSync } from 'node:sqlite';
import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;

const [file, slug, name, planCode = 'PRO'] = process.argv.slice(2);
if (!file || !slug || !name) {
  console.error('Kullanım: node scripts/import-sqlite.js <sqlite-dosyası> <slug> "<Firma Adı>" [PLAN_KODU]');
  process.exit(1);
}

const sqlite = new DatabaseSync(file, { readOnly: true });
const prisma = new PrismaClient();

const models = Object.fromEntries(Prisma.dmmf.datamodel.models.map(m => [m.name, m]));
const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));

const rows = (model) => (tables.has(model) ? sqlite.prepare(`SELECT * FROM "${model}" ORDER BY id`).all() : []);

// SQLite değerlerini Prisma alan tiplerine çevirir; ilişkisel alanlar ve id dışarıda bırakılır
const convert = (model, row, skip = []) => {
  const data = {};
  for (const field of models[model].fields) {
    if (field.kind !== 'scalar' || field.name === 'id' || skip.includes(field.name) || !(field.name in row)) continue;
    let v = row[field.name];
    if (v === null || v === undefined) { data[field.name] = null; continue; }
    if (field.type === 'DateTime') v = new Date(typeof v === 'number' ? v : Date.parse(v));
    else if (field.type === 'Boolean') v = Boolean(v);
    else if (field.type === 'Float') v = Number(v);
    else if (field.type === 'Int') v = Number(v);
    data[field.name] = v;
  }
  return data;
};

const map = {}; // model -> Map(eskiId -> yeniId)
const idOf = (model, oldId) => (oldId == null ? null : map[model]?.get(oldId) ?? null);

async function copy(model, { remap = {}, skip = [], transform } = {}) {
  map[model] = new Map();
  const delegate = prisma[model.charAt(0).toLowerCase() + model.slice(1)];
  for (const row of rows(model)) {
    const data = convert(model, row, [...skip, 'tenantId', ...Object.keys(remap)]);
    for (const [field, target] of Object.entries(remap)) data[field] = idOf(target, row[field]);
    if (transform) transform(data, row);
    const created = await delegate.create({ data: { ...data, tenantId: tenant.id } });
    map[model].set(row.id, created.id);
  }
  console.log(`  ${model}: ${map[model].size}`);
}

let tenant;

async function main() {
  if (await prisma.tenant.findUnique({ where: { slug } })) throw new Error(`"${slug}" adresli kiracı zaten var.`);
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new Error(`${planCode} paketi bulunamadı. Önce seed çalıştırın.`);

  const firstAdmin = rows('User').find(u => u.role === 'ADMIN');
  const periodEnd = new Date();
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  tenant = await prisma.tenant.create({
    data: { slug, name, contactEmail: firstAdmin?.email || 'admin@example.com', planId: plan.id, status: 'ACTIVE', currentPeriodEnd: periodEnd, billingCycle: 'YEARLY', signupSource: 'PLATFORM' }
  });
  console.log(`Kiracı oluşturuldu: ${slug} (#${tenant.id}). Aktarılıyor...`);

  await copy('Company', { skip: ['plasiyerId'] });
  await copy('User', {
    remap: { companyId: 'Company' },
    transform: (d, row) => {
      d.email = d.email.toLowerCase(); d.emailVerifiedAt = d.emailVerifiedAt || new Date(); d.emailVerifyToken = null;
      // Yöneticiler firma sahibi; her bayinin ilk kullanıcısı ana kullanıcı
      const firstOfCompany = rows('User').find(u => u.role === 'BAYI' && u.companyId === row.companyId)?.id === row.id;
      d.isOwner = d.role === 'ADMIN' || (d.role === 'BAYI' && firstOfCompany);
    }
  });
  for (const c of rows('Company').filter(c => c.plasiyerId)) {
    await prisma.company.update({ where: { id: idOf('Company', c.id) }, data: { plasiyerId: idOf('User', c.plasiyerId) } });
  }

  await copy('Category', { skip: ['parentId'] });
  for (const c of rows('Category').filter(c => c.parentId)) {
    await prisma.category.update({ where: { id: idOf('Category', c.id) }, data: { parentId: idOf('Category', c.parentId) } });
  }

  await copy('Product', {
    remap: { categoryId: 'Category' },
    skip: ['parentId', 'alternativeToId'],
    transform: (d) => { if (d.currency === 'TL') d.currency = 'TRY'; }
  });
  for (const p of rows('Product').filter(p => p.parentId || p.alternativeToId)) {
    await prisma.product.update({
      where: { id: idOf('Product', p.id) },
      data: { parentId: idOf('Product', p.parentId), alternativeToId: idOf('Product', p.alternativeToId) }
    });
  }

  await copy('Order', { remap: { userId: 'User', companyId: 'Company' } });
  await copy('OrderItem', { remap: { orderId: 'Order', productId: 'Product' } });
  await copy('Payment', { remap: { orderId: 'Order', companyId: 'Company' } });
  await copy('FinancialTransaction', { remap: { companyId: 'Company', orderId: 'Order' } });
  await copy('PlasiyerPoint', { remap: { userId: 'User', orderId: 'Order' } });
  await copy('Setting');
  await copy('Reconciliation', { remap: { companyId: 'Company', userId: 'User' } });
  await copy('ReturnRequest', { remap: { companyId: 'Company', userId: 'User', orderId: 'Order', orderItemId: 'OrderItem', productId: 'Product' } });
  await copy('Notification', { remap: { userId: 'User' }, transform: (d) => { d.dedupeKey = d.dedupeKey ? `t${tenant.id}:${d.dedupeKey}` : null; } });
  await copy('StockAlert', { remap: { userId: 'User', productId: 'Product' } });

  console.log('Aktarım tamamlandı.');
}

main()
  .catch((e) => { console.error('HATA:', e.message); process.exitCode = 1; })
  .finally(async () => { sqlite.close(); await prisma.$disconnect(); });
