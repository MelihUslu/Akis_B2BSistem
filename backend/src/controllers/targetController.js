import prisma, { currentTenantId } from '../utils/prisma.js';
import { round2 } from '../services/pricingService.js';
import { postEntry } from '../services/accountPosting.js';
import { notifyCompany, safeNotify } from '../services/notificationService.js';

/**
 * Bayi hedefi ve ciro primi. Gerçekleşen: dönem içinde onaylanan siparişlerin KDV hariç tutarı (kupon indirimi
 * düşülmüş, kargo hariç) eksi dönem içindeki onaylı iadeler. Dönem kapatılınca hedef tutmuşsa gerçekleşenin
 * bonusRate yüzdesi bayinin carisine alacak (ciro primi) olarak yazılır.
 */
const COUNTED = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'];
const RETURN_DONE = ['APPROVED', 'COMPLETED'];

export class TargetError extends Error {}

const dayStart = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T00:00:00`) : null);
const dayEnd = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T23:59:59.999`) : null);

export const achievedFor = async (db, { companyId, periodStart, periodEnd }) => {
  const [orders, returns] = await Promise.all([
    db.order.aggregate({ where: { companyId, status: { in: COUNTED }, approvedAt: { gte: periodStart, lte: periodEnd } }, _sum: { subtotal: true, discountAmount: true } }),
    db.returnRequest.findMany({
      where: { companyId, status: { in: RETURN_DONE }, createdAt: { gte: periodStart, lte: periodEnd } },
      select: { quantity: true, orderItem: { select: { price: true } } }
    })
  ]);
  const sales = (orders._sum.subtotal || 0) - (orders._sum.discountAmount || 0);
  const returned = returns.reduce((s, r) => s + r.quantity * (r.orderItem?.price || 0), 0);
  return round2(Math.max(0, sales - returned));
};

// Hedefin ekranda gösterilecek hali: gerçekleşen, yüzde, kalan ve kazanılacak prim
const present = async (t) => {
  const achieved = t.status === 'OPEN' ? await achievedFor(prisma, t) : (t.achievedAmount || 0);
  const percent = t.targetAmount > 0 ? Math.min(999, Math.round((achieved / t.targetAmount) * 1000) / 10) : 0;
  return {
    ...t,
    achieved,
    percent,
    remaining: round2(Math.max(0, t.targetAmount - achieved)),
    bonus: achieved >= t.targetAmount ? round2(achieved * t.bonusRate / 100) : 0,
    potentialBonus: round2(Math.max(achieved, t.targetAmount) * t.bonusRate / 100),
    ended: new Date() > t.periodEnd
  };
};

const parseBody = (body, current = {}) => {
  const periodStart = body.periodStart !== undefined ? dayStart(body.periodStart) : current.periodStart;
  const periodEnd = body.periodEnd !== undefined ? dayEnd(body.periodEnd) : current.periodEnd;
  const targetAmount = body.targetAmount !== undefined ? parseFloat(body.targetAmount) : current.targetAmount;
  const bonusRate = body.bonusRate !== undefined ? parseFloat(body.bonusRate) : current.bonusRate;
  if (!periodStart || !periodEnd) throw new TargetError('Dönem başlangıç ve bitiş tarihini girin.');
  if (periodStart > periodEnd) throw new TargetError('Dönem bitişi başlangıçtan önce olamaz.');
  if (!(targetAmount > 0)) throw new TargetError('Hedef tutarı sıfırdan büyük olmalı.');
  if (!(bonusRate > 0) || bonusRate > 50) throw new TargetError('Prim oranı %0 ile %50 arasında olmalı.');
  const name = body.name !== undefined ? String(body.name || '').trim().slice(0, 80) || null : current.name;
  return { name, periodStart, periodEnd, targetAmount: round2(targetAmount), bonusRate: round2(bonusRate) };
};

const fail = (res, error, fallback) => {
  if (error instanceof TargetError) return res.status(400).json({ message: error.message });
  console.error(fallback, error);
  return res.status(400).json({ message: fallback });
};

export const listTargets = async (req, res) => {
  try {
    const where = { ...(req.query.companyId && { companyId: parseInt(req.query.companyId) }), ...(req.query.status && { status: req.query.status }) };
    const rows = await prisma.dealerTarget.findMany({ where, include: { company: { select: { id: true, name: true, currency: true } } }, orderBy: [{ status: 'asc' }, { periodEnd: 'asc' }] });
    res.json(await Promise.all(rows.map(present)));
  } catch (error) {
    fail(res, error, 'Hedefler getirilemedi.');
  }
};

export const createTarget = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: parseInt(req.body.companyId) } });
    if (!company || company.kind !== 'DEALER') throw new TargetError('Bayi bulunamadı.');
    const target = await prisma.dealerTarget.create({ data: { companyId: company.id, ...parseBody(req.body) } });
    safeNotify(notifyCompany(company.id, {
      type: 'SYSTEM',
      title: 'Yeni satış hedefiniz',
      message: `${target.name || 'Dönem hedefi'}: ₺${target.targetAmount.toLocaleString('tr-TR')} (KDV hariç). Hedefe ulaşırsanız satışınızın %${target.bonusRate}'i ciro primi olarak carinize yazılır.`,
      link: '/bayi/finance'
    }));
    res.status(201).json(await present(target));
  } catch (error) {
    fail(res, error, 'Hedef oluşturulamadı.');
  }
};

export const updateTarget = async (req, res) => {
  try {
    const current = await prisma.dealerTarget.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!current) return res.status(404).json({ message: 'Hedef bulunamadı.' });
    if (current.status !== 'OPEN') throw new TargetError('Kapatılmış hedef değiştirilemez.');
    const target = await prisma.dealerTarget.update({ where: { id: current.id }, data: parseBody(req.body, current) });
    res.json(await present(target));
  } catch (error) {
    fail(res, error, 'Hedef güncellenemedi.');
  }
};

export const deleteTarget = async (req, res) => {
  try {
    const removed = await prisma.dealerTarget.deleteMany({ where: { id: parseInt(req.params.id), status: 'OPEN' } });
    if (removed.count === 0) throw new TargetError('Yalnızca açık hedefler silinebilir.');
    res.json({ message: 'Hedef silindi.' });
  } catch (error) {
    fail(res, error, 'Hedef silinemedi.');
  }
};

/**
 * Dönemi kapatır. pay (varsayılan true): hedef tuttuysa prim cariye alacak yazılır. Aynı hedef iki kez kapatılamaz
 * (satır kilitlenir, durum hâlâ OPEN olmalı); prim bir kez yazılır.
 */
export const closeTarget = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pay = req.body.pay !== false;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DealerTarget" WHERE id = ${id} AND "tenantId" = ${currentTenantId()} FOR UPDATE`;
      const t = await tx.dealerTarget.findUnique({ where: { id }, include: { company: true } });
      if (!t) throw new TargetError('Hedef bulunamadı.');
      if (t.status !== 'OPEN') throw new TargetError('Bu hedef zaten kapatılmış.');
      const achieved = await achievedFor(tx, t);
      const reached = achieved >= t.targetAmount;
      const bonus = reached && pay ? round2(achieved * t.bonusRate / 100) : 0;
      if (bonus > 0) {
        await postEntry(tx, {
          company: t.company, type: 'CREDIT', amountTRY: bonus, source: 'BONUS',
          description: `Ciro primi: ${t.name || 'dönem hedefi'} (%${t.bonusRate}, gerçekleşen ₺${achieved.toLocaleString('tr-TR')})`
        });
      }
      const updated = await tx.dealerTarget.update({
        where: { id },
        data: { status: bonus > 0 ? 'PAID' : 'CLOSED', achievedAmount: achieved, paidAmount: bonus || null, paidAt: bonus > 0 ? new Date() : null }
      });
      return { updated, reached, bonus, companyId: t.companyId };
    });
    if (result.bonus > 0) {
      safeNotify(notifyCompany(result.companyId, {
        type: 'PAYMENT',
        title: 'Ciro priminiz carinize yazıldı',
        message: `${result.updated.name || 'Dönem hedefi'} tuttu: ₺${result.bonus.toLocaleString('tr-TR')} ciro primi cari hesabınıza alacak olarak işlendi.`,
        link: '/bayi/finance'
      }));
    }
    res.json({
      message: result.bonus > 0 ? `Hedef tuttu; ₺${result.bonus.toLocaleString('tr-TR')} prim cariye yazıldı.` : result.reached ? 'Hedef kapatıldı (prim yazılmadı).' : 'Hedef tutmadı; dönem kapatıldı.',
      target: await present(result.updated)
    });
  } catch (error) {
    fail(res, error, 'Hedef kapatılamadı.');
  }
};

// Bayi: açık hedefleri ve son kapanan hedefi
export const myTargets = async (req, res) => {
  try {
    const rows = await prisma.dealerTarget.findMany({
      where: { companyId: req.user.companyId, OR: [{ status: 'OPEN' }, { updatedAt: { gte: new Date(Date.now() - 90 * 864e5) } }] },
      orderBy: [{ status: 'asc' }, { periodEnd: 'desc' }],
      take: 6
    });
    res.json(await Promise.all(rows.map(present)));
  } catch (error) {
    fail(res, error, 'Hedefler getirilemedi.');
  }
};
