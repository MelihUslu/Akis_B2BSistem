import pkg from '@prisma/client';
import prisma, { currentTenantId } from '../utils/prisma.js';
import { cached } from '../utils/cache.js';
import { workbookBuffer } from '../utils/xlsxStream.js';
import { getExchangeRates, toTRY } from './exchangeRateService.js';

// Satış sayılan sipariş durumları (bekleyen ve iptal edilenler hariç)
const { Prisma } = pkg;
const SOLD = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'];
const DAY = 24 * 60 * 60 * 1000;
const r2 = (n) => Math.round(Number((n * 100).toPrecision(15))) / 100;

export const parseRange = (query) => {
  const to = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date();
  const from = query.from ? new Date(`${query.from}T00:00:00`) : new Date(to.getTime() - 29 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error('Geçersiz tarih aralığı.');
  if (to - from > 3 * 366 * DAY) throw new Error('Tarih aralığı en fazla 3 yıl olabilir.');
  return { from, to };
};

const chunked = async (ids, size, fn) => {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(await fn(ids.slice(i, i + size))));
  return out;
};

/**
 * Satış raporu, toplamaları veritabanında yapar: belleğe yalnızca ürün, bayi ve dönem başına özet satırlar gelir.
 * Eskiden 12 aylık aralıktaki bütün kalemler (60 bin siparişte ~150 bin satır) JavaScript'e yüklenip orada toplanıyordu:
 * tek rapor ~700 MB bellek kullanıyordu, on kat veride sunucuyu düşürecekti (yük testi, 5 Kasım 2026).
 * Kural aynı: satış sayılan siparişlerin iptal edilmemiş kalemleri; kupon indirimi sipariş içinde tutarla orantılı
 * düşülür (ratio); kalemi kalmamış sipariş de sipariş sayısına girer.
 * o: siparişler, li: kalemler, po: sipariş başına adet, ciro ve indirim oranı. Bayi ve dönem özetleri po'dan
 * (sipariş başına bir satır) çıkar; kalem başına tekrar gruplamak ve DISTINCT saymak on kat veride iki kat yavaştı.
 */
const salesBase = ({ from, to, tenantId }) => Prisma.sql`
  WITH o AS (
    SELECT id, "companyId", "createdAt", "discountAmount" FROM "Order"
    WHERE "tenantId" = ${tenantId} AND status = ANY(${SOLD}) AND "createdAt" >= ${from} AND "createdAt" <= ${to}
  ), li AS (
    SELECT i."orderId", i."productId", i.quantity, i.price * i.quantity AS gross
    FROM "OrderItem" i JOIN o ON o.id = i."orderId" WHERE i.status <> 'CANCELLED'
  ), s AS (
    SELECT "orderId", sum(quantity) AS quantity, sum(gross) AS gross FROM li GROUP BY "orderId"
  ), po AS (
    SELECT o.id, o."companyId", o."createdAt", COALESCE(s.quantity, 0) AS quantity, COALESCE(s.gross, 0) AS gross,
      CASE WHEN s.gross > 0 THEN GREATEST(0, s.gross - COALESCE(o."discountAmount", 0)) / s.gross ELSE 1 END AS ratio
    FROM o LEFT JOIN s ON s."orderId" = o.id
  )`;

const loadSalesAggregates = async ({ from, to, monthly }) => {
  const tenantId = currentTenantId();
  if (!tenantId) throw new Error('[Tenant] Satış raporu kiracı bağlamı olmadan çağrıldı.');
  const base = salesBase({ from, to, tenantId });
  const tz = process.env.TZ || 'Europe/Istanbul';
  const fmt = monthly ? 'YYYY-MM' : 'YYYY-MM-DD';
  // Tek sorgu: sipariş ve kalem kümesi bir kez hesaplanır (birden çok yerde kullanılan CTE'yi PostgreSQL bir kez
  // oluşturur), dört özet JSON olarak döner (on kat veride 12 aylık rapor 5,7 sn → 2,5 sn)
  const [row] = await prisma.$queryRaw`${base}
    SELECT
      (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT li."productId", sum(li.quantity)::float8 AS quantity, sum(li.gross * po.ratio)::float8 AS amount
        FROM li JOIN po ON po.id = li."orderId" GROUP BY li."productId") x) AS "byProduct",
      (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT parent AS "parentId", count(*)::int AS orders FROM (
        SELECT DISTINCT COALESCE(p."parentId", p.id) AS parent, li."orderId" FROM li JOIN "Product" p ON p.id = li."productId") d GROUP BY parent) x) AS "ordersByParent",
      (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT "companyId", count(*)::int AS orders, sum(quantity)::float8 AS quantity, sum(gross * ratio)::float8 AS revenue
        FROM po GROUP BY "companyId") x) AS "byDealer",
      (SELECT COALESCE(json_agg(x), '[]') FROM (SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, ${fmt}) AS period, count(*)::int AS orders, sum(gross * ratio)::float8 AS revenue
        FROM po GROUP BY 1) x) AS "byPeriod",
      (SELECT count(*) FROM o)::int AS orders`;
  const { byProduct, ordersByParent, byDealer, byPeriod } = row;
  const productIds = byProduct.map((r) => r.productId);
  const companyIds = byDealer.map((r) => r.companyId);
  const [products, companies] = await Promise.all([
    chunked(productIds, 10000, (ids) => prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, sku: true, unit: true, costPrice: true, currency: true, parentId: true, category: { select: { id: true, name: true } }, parent: { select: { id: true, name: true, sku: true, category: { select: { id: true, name: true } } } } }
    })),
    chunked(companyIds, 10000, (ids) => prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, dealerGroup: true } }))
  ]);
  return { byProduct, ordersByParent, byDealer, byPeriod, totalOrders: row.orders || 0, products, companies };
};

/**
 * Tarih aralığındaki satış raporu (tutarlar TL, KDV hariç; kupon indirimi sipariş bazında orantılı düşülür).
 * Maliyet, ürünün güncel maliyet fiyatı ve bugünkü kurla hesaplanır (yaklaşık kâr).
 * Sonuç firma + aralık başına 60 sn önbellekte tutulur; aynı anda açan yöneticiler tek hesabı bekler.
 */
export const buildSalesReport = ({ from, to }) =>
  cached(`sales:${currentTenantId()}:${from.getTime()}:${to.getTime()}`, 60_000, () => computeSalesReport({ from, to }));

const computeSalesReport = async ({ from, to }) => {
  const monthly = to - from > 92 * DAY; // 3 aydan uzun aralıkta aylık gruplanır
  const [agg, rates, activeProducts] = await Promise.all([
    loadSalesAggregates({ from, to, monthly }),
    getExchangeRates().then((r) => r.rates).catch(() => ({})),
    prisma.product.findMany({ where: { isActive: true, parentId: null }, select: { id: true, name: true, sku: true, stock: true, createdAt: true, category: { select: { name: true } } } })
  ]);
  const productById = new Map(agg.products.map((p) => [p.id, p]));
  const companyById = new Map(agg.companies.map((c) => [c.id, c]));
  const ordersByParent = new Map(agg.ordersByParent.map((r) => [r.parentId, r.orders]));

  // Ürün (varyantlar ana ürüne toplanır) ve kategori; maliyet varyantın kendi maliyetiyle
  const products = new Map();
  const categories = new Map();
  const soldParents = new Set();
  let revenue = 0;
  let cost = 0;
  let costCovered = 0; // maliyeti bilinen ciro
  let quantity = 0;
  for (const row of agg.byProduct) {
    const p = productById.get(row.productId);
    if (!p) continue;
    const parent = p.parent || p;
    soldParents.add(parent.id);
    const unitCost = p.costPrice != null ? toTRY(p.costPrice, p.currency, rates) : null;
    const lineCost = unitCost != null ? unitCost * row.quantity : null;
    const pr = products.get(parent.id) || { id: parent.id, name: parent.name, sku: parent.sku, unit: p.unit, category: (p.parent?.category || p.category)?.name || '—', quantity: 0, revenue: 0, cost: 0, costKnown: true };
    pr.quantity += row.quantity;
    pr.revenue += row.amount;
    if (lineCost == null) pr.costKnown = false; else pr.cost += lineCost;
    products.set(parent.id, pr);
    const cat = (p.parent?.category || p.category) || { id: 0, name: 'Kategorisiz' };
    const c = categories.get(cat.id) || { id: cat.id, name: cat.name, quantity: 0, revenue: 0 };
    c.quantity += row.quantity;
    c.revenue += row.amount;
    categories.set(cat.id, c);
    revenue += row.amount;
    quantity += row.quantity;
    if (lineCost != null) { cost += lineCost; costCovered += row.amount; }
  }

  const byRevenue = (a, b) => b.revenue - a.revenue;
  const productRows = [...products.values()].map((p) => ({
    ...p, orders: ordersByParent.get(p.id) || 0, revenue: r2(p.revenue),
    cost: p.costKnown ? r2(p.cost) : null,
    margin: p.costKnown && p.revenue > 0 ? r2(((p.revenue - p.cost) / p.revenue) * 100) : null
  })).sort(byRevenue);
  const totalOrders = agg.totalOrders;

  return {
    range: { from, to, grouping: monthly ? 'month' : 'day' },
    summary: {
      revenue: r2(revenue),
      orders: totalOrders,
      dealers: agg.byDealer.length,
      averageOrder: totalOrders ? r2(revenue / totalOrders) : 0,
      quantity,
      // Kâr yalnızca maliyeti girilmiş ürünler üzerinden hesaplanır
      grossProfit: costCovered ? r2(costCovered - cost) : null,
      margin: costCovered ? r2(((costCovered - cost) / costCovered) * 100) : null,
      costCoverage: revenue ? r2((costCovered / revenue) * 100) : 0
    },
    trend: agg.byPeriod.map((t) => ({ period: t.period, revenue: r2(t.revenue), orders: t.orders })).sort((a, b) => a.period.localeCompare(b.period)),
    products: productRows,
    dealers: agg.byDealer.map((d) => {
      const c = companyById.get(d.companyId);
      return { id: d.companyId, name: c?.name || `#${d.companyId}`, group: c?.dealerGroup, orders: d.orders, quantity: d.quantity, revenue: r2(d.revenue), share: revenue ? r2((d.revenue / revenue) * 100) : 0 };
    }).sort(byRevenue),
    categories: [...categories.values()].map((c) => ({ ...c, revenue: r2(c.revenue), share: revenue ? r2((c.revenue / revenue) * 100) : 0 })).sort(byRevenue),
    unsold: activeProducts.filter((p) => !soldParents.has(p.id)).map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category?.name || '—', stock: p.stock, createdAt: p.createdAt })).sort((a, b) => b.stock - a.stock)
  };
};

const fmtDate = (d) => new Date(d).toLocaleDateString('tr-TR');

export const reportWorkbook = (report) => {
  const s = report.summary;
  const list = (rows) => (rows.length ? rows : [{ Bilgi: 'Kayıt yok' }]);
  return workbookBuffer([
    { name: 'Özet', rows: [
      { Gösterge: 'Tarih aralığı', Değer: `${fmtDate(report.range.from)} – ${fmtDate(report.range.to)}` },
      { Gösterge: 'Ciro (KDV hariç, TL)', Değer: s.revenue },
      { Gösterge: 'Sipariş sayısı', Değer: s.orders },
      { Gösterge: 'Ortalama sipariş (TL)', Değer: s.averageOrder },
      { Gösterge: 'Sipariş veren bayi', Değer: s.dealers },
      { Gösterge: 'Satılan miktar', Değer: s.quantity },
      { Gösterge: 'Brüt kâr (TL, maliyeti bilinenler)', Değer: s.grossProfit ?? '—' },
      { Gösterge: 'Kâr marjı (%)', Değer: s.margin ?? '—' },
      { Gösterge: 'Maliyeti bilinen ciro oranı (%)', Değer: s.costCoverage }
    ] },
    { name: 'Ürünler', rows: list(report.products.map((p) => ({ 'Ürün': p.name, SKU: p.sku, Kategori: p.category, 'Miktar': p.quantity, Birim: p.unit, 'Sipariş': p.orders, 'Ciro (TL)': p.revenue, 'Maliyet (TL)': p.cost ?? '', 'Marj (%)': p.margin ?? '' }))) },
    { name: 'Bayiler', rows: list(report.dealers.map((d) => ({ Bayi: d.name, Grup: d.group, 'Sipariş': d.orders, 'Miktar': d.quantity, 'Ciro (TL)': d.revenue, 'Pay (%)': d.share }))) },
    { name: 'Kategoriler', rows: list(report.categories.map((c) => ({ Kategori: c.name, 'Miktar': c.quantity, 'Ciro (TL)': c.revenue, 'Pay (%)': c.share }))) },
    { name: 'Satılmayanlar', rows: list(report.unsold.map((p) => ({ 'Ürün': p.name, SKU: p.sku, Kategori: p.category, Stok: p.stock, 'Eklenme': fmtDate(p.createdAt) }))) },
    { name: 'Trend', rows: list(report.trend.map((t) => ({ 'Dönem': t.period, 'Sipariş': t.orders, 'Ciro (TL)': t.revenue }))) }
  ]);
};
