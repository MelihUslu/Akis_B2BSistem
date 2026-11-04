import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma, { currentTenantId } from '../utils/prisma.js';
import { round2 } from '../services/pricingService.js';
import { localDay } from '../utils/dates.js';
import { HR_DOC_DIR, CASH_DOC_DIR, CASH_DOC_TYPES } from '../middlewares/upload.js';
import { notifyAdmins, notifyUser, safeNotify } from '../services/notificationService.js';
import { checkBudgets } from './cashController.js';
import {
  HrError, hrEnabled, canManage, canPay, assertNotSelf, parseDay, workdays, parsePeriod, monthEnded, currentPeriod,
  achievedForStaff, bonusFor, presentTarget, LEAVE_TYPES, CLAIM_TYPES, PAY_METHODS, BASES, CASH_CATEGORY
} from '../services/hrService.js';

/**
 * Personel yönetimi: personel kartları, izin, masraf / avans, satış hedefi ve prim, şirket duyuruları.
 * Erişim (routes/hrRoutes.js): modül firmada açık olmalı; bayi hesapları giremez. Personel /me uçlarında yalnızca
 * kendi kaydını görür; yönetim uçları "Personel" (HR), ödeme uçları "Finans" yetkisi ister.
 * Onay, ret ve ödeme kimin yaptığı ve ne zaman yaptığıyla kayda yazılır (ayrıca işlem kaydına düşer).
 */

const MANAGE_LINK = '/admin/personel';
const selfLink = (role) => (role === 'PLASIYER' ? '/plasiyer/personel' : '/admin/personel-alanim');
const tl = (n) => `₺${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayTr = (d) => new Date(d).toLocaleDateString('tr-TR', { timeZone: process.env.TZ || 'Europe/Istanbul' });
const id = (v) => parseInt(v) || 0;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
// "1.500,50" / "1500,50" / "1500.50" → 1500.5
const amountOf = (v) => {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  return round2(Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t));
};

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

export const requireAny = (...checks) => (req, res, next) => {
  if (checks.some((c) => c(req.user))) return next();
  res.status(403).json({ message: 'Bu işlem için yetkiniz yok.' });
};

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
  res.json({ enabled, canManage: canManage(req.user), canPay: canPay(req.user), employee: me });
});

// ─── Personel kartları ───────────────────────────────────────────────────────

const USER_PICK = { select: { id: true, name: true, email: true, role: true, isActive: true } };

const parseEmployee = async (body, currentId = null) => {
  const name = text(body.name, 120);
  if (name.length < 2) throw new HrError('Ad soyad yazın.');
  const email = text(body.email, 160).toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HrError('E-posta adresi geçerli değil.');
  let userId = body.userId === '' || body.userId === null || body.userId === undefined ? null : id(body.userId);
  if (userId) {
    // Yalnızca bu firmanın yönetici / plasiyer hesabı bağlanır; bayi ve müşteri hesapları bağlanamaz
    const user = await prisma.user.findFirst({ where: { id: userId }, include: { employee: true } });
    if (!user) throw new HrError('Kullanıcı hesabı bulunamadı.');
    if (!['ADMIN', 'PLASIYER'].includes(user.role)) throw new HrError('Bayi ya da müşteri hesabı personele bağlanamaz.');
    if (user.employee && user.employee.id !== currentId) throw new HrError(`Bu hesap zaten "${user.employee.name}" personel kartına bağlı.`);
  } else userId = null;
  return {
    name, email, userId,
    phone: text(body.phone, 30) || null,
    department: text(body.department, 60) || null,
    title: text(body.title, 80) || null,
    hireDate: body.hireDate ? parseDay(body.hireDate, 'İşe giriş tarihi') : null,
    isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true'
  };
};

export const listEmployees = handle('Personel listesi alınamadı.', async (req, res) => {
  const q = text(req.query.q, 60);
  const where = {
    ...(req.query.status === 'active' && { isActive: true }),
    ...(req.query.status === 'passive' && { isActive: false }),
    ...(req.query.department && { department: String(req.query.department) }),
    ...(q && { OR: ['name', 'email', 'phone', 'department', 'title'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } })) })
  };
  const rows = await prisma.employee.findMany({
    where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { user: USER_PICK },
    take: 500
  });
  const ids = rows.map((r) => r.id);
  const [leaves, claims] = await Promise.all([
    prisma.leaveRequest.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } }),
    prisma.staffClaim.groupBy({ by: ['employeeId'], where: { employeeId: { in: ids }, status: 'PENDING' }, _count: { _all: true } })
  ]);
  const pending = new Map();
  for (const g of [...leaves, ...claims]) pending.set(g.employeeId, (pending.get(g.employeeId) || 0) + g._count._all);
  res.json(rows.map((r) => ({ ...r, pending: pending.get(r.id) || 0 })));
});

export const createEmployee = handle('Personel kaydedilemedi.', async (req, res) => {
  const employee = await prisma.employee.create({ data: await parseEmployee(req.body), include: { user: USER_PICK } });
  res.locals.auditEntityId = employee.id;
  res.status(201).json({ message: 'Personel kartı oluşturuldu.', employee });
});

export const updateEmployee = handle('Personel güncellenemedi.', async (req, res) => {
  const current = await prisma.employee.findFirst({ where: { id: id(req.params.id) } });
  if (!current) throw new HrError('Personel bulunamadı.', 404);
  const employee = await prisma.employee.update({ where: { id: current.id }, data: await parseEmployee(req.body, current.id), include: { user: USER_PICK } });
  res.json({ message: 'Personel kartı güncellendi.', employee });
});

// Karta bağlanabilecek hesaplar: firmanın yönetici ve plasiyerleri (bağlı olmayanlar + düzenlenen kartın hesabı)
export const linkableUsers = handle('Hesaplar alınamadı.', async (req, res) => {
  const keep = id(req.query.include);
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'PLASIYER'] }, OR: [{ employee: null }, ...(keep ? [{ id: keep }] : [])] },
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
  const [used, pendingLeaves, pendingClaims, unpaid] = await Promise.all([
    prisma.leaveRequest.groupBy({ by: ['type'], where: { employeeId: employee.id, status: 'APPROVED', startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } }, _sum: { days: true } }),
    prisma.leaveRequest.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
    prisma.staffClaim.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
    prisma.staffClaim.aggregate({ where: { employeeId: employee.id, status: 'APPROVED', paidAt: null }, _sum: { amount: true } })
  ]);
  res.json({
    employee,
    leaveDays: { year, byType: Object.fromEntries(used.map((u) => [u.type, u._sum.days || 0])) },
    pending: { leaves: pendingLeaves, claims: pendingClaims },
    awaitingPayment: round2(unpaid._sum.amount || 0)
  });
});

// ─── İzin ────────────────────────────────────────────────────────────────────

const LEAVE_INCLUDE = { employee: { select: { id: true, name: true, department: true, title: true, userId: true } } };

export const myLeaves = handle('İzinler alınamadı.', async (req, res) => {
  const employee = await requireMe(req);
  res.json(await prisma.leaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { startDate: 'desc' }, take: 200 }));
});

export const createLeave = handle('İzin talebi oluşturulamadı.', async (req, res) => {
  const employee = await requireActiveMe(req);
  const type = LEAVE_TYPES[req.body.type] ? req.body.type : null;
  if (!type) throw new HrError('İzin türünü seçin.');
  const startDate = parseDay(req.body.startDate, 'Başlangıç tarihi');
  const endDate = parseDay(req.body.endDate, 'Bitiş tarihi');
  if (endDate < startDate) throw new HrError('Bitiş tarihi başlangıçtan önce olamaz.');
  if ((endDate - startDate) / 864e5 > 365) throw new HrError('İzin en fazla bir yıl olabilir.');
  const days = workdays(startDate, endDate);
  if (days === 0) throw new HrError('Seçilen aralıkta iş günü yok (hafta sonu).');
  const overlap = await prisma.leaveRequest.findFirst({ where: { employeeId: employee.id, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate } } });
  if (overlap) throw new HrError(`Bu tarihlerle çakışan bir izin talebiniz var (${dayTr(overlap.startDate)} – ${dayTr(overlap.endDate)}).`);
  const leave = await prisma.leaveRequest.create({ data: { employeeId: employee.id, type, startDate, endDate, days, note: text(req.body.note, 500) || null, createdByName: req.user.name } });
  res.locals.auditEntityId = leave.id;
  safeNotify(notifyAdmins({
    type: 'HR', excludeUserId: req.user.id,
    title: 'Yeni izin talebi',
    message: `${employee.name}: ${LEAVE_TYPES[type]}, ${dayTr(startDate)} – ${dayTr(endDate)} (${days} iş günü).`,
    link: `${MANAGE_LINK}?tab=leaves`
  }));
  res.status(201).json({ message: `İzin talebiniz iletildi (${days} iş günü).`, leave });
});

export const cancelLeave = handle('Talep iptal edilemedi.', async (req, res) => {
  const employee = await requireMe(req);
  const done = await prisma.leaveRequest.updateMany({ where: { id: id(req.params.id), employeeId: employee.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  if (done.count === 0) throw new HrError('Yalnızca onay bekleyen kendi talebinizi iptal edebilirsiniz.');
  res.json({ message: 'İzin talebi iptal edildi.' });
});

export const listLeaves = handle('İzinler alınamadı.', async (req, res) => {
  const where = {
    ...(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(req.query.status) && { status: req.query.status }),
    ...(req.query.employeeId && { employeeId: id(req.query.employeeId) })
  };
  const [rows, counts] = await Promise.all([
    prisma.leaveRequest.findMany({ where, include: LEAVE_INCLUDE, orderBy: [{ startDate: 'desc' }], take: 300 }),
    prisma.leaveRequest.groupBy({ by: ['status'], _count: { _all: true } })
  ]);
  res.json({ rows, counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) });
});

// Karar: yalnızca bekleyen talep, bir kez (koşullu güncelleme; iki yönetici aynı anda karar veremez)
const decide = async ({ model, req, approve, label }) => {
  const record = await prisma[model].findFirst({ where: { id: id(req.params.id) }, include: { employee: { include: { user: { select: { role: true } } } } } });
  if (!record) throw new HrError('Talep bulunamadı.', 404);
  assertNotSelf(req.user, record.employee);
  const reason = text(req.body?.reason, 500);
  if (!approve && reason.length < 3) throw new HrError('Ret gerekçesini yazın.');
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
      message: `${LEAVE_TYPES[record.type]}, ${dayTr(record.startDate)} – ${dayTr(record.endDate)}${approve ? '' : `. Gerekçe: ${reason}`}`,
      link: selfLink(e.user?.role)
    }));
  }
  res.json({ message: approve ? 'İzin onaylandı.' : 'İzin reddedildi.' });
});

// ─── Masraf ve avans ─────────────────────────────────────────────────────────

const CLAIM_INCLUDE = { employee: { select: { id: true, name: true, department: true, title: true, userId: true } } };
const publicClaim = ({ storedName, ...c }) => ({ ...c, hasFile: Boolean(storedName) });

export const myClaims = handle('Talepler alınamadı.', async (req, res) => {
  const employee = await requireMe(req);
  const rows = await prisma.staffClaim.findMany({ where: { employeeId: employee.id }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 200 });
  res.json(rows.map(publicClaim));
});

export const createClaim = async (req, res) => {
  try {
    const employee = await requireActiveMe(req);
    const type = CLAIM_TYPES[req.body.type] ? req.body.type : null;
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
    safeNotify(notifyAdmins({
      type: 'HR', excludeUserId: req.user.id,
      title: type === 'ADVANCE' ? 'Yeni avans talebi' : 'Yeni masraf talebi',
      message: `${employee.name}: ${tl(amount)} · ${description}`,
      link: `${MANAGE_LINK}?tab=claims`
    }));
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

// Durum filtreleri: onay bekleyen, ödeme bekleyen (onaylı + ödenmemiş), ödenen, reddedilen
const CLAIM_FILTERS = {
  PENDING: { status: 'PENDING' },
  TO_PAY: { status: 'APPROVED', paidAt: null },
  PAID: { paidAt: { not: null } },
  REJECTED: { status: { in: ['REJECTED', 'CANCELLED'] } }
};

export const listClaims = handle('Talepler alınamadı.', async (req, res) => {
  const where = { ...(CLAIM_FILTERS[req.query.status] || {}), ...(req.query.employeeId && { employeeId: id(req.query.employeeId) }) };
  const [rows, ...counts] = await Promise.all([
    prisma.staffClaim.findMany({ where, include: CLAIM_INCLUDE, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 300 }),
    ...Object.values(CLAIM_FILTERS).map((w) => prisma.staffClaim.count({ where: w }))
  ]);
  const totals = await prisma.staffClaim.aggregate({ where: CLAIM_FILTERS.TO_PAY, _sum: { amount: true } });
  res.json({
    rows: rows.map(publicClaim),
    counts: Object.fromEntries(Object.keys(CLAIM_FILTERS).map((k, i) => [k, counts[i]])),
    toPayTotal: round2(totals._sum.amount || 0)
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

const paymentOf = (body) => {
  const method = PAY_METHODS.includes(body?.method) ? body.method : null;
  if (!method) throw new HrError('Ödeme şeklini seçin (nakit, banka, kart).');
  const day = body?.date ? String(body.date).slice(0, 10) : localDay();
  parseDay(day, 'Ödeme tarihi');
  return { method, date: new Date(`${day}T12:00:00`) };
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

/**
 * Ödeme: gelir-gidere gider kaydı açılır ve talep "ödendi" olur, ikisi tek işlemde. Gelir-gider kaydının kaynak
 * anahtarı (STAFF_CLAIM:<id>) veritabanında tekildir: aynı anda iki ödeme denense de yalnızca biri kaydedilir.
 */
export const payClaim = handle('Ödeme kaydedilemedi.', async (req, res) => {
  const { method, date } = paymentOf(req.body);
  const claim = await prisma.staffClaim.findFirst({ where: { id: id(req.params.id) }, include: { employee: { include: { user: { select: { role: true } } } } } });
  if (!claim) throw new HrError('Talep bulunamadı.', 404);
  if (claim.paidAt) throw new HrError('Bu talep zaten ödendi.', 409);
  if (claim.status !== 'APPROVED') throw new HrError('Yalnızca onaylanmış talep ödenebilir.');
  const file = await copyToCash(claim);
  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.cashEntry.create({
        data: {
          type: 'OUT', category: CASH_CATEGORY[claim.type], amount: claim.amount, date, method, vatRate: 0,
          description: `${claim.employee.name}: ${claim.description}`.slice(0, 500), sourceRef: `STAFF_CLAIM:${claim.id}`,
          createdByName: req.user.name, ...(file || {})
        }
      });
      const done = await tx.staffClaim.updateMany({
        where: { id: claim.id, status: 'APPROVED', paidAt: null },
        data: { paidAt: new Date(), paidById: req.user.id, paidByName: req.user.name, paymentMethod: method, cashEntryId: entry.id }
      });
      if (done.count === 0) throw new HrError('Bu talep zaten ödendi.', 409);
    });
  } catch (error) {
    if (file) await removeFile(CASH_DOC_DIR, file.storedName);
    if (error?.code === 'P2002') throw new HrError('Bu talep zaten ödendi.', 409);
    throw error;
  }
  safeNotify(checkBudgets());
  if (claim.employee.userId) {
    safeNotify(notifyUser(claim.employee.userId, {
      type: 'HR', title: `${CLAIM_TYPES[claim.type]} ödendi`,
      message: `${CLAIM_TYPES[claim.type]} ${tl(claim.amount)} ${dayTr(date)} tarihinde ödendi.`, link: selfLink(claim.employee.user?.role)
    }));
  }
  res.json({ message: `Ödeme kaydedildi; Gelir-Gider'e "${CASH_CATEGORY[claim.type]}" gideri olarak eklendi.` });
});

// Yanlış girilen ödemeyi geri alır: gelir-gider kaydı silinir, talep yeniden "ödeme bekliyor" olur
const undoPayment = async (model, record, sourceRef) => {
  const entry = await prisma.cashEntry.findFirst({ where: { sourceRef } });
  await prisma.$transaction(async (tx) => {
    const done = await tx[model].updateMany({
      where: { id: record.id, paidAt: { not: null } },
      data: { paidAt: null, paidById: null, paidByName: null, paymentMethod: null, cashEntryId: null, ...(model === 'staffTarget' && { paidAmount: null }) }
    });
    if (done.count === 0) throw new HrError('Bu kayıt ödenmemiş.', 409);
    await tx.cashEntry.deleteMany({ where: { sourceRef } });
  });
  if (entry?.storedName) await removeFile(CASH_DOC_DIR, entry.storedName);
};

export const unpayClaim = handle('Ödeme geri alınamadı.', async (req, res) => {
  const claim = await prisma.staffClaim.findFirst({ where: { id: id(req.params.id) } });
  if (!claim) throw new HrError('Talep bulunamadı.', 404);
  await undoPayment('staffClaim', claim, `STAFF_CLAIM:${claim.id}`);
  res.json({ message: 'Ödeme geri alındı; gelir-gider kaydı silindi.' });
});

// Fiş / fatura: talebin sahibi ve Personel / Finans yetkilileri indirir
export const claimFile = handle('Belge alınamadı.', async (req, res) => {
  const claim = await prisma.staffClaim.findFirst({ where: { id: id(req.params.id) }, include: { employee: { select: { userId: true } } } });
  const allowed = claim && (claim.employee.userId === req.user.id || canManage(req.user) || canPay(req.user));
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

const TARGET_INCLUDE = { employee: { select: { id: true, name: true, department: true, title: true, userId: true, user: { select: { role: true } } } } };

const parseTarget = (body, current = {}) => {
  const targetAmount = body.targetAmount !== undefined ? amountOf(body.targetAmount) : current.targetAmount;
  const bonusRate = body.bonusRate !== undefined ? amountOf(body.bonusRate) : current.bonusRate;
  const basis = body.basis !== undefined ? body.basis : current.basis || 'SALES';
  if (!(targetAmount > 0) || targetAmount >= 1e10) throw new HrError('Hedef tutarı sıfırdan büyük olmalı.');
  if (!(bonusRate > 0) || bonusRate > 50) throw new HrError('Prim oranı %0 ile %50 arasında olmalı.');
  if (!BASES[basis]) throw new HrError('Primin satışa mı tahsilata mı bağlı olduğunu seçin.');
  return { targetAmount, bonusRate, basis };
};

export const listTargets = handle('Hedefler alınamadı.', async (req, res) => {
  const where = req.query.employeeId ? { employeeId: id(req.query.employeeId) } : { period: req.query.period ? parsePeriod(req.query.period) : currentPeriod() };
  const rows = await prisma.staffTarget.findMany({ where, include: TARGET_INCLUDE, orderBy: [{ period: 'desc' }, { employee: { name: 'asc' } }] });
  res.json(await Promise.all(rows.map(presentTarget)));
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
  if (!employee.userId) throw new HrError('Satış hedefi için personel kartının bir kullanıcı hesabına (plasiyer / yönetici) bağlı olması gerekir.');
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
  const { method, date } = paymentOf(req.body);
  const t = await prisma.staffTarget.findFirst({ where: { id: id(req.params.id) }, include: TARGET_INCLUDE });
  if (!t) throw new HrError('Hedef bulunamadı.', 404);
  if (t.paidAt) throw new HrError('Bu prim zaten ödendi.', 409);
  if (t.status !== 'CLOSED') throw new HrError('Prim, dönem kapatıldıktan sonra ödenir.');
  if (!(t.bonusAmount > 0)) throw new HrError('Bu dönem için ödenecek prim yok.');
  try {
    await prisma.$transaction(async (tx) => {
      const entry = await tx.cashEntry.create({
        data: {
          type: 'OUT', category: CASH_CATEGORY.BONUS, amount: t.bonusAmount, date, method, vatRate: 0,
          description: `${t.employee.name}: ${t.period} satış primi (%${t.bonusRate})`, sourceRef: `STAFF_BONUS:${t.id}`, createdByName: req.user.name
        }
      });
      const done = await tx.staffTarget.updateMany({
        where: { id: t.id, status: 'CLOSED', paidAt: null },
        data: { paidAmount: t.bonusAmount, paidAt: new Date(), paidById: req.user.id, paidByName: req.user.name, paymentMethod: method, cashEntryId: entry.id }
      });
      if (done.count === 0) throw new HrError('Bu prim zaten ödendi.', 409);
    });
  } catch (error) {
    if (error?.code === 'P2002') throw new HrError('Bu prim zaten ödendi.', 409);
    throw error;
  }
  safeNotify(checkBudgets());
  if (t.employee.userId) {
    safeNotify(notifyUser(t.employee.userId, { type: 'HR', title: 'Priminiz ödendi', message: `${t.period} satış primi ${tl(t.bonusAmount)} ödendi.`, link: selfLink(t.employee.user?.role) }));
  }
  res.json({ message: `Prim ödemesi kaydedildi; Gelir-Gider'e "${CASH_CATEGORY.BONUS}" gideri olarak eklendi.` });
});

export const unpayTarget = handle('Prim ödemesi geri alınamadı.', async (req, res) => {
  const t = await prisma.staffTarget.findFirst({ where: { id: id(req.params.id) } });
  if (!t) throw new HrError('Hedef bulunamadı.', 404);
  await undoPayment('staffTarget', t, `STAFF_BONUS:${t.id}`);
  res.json({ message: 'Prim ödemesi geri alındı; gelir-gider kaydı silindi.' });
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
