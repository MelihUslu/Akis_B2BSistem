import prisma from '../utils/prisma.js';
import { round2 } from '../services/pricingService.js';
import { hasPermission } from '../services/permissions.js';

const REVENUE_STATUSES = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'];
const DAY = 24 * 60 * 60 * 1000;

export const getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const seriesStart = new Date(now.getTime() - 29 * DAY);
    seriesStart.setHours(0, 0, 0, 0);

    const [
      monthSales, prevMonthSales, activeDealers, pendingDealers, pendingOrderCount,
      plasiyerTotal, seriesOrders, statusGroups, dealerTotals, returnTotals,
      riskCandidates, pendingOrders, lowStock, debtors, pendingReturns
    ] = await Promise.all([
      prisma.order.aggregate({ where: { status: { in: REVENUE_STATUSES }, approvedAt: { gte: monthStart } }, _sum: { totalAmount: true } }),
      prisma.order.aggregate({ where: { status: { in: REVENUE_STATUSES }, approvedAt: { gte: prevMonthStart, lt: monthStart } }, _sum: { totalAmount: true } }),
      prisma.company.count({ where: { status: 'ACTIVE', kind: 'DEALER' } }),
      prisma.company.count({ where: { status: 'PENDING', kind: 'DEALER' } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.plasiyerPoint.aggregate({ _sum: { points: true } }),
      prisma.order.findMany({ where: { createdAt: { gte: seriesStart }, status: { not: 'CANCELLED' } }, select: { createdAt: true, totalAmount: true } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.groupBy({ by: ['companyId'], where: { status: { in: REVENUE_STATUSES } }, _sum: { totalAmount: true }, orderBy: { _sum: { totalAmount: 'desc' } }, take: 5 }),
      prisma.returnRequest.groupBy({ by: ['productId'], where: { status: { not: 'REJECTED' } }, _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 5 }),
      prisma.company.findMany({ where: { riskLimit: { gt: 0 }, currentBalance: { lt: 0 } }, select: { id: true, name: true, riskLimit: true, currentBalance: true } }),
      prisma.order.findMany({
        where: { status: 'PENDING' },
        include: { company: { select: { name: true } }, items: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.product.findMany({ where: { isActive: true, stock: { lte: 5 } }, select: { id: true, name: true, sku: true, stock: true }, orderBy: { stock: 'asc' }, take: 6 }),
      prisma.company.findMany({
        where: { currentBalance: { lt: 0 }, kind: { in: ['DEALER', 'CUSTOMER'] } },
        select: {
          id: true, name: true, currentBalance: true, currency: true, phone: true,
          orders: { where: { dueDate: { not: null } }, orderBy: { dueDate: 'asc' }, take: 1, select: { dueDate: true } }
        },
        orderBy: { currentBalance: 'asc' },
        take: 6
      }),
      prisma.returnRequest.count({ where: { status: 'PENDING' } })
    ]);

    // Son 30 gün günlük satış serisi
    const buckets = new Map();
    for (let i = 0; i < 30; i++) {
      const d = new Date(seriesStart.getTime() + i * DAY);
      buckets.set(d.toDateString(), { name: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), orders: 0, revenue: 0 });
    }
    for (const o of seriesOrders) {
      const b = buckets.get(new Date(o.createdAt).toDateString());
      if (b) { b.orders++; b.revenue = round2(b.revenue + o.totalAmount); }
    }

    const [dealerNames, productNames] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: dealerTotals.map(d => d.companyId) } }, select: { id: true, name: true } }),
      prisma.product.findMany({ where: { id: { in: returnTotals.map(r => r.productId) } }, select: { id: true, name: true } })
    ]);
    const dealerName = new Map(dealerNames.map(d => [d.id, d.name]));
    const productName = new Map(productNames.map(p => [p.id, p.name]));

    const thisMonth = monthSales._sum.totalAmount || 0;
    const lastMonth = prevMonthSales._sum.totalAmount || 0;

    res.json({
      stats: {
        monthSales: round2(thisMonth),
        salesChange: lastMonth > 0 ? round2(((thisMonth - lastMonth) / lastMonth) * 100) : null,
        activeDealers,
        pendingDealers,
        pendingOrders: pendingOrderCount,
        pendingReturns,
        plasiyerTotal: round2(plasiyerTotal._sum.points || 0)
      },
      salesSeries: [...buckets.values()],
      orderStatus: statusGroups.map(g => ({ status: g.status, count: g._count._all })),
      topDealers: dealerTotals.map(d => ({ name: dealerName.get(d.companyId) || `#${d.companyId}`, total: round2(d._sum.totalAmount || 0) })),
      mostReturned: returnTotals.map(r => ({ name: productName.get(r.productId) || `#${r.productId}`, quantity: r._sum.quantity || 0 })),
      riskCompanies: riskCandidates
        .map(c => ({ ...c, usage: round2((-c.currentBalance / c.riskLimit) * 100) }))
        .filter(c => c.usage >= 70)
        .sort((a, b) => b.usage - a.usage)
        .slice(0, 6),
      pendingOrders,
      lowStock,
      debtors: debtors.map(d => ({ id: d.id, name: d.name, phone: d.phone, balance: d.currentBalance, currency: d.currency, nextDue: d.orders[0]?.dueDate || null }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ message: 'Panel verileri getirilemedi.' });
  }
};

/**
 * Menü rozetleri: ilgilenilmesi gereken iş sayıları. Kullanıcı yalnızca yetkili olduğu bölümlerin sayısını alır.
 */
export const getMenuCounts = async (req, res) => {
  try {
    const u = req.user;
    const jobs = {
      orders: hasPermission(u, 'ORDERS') && (() => prisma.order.count({ where: { status: 'PENDING' } })),
      returns: hasPermission(u, 'ORDERS') && (() => prisma.returnRequest.count({ where: { status: 'PENDING' } })),
      quotes: (hasPermission(u, 'QUOTES') || hasPermission(u, 'QUOTE_APPROVAL')) && (() => prisma.quoteRequest.count({
        where: { status: { in: [...(hasPermission(u, 'QUOTES') ? ['PENDING'] : []), ...(hasPermission(u, 'QUOTE_APPROVAL') ? ['PENDING_APPROVAL'] : [])] } }
      })),
      dealers: hasPermission(u, 'DEALERS') && (() => prisma.company.count({ where: { status: 'PENDING', kind: 'DEALER' } })),
      leads: hasPermission(u, 'LEADS') && (() => prisma.customerLead.count({ where: { status: 'NEW' } })),
      whatsapp: hasPermission(u, 'MESSAGES') && (() => prisma.waConversation.count({ where: { needsHuman: true, status: { not: 'CLOSED' } } }))
    };
    const entries = await Promise.all(Object.entries(jobs).filter(([, fn]) => fn).map(async ([k, fn]) => [k, await fn()]));
    res.json(Object.fromEntries(entries));
  } catch (error) {
    console.error('getMenuCounts error:', error);
    res.status(500).json({ message: 'Sayılar getirilemedi.' });
  }
};
