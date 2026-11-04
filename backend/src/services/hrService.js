import prisma from '../utils/prisma.js';
import { localMonth } from '../utils/dates.js';
import { round2 } from './pricingService.js';
import { hasPermission } from './permissions.js';

/**
 * Personel yönetimi: ortak kurallar. Firma bazında açılır (Ayarlar → hr_enabled).
 * Onaylar "Personel" (HR) yetkisiyle, ödemeler "Finans" yetkisiyle yapılır; firma sahibi her ikisine de sahiptir.
 */
export const HR_SETTING = 'hr_enabled';

export const LEAVE_TYPES = { ANNUAL: 'Yıllık izin', EXCUSE: 'Mazeret izni', SICK: 'Hastalık / rapor', UNPAID: 'Ücretsiz izin', OTHER: 'Diğer' };
export const CLAIM_TYPES = { EXPENSE: 'Masraf', ADVANCE: 'Avans' };
export const PAY_METHODS = ['CASH', 'BANK', 'CARD'];
export const BASES = { SALES: 'Satış', COLLECTION: 'Tahsilat' };
// Gelir-giderde personel ödemelerinin kategorileri
export const CASH_CATEGORY = { EXPENSE: 'Personel masrafı', ADVANCE: 'Personel avansı', BONUS: 'Personel primi' };

export class HrError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const hrEnabled = async () => String((await prisma.setting.findFirst({ where: { key: HR_SETTING } }))?.value) === 'true';

export const canManage = (user) => hasPermission(user, 'HR');
export const canPay = (user) => hasPermission(user, 'FINANCE');

// Kişi kendi talebini onaylayamaz (firma sahibi hariç: üstünde onay verecek kimse yoktur)
export const assertNotSelf = (user, employee) => {
  if (employee.userId && employee.userId === user.id && !user.isOwner) {
    throw new HrError('Kendi talebinizi onaylayamaz ya da reddedemezsiniz; başka bir yetkili karar vermeli.', 403);
  }
};

// ─── Tarihler ────────────────────────────────────────────────────────────────

export const parseDay = (v, label = 'Tarih') => {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HrError(`${label} geçerli değil.`);
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new HrError(`${label} geçerli değil.`);
  return d;
};

// İki gün arasındaki iş günü (hafta sonu hariç, iki uç dahil). Resmî tatiller ayrıca düşülmez.
export const workdays = (start, end) => {
  let n = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
};

export const parsePeriod = (v) => {
  const s = String(v || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new HrError('Ay seçin (YYYY-AA).');
  return s;
};

// 'YYYY-MM' → ayın başı ve sonraki ayın başı (firmanın saat diliminde)
export const monthRange = (period) => {
  const [y, m] = period.split('-').map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
};
export const monthEnded = (period, now = new Date()) => monthRange(period).to <= now;
export const currentPeriod = () => localMonth();

// ─── Hedef ve prim ───────────────────────────────────────────────────────────

const COUNTED = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'];
const RETURN_DONE = ['APPROVED', 'COMPLETED'];

/**
 * Personelin satışları: sorumlu olduğu bayilerin siparişleri (Bayi Yönetimi → plasiyer) ve bayi adına kendi girdiği
 * siparişler. Bir sipariş iki koşulu birden sağlasa da bir kez sayılır.
 */
const staffOrders = (userId) => ({ OR: [{ company: { plasiyerId: userId } }, { userId, channel: { in: ['STAFF', 'PLASIYER'] } }] });

/**
 * Gerçekleşen tutar.
 *  SALES: ayda onaylanan siparişlerin KDV hariç tutarı (kupon indirimi düşülmüş, kargo hariç; iptal edilenler sayılmaz;
 *         kısmi onayda yalnızca onaylanan kalemler) eksi ayda onaylanan iadeler (bayi hedefiyle aynı kural).
 *  COLLECTION: sorumlu olduğu bayilerden ayda alınan tahsilatlar (TL karşılığı; ters kaydı yapılan / iptal edilen sayılmaz).
 */
export const achievedForStaff = async (db, { userId, period, basis }) => {
  if (!userId) return 0;
  const { from, to } = monthRange(period);
  if (basis === 'COLLECTION') {
    const payments = await db.payment.findMany({
      where: { direction: 'IN', status: 'COMPLETED', paymentDate: { gte: from, lt: to }, company: { plasiyerId: userId } },
      select: { amount: true, currency: true, rate: true }
    });
    return round2(payments.reduce((s, p) => s + (p.currency === 'TRY' ? p.amount : p.amount * (p.rate || 1)), 0));
  }
  const scope = staffOrders(userId);
  const [orders, returns] = await Promise.all([
    db.order.aggregate({ where: { ...scope, status: { in: COUNTED }, approvedAt: { gte: from, lt: to } }, _sum: { subtotal: true, discountAmount: true } }),
    db.returnRequest.findMany({
      where: { status: { in: RETURN_DONE }, createdAt: { gte: from, lt: to }, orderItem: { order: scope } },
      select: { quantity: true, orderItem: { select: { price: true } } }
    })
  ]);
  const sales = (orders._sum.subtotal || 0) - (orders._sum.discountAmount || 0);
  const returned = returns.reduce((s, r) => s + r.quantity * (r.orderItem?.price || 0), 0);
  return round2(Math.max(0, sales - returned));
};

export const bonusFor = (achieved, t) => (achieved >= t.targetAmount ? round2(achieved * t.bonusRate / 100) : 0);

// Ekranda gösterilen hâli: açık hedefte gerçekleşen canlı hesaplanır, kapalıda kapanıştaki değer
export const presentTarget = async (t) => {
  const open = t.status === 'OPEN';
  const achieved = open ? await achievedForStaff(prisma, { userId: t.employee?.userId, period: t.period, basis: t.basis }) : (t.achievedAmount || 0);
  return {
    ...t,
    achieved,
    percent: t.targetAmount > 0 ? Math.min(999, Math.round((achieved / t.targetAmount) * 1000) / 10) : 0,
    calculatedBonus: open ? bonusFor(achieved, t) : (t.bonusAmount || 0),
    paidBonus: t.paidAmount || 0,
    ended: monthEnded(t.period)
  };
};
