import xlsx from 'xlsx';
import prisma from '../utils/prisma.js';
import { getExchangeRates, toTRY } from './exchangeRateService.js';

// Satış sayılan sipariş durumları (bekleyen ve iptal edilenler hariç)
const SOLD = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED'];
const DAY = 24 * 60 * 60 * 1000;
const r2 = (n) => Math.round(Number((n * 100).toPrecision(15))) / 100;

export const parseRange = (query) => {
  const to = query.to ? new Date(`${query.to}T23:59:59.999`) : new Date();
  const from = query.from ? new Date(`${query.from}T00:00:00`) : new Date(to.getTime() - 29 * DAY);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error('Geçersiz tarih aralığı.');
  if (to - from > 3 * 366 * DAY) throw new Error('Tarih aralığı en fazla 3 yıl olabilir.');
  return { from, to };
};

/**
 * Tarih aralığındaki satış raporu (tutarlar TL, KDV hariç; kupon indirimi sipariş bazında orantılı düşülür).
 * Maliyet, ürünün güncel maliyet fiyatı ve bugünkü kurla hesaplanır (yaklaşık kâr).
 */
export const buildSalesReport = async ({ from, to }) => {
  const [orders, rates, activeProducts] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: SOLD }, createdAt: { gte: from, lte: to } },
      select: {
        id: true, createdAt: true, discountAmount: true, companyId: true,
        company: { select: { name: true, dealerGroup: true } },
        items: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            quantity: true, price: true, productId: true,
            product: { select: { id: true, name: true, sku: true, unit: true, costPrice: true, currency: true, parentId: true, category: { select: { id: true, name: true } }, parent: { select: { id: true, name: true, sku: true, category: { select: { id: true, name: true } } } } } }
          }
        }
      }
    }),
    getExchangeRates().then((r) => r.rates).catch(() => ({})),
    prisma.product.findMany({ where: { isActive: true, parentId: null }, select: { id: true, name: true, sku: true, stock: true, createdAt: true, category: { select: { name: true } } } })
  ]);

  const products = new Map();
  const dealers = new Map();
  const categories = new Map();
  const trend = new Map();
  const monthly = to - from > 92 * DAY; // 3 aydan uzun aralıkta aylık gruplanır
  const soldParents = new Set();
  let revenue = 0;
  let cost = 0;
  let costCovered = 0; // maliyeti bilinen ciro

  for (const o of orders) {
    const gross = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const ratio = gross > 0 ? Math.max(0, gross - (o.discountAmount || 0)) / gross : 1;
    const key = monthly ? o.createdAt.toISOString().slice(0, 7) : o.createdAt.toISOString().slice(0, 10);
    const t = trend.get(key) || { period: key, revenue: 0, orders: 0 };
    t.orders += 1;

    const d = dealers.get(o.companyId) || { id: o.companyId, name: o.company?.name || `#${o.companyId}`, group: o.company?.dealerGroup, orders: 0, quantity: 0, revenue: 0 };
    d.orders += 1;

    for (const i of o.items) {
      const amount = i.price * i.quantity * ratio;
      const p = i.product;
      const parent = p.parent || p;
      soldParents.add(parent.id);
      const unitCost = p.costPrice != null ? toTRY(p.costPrice, p.currency, rates) : null;
      const lineCost = unitCost != null ? unitCost * i.quantity : null;

      const pr = products.get(parent.id) || { id: parent.id, name: parent.name, sku: parent.sku, unit: p.unit, category: (p.parent?.category || p.category)?.name || '—', quantity: 0, revenue: 0, cost: 0, costKnown: true, orders: new Set() };
      pr.quantity += i.quantity;
      pr.revenue += amount;
      pr.orders.add(o.id);
      if (lineCost == null) pr.costKnown = false; else pr.cost += lineCost;
      products.set(parent.id, pr);

      const cat = (p.parent?.category || p.category) || { id: 0, name: 'Kategorisiz' };
      const c = categories.get(cat.id) || { id: cat.id, name: cat.name, quantity: 0, revenue: 0 };
      c.quantity += i.quantity;
      c.revenue += amount;
      categories.set(cat.id, c);

      d.quantity += i.quantity;
      d.revenue += amount;
      t.revenue += amount;
      revenue += amount;
      if (lineCost != null) { cost += lineCost; costCovered += amount; }
    }
    dealers.set(o.companyId, d);
    trend.set(key, t);
  }

  const byRevenue = (a, b) => b.revenue - a.revenue;
  const productRows = [...products.values()].map((p) => ({
    ...p, orders: p.orders.size, revenue: r2(p.revenue),
    cost: p.costKnown ? r2(p.cost) : null,
    margin: p.costKnown && p.revenue > 0 ? r2(((p.revenue - p.cost) / p.revenue) * 100) : null
  })).sort(byRevenue);

  return {
    range: { from, to, grouping: monthly ? 'month' : 'day' },
    summary: {
      revenue: r2(revenue),
      orders: orders.length,
      dealers: dealers.size,
      averageOrder: orders.length ? r2(revenue / orders.length) : 0,
      quantity: productRows.reduce((s, p) => s + p.quantity, 0),
      // Kâr yalnızca maliyeti girilmiş ürünler üzerinden hesaplanır
      grossProfit: costCovered ? r2(costCovered - cost) : null,
      margin: costCovered ? r2(((costCovered - cost) / costCovered) * 100) : null,
      costCoverage: revenue ? r2((costCovered / revenue) * 100) : 0
    },
    trend: [...trend.values()].map((t) => ({ ...t, revenue: r2(t.revenue) })).sort((a, b) => a.period.localeCompare(b.period)),
    products: productRows,
    dealers: [...dealers.values()].map((d) => ({ ...d, revenue: r2(d.revenue), share: revenue ? r2((d.revenue / revenue) * 100) : 0 })).sort(byRevenue),
    categories: [...categories.values()].map((c) => ({ ...c, revenue: r2(c.revenue), share: revenue ? r2((c.revenue / revenue) * 100) : 0 })).sort(byRevenue),
    unsold: activeProducts.filter((p) => !soldParents.has(p.id)).map((p) => ({ id: p.id, name: p.name, sku: p.sku, category: p.category?.name || '—', stock: p.stock, createdAt: p.createdAt })).sort((a, b) => b.stock - a.stock)
  };
};

const fmtDate = (d) => new Date(d).toLocaleDateString('tr-TR');

export const reportWorkbook = (report) => {
  const wb = xlsx.utils.book_new();
  const add = (name, rows) => xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows.length ? rows : [{ Bilgi: 'Kayıt yok' }]), name);
  const s = report.summary;
  add('Özet', [
    { Gösterge: 'Tarih aralığı', Değer: `${fmtDate(report.range.from)} – ${fmtDate(report.range.to)}` },
    { Gösterge: 'Ciro (KDV hariç, TL)', Değer: s.revenue },
    { Gösterge: 'Sipariş sayısı', Değer: s.orders },
    { Gösterge: 'Ortalama sipariş (TL)', Değer: s.averageOrder },
    { Gösterge: 'Sipariş veren bayi', Değer: s.dealers },
    { Gösterge: 'Satılan miktar', Değer: s.quantity },
    { Gösterge: 'Brüt kâr (TL, maliyeti bilinenler)', Değer: s.grossProfit ?? '—' },
    { Gösterge: 'Kâr marjı (%)', Değer: s.margin ?? '—' },
    { Gösterge: 'Maliyeti bilinen ciro oranı (%)', Değer: s.costCoverage }
  ]);
  add('Ürünler', report.products.map((p) => ({ 'Ürün': p.name, SKU: p.sku, Kategori: p.category, 'Miktar': p.quantity, Birim: p.unit, 'Sipariş': p.orders, 'Ciro (TL)': p.revenue, 'Maliyet (TL)': p.cost ?? '', 'Marj (%)': p.margin ?? '' })));
  add('Bayiler', report.dealers.map((d) => ({ Bayi: d.name, Grup: d.group, 'Sipariş': d.orders, 'Miktar': d.quantity, 'Ciro (TL)': d.revenue, 'Pay (%)': d.share })));
  add('Kategoriler', report.categories.map((c) => ({ Kategori: c.name, 'Miktar': c.quantity, 'Ciro (TL)': c.revenue, 'Pay (%)': c.share })));
  add('Satılmayanlar', report.unsold.map((p) => ({ 'Ürün': p.name, SKU: p.sku, Kategori: p.category, Stok: p.stock, 'Eklenme': fmtDate(p.createdAt) })));
  add('Trend', report.trend.map((t) => ({ 'Dönem': t.period, 'Sipariş': t.orders, 'Ciro (TL)': t.revenue })));
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
};
