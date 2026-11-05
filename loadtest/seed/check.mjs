/**
 * Yazma testlerinden sonra doğruluk kontrolü (yalnızca akis_load). Her kontrol "sorunlu kayıt sayısı" döner; hepsi 0 olmalı.
 *   docker exec -w /app akis_loadtest_backend node /loadtest/seed/check.mjs
 */
import { createRequire } from 'module';

const require = createRequire(`${process.env.APP_DIR || '/app'}/package.json`);
const { PrismaClient } = require('@prisma/client');

if (!/\/akis_load(\?|$)/.test(process.env.DATABASE_URL || '')) { console.error('Güvenlik: DATABASE_URL akis_load veritabanını göstermeli.'); process.exit(1); }
const prisma = new PrismaClient();
const one = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0]?.n ?? 0);

const CHECKS = [
  ['Eksi stoklu ürün', 'select count(*)::int n from "Product" where stock < 0'],
  ['Eksi depo stoğu', 'select count(*)::int n from "WarehouseStock" where quantity < 0'],
  // Stok ayırma: bekleyen siparişlerdeki miktar stoğu aşmamalı (sipariş anında satır kilidiyle korunur)
  ['Bekleyen sipariş miktarı stoğu aşan ürün', `select count(*)::int n from (
      select p.id from "Product" p join "OrderItem" i on i."productId" = p.id join "Order" o on o.id = i."orderId"
      where o.status = 'PENDING' and i.status <> 'CANCELLED' group by p.id, p.stock having sum(i.quantity) > p.stock) x`],
  ['Aynı siparişe birden fazla borç kaydı', `select count(*)::int n from (
      select "orderId" from "FinancialTransaction" where source = 'ORDER' and type = 'DEBT' and "orderId" is not null group by "orderId" having count(*) > 1) x`],
  ['Onaylı sipariş: borç kaydı tutarı ≠ borçlanan tutar', `select count(*)::int n from "Order" o
      join (select "orderId", sum(amount) s from "FinancialTransaction" where source = 'ORDER' and type = 'DEBT' group by "orderId") t on t."orderId" = o.id
      where o.status in ('APPROVED','PARTIAL_APPROVED','SHIPPED','READY_FOR_PICKUP','COMPLETED') and abs(t.s - o."debitedAmount") > 0.01`],
  ['Cari bakiyesi hareketlerle uyuşmayan firma', `select count(*)::int n from "Company" c
      left join (select "companyId", sum(case when type = 'CREDIT' then amount else -amount end) s from "FinancialTransaction" group by "companyId") t on t."companyId" = c.id
      where abs(coalesce(t.s, 0) - c."currentBalance") > 0.05`],
  ['Alacak kaydı olmayan tahsilat', `select count(*)::int n from "Payment" p where p.status = 'COMPLETED' and p."companyId" is not null
      and not exists (select 1 from "FinancialTransaction" t where t."paymentId" = p.id)`],
  ['Tekrarlanan makbuz numarası', 'select count(*)::int n from (select "tenantId", "receiptNo" from "Payment" where "receiptNo" is not null group by 1, 2 having count(*) > 1) x']
];

const main = async () => {
  let bad = 0;
  for (const [label, sql] of CHECKS) {
    const n = await one(sql);
    bad += n;
    console.log(`${n === 0 ? '✓' : '✗'} ${label}: ${n}`);
  }
  const stats = (await prisma.$queryRawUnsafe(`select
      (select count(*)::int from "Order" where note = 'Kampanya siparişi') siparis,
      (select count(*)::int from "Order" where note = 'Kampanya siparişi' and status <> 'PENDING') onaylanan,
      (select count(*)::int from "Payment" where note = 'Kampanya tahsilatı') tahsilat,
      (select count(*)::int from "QuoteRequest" where note = 'Kampanya için toplu fiyat') teklif`))[0];
  console.log(`\nTest kayıtları: ${stats.siparis} sipariş (${stats.onaylanan} karara bağlandı), ${stats.tahsilat} tahsilat, ${stats.teklif} teklif`);
  console.log(bad === 0 ? '\nDoğruluk kontrolleri temiz.' : `\n${bad} sorunlu kayıt var.`);
  process.exitCode = bad === 0 ? 0 : 2;
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
