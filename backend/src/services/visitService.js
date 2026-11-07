/**
 * Plasiyer saha ziyareti. Plasiyer yalnızca sorumlu olduğu (Company.plasiyerId) aktif bayiler için ziyaret planlar ve
 * kaydeder. Gün, Türkiye saatine göre "YYYY-MM-DD" olarak alınır ve gün ortası (12:00) saklanır.
 */
import prisma from '../utils/prisma.js';
import { localDay } from '../utils/dates.js';

export const RESULTS = { ORDER: 'Sipariş alındı', PAYMENT: 'Tahsilat yapıldı', INFO: 'Bilgilendirme / tanıtım', NO_CONTACT: 'Görüşülemedi' };
export const VISIT_STATUS = { PLANNED: 'Planlı', DONE: 'Yapıldı', CANCELLED: 'İptal' };
export const STALE_DAYS = 30; // bu kadar gündür ziyaret edilmeyen bayi listede öne çıkar

export class VisitError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
export const dayAt = (v) => new Date(`${v}T12:00:00`);
const addDays = (day, n) => localDay(new Date(dayAt(day).getTime() + n * 864e5));
const text = (v, max) => String(v ?? '').trim().slice(0, max) || null;

/** Planlanacak gün: bugünden 1 yıl sonrasına kadar (geçmiş güne plan açılmaz) */
const plannedDay = (v) => {
  if (!isDay(v)) throw new VisitError('Ziyaret gününü seçin.');
  const today = localDay();
  if (v < today || v > addDays(today, 365)) throw new VisitError('Ziyaret günü bugünden bir yıl sonrasına kadar olabilir.');
  return dayAt(v);
};

// Konum isteğe bağlı; verilirse geçerli olmalı
const location = (b) => {
  if (b.lat == null && b.lng == null) return {};
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const accuracy = b.accuracy == null ? null : Number(b.accuracy);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180) || (accuracy !== null && !(accuracy >= 0))) throw new VisitError('Konum bilgisi geçersiz.');
  return { lat, lng, accuracy: accuracy === null ? null : Math.round(accuracy) };
};

const myDealer = async (userId, companyId) => {
  const company = await prisma.company.findFirst({ where: { id: parseInt(companyId) || 0, plasiyerId: userId, kind: 'DEALER', status: 'ACTIVE' } });
  if (!company) throw new VisitError('Bayi bulunamadı ya da size atanmamış.', 404);
  return company;
};

export const planVisit = async (user, body) => {
  const company = await myDealer(user.id, body.companyId);
  const plannedFor = plannedDay(body.plannedFor);
  const exists = await prisma.visit.findFirst({ where: { userId: user.id, companyId: company.id, status: 'PLANNED', plannedFor } });
  if (exists) throw new VisitError('Bu bayiye o gün için zaten ziyaret planlı.');
  return prisma.visit.create({ data: { userId: user.id, companyId: company.id, plannedFor, note: text(body.note, 500) } });
};

/**
 * Ziyaret kaydı: planlı ziyaret (visitId) yapıldı olarak işaretlenir ya da plansız ziyaret açılır.
 * nextVisitOn verilirse o gün için planlı ziyaret açılır.
 */
export const recordVisit = async (user, body) => {
  if (!RESULTS[body.result]) throw new VisitError('Ziyaretin sonucunu seçin.');
  const loc = location(body);
  const note = text(body.note, 500);
  let visit;
  if (body.visitId) {
    const planned = await prisma.visit.findFirst({ where: { id: parseInt(body.visitId) || 0, userId: user.id, status: 'PLANNED' } });
    if (!planned) throw new VisitError('Planlı ziyaret bulunamadı.', 404);
    await myDealer(user.id, planned.companyId);
    const done = await prisma.visit.updateMany({ where: { id: planned.id, status: 'PLANNED' }, data: { status: 'DONE', doneAt: new Date(), result: body.result, note: note || planned.note, ...loc } });
    if (done.count !== 1) throw new VisitError('Bu ziyaret zaten kaydedilmiş.', 409);
    visit = await prisma.visit.findUnique({ where: { id: planned.id } });
  } else {
    const company = await myDealer(user.id, body.companyId);
    visit = await prisma.visit.create({ data: { userId: user.id, companyId: company.id, status: 'DONE', doneAt: new Date(), result: body.result, note, ...loc } });
  }
  let next = null;
  if (body.nextVisitOn) next = await planVisit(user, { companyId: visit.companyId, plannedFor: body.nextVisitOn }).catch((e) => { if (e instanceof VisitError) return null; throw e; });
  return { visit, next };
};

export const cancelVisit = async (user, id) => {
  const done = await prisma.visit.updateMany({ where: { id, userId: user.id, status: 'PLANNED' }, data: { status: 'CANCELLED' } });
  if (done.count !== 1) throw new VisitError('Planlı ziyaret bulunamadı.', 404);
};

const visitInclude = { company: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } };
const view = (v) => ({ ...v, resultLabel: v.result ? RESULTS[v.result] : null, statusLabel: VISIT_STATUS[v.status] });

/** Plasiyerin ziyaretleri (varsayılan: 7 gün öncesi – 14 gün sonrası; planlılar plan gününe, yapılanlar yapıldığı güne göre) */
export const myVisits = async (user, { from, to } = {}) => {
  const today = localDay();
  const start = dayAt(isDay(from) ? from : addDays(today, -7));
  const end = new Date(dayAt(isDay(to) ? to : addDays(today, 14)).getTime() + 12 * 3600e3);
  start.setHours(start.getHours() - 12);
  const visits = await prisma.visit.findMany({
    where: { userId: user.id, OR: [{ status: 'PLANNED', plannedFor: { gte: start, lte: end } }, { status: 'DONE', doneAt: { gte: start, lte: end } }] },
    include: visitInclude, orderBy: [{ plannedFor: 'asc' }, { doneAt: 'desc' }]
  });
  return { today, visits: visits.map(view) };
};

/** Bayi başına son ziyaret ve sıradaki planlı ziyaret (plasiyer bayi listesi) */
export const visitStatsFor = async (companyIds) => {
  const [last, next] = await Promise.all([
    prisma.visit.groupBy({ by: ['companyId'], where: { companyId: { in: companyIds }, status: 'DONE' }, _max: { doneAt: true } }),
    prisma.visit.groupBy({ by: ['companyId'], where: { companyId: { in: companyIds }, status: 'PLANNED', plannedFor: { gte: dayAt(localDay()) } }, _min: { plannedFor: true } })
  ]);
  return {
    last: new Map(last.map((r) => [r.companyId, r._max.doneAt])),
    next: new Map(next.map((r) => [r.companyId, r._min.plannedFor]))
  };
};

/**
 * Yönetim raporu: ziyaretler (filtreli), plasiyer başına özet ve uzun süredir ziyaret edilmeyen bayiler.
 */
export const visitReport = async ({ userId, from, to } = {}) => {
  const today = localDay();
  const start = dayAt(isDay(from) ? from : addDays(today, -30));
  start.setHours(0, 0, 0, 0);
  const end = dayAt(isDay(to) ? to : today);
  end.setHours(23, 59, 59, 999);
  const who = parseInt(userId) || null;
  const [visits, plasiyers, dealers] = await Promise.all([
    prisma.visit.findMany({
      where: { ...(who && { userId: who }), OR: [{ status: 'DONE', doneAt: { gte: start, lte: end } }, { status: 'PLANNED', plannedFor: { gte: start, lte: end } }] },
      include: visitInclude, orderBy: [{ doneAt: 'desc' }, { plannedFor: 'desc' }], take: 1000
    }),
    prisma.user.findMany({ where: { role: 'PLASIYER' }, select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.company.findMany({ where: { kind: 'DEALER', status: 'ACTIVE', plasiyerId: who ? who : { not: null } }, select: { id: true, name: true, plasiyerId: true }, orderBy: { name: 'asc' } })
  ]);
  const { last } = await visitStatsFor(dealers.map((d) => d.id));
  const cutoff = Date.now() - STALE_DAYS * 864e5;
  const names = new Map(plasiyers.map((p) => [p.id, p.name]));
  const summary = plasiyers.filter((p) => !who || p.id === who).map((p) => {
    const mine = visits.filter((v) => v.userId === p.id);
    const done = mine.filter((v) => v.status === 'DONE');
    const own = dealers.filter((d) => d.plasiyerId === p.id);
    return {
      id: p.id, name: p.name, isActive: p.isActive, dealers: own.length,
      done: done.length, planned: mine.filter((v) => v.status === 'PLANNED').length,
      visitedDealers: new Set(done.map((v) => v.companyId)).size,
      byResult: Object.fromEntries(Object.keys(RESULTS).map((k) => [k, done.filter((v) => v.result === k).length]))
    };
  });
  const stale = dealers
    .map((d) => ({ id: d.id, name: d.name, plasiyer: names.get(d.plasiyerId) || null, lastVisitAt: last.get(d.id) || null }))
    .filter((d) => !d.lastVisitAt || d.lastVisitAt.getTime() < cutoff)
    .sort((a, b) => (a.lastVisitAt?.getTime() || 0) - (b.lastVisitAt?.getTime() || 0));
  return { from: localDay(start), to: localDay(end), staleDays: STALE_DAYS, plasiyers, summary, stale, visits: visits.map(view) };
};
