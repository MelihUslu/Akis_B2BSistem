import prisma from '../utils/prisma.js';
import { availableCredit, round2 } from '../services/pricingService.js';

/**
 * Plasiyer (saha satış) paneli: sorumlu olduğu bayiler ve prim puanları.
 * Bayi adına sipariş, bayinin portalı "X-Act-As-Company" başlığıyla kullanılarak verilir (authMiddleware).
 */
const ACTIVE_ORDER = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'];

export const myDealers = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: { plasiyerId: req.user.id, kind: 'DEALER', status: 'ACTIVE' },
      select: { id: true, name: true, phone: true, authorizedPerson: true, currency: true, riskLimit: true, currentBalance: true, dealerGroup: true, paymentTermDays: true },
      orderBy: { name: 'asc' }
    });
    const ids = companies.map((c) => c.id);
    const now = new Date();
    const [last, pending, overdue] = await Promise.all([
      prisma.order.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, status: { not: 'CANCELLED' } }, _max: { createdAt: true } }),
      prisma.order.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
      prisma.order.groupBy({ by: ['companyId'], where: { companyId: { in: ids }, status: { in: ACTIVE_ORDER }, dueDate: { lt: now }, paymentMethod: 'CURRENT_ACCOUNT' }, _sum: { totalAmount: true } })
    ]);
    const lastBy = new Map(last.map((r) => [r.companyId, r._max.createdAt]));
    const pendingBy = new Map(pending.map((r) => [r.companyId, r._count._all]));
    const overdueBy = new Map(overdue.map((r) => [r.companyId, r._sum.totalAmount || 0]));
    const data = await Promise.all(companies.map(async (c) => {
      const credit = await availableCredit(prisma, c);
      return {
        ...c,
        available: credit.available,
        lastOrderAt: lastBy.get(c.id) || null,
        pendingOrders: pendingBy.get(c.id) || 0,
        // Vadesi geçmiş siparişler (borç olarak; bakiye ödemeyle kapanmışsa 0 gösterilir)
        overdue: c.currentBalance < 0 ? round2(Math.min(overdueBy.get(c.id) || 0, -c.currentBalance)) : 0
      };
    }));
    res.json(data);
  } catch (error) {
    console.error('myDealers error:', error);
    res.status(500).json({ message: 'Bayiler getirilemedi.' });
  }
};

export const mySummary = async (req, res) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const [month, total, recent, monthSales] = await Promise.all([
      prisma.plasiyerPoint.aggregate({ where: { userId: req.user.id, createdAt: { gte: monthStart } }, _sum: { points: true } }),
      prisma.plasiyerPoint.aggregate({ where: { userId: req.user.id }, _sum: { points: true } }),
      prisma.plasiyerPoint.findMany({
        where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 20,
        include: { order: { select: { id: true, totalAmount: true, createdAt: true, company: { select: { name: true } } } } }
      }),
      prisma.order.aggregate({ where: { company: { plasiyerId: req.user.id }, status: { in: ACTIVE_ORDER }, approvedAt: { gte: monthStart } }, _sum: { subtotal: true }, _count: { _all: true } })
    ]);
    res.json({
      monthPoints: round2(month._sum.points || 0),
      totalPoints: round2(total._sum.points || 0),
      monthSales: round2(monthSales._sum.subtotal || 0),
      monthOrders: monthSales._count._all,
      recent
    });
  } catch (error) {
    console.error('mySummary error:', error);
    res.status(500).json({ message: 'Prim bilgisi getirilemedi.' });
  }
};
