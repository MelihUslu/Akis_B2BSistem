import prisma, { currentTenantId } from '../utils/prisma.js';
import { localDay, localMonth } from '../utils/dates.js';
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
export const ADVANCE_METHOD = 'ADVANCE'; // Ödemede "avanstan mahsup"
export const PAYMENT_KINDS = { PAYOUT: 'Ödeme', OFFSET: 'Avanstan mahsup', REFUND: 'Avans iadesi', PAYROLL: 'Maaştan kesinti' };
export const BASES = { SALES: 'Satış', COLLECTION: 'Tahsilat' };
// Gelir-giderde personel ödemelerinin kategorileri
export const CASH_CATEGORY = { EXPENSE: 'Personel masrafı', ADVANCE: 'Personel avansı', BONUS: 'Personel primi', REFUND: 'Personel avans iadesi' };

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
// Talebe karar verebilir: Personel yetkilisi ya da personelin yöneticisi (departman yöneticisi)
export const canDecide = (user, employee) => canManage(user) || Boolean(employee.manager?.userId && employee.manager.userId === user.id);

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

// ─── İzin günleri ve resmî tatiller ─────────────────────────────────────────

// Her yıl aynı gün olan resmî tatiller (2429 sayılı Kanun). Dini bayramlar her yıl değiştiği için firma listesine eklenir.
const FIXED_HOLIDAYS = [
  ['01-01', 'Yılbaşı'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'],
  ['05-19', 'Atatürk\'ü Anma, Gençlik ve Spor Bayramı'], ['07-15', 'Demokrasi ve Millî Birlik Günü'], ['08-30', 'Zafer Bayramı'],
  ['10-28', 'Cumhuriyet Bayramı arifesi', true], ['10-29', 'Cumhuriyet Bayramı']
];
export const fixedHolidays = (year) => FIXED_HOLIDAYS.map(([md, name, half]) => ({ date: `${year}-${md}`, name, half: Boolean(half), fixed: true }));

export const HR_RULE_KEYS = { saturday: 'hr_saturday_workday', negative: 'hr_negative_leave', holidays: 'hr_holidays' };

// Firmanın izin kuralları: Cumartesi iş günü mü, bakiyeyi aşan yıllık izne izin var mı, firma tatil listesi
export const leaveRules = async () => {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.values(HR_RULE_KEYS) } } });
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  let holidays = [];
  try { holidays = JSON.parse(v[HR_RULE_KEYS.holidays] || '[]'); } catch { holidays = []; }
  return {
    saturday: v[HR_RULE_KEYS.saturday] === 'true',
    allowNegative: v[HR_RULE_KEYS.negative] === 'true',
    holidays: Array.isArray(holidays) ? holidays.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h?.date)) : []
  };
};

// Tarih → { name, half } (sabit tatiller + firma listesi; aynı gün ikisi de varsa tam gün olan geçerli)
const holidayMap = (rules, fromYear, toYear) => {
  const map = new Map();
  for (let y = fromYear; y <= toYear; y++) for (const h of fixedHolidays(y)) map.set(h.date, h);
  for (const h of rules.holidays) {
    const prev = map.get(h.date);
    if (!prev || prev.half) map.set(h.date, { date: h.date, name: h.name || 'Tatil', half: Boolean(h.half) && (!prev || prev.half) });
  }
  return map;
};

/**
 * İzinde sayılan gün: Pazar sayılmaz; Cumartesi yalnızca firma "iş günü" dediyse; resmî tatil sayılmaz, yarım günlük
 * tatil (arife) yarım gün sayılır. half: tek günlük izinde sabah / öğleden sonra (0,5 gün).
 * Döner: { days, holidays: [aralıktaki tatiller] }.
 */
export const countLeaveDays = (start, end, rules, half = null) => {
  const map = holidayMap(rules, start.getFullYear(), end.getFullYear());
  let days = 0;
  const hit = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    if (wd === 0 || (wd === 6 && !rules.saturday)) continue;
    const h = map.get(localDay(d));
    if (h) hit.push(h);
    days += h ? (h.half ? 0.5 : 0) : 1;
  }
  if (half) days = Math.min(days, 0.5);
  return { days, holidays: hit };
};

// ─── Yıllık izin hakkı ───────────────────────────────────────────────────────

// 4857 sayılı İş Kanunu md. 53: hizmet yılı 1–5 (5 dahil) 14 gün, 5'ten fazla 15'ten az 20 gün, 15 ve üstü 26 gün
export const legalLeaveDays = (serviceYear) => (serviceYear <= 5 ? 14 : serviceYear < 15 ? 20 : 26);
const entitlementFor = (employee, serviceYear) => Math.max(legalLeaveDays(serviceYear), employee.annualLeaveDays || 0);
const addYears = (d, n) => { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x; };

/**
 * Yıllık izin bakiyesi. Hak, her işe giriş yıl dönümünde (ilk yıl dolunca) yıl başına gün olarak eklenir; kullanılmayan
 * izin devreder. Devir girildiyse (leaveCarryDate itibarıyla leaveCarryDays gün) o tarihten önceki hak ve kullanımlar
 * sayılmaz. leaves: personelin onaylı / bekleyen yıllık izinleri. İşe giriş tarihi yoksa null.
 */
export const leaveBalance = (employee, leaves, now = new Date()) => {
  if (!employee.hireDate) return null;
  const from = employee.leaveCarryDate || null;
  let earned = 0;
  let year = 1;
  let next = null;
  for (; year < 80; year++) {
    const at = addYears(employee.hireDate, year);
    if (at > now) { next = { date: at, days: entitlementFor(employee, year), serviceYear: year }; break; }
    if (!from || at > from) earned += entitlementFor(employee, year);
  }
  const counted = leaves.filter((l) => l.type === 'ANNUAL' && (!from || l.startDate >= from));
  const sum = (status) => counted.filter((l) => l.status === status).reduce((s, l) => s + l.days, 0);
  const used = sum('APPROVED');
  const pending = sum('PENDING');
  const carry = from ? (employee.leaveCarryDays || 0) : 0;
  const remaining = Math.round((carry + earned - used) * 10) / 10;
  return {
    serviceYears: year - 1,
    perYear: entitlementFor(employee, Math.max(1, year)),
    carry: from ? { date: from, days: carry } : null,
    earned, used, pending, remaining,
    available: Math.round((remaining - pending) * 10) / 10,
    next
  };
};

// Birden çok personelin bakiyesi (liste ekranı): yıllık izinler tek sorguda
export const leaveBalances = async (employees) => {
  const ids = employees.filter((e) => e.hireDate).map((e) => e.id);
  const leaves = ids.length ? await prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, type: 'ANNUAL', status: { in: ['APPROVED', 'PENDING'] } }, select: { employeeId: true, type: true, status: true, startDate: true, days: true } }) : [];
  return new Map(employees.map((e) => [e.id, leaveBalance(e, leaves.filter((l) => l.employeeId === e.id))]));
};
export const employeeBalance = async (employee) => (await leaveBalances([employee])).get(employee.id);

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

// ─── Ödemeler (kısmi) ve avans kapanışı ─────────────────────────────────────

const lock = (tx, table, id) => tx.$queryRawUnsafe(`SELECT id FROM "${table}" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`, id, currentTenantId());
const tl = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Personelin açık avansları (ödenmiş, henüz kapanmamış), eskisi önce
export const openAdvances = (db, employeeId) => db.staffClaim.findMany({ where: { employeeId, type: 'ADVANCE', paidAmount: { gt: 0 } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] })
  .then((rows) => rows.map((a) => ({ ...a, open: round2(a.paidAmount - a.settledAmount) })).filter((a) => a.open > 0.004));

export const openAdvanceTotal = async (db, employeeId) => round2((await openAdvances(db, employeeId)).reduce((s, a) => s + a.open, 0));

/**
 * Talebe (masraf / avans) ya da prime ödeme; kısmi olabilir. Konu satırı kilitlenir: aynı anda gelen ödemeler sırayla
 * işler, kalan tutardan fazlası ödenemez. method:
 *  CASH / BANK / CARD → PAYOUT: gelir-gidere gider (kaynak STAFF_PAY:<ödeme>, tekil)
 *  ADVANCE            → OFFSET: personelin açık avanslarından (eskisi önce) düşülür; nakit çıkmaz
 * subject: { claimId } ya da { targetId }. Döner: { paid, due, complete, payments }.
 */
export const payTowards = (subject, { amount, date, method, note, user, cashFile, describe }) => prisma.$transaction(async (tx) => {
  const isClaim = Boolean(subject.claimId);
  await lock(tx, isClaim ? 'StaffClaim' : 'StaffTarget', subject.claimId || subject.targetId);
  const row = isClaim
    ? await tx.staffClaim.findFirst({ where: { id: subject.claimId }, include: { employee: true } })
    : await tx.staffTarget.findFirst({ where: { id: subject.targetId }, include: { employee: true } });
  if (!row) throw new HrError(isClaim ? 'Talep bulunamadı.' : 'Hedef bulunamadı.', 404);
  if (isClaim && row.status !== 'APPROVED') throw new HrError('Yalnızca onaylanmış talep ödenebilir.');
  if (!isClaim && row.status !== 'CLOSED') throw new HrError('Prim, dönem kapatıldıktan sonra ödenir.');
  const due = round2(isClaim ? row.amount : row.bonusAmount || 0);
  if (!(due > 0)) throw new HrError('Bu dönem için ödenecek prim yok.');
  const remaining = round2(due - row.paidAmount);
  if (remaining <= 0) throw new HrError(isClaim ? 'Bu talep zaten ödendi.' : 'Bu prim zaten ödendi.', 409);
  const value = amount === undefined || amount === null || amount === '' ? remaining : round2(Number(amount));
  if (!(value > 0)) throw new HrError('Geçerli bir tutar girin.');
  if (value > remaining + 0.004) throw new HrError(`Kalan tutar ${tl(remaining)}; bundan fazlası ödenemez.`, 409);

  const base = { employeeId: row.employeeId, amount: value, date, note: note || null, createdById: user.id, createdByName: user.name, ...(isClaim ? { claimId: row.id } : { targetId: row.id }) };
  const payments = [];
  if (method === ADVANCE_METHOD) {
    if (isClaim && row.type === 'ADVANCE') throw new HrError('Avans, avanstan mahsup edilemez.');
    const advances = await openAdvances(tx, row.employeeId);
    for (const a of advances) await lock(tx, 'StaffClaim', a.id);
    const fresh = await openAdvances(tx, row.employeeId); // kilitten sonra güncel hâli
    const open = round2(fresh.reduce((s, a) => s + a.open, 0));
    if (open + 0.004 < value) throw new HrError(`Açık avans ${tl(open)}; mahsup için yeterli değil.`);
    let left = value;
    for (const a of fresh) {
      if (left <= 0.004) break;
      const part = round2(Math.min(left, a.open));
      payments.push(await tx.staffPayment.create({ data: { ...base, kind: 'OFFSET', amount: part, advanceId: a.id } }));
      await tx.staffClaim.update({ where: { id: a.id }, data: { settledAmount: { increment: part } } });
      left = round2(left - part);
    }
  } else {
    if (!PAY_METHODS.includes(method)) throw new HrError('Ödeme şeklini seçin (nakit, banka, kart ya da avanstan mahsup).');
    const payment = await tx.staffPayment.create({ data: { ...base, kind: 'PAYOUT', method } });
    const entry = await tx.cashEntry.create({
      data: {
        type: 'OUT', category: isClaim ? CASH_CATEGORY[row.type] : CASH_CATEGORY.BONUS, amount: value, date, method, vatRate: 0,
        description: describe(row, value, due).slice(0, 500), sourceRef: `STAFF_PAY:${payment.id}`, createdByName: user.name, ...(cashFile || {})
      }
    });
    payments.push(await tx.staffPayment.update({ where: { id: payment.id }, data: { cashEntryId: entry.id } }));
  }
  const paid = round2(row.paidAmount + value);
  const complete = paid >= due - 0.004;
  const data = { paidAmount: paid, ...(complete && { paidAt: new Date() }) };
  if (isClaim) await tx.staffClaim.update({ where: { id: row.id }, data });
  else await tx.staffTarget.update({ where: { id: row.id }, data });
  return { row, paid, due, complete, payments };
});

/**
 * Avansın kapanması: REFUND (personel kullanmadığı tutarı iade eder → gelir-gidere gelir) ya da PAYROLL (maaştan kesildi;
 * bordro sistem dışında olduğu için nakit kaydı açılmaz). Açık tutardan fazlası kapanamaz.
 */
export const settleAdvance = (advanceId, { kind, amount, date, method, note, user }) => prisma.$transaction(async (tx) => {
  await lock(tx, 'StaffClaim', advanceId);
  const a = await tx.staffClaim.findFirst({ where: { id: advanceId }, include: { employee: true } });
  if (!a || a.type !== 'ADVANCE') throw new HrError('Avans bulunamadı.', 404);
  const open = round2(a.paidAmount - a.settledAmount);
  if (open <= 0) throw new HrError(a.paidAmount > 0 ? 'Bu avans kapanmış.' : 'Avans henüz ödenmedi; ödenmeyen avans kapatılamaz.', 409);
  const value = amount === undefined || amount === null || amount === '' ? open : round2(Number(amount));
  if (!(value > 0)) throw new HrError('Geçerli bir tutar girin.');
  if (value > open + 0.004) throw new HrError(`Açık avans ${tl(open)}; bundan fazlası kapatılamaz.`, 409);
  if (!['REFUND', 'PAYROLL'].includes(kind)) throw new HrError('Kapanış şeklini seçin (iade ya da maaştan kesinti).');
  if (kind === 'REFUND' && !PAY_METHODS.includes(method)) throw new HrError('İadenin nasıl alındığını seçin (nakit, banka, kart).');
  let payment = await tx.staffPayment.create({
    data: { employeeId: a.employeeId, kind, amount: value, date, method: kind === 'REFUND' ? method : null, advanceId: a.id, note: note || null, createdById: user.id, createdByName: user.name }
  });
  if (kind === 'REFUND') {
    const entry = await tx.cashEntry.create({
      data: { type: 'IN', category: CASH_CATEGORY.REFUND, amount: value, date, method, vatRate: 0, description: `${a.employee.name}: avans iadesi (${a.description})`.slice(0, 500), sourceRef: `STAFF_PAY:${payment.id}`, createdByName: user.name }
    });
    payment = await tx.staffPayment.update({ where: { id: payment.id }, data: { cashEntryId: entry.id } });
  }
  await tx.staffClaim.update({ where: { id: a.id }, data: { settledAmount: { increment: value } } });
  return { advance: a, payment, open: round2(open - value) };
});

/**
 * Ödemeyi geri alır (yanlış giriş): gelir-gider kaydı silinir, talebin / primin ödenen tutarı ya da avansın kapanan
 * tutarı geri düşülür. Mahsubu ya da iadesi olan avansın ödemesi, önce onlar geri alınmadan geri alınamaz.
 */
export const undoPayment = (paymentId) => prisma.$transaction(async (tx) => {
  const p = await tx.staffPayment.findFirst({ where: { id: paymentId } });
  if (!p) throw new HrError('Ödeme kaydı bulunamadı.', 404);
  if (p.claimId) await lock(tx, 'StaffClaim', p.claimId);
  if (p.targetId) await lock(tx, 'StaffTarget', p.targetId);
  if (p.advanceId) await lock(tx, 'StaffClaim', p.advanceId);
  if (!(await tx.staffPayment.findFirst({ where: { id: paymentId } }))) throw new HrError('Bu ödeme zaten geri alındı.', 409);
  if (p.claimId && p.kind === 'PAYOUT') {
    const c = await tx.staffClaim.findFirst({ where: { id: p.claimId } });
    if (c.type === 'ADVANCE' && round2(c.paidAmount - p.amount) < round2(c.settledAmount) - 0.004) {
      throw new HrError('Bu avansın mahsup / iade kayıtları var; önce onları geri alın.', 409);
    }
  }
  if (p.cashEntryId) {
    const entry = await tx.cashEntry.findFirst({ where: { id: p.cashEntryId } });
    await tx.staffPayment.update({ where: { id: p.id }, data: { cashEntryId: null } });
    if (entry) await tx.cashEntry.delete({ where: { id: entry.id } });
    p.cashFile = entry?.storedName || null;
  }
  await tx.staffPayment.delete({ where: { id: p.id } });
  if (p.advanceId) await tx.staffClaim.update({ where: { id: p.advanceId }, data: { settledAmount: { decrement: p.amount } } });
  if (p.claimId) await tx.staffClaim.update({ where: { id: p.claimId }, data: { paidAmount: { decrement: p.amount }, paidAt: null } });
  if (p.targetId) await tx.staffTarget.update({ where: { id: p.targetId }, data: { paidAmount: { decrement: p.amount }, paidAt: null } });
  return p;
});
