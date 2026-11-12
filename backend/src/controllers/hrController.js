import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma, { currentTenantId } from '../utils/prisma.js';
import { round2 } from '../services/pricingService.js';
import { localDay } from '../utils/dates.js';
import { HR_DOC_DIR, CASH_DOC_DIR, CASH_DOC_TYPES } from '../middlewares/upload.js';
import { notifyAdmins, notifyUser, safeNotify } from '../services/notificationService.js';
import { sendCredentialsMail } from '../services/mailService.js';
import { checkBudgets } from './cashController.js';
import {
  HrError, hrEnabled, canManage, canPay, canDecide, assertNotSelf, parseDay, parsePeriod, monthEnded, currentPeriod,
  achievedForStaff, bonusFor, presentTarget, LEAVE_TYPES, CLAIM_TYPES, PAY_METHODS, BASES, CASH_CATEGORY, ADVANCE_METHOD,
  countLeaveDays, leaveRules, leaveBalances, employeeBalance, fixedHolidays, HR_RULE_KEYS,
  payTowards, settleAdvance, undoPayment, openAdvanceTotal
} from '../services/hrService.js';

/**
 * Personel yönetimi: personel kartları, izin, masraf / avans, satış hedefi ve prim, şirket duyuruları.
 * Erişim (routes/hrRoutes.js): modül firmada açık olmalı; bayi hesapları giremez. Personel /me uçlarında yalnızca
 * kendi kaydını görür; yönetim uçları "Personel" (HR), ödeme uçları "Finans" yetkisi ister. Personelin yöneticisi
 * (departman yöneticisi) Personel yetkisi olmadan kendi ekibinin taleplerine karar verir.
 * Onay, ret ve ödeme kimin yaptığı ve ne zaman yaptığıyla kayda yazılır (ayrıca işlem kaydına düşer).
 */

const MANAGE_LINK = '/admin/personel';
const selfLink = (role) => (role === 'PLASIYER' ? '/plasiyer/personel' : role === 'PERSONEL' ? '/personel' : '/admin/personel-alanim');
const teamLink = (role) => `${selfLink(role)}?tab=team`;
const tl = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayTr = (d) => new Date(d).toLocaleDateString('tr-TR', { timeZone: process.env.TZ || 'Europe/Istanbul' });
const daysTr = (n) => `${String(n).replace('.', ',')} gün`;
const id = (v) => parseInt(v) || 0;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
// "1.500,50" / "1500,50" / "1500.50" → 1500.5
const amountOf = (v) => {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  return round2(Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t));
};
const optionalAmount = (v) => (v === undefined || v === null || v === '' ? undefined : amountOf(v));

const fail = (res, error, fallback) => {
  if (error instanceof HrError) return res.status(error.status).json({ message: error.message, ...(error.code && { code: error.code }) });
  if (error?.code === 'P2002') return res.status(409).json({ message: 'Bu kayıt zaten var (aynı işlem ikinci kez yapılamaz).' });
  console.error(fallback, error);
  return res.status(500).json({ message: fallback });
};
const handle = (fallback, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    fail(res, error, fallback);
  }
};

const removeFile = (dir, name) => (name ? fs.unlink(path.join(dir, name)).catch(() => {}) : null);

// ─── Erişim ──────────────────────────────────────────────────────────────────

// Modül kapalıyken /status dışındaki bütün uçlar reddedilir (menü gizlemenin yanında sunucu tarafı kontrol)
export const requireHrModule = async (req, res, next) => {
  if (await hrEnabled()) return next();
  res.status(403).json({ message: 'Personel modülü bu firmada kapalı. Ayarlar → Modüller bölümünden açılabilir.', code: 'MODULE_DISABLED' });
};

export const requireAny = (...checks) => Object.assign((req, res, next) => {
  if (checks.some((c) => c(req.user))) return next();
  res.status(403).json({ message: 'Bu işlem için yetkiniz yok.' });
}, { allows: (u) => checks.some((c) => c(u)) });

const myEmployee = (req) => prisma.employee.findFirst({ where: { userId: req.user.id } });
const requireMe = async (req) => {
  const me = await myEmployee(req);
  if (!me) throw new HrError('Personel kartınız yok. Personel yetkilisinden kartınızı açmasını isteyin.', 404, 'NO_EMPLOYEE');
  return me;
};
const requireActiveMe = async (req) => {
  const me = await requireMe(req);
  if (!me.isActive) throw new HrError('Personel kaydınız pasif; yeni talep açamazsınız.', 403);
  return me;
};

export const status = handle('Durum alınamadı.', async (req, res) => {
  const enabled = await hrEnabled();
  const me = enabled ? await myEmployee(req) : null;
  const reports = me ? await prisma.employee.count({ where: { managerId: me.id, isActive: true } }) : 0;
  res.json({ enabled, canManage: canManage(req.user), canPay: canPay(req.user), employee: me, isManager: reports > 0, reports });
});

// ─── İzin kuralları (Personel yetkisi) ───────────────────────────────────────

export const getHrSettings = handle('Ayarlar alınamadı.', async (req, res) => {
  const rules = await leaveRules();
  const y = new Date().getFullYear();
  res.json({
    saturdayWorkday: rules.saturday,
    allowNegativeLeave: rules.allowNegative,
    holidays: [...rules.holidays].sort((a, b) => a.date.localeCompare(b.date)),
    fixedHolidays: [...fixedHolidays(y), ...fixedHolidays(y + 1)]
  });
});

export const saveHrSettings = handle('Ayarlar kaydedilemedi.', async (req, res) => {
  const holidays = (Array.isArray(req.body.holidays) ? req.body.holidays : []).slice(0, 200).map((h) => {
    parseDay(h?.date, 'Tatil tarihi');
    return { date: String(h.date).slice(0, 10), name: text(h.name, 80) || 'Tatil', half: Boolean(h.half) };
  });
  const unique = [...new Map(holidays.map((h) => [h.date, h])).values()];
  const values = {
    [HR_RULE_KEYS.saturday]: String(req.body.saturdayWorkday === true),
    [HR_RULE_KEYS.negative]: String(req.body.allowNegativeLeave === true),
    [HR_RULE_KEYS.holidays]: JSON.stringify(unique)
  };
  await prisma.$transaction(Object.entries(values).map(([key, value]) => prisma.setting.upsert({
    where: { tenantId_key: { tenantId: currentTenantId(), key } }, update: { value }, create: { key, value }
  })));
  res.json({ message: 'İzin ayarları kaydedildi.' });
});

// ─── Personel kartları ───────────────────────────────────────────────────────

const USER_PICK = { select: { id: true, name: true, email: true, role: true, isActive: true } };
const EMPLOYEE_INCLUDE = { user: USER_PICK, manager: { select: { id: true, name: true, userId: true } } };

const parseEmployee = async (body, currentId = null) => {
  const name = text(body.name, 120);
  if (name.length < 2) throw new HrError('Ad soyad yazın.');
  const email = text(body.email, 160).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HrError('E-posta adresi geçerli değil.');
  let userId = body.userId === '' || body.userId === null || body.userId === undefined ? null : id(body.userId);
  if (userId) {
    // Yalnızca bu firmanın yönetici / plasiyer / personel hesabı bağlanır; bayi ve müşteri hesapları bağlanamaz
    const user = await prisma.user.findFirst({ where: { id: userId }, include: { employee: true } });
    if (!user) throw new HrError('Kullanıcı hesabı bulunamadı.');
    if (!['ADMIN', 'PLASIYER', 'PERSONEL'].includes(user.role)) throw new HrError('Bayi ya da müşteri hesabı personele bağlanamaz.');
    if (user.employee && user.employee.id !== currentId) throw new HrError(`Bu hesap zaten "${user.employee.name}" personel kartına bağlı.`);
  } else userId = null;
  let managerId = body.managerId === '' || body.managerId === null || body.managerId === undefined ? null : id(body.managerId);
  if (managerId) {
    if (managerId === currentId) throw new HrError('Personel kendi yöneticisi olamaz.');
    const manager = await prisma.employee.findFirst({ where: { id: managerId } });
    if (!manager) throw new HrError('Yönetici bulunamadı.');
    if (!manager.userId) throw new HrError('Yöneticinin onay verebilmesi için personel kartına bir kullanıcı hesabı bağlı olmalı.');
  } else managerId = null;
  const annualLeaveDays = body.annualLeaveDays === '' || body.annualLeaveDays == null ? null : parseInt(body.annualLeaveDays);
  if (annualLeaveDays !== null && !(annualLeaveDays >= 0 && annualLeaveDays <= 60)) throw new HrError('Yıllık izin 0 ile 60 gün arasında olmalı.');
  const carryDate = body.leaveCarryDate ? parseDay(body.leaveCarryDate, 'Devir tarihi') : null;
  const carryDays = body.leaveCarryDays === '' || body.leaveCarryDays == null ? null : Math.round(Number(String(body.leaveCarryDays).replace(',', '.')) * 10) / 10;
  if (carryDays !== null && !(Math.abs(carryDays) <= 400)) throw new HrError('Devreden izin günü geçerli değil.');
  if ((carryDate === null) !== (carryDays === null)) throw new HrError('Devir için hem tarihi hem kalan gün sayısını girin.');
  return {
    name, email, userId, managerId, annualLeaveDays, leaveCarryDays: carryDays, leaveCarryDate: carryDate,
    phone: text(body.phone, 30) || null,
    department: text(body.department, 60) || null,
    title: text(body.title, 80) || null,
    hireDate: body.hireDate ? parseDay(body.hireDate, 'İşe giriş tarihi') : null,
    isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true'
  };
};

// Kart kaydından sonra: departmanın tamamına aynı yönetici; pasif personelin "personel" hesabı da kapanır
const afterEmployeeSave = async (employee, body) => {
  if (body.applyManagerToDepartment && employee.department && employee.managerId) {
    await prisma.employee.updateMany({ where: { department: employee.department, id: { notIn: [employee.id, employee.managerId] } }, data: { managerId: employee.managerId } });
  }
  if (employee.userId && employee.user?.role === 'PERSONEL' && employee.user.isActive !== employee.isActive) {
    await prisma.user.update({ where: { id: employee.userId }, data: { isActive: employee.isActive } });
  }
};

export const listEmployees = handle('Personel listesi alınamadı.', async (req, res) => {
  const q = text(req.query.q, 60);
  const where = {
    ...(req.query.status === 'active' && { isActive: true }),
    ...(req.query.status === 'passive' && { isActive: false }),
    ...(req.query.department && { department: String(req.query.department) }),
    ...(q && { OR: ['name', 'email', 'phone', 'department', 'title'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) })
  };
  const rows = await prisma.employee.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: EMPLOYEE_INCLUDE, take: 500 });
  const ids = rows.map((r) => r.id);
  const [leaves, claims, advances, balances] = await Promise.all([
    prisma.leaveRequest.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.staffClaim.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.staffClaim.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, type: 'ADVANCE' }, _sum: { paidAmount: true, settledAmount: true } }),
    leaveBalances(rows)
  ]);
  const pending = new Map();
  for (const g of [...leaves, ...claims]) pending.set(g.employeeId, (pending.get(g.employeeId) || 0) + g._count._all);
  const open = new Map(advances.map((a) => [a.employeeId, round2((a._sum.paidAmount || 0) - (a._sum.settledAmount || 0))]));
  res.json(rows.map((r) => ({ ...r, pending: pending.get(r.id) || 0, openAdvance: open.get(r.id) || 0, leaveBalance: balances.get(r.id) })));
});

export const createEmployee = handle('Personel kaydedilemedi.', async (req, res) => {
  const employee = await prisma.employee.create({ data: await parseEmployee(req.body), include: EMPLOYEE_INCLUDE });
  await afterEmployeeSave(employee, req.body);
  res.locals.auditEntityId = employee.id;
  res.status(201).json({ message: 'Personel kartı oluşturuldu.', employee });
});

export const updateEmployee = handle('Personel güncellenemedi.', async (req, res) => {
  const current = await prisma.employee.findFirst({ where: { id: id(req.params.id) } });
  if (!current) throw new HrError('Personel bulunamadı.', 404);
  const employee = await prisma.employee.update({ where: { id: current.id }, data: await parseEmployee(req.body, current.id), include: EMPLOYEE_INCLUDE });
  await afterEmployeeSave(employee, req.body);
  res.json({ message: 'Personel kartı güncellendi.', employee });
});

/**
 * Personel girişi: kartı olan ama sistem hesabı olmayan personele yalnızca Personel Alanım'a giren hesap ("Personel"
 * rolü) açılır; paketteki yönetici sayısına dahil değildir. Geçici şifre e-postayla gider; e-posta gönderilemezse
 * yanıtta bir kez gösterilir (yetkili personele iletir).
 */
export const createEmployeeAccount = handle('Giriş hesabı açılamadı.', async (req, res) => {
  const employee = await prisma.employee.findFirst({ where: { id: id(req.params.id) } });
  if (!employee) throw new HrError('Personel bulunamadı.', 404);
  if (employee.userId) throw new HrError('Bu personelin zaten bir hesabı var.');
  if (!employee.isActive) throw new HrError('Pasif personele hesap açılamaz.');
  const email = text(req.body.email || employee.email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HrError('Giriş için geçerli bir e-posta adresi yazın.');
  if (await prisma.user.findFirst({ where: { email } })) throw new HrError('Bu e-posta ile kayıtlı bir kullanıcı var; o hesabı karta bağlayın.');
  const password = crypto.randomBytes(9).toString('base64url').slice(0, 12);
  const user = await prisma.user.create({ data: { email, name: employee.name, role: 'PERSONEL', password: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(), permissions: [] } });
  await prisma.employee.update({ where: { id: employee.id }, data: { userId: user.id, email: employee.email || email } });
  const mail = await sendCredentialsMail({ to: email, name: employee.name, password, tenant: req.tenant }).catch(() => ({ delivered: false }));
  res.locals.auditEntityId = employee.id;
  res.status(201).json({
    message: mail.delivered ? `Giriş hesabı açıldı; bilgiler ${email} adresine gönderildi.` : 'Giriş hesabı açıldı. E-posta gönderilemedi; geçici şifreyi personele siz iletin.',
    ...(!mail.delivered && { password })
  });
});

// Karta bağlanabilecek hesaplar: firmanın yönetici, plasiyer ve personel hesapları (bağlı olmayanlar + düzenlenen kartın hesabı)
export const linkableUsers = handle('Hesaplar alınamadı.', async (req, res) => {
  const keep = id(req.query.include);
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'PLASIYER', 'PERSONEL'] }, OR: [{ employee: null }, ...(keep ? [{ id: keep }] : [])] },
    select: { id: true, name: true, email: true, role: true, isActive: true }, orderBy: { name: 'asc' }
  });
  res.json(users);
});

export const departments = handle('Departmanlar alınamadı.', async (req, res) => {
  const rows = await prisma.employee.groupBy({ by: ['department'], where: { department: { not: null } }, _count: { _all: true }, orderBy: { department: 'asc' } });
  res.json(rows.map((r) => ({ name: r.department, count: r._count._all })));
});

// ─── Benim kaydım ────────────────────────────────────────────────────────────

export const me = handle('Bilgileriniz alınamadı.', async (req, res) => {
  const employee = await requireMe(req);
  const year = new Date().getFullYear();
  const [used, pendingLeaves, pendingClaims, unpaid, balance, openAdvance, manager, reports] = await Promise.all([
    prisma.leaveRequest.groupBy({ by: ['type'], where: { employeeId: employee.id, status: 'APPROVED', startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }, _sum: { days: true } }),
    prisma.leaveRequest.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
    prisma.staffClaim.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
    prisma.staffClaim.aggregate({ where: { employeeId: employee.id, status: 'APPROVED', paidAt: null }, _sum: { amount: true, paidAmount: true } }),
    employeeBalance(employee),
    openAdvanceTotal(prisma, employee.id),
    employee.managerId ? prisma.employee.findFirst({ where: { id: employee.managerId }, select: { id: true, name: true } }) : null,
    prisma.employee.count({ where: { managerId: employee.id, isActive: true } })
  ]);
  res.json({
    employee: { ...employee, manager },
    leaveDays: { year, byType: Object.fromEntries(used.map((u) => [u.type, u._sum.days || 0])) },
    leaveBalance: balance,
    pending: { leaves: pendingLeaves, claims: pendingClaims },
    awaitingPayment: round2((unpaid._sum.amount || 0) - (unpaid._sum.paidAmount || 0)),
    openAdvance,
    reports
  });
});

// ─── İzin ────────────────────────────────────────────────────────────────────

const LEAVE_INCLUDE = { employee: { select: { id: true, name: true, department: true, title: true, userId: true } } };

// İzin talebinin gün sayısı (kurallara göre) ve yıllık izinde bakiye
const leavePlan = async (employee, body) => {
  const type = LEAVE_TYPES[body.type] ? body.type : null;
  if (!type) throw new HrError('İzin türünü seçin.');
  const startDate = parseDay(body.startDate, 'Başlangıç tarihi');
  const endDate = parseDay(body.endDate, 'Bitiş tarihi');
  if (endDate < startDate) throw new HrError('Bitiş tarihi başlangıçtan önce olamaz.');
  if ((endDate - startDate) / 864e5 > 365) throw new HrError('İzin en fazla bir yıl olabilir.');
  const half = ['AM', 'PM'].includes(body.half) ? body.half : null;
  if (half && endDate.getTime() !== startDate.getTime()) throw new HrError('Yarım gün izin yalnızca tek gün için seçilebilir.');
  const rules = await leaveRules();
  const { days, holidays } = countLeaveDays(startDate, endDate, rules, half);
  const balance = type === 'ANNUAL' ? await employeeBalance(employee) : null;
  return { type, startDate, endDate, half, days, holidays, balance, rules };
};

// Talep penceresinde önizleme: kaç gün sayılacağı, aradaki tatiller, kalan yıllık izin
export const leavePreview = handle('Hesaplanamadı.', async (req, res) => {
  const employee = await requireMe(req);
  const plan = await leavePlan(employee, req.query);
  res.json({
    days: plan.days,
    holidays: plan.holidays.map((h) => ({ date: h.date, name: h.name, half: h.half })),
    balance: plan.balance,
    exceeds: Boolean(plan.balance && plan.days > plan.balance.available),
    allowNegative: plan.rules.allowNegative
  });
});

export const myLeaves = handle('İzinler alınamadı.', async (req, res) => {
  const employee = await requireMe(req);
  res.json(await prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { startDate: 'desc' }, take: 200 }));
});

// Yeni talep: yöneticisi varsa yöneticiye, yoksa Personel yetkililerine bildirim
const notifyDeciders = async (employee, payload, actorId) => {
  const manager = employee.managerId ? await prisma.employee.findFirst({ where: { id: employee.managerId }, include: { user: { select: { id: true, role: true, isActive: true } } } }) : null;
  if (manager?.user?.isActive && manager.userId !== actorId) {
    return notifyUser(manager.userId, { ...payload, link: teamLink(manager.user.role) });
  }
  return notifyAdmins({ ...payload, type: 'HR', excludeUserId: actorId });
};

export const createLeave = handle('İzin talebi oluşturulamadı.', async (req, res) => {
  const employee = await requireActiveMe(req);
  const { type, startDate, endDate, half, days, balance, rules } = await leavePlan(employee, req.body);
  if (days === 0) throw new HrError('Seçilen aralıkta iş günü yok (hafta sonu ya da resmî tatil).');
  if (balance && !rules.allowNegative && days > balance.available) {
    throw new HrError(`Kalan yıllık izniniz ${daysTr(balance.available)}${balance.pending ? ` (onay bekleyen ${daysTr(balance.pending)} düşüldü)` : ''}; bu talep ${daysTr(days)}.`);
  }
  const overlap = await prisma.leaveRequest.findFirst({ where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate } } });
  if (overlap) throw new HrError(`Bu tarihlerle çakışan bir izin talebiniz var (${dayTr(overlap.startDate)} – ${dayTr(overlap.endDate)}).`);
  const leave = await prisma.leaveRequest.create({ data: { employeeId: employee.id, type, startDate, endDate, half, days, note: text(req.body.note, 500) || null, createdByName: req.user.name } });
  res.locals.auditEntityId = leave.id;
  safeNotify(notifyDeciders(employee, {
    type: 'HR',
    title: 'Yeni izin talebi',
    message: `${employee.name}: ${LEAVE_TYPES[type]}, ${dayTr(startDate)}${half ? ` (yarım gün)` : ` – ${dayTr(endDate)}`} (${daysTr(days)}).`,
    link: `${MANAGE_LINK}?tab=leaves`
  }, req.user.id));
  res.status(201).json({ message: `İzin talebiniz iletildi (${daysTr(days)}).`, leave });
});

export const cancelLeave = handle('Talep iptal edilemedi.', async (req, res) => {
  const employee = await requireMe(req);
  const done = await prisma.leaveRequest.updateMany({ where: { id: id(req.params.id), employeeId: employee.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (done.count === 0) throw new HrError('Yalnızca onay bekleyen kendi talebinizi iptal edebilirsiniz.');
  res.json({ message: 'İzin talebi iptal edildi.' });
});

// İzin listesi (yönetim ve ekip): yıllık izinde personelin kalan günü de döner
const withBalances = async (rows) => {
  const employees = await prisma.employee.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.employeeId))] } } });
  const balances = await leaveBalances(employees);
  return rows.map((r) => ({ ...r, balance: r.type === 'ANNUAL' ? balances.get(r.employeeId) || null : null }));
};

export const listLeaves = handle('İzinler alınamadı.', async (req, res) => {
  const where = {
    ...(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(req.query.status) && { status: req.query.status }),
    ...(req.query.employeeId && { employeeId: id(req.query.employeeId) })
  };
  const [rows, counts] = await Promise.all([
    prisma.leaveRequest.findMany({ where, include: LEAVE_INCLUDE, orderBy: [{ startDate: 'desc' }], take: 300 }),
    prisma.leaveRequest.groupBy({ by: ['status'], _count: { _all: true } })
  ]);
  res.json({ rows: await withBalances(rows), counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

// Karar: Personel yetkilisi ya da personelin yöneticisi; yalnızca bekleyen talep, bir kez (koşullu güncelleme)
const decide = async ({ model, req, approve, label }) => {
  const record = await prisma[model].findFirst({
    where: { id: id(req.params.id) },
    include: { employee: { include: { user: { select: { role: true } }, manager: { select: { userId: true } } } } }
  });
  if (!record) throw new HrError('Talep bulunamadı.', 404);
  if (!canDecide(req.user, record.employee)) throw new HrError('Bu talebe karar verme yetkiniz yok (Personel yetkisi ya da personelin yöneticisi olmalısınız).', 403);
  assertNotSelf(req.user, record.employee);
  const reason = text(req.body?.reason, 500);
  if (!approve && reason.length < 3) throw new HrError('Ret gerekçesini yazın.');
  if (approve && model === 'leaveRequest' && record.type === 'ANNUAL') {
    const [balance, rules] = await Promise.all([employeeBalance(record.employee), leaveRules()]);
    // Onaylı izinlerden sonra kalan gün bu talebi karşılamalı (avans izne izin verilmediyse)
    if (balance && !rules.allowNegative && record.days > balance.remaining + 0.001) {
      throw new HrError(`Personelin kalan yıllık izni ${daysTr(balance.remaining)}; bu talep ${daysTr(record.days)}. Bakiyeyi aşan izin için İzin ayarlarından "avans izin"e izin verin.`);
    }
  }
  const done = await prisma[model].updateMany({
    where: { id: record.id, status: 'PENDING' },
    data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: req.user.id, decidedByName: req.user.name, decidedAt: new Date(), rejectReason: approve ? null : reason }
  });
  if (done.count === 0) throw new HrError(`Bu ${label} zaten sonuçlanmış.`, 409);
  return { record, reason };
};

export const decideLeave = (approve) => handle('Karar kaydedilemedi.', async (req, res) => {
  const { record, reason } = await decide({ model: 'leaveRequest', req, approve, label: 'izin talebi' });
  const e = record.employee;
  if (e.userId) {
    safeNotify(notifyUser(e.userId, {
      type: 'HR',
      title: approve ? 'İzin talebiniz onaylandı' : 'İzin talebiniz reddedildi',
      message: `${LEAVE_TYPES[record.type]}, ${dayTr(record.startDate)} – ${dayTr(record.endDate)} (${daysTr(record.days)})${approve ? '' : `. Gerekçe: ${reason}`}`,
      link: selfLink(e.user?.role)
    }));
  }
  res.json({ message: approve ? 'İzin onaylandı.' : 'İzin reddedildi.' });
});

// ─── Ekibim (departman yöneticisi) ───────────────────────────────────────────

export const myTeam = handle('Ekip bilgisi alınamadı.', async (req, res) => {
  const manager = await requireMe(req);
  const members = await prisma.employee.findMany({ where: { managerId: manager.id }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  const ids = members.map((m) => m.id);
  const since = new Date(Date.now() - 90 * 864e5);
  const [leaves, claims, balances] = await Promise.all([
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, OR: [{ status: 'PENDING' }, { startDate: { gte: since } }] }, include: LEAVE_INCLUDE, orderBy: [{ status: 'desc' }, { startDate: 'desc' }], take: 200 }),
    prisma.staffClaim.findMany({ where: { employeeId: { in: ids }, OR: [{ status: 'PENDING' }, { date: { gte: since } }] }, include: CLAIM_INCLUDE, orderBy: [{ date: 'desc' }], take: 200 }),
    leaveBalances(members)
  ]);
  res.json({
    members: members.map((m) => ({ id: m.id, name: m.name, title: m.title, department: m.department, isActive: m.isActive, leaveBalance: balances.get(m.id) })),
    leaves: await withBalances(leaves),
    claims: claims.map(publicClaim)
  });
});

// ─── Masraf ve avans ─────────────────────────────────────────────────────────

const PAYMENT_PICK = { select: { id: true, kind: true, amount: true, date: true, method: true, advanceId: true, claimId: true, targetId: true, createdByName: true, createdAt: true, note: true } };
const CLAIM_INCLUDE = {
  employee: { select: { id: true, name: true, department: true, title: true, userId: true } },
  payments: { ...PAYMENT_PICK, orderBy: { id: 'asc' } },
  settlements: { ...PAYMENT_PICK, orderBy: { id: 'asc' } }
};
const publicClaim = ({ storedName, ...c }) => ({
  ...c,
  hasFile: Boolean(storedName),
  remaining: round2(c.amount - (c.paidAmount || 0)),
  ...(c.type === 'ADVANCE' && { open: round2((c.paidAmount || 0) - (c.settledAmount || 0)) })
});

export const myClaims = handle('Talepler alınamadı.', async (req, res) => {
  const employee = await requireMe(req);
  const rows = await prisma.staffClaim.findMany({ where: { employeeId: employee.id }, include: { payments: CLAIM_INCLUDE.payments, settlements: CLAIM_INCLUDE.settlements }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200 });
  res.json(rows.map(publicClaim));
});

export const createClaim = async (req, res) => {
  try {
    const employee = await requireActiveMe(req);
    const type = Object.hasOwn(CLAIM_TYPES, req.body.type) ? req.body.type : null;
    if (!type) throw new HrError('Masraf mı avans mı seçin.');
    const amount = amountOf(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e9) throw new HrError('Geçerli bir tutar girin.');
    const date = req.body.date ? parseDay(req.body.date, 'Tarih') : parseDay(localDay(), 'Tarih');
    if (date > new Date(`${localDay()}T23:59:59`) && type === 'EXPENSE') throw new HrError('Masraf tarihi ileri bir gün olamaz.');
    const description = text(req.body.description, 500);
    if (description.length < 3) throw new HrError('Açıklama yazın (ne için).');
    const file = req.file ? { fileName: req.file.originalname.slice(0, 120), storedName: req.file.filename, mimeType: CASH_DOC_TYPES[path.extname(req.file.filename).toLowerCase()] } : {};
    const claim = await prisma.staffClaim.create({ data: { employeeId: employee.id, type, amount, date, description, ...file, createdByName: req.user.name } });
    res.locals.auditEntityId = claim.id;
    safeNotify(notifyDeciders(employee, {
      type: 'HR',
      title: type === 'ADVANCE' ? 'Yeni avans talebi' : 'Yeni masraf talebi',
      message: `${employee.name}: ${tl(amount)} · ${description}`,
      link: `${MANAGE_LINK}?tab=claims`
    }, req.user.id));
    res.status(201).json({ message: `${CLAIM_TYPES[type]} talebiniz iletildi.`, claim: publicClaim(claim) });
  } catch (error) {
    if (req.file) await removeFile(HR_DOC_DIR, req.file.filename);
    fail(res, error, 'Talep oluşturulamadı.');
  }
};

export const cancelClaim = handle('Talep iptal edilemedi.', async (req, res) => {
  const employee = await requireMe(req);
  const done = await prisma.staffClaim.updateMany({ where: { id: id(req.params.id), employeeId: employee.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (done.count === 0) throw new HrError('Yalnızca onay bekleyen kendi talebinizi iptal edebilirsiniz.');
  res.json({ message: 'Talep iptal edildi.' });
});

// Durum filtreleri: onay bekleyen, ödeme bekleyen (onaylı, tamamı ödenmemiş), ödenen, açık avans, reddedilen
const CLAIM_FILTERS = {
  PENDING: { status: 'PENDING' },
  TO_PAY: { status: 'APPROVED', paidAt: null },
  PAID: { paidAt: { not: null } },
  OPEN_ADVANCE: { type: 'ADVANCE', paidAmount: { gt: 0 } }, // kapanmamışlar aşağıda süzülür
  REJECTED: { status: { in: ['REJECTED', 'CANCELLED'] } }
};
const isOpenAdvance = (c) => c.type === 'ADVANCE' && c.paidAmount - c.settledAmount > 0.004;

export const listClaims = handle('Talepler alınamadı.', async (req, res) => {
  const where = { ...((Object.hasOwn(CLAIM_FILTERS, req.query.status) && CLAIM_FILTERS[req.query.status]) || {}), ...(req.query.employeeId && { employeeId: id(req.query.employeeId) }) };
  const [rows, pending, toPay, paid, rejected, advances, toPaySum] = await Promise.all([
    prisma.staffClaim.findMany({ where, include: CLAIM_INCLUDE, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 300 }),
    prisma.staffClaim.count({ where: CLAIM_FILTERS.PENDING }),
    prisma.staffClaim.count({ where: CLAIM_FILTERS.TO_PAY }),
    prisma.staffClaim.count({ where: CLAIM_FILTERS.PAID }),
    prisma.staffClaim.count({ where: CLAIM_FILTERS.REJECTED }),
    prisma.staffClaim.findMany({ where: CLAIM_FILTERS.OPEN_ADVANCE, select: { employeeId: true, type: true, paidAmount: true, settledAmount: true } }),
    prisma.staffClaim.aggregate({ where: CLAIM_FILTERS.TO_PAY, _sum: { amount: true, paidAmount: true } })
  ]);
  const open = advances.filter(isOpenAdvance);
  // Personelin açık avansı: masraf "avanstan mahsup" ile ödenebilir
  const openBy = new Map();
  for (const a of open) openBy.set(a.employeeId, round2((openBy.get(a.employeeId) || 0) + a.paidAmount - a.settledAmount));
  res.json({
    rows: (req.query.status === 'OPEN_ADVANCE' ? rows.filter(isOpenAdvance) : rows).map((c) => ({ ...publicClaim(c), employeeOpenAdvance: openBy.get(c.employeeId) || 0 })),
    counts: { PENDING: pending, TO_PAY: toPay, PAID: paid, OPEN_ADVANCE: open.length, REJECTED: rejected },
    toPayTotal: round2((toPaySum._sum.amount || 0) - (toPaySum._sum.paidAmount || 0)),
    openAdvanceTotal: round2(open.reduce((s, a) => s + a.paidAmount - a.settledAmount, 0))
  });
});

export const decideClaim = (approve) => handle('Karar kaydedilemedi.', async (req, res) => {
  const { record, reason } = await decide({ model: 'staffClaim', req, approve, label: 'talep' });
  const e = record.employee;
  const what = `${CLAIM_TYPES[record.type]} ${tl(record.amount)}`;
  if (e.userId) {
    safeNotify(notifyUser(e.userId, {
      type: 'HR',
      title: approve ? `${CLAIM_TYPES[record.type]} talebiniz onaylandı` : `${CLAIM_TYPES[record.type]} talebiniz reddedildi`,
      message: approve ? `${what} onaylandı; ödeme yapılınca ayrıca bildirilecek.` : `${what}. Gerekçe: ${reason}`,
      link: selfLink(e.user?.role)
    }));
  }
  if (approve) {
    safeNotify(notifyAdmins({ type: 'HR', anyPermission: ['FINANCE'], title: 'Ödeme bekleyen personel talebi', message: `${e.name}: ${what} onaylandı, ödenmeyi bekliyor.`, link: `${MANAGE_LINK}?tab=claims` }));
  }
  res.json({ message: approve ? 'Talep onaylandı. Ödeme ayrıca kaydedilir.' : 'Talep reddedildi.' });
});

const paymentOf = (body, methods) => {
  const method = methods.includes(body?.method) ? body.method : null;
  if (!method) throw new HrError('Ödeme şeklini seçin.');
  const day = body?.date ? String(body.date).slice(0, 10) : localDay();
  parseDay(day, 'Ödeme tarihi');
  return { method, date: new Date(`${day}T12:00:00`), amount: optionalAmount(body?.amount), note: text(body?.note, 200) };
};

// Fiş / fatura gelir-gider kaydına da kopyalanır (iki kaydın dosyası birbirinden bağımsız silinebilsin)
const copyToCash = async (claim) => {
  if (!claim.storedName) return null;
  const storedName = `t${currentTenantId()}-${crypto.randomBytes(16).toString('hex')}${path.extname(claim.storedName).toLowerCase()}`;
  try {
    await fs.copyFile(path.join(HR_DOC_DIR, claim.storedName), path.join(CASH_DOC_DIR, storedName));
    return { fileName: claim.fileName, storedName, mimeType: claim.mimeType };
  } catch {
    return null;
  }
};

const paidMessage = (result, label, method) => {
  const left = round2(result.due - result.paid);
  const where = method === ADVANCE_METHOD ? 'açık avanstan düşüldü (nakit çıkmadı)' : 'Gelir-Gider\'e gider olarak eklendi';
  return result.complete ? `${label} tamamı ödendi; ${where}.` : `Kısmi ödeme kaydedildi; ${where}. Kalan ${tl(left)}.`;
};

/**
 * Ödeme (kısmi olabilir): tutar boşsa kalanın tamamı. Nakit / banka / kart → gelir-gidere gider; "avanstan mahsup" →
 * personelin açık avansından düşülür. Kalan tutardan fazlası ödenemez; eşzamanlı ödemeler sırayla işler.
 */
export const payClaim = handle('Ödeme kaydedilemedi.', async (req, res) => {
  const pay = paymentOf(req.body, [...PAY_METHODS, ADVANCE_METHOD]);
  const claim = await prisma.staffClaim.findFirst({ where: { id: id(req.params.id) } });
  if (!claim) throw new HrError('Talep bulunamadı.', 404);
  const cashFile = pay.method === ADVANCE_METHOD ? null : await copyToCash(claim);
  let result;
  try {
    result = await payTowards({ claimId: claim.id }, {
      ...pay, user: req.user, cashFile,
      describe: (row, value, due) => `${row.employee.name}: ${row.description}${value < due ? ` (kısmi ${tl(value)} / ${tl(due)})` : ''}`
    });
  } catch (error) {
    if (cashFile) await removeFile(CASH_DOC_DIR, cashFile.storedName);
    throw error;
  }
  if (pay.method !== ADVANCE_METHOD) safeNotify(checkBudgets());
  const e = await prisma.employee.findFirst({ where: { id: claim.employeeId }, include: { user: { select: { role: true } } } });
  if (e.userId) {
    safeNotify(notifyUser(e.userId, {
      type: 'HR', title: result.complete ? `${CLAIM_TYPES[claim.type]} ödendi` : `${CLAIM_TYPES[claim.type]} için kısmi ödeme`,
      message: `${CLAIM_TYPES[claim.type]} ${tl(claim.amount)}: ${tl(result.payments.reduce((s, p) => s + p.amount, 0))} ${pay.method === ADVANCE_METHOD ? 'avansınızdan mahsup edildi' : 'ödendi'}${result.complete ? '' : `, kalan ${tl(result.due - result.paid)}`}.`,
      link: selfLink(e.user?.role)
    }));
  }
  res.json({ message: paidMessage(result, CLAIM_TYPES[claim.type], pay.method) });
});

// Avansın kapanması: nakit iade (gelir kaydı) ya da maaştan kesinti
export const settleClaim = handle('Avans kapatılamadı.', async (req, res) => {
  const kind = req.body?.kind;
  const day = req.body?.date ? String(req.body.date).slice(0, 10) : localDay();
  parseDay(day, 'Tarih');
  const result = await settleAdvance(id(req.params.id), { kind, amount: optionalAmount(req.body?.amount), date: new Date(`${day}T12:00:00`), method: req.body?.method, note: text(req.body?.note, 200), user: req.user });
  res.json({ message: `${kind === 'REFUND' ? 'Avans iadesi kaydedildi; Gelir-Gider\'e gelir olarak eklendi.' : 'Maaştan kesinti kaydedildi.'}${result.open > 0 ? ` Açık avans ${tl(result.open)}.` : ' Avans kapandı.'}` });
});

// Yanlış girilen ödemeyi / mahsubu / iadeyi geri alır
export const deletePayment = handle('Ödeme geri alınamadı.', async (req, res) => {
  const p = await undoPayment(id(req.params.id));
  if (p.cashFile) await removeFile(CASH_DOC_DIR, p.cashFile);
  res.json({ message: p.cashEntryId || p.kind === 'PAYOUT' || p.kind === 'REFUND' ? 'Ödeme geri alındı; gelir-gider kaydı silindi.' : 'Kayıt geri alındı.' });
});

// Fiş / fatura: talebin sahibi, Personel / Finans yetkilileri ve personelin yöneticisi indirir
export const claimFile = handle('Belge alınamadı.', async (req, res) => {
  const claim = await prisma.staffClaim.findFirst({ where: { id: id(req.params.id) }, include: { employee: { select: { userId: true, manager: { select: { userId: true } } } } } });
  const allowed = claim && (claim.employee.userId === req.user.id || canManage(req.user) || canPay(req.user) || claim.employee.manager?.userId === req.user.id);
  if (!allowed || !claim.storedName) throw new HrError('Belge bulunamadı.', 404);
  const file = path.resolve(HR_DOC_DIR, claim.storedName);
  if (!file.startsWith(path.resolve(HR_DOC_DIR)) || !claim.storedName.startsWith(`t${currentTenantId()}-`)) throw new HrError('Belge bulunamadı.', 404);
  res.setHeader('Content-Type', claim.mimeType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, claim.fileName || claim.storedName, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Dosya bulunamadı.' });
  });
});

// ─── Satış hedefi ve prim ────────────────────────────────────────────────────

const TARGET_INCLUDE = {
  employee: { select: { id: true, name: true, department: true, title: true, userId: true, user: { select: { role: true } } } },
  payments: { ...PAYMENT_PICK, orderBy: { id: 'asc' } }
};

const parseTarget = (body, current = {}) => {
  const targetAmount = body.targetAmount !== undefined ? amountOf(body.targetAmount) : current.targetAmount;
  const bonusRate = body.bonusRate !== undefined ? amountOf(body.bonusRate) : current.bonusRate;
  const basis = body.basis !== undefined ? body.basis : current.basis || 'SALES';
  if (!(targetAmount > 0) || targetAmount >= 1e10) throw new HrError('Hedef tutarı sıfırdan büyük olmalı.');
  if (!(bonusRate > 0) || bonusRate > 50) throw new HrError('Prim oranı %0 ile %50 arasında olmalı.');
  if (!BASES[basis]) throw new HrError('Primin satışa mı tahsilata mı bağlı olduğunu seçin.');
  return { targetAmount, bonusRate, basis };
};

// Hedef + personelin açık avansı (prim avanstan mahsup edilebilir)
const presentTargets = async (rows) => {
  const advances = new Map();
  for (const empId of [...new Set(rows.filter((t) => t.status === 'CLOSED' && !t.paidAt).map((t) => t.employeeId))]) advances.set(empId, await openAdvanceTotal(prisma, empId));
  return Promise.all(rows.map(async (t) => ({ ...(await presentTarget(t)), openAdvance: advances.get(t.employeeId) || 0 })));
};

export const listTargets = handle('Hedefler alınamadı.', async (req, res) => {
  const where = req.query.employeeId ? { employeeId: id(req.query.employeeId) } : { period: req.query.period ? parsePeriod(req.query.period) : currentPeriod() };
  const rows = await prisma.staffTarget.findMany({ where, include: TARGET_INCLUDE, orderBy: [{ period: 'desc' }, { employee: { name: 'asc' } }] });
  res.json(await presentTargets(rows));
});

export const myTargets = handle('Hedefler alınamadı.', async (req, res) => {
  const employee = await requireMe(req);
  const rows = await prisma.staffTarget.findMany({ where: { employeeId: employee.id }, include: TARGET_INCLUDE, orderBy: { period: 'desc' }, take: 24 });
  res.json(await Promise.all(rows.map(presentTarget)));
});

export const createTarget = handle('Hedef kaydedilemedi.', async (req, res) => {
  const employee = await prisma.employee.findFirst({ where: { id: id(req.body.employeeId) }, include: { user: { select: { role: true } } } });
  if (!employee) throw new HrError('Personel bulunamadı.', 404);
  if (!employee.isActive) throw new HrError('Pasif personele hedef verilemez.');
  // Satışlar hesabın sorumlu olduğu bayilerden ve bayi adına girdiği siparişlerden hesaplanır
  if (!employee.userId || !['ADMIN', 'PLASIYER'].includes(employee.user?.role)) throw new HrError('Satış hedefi için personel kartının bir plasiyer ya da yönetici hesabına bağlı olması gerekir (satışlar bu hesabın bayilerinden hesaplanır).');
  const period = parsePeriod(req.body.period);
  if (monthEnded(period)) throw new HrError('Geçmiş bir aya hedef verilemez.');
  const exists = await prisma.staffTarget.findFirst({ where: { employeeId: employee.id, period } });
  if (exists) throw new HrError('Bu personelin o ay için hedefi zaten var; mevcut hedefi düzenleyin.', 409);
  const target = await prisma.staffTarget.create({ data: { employeeId: employee.id, period, ...parseTarget(req.body), createdByName: req.user.name }, include: TARGET_INCLUDE });
  res.locals.auditEntityId = target.id;
  safeNotify(notifyUser(employee.userId, {
    type: 'HR', title: 'Yeni satış hedefiniz',
    message: `${period}: ${tl(target.targetAmount)} (${BASES[target.basis].toLocaleLowerCase('tr')}). Hedefe ulaşırsanız %${target.bonusRate} prim hesaplanır.`,
    link: selfLink(employee.user?.role)
  }));
  res.status(201).json({ message: 'Hedef kaydedildi; personele bildirildi.', target: await presentTarget(target) });
});

export const updateTarget = handle('Hedef güncellenemedi.', async (req, res) => {
  const current = await prisma.staffTarget.findFirst({ where: { id: id(req.params.id) } });
  if (!current) throw new HrError('Hedef bulunamadı.', 404);
  const done = await prisma.staffTarget.updateMany({ where: { id: current.id, status: 'OPEN' }, data: parseTarget(req.body, current) });
  if (done.count === 0) throw new HrError('Kapatılmış hedef değiştirilemez.');
  res.json({ message: 'Hedef güncellendi.' });
});

export const deleteTarget = handle('Hedef silinemedi.', async (req, res) => {
  const done = await prisma.staffTarget.deleteMany({ where: { id: id(req.params.id), status: 'OPEN' } });
  if (done.count === 0) throw new HrError('Yalnızca açık hedefler silinebilir.');
  res.json({ message: 'Hedef silindi.' });
});

/**
 * Ay kapanışı: gerçekleşen ve hesaplanan prim sabitlenir (sonradan gelen iade ya da iptal kapalı ayı değiştirmez).
 * Ay bitmeden kapatılamaz; iki kez kapatılamaz (satır kilidi). Prim ödemesi ayrıca yapılır.
 */
export const closeTarget = handle('Dönem kapatılamadı.', async (req, res) => {
  const tid = id(req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StaffTarget" WHERE id = ${tid} AND "tenantId" = ${currentTenantId()} FOR UPDATE`;
    const t = await tx.staffTarget.findFirst({ where: { id: tid }, include: TARGET_INCLUDE });
    if (!t) throw new HrError('Hedef bulunamadı.', 404);
    if (t.status !== 'OPEN') throw new HrError('Bu dönem zaten kapatılmış.', 409);
    if (!monthEnded(t.period)) throw new HrError('Ay bitmeden dönem kapatılamaz.');
    const achieved = await achievedForStaff(tx, { userId: t.employee.userId, period: t.period, basis: t.basis });
    const bonus = bonusFor(achieved, t);
    await tx.staffTarget.update({ where: { id: t.id }, data: { status: 'CLOSED', achievedAmount: achieved, bonusAmount: bonus, closedAt: new Date(), closedByName: req.user.name } });
    return { t, achieved, bonus };
  });
  const { t, achieved, bonus } = result;
  if (t.employee.userId) {
    safeNotify(notifyUser(t.employee.userId, {
      type: 'HR', title: bonus > 0 ? 'Hedefiniz tuttu, priminiz hesaplandı' : 'Hedef dönemi kapandı',
      message: `${t.period}: gerçekleşen ${tl(achieved)} / hedef ${tl(t.targetAmount)}.${bonus > 0 ? ` Hesaplanan prim ${tl(bonus)}; ödeme yapılınca bildirilecek.` : ' Prim hesaplanmadı.'}`,
      link: selfLink(t.employee.user?.role)
    }));
  }
  res.json({ message: bonus > 0 ? `Dönem kapatıldı. Hesaplanan prim ${tl(bonus)}; ödeme ayrıca kaydedilir.` : 'Dönem kapatıldı. Hedef tutmadığı için prim hesaplanmadı.' });
});

export const payTarget = handle('Prim ödemesi kaydedilemedi.', async (req, res) => {
  const pay = paymentOf(req.body, [...PAY_METHODS, ADVANCE_METHOD]);
  const target = await prisma.staffTarget.findFirst({ where: { id: id(req.params.id) }, include: TARGET_INCLUDE });
  if (!target) throw new HrError('Hedef bulunamadı.', 404);
  const result = await payTowards({ targetId: target.id }, {
    ...pay, user: req.user,
    describe: (row, value, due) => `${row.employee.name}: ${row.period} satış primi (%${row.bonusRate})${value < due ? ` (kısmi ${tl(value)} / ${tl(due)})` : ''}`
  });
  if (pay.method !== ADVANCE_METHOD) safeNotify(checkBudgets());
  if (target.employee.userId) {
    safeNotify(notifyUser(target.employee.userId, {
      type: 'HR', title: result.complete ? 'Priminiz ödendi' : 'Priminiz için kısmi ödeme',
      message: `${target.period} satış primi: ${tl(result.paid)} / ${tl(result.due)} ödendi${pay.method === ADVANCE_METHOD ? ' (avanstan mahsup)' : ''}.`,
      link: selfLink(target.employee.user?.role)
    }));
  }
  res.json({ message: paidMessage(result, 'Primin', pay.method) });
});

// ─── Şirket duyuruları ───────────────────────────────────────────────────────

const parseDepartments = (v) => [...new Set((Array.isArray(v) ? v : []).map((d) => text(d, 60)).filter(Boolean))].slice(0, 30);

export const listAnnouncements = handle('Duyurular alınamadı.', async (req, res) => {
  res.json(await prisma.staffAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
});

export const createAnnouncement = handle('Duyuru yayınlanamadı.', async (req, res) => {
  const title = text(req.body.title, 120);
  const body = text(req.body.body, 4000);
  if (title.length < 3) throw new HrError('Başlık yazın.');
  if (body.length < 3) throw new HrError('Duyuru metnini yazın.');
  const departments = parseDepartments(req.body.departments);
  const announcement = await prisma.staffAnnouncement.create({ data: { title, body, departments, createdById: req.user.id, createdByName: req.user.name } });
  res.locals.auditEntityId = announcement.id;
  // Hesabı olan aktif personele bildirim (departman seçildiyse yalnızca o departmanlar)
  const recipients = await prisma.employee.findMany({
    where: { isActive: true, userId: { not: null }, ...(departments.length && { department: { in: departments } }) },
    select: { userId: true, user: { select: { role: true, isActive: true } } }
  });
  for (const r of recipients.filter((x) => x.user?.isActive && x.userId !== req.user.id)) {
    safeNotify(notifyUser(r.userId, { type: 'HR', title: `Duyuru: ${title}`, message: body.slice(0, 200), link: selfLink(r.user.role), dedupeKey: `staff-ann:${announcement.id}:u${r.userId}` }));
  }
  res.status(201).json({ message: `Duyuru yayınlandı (${recipients.length} personel).`, announcement });
});

export const deleteAnnouncement = handle('Duyuru silinemedi.', async (req, res) => {
  const done = await prisma.staffAnnouncement.deleteMany({ where: { id: id(req.params.id) } });
  if (done.count === 0) throw new HrError('Duyuru bulunamadı.', 404);
  res.json({ message: 'Duyuru silindi.' });
});

// Personelin göreceği duyurular: tüm personele olanlar ve kendi departmanına olanlar
export const myAnnouncements = handle('Duyurular alınamadı.', async (req, res) => {
  const employee = await myEmployee(req);
  const dept = employee?.department;
  res.json(await prisma.staffAnnouncement.findMany({
    where: { OR: [{ departments: { isEmpty: true } }, ...(dept ? [{ departments: { has: dept } }] : [])] },
    orderBy: { createdAt: 'desc' }, take: 50,
    select: { id: true, title: true, body: true, departments: true, createdByName: true, createdAt: true }
  }));
});
