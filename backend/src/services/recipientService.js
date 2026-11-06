/**
 * Toplu SMS ve toplu e-postanın ortak alıcı listesi: bayiler, bayi olmayan müşteri carileri ve müşteri adayları.
 * Her satır cep telefonlarını (5XXXXXXXXX) ve e-posta adreslerini taşır. Sıra: bayi kullanıcıları (önce ana kullanıcı),
 * cari yetkili kişileri (önce birincil), carinin kendi telefonu / e-postası. Numara ve adresler her zaman kayıtlardan
 * çözülür (tarayıcıdan gelen değere güvenilmez).
 */
import prisma from '../utils/prisma.js';
import { normalizePhone } from './smsService.js';

export const SOURCES = { DEALER: 'Bayiler', CUSTOMER: 'Müşteriler', LEAD: 'Müşteri adayları' };
export const KEY_PREFIX = { DEALER: 'D', CUSTOMER: 'C', LEAD: 'L' };
export const MAX_ROWS = 5000;

const mobile = (v) => { try { return normalizePhone(v); } catch { return null; } };
export const emailOf = (v) => {
  const e = String(v ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
};
const uniq = (list) => [...new Set(list.filter(Boolean))];

const companyRows = async (kind, f = {}) => {
  const companies = await prisma.company.findMany({
    where: {
      kind,
      ...(kind === 'DEALER' ? { status: 'ACTIVE' } : { status: { not: 'PASSIVE' } }),
      ...(f.ids && { id: { in: f.ids } }),
      ...(f.q && { name: { contains: f.q, mode: 'insensitive' } }),
      ...(f.tag && { tags: { has: f.tag } }),
      ...(f.group && { dealerGroup: f.group }),
      ...(f.plasiyerId && { plasiyerId: f.plasiyerId }),
      ...(f.debtOnly && { currentBalance: { lt: 0 } })
    },
    select: {
      id: true, name: true, authorizedPerson: true, phone: true, email: true, tags: true, dealerGroup: true, currentBalance: true, currency: true,
      plasiyer: { select: { name: true } },
      users: { where: { role: 'BAYI', isActive: true }, select: { name: true, phone: true, email: true }, orderBy: [{ isOwner: 'desc' }, { id: 'asc' }] },
      contacts: { select: { name: true, phone: true, email: true }, orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] }
    },
    orderBy: { name: 'asc' },
    take: MAX_ROWS
  });
  const last = new Map((await prisma.order.groupBy({
    by: ['companyId'], where: { companyId: { in: companies.map((c) => c.id) }, status: { not: 'CANCELLED' } }, _max: { createdAt: true }
  })).map((r) => [r.companyId, r._max.createdAt]));
  const cutoff = f.noOrderDays ? Date.now() - f.noOrderDays * 864e5 : null;
  return companies
    .map((c) => ({
      key: `${KEY_PREFIX[kind]}:${c.id}`, source: kind, id: c.id, name: c.name,
      contact: c.users[0]?.name || c.contacts[0]?.name || c.authorizedPerson || '',
      phones: uniq([...c.users.map((u) => u.phone), ...c.contacts.map((x) => mobile(x.phone)), mobile(c.phone)]),
      emails: uniq([...c.users.map((u) => emailOf(u.email)), ...c.contacts.map((x) => emailOf(x.email)), emailOf(c.email)]),
      tags: c.tags, group: kind === 'DEALER' ? c.dealerGroup : null, plasiyer: c.plasiyer?.name || null,
      balance: c.currentBalance, currency: c.currency, lastOrderAt: last.get(c.id) || null
    }))
    .filter((r) => !cutoff || !r.lastOrderAt || r.lastOrderAt.getTime() < cutoff);
};

const leadRows = async (f = {}) => {
  const leads = await prisma.customerLead.findMany({
    where: {
      ...(f.ids && { id: { in: f.ids } }),
      ...(f.q && { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { phone: { contains: f.q } }, { email: { contains: f.q, mode: 'insensitive' } }] }),
      ...(f.status && { status: f.status }),
      ...(f.leadSource && { source: f.leadSource }),
      ...(f.city && { city: { contains: f.city, mode: 'insensitive' } })
    },
    select: { id: true, name: true, phone: true, email: true, city: true, source: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS
  });
  return leads.map((l) => ({
    key: `L:${l.id}`, source: 'LEAD', id: l.id, name: l.name || l.phone || l.email, contact: l.name,
    phones: uniq([mobile(l.phone)]), emails: uniq([emailOf(l.email)]),
    city: l.city, leadSource: l.source, status: l.status, createdAt: l.createdAt, balance: null
  }));
};

/** Seçim ekranı: kaynağa ve süzgeçlere göre adaylar (numarası / adresi olmayanlar da gelir, seçilemez) */
export const listRecipients = (source, filters) => (source === 'LEAD' ? leadRows(filters) : companyRows(source, filters));

/** "D:12", "C:5", "L:9" anahtarlarından satırlar (yalnızca hâlâ geçerli kayıtlar: pasif bayi vb. düşer) */
export const rowsByKeys = async (keys) => {
  const ids = { DEALER: [], CUSTOMER: [], LEAD: [] };
  const byPrefix = Object.fromEntries(Object.entries(KEY_PREFIX).map(([k, p]) => [p, k]));
  for (const key of keys) {
    const [p, id] = String(key).split(':');
    if (byPrefix[p] && Number.isInteger(+id)) ids[byPrefix[p]].push(+id);
  }
  return [
    ...(ids.DEALER.length ? await companyRows('DEALER', { ids: ids.DEALER }) : []),
    ...(ids.CUSTOMER.length ? await companyRows('CUSTOMER', { ids: ids.CUSTOMER }) : []),
    ...(ids.LEAD.length ? await leadRows({ ids: ids.LEAD }) : [])
  ];
};

/** Filtre sorgu parametreleri (iki ekran aynı süzgeçleri kullanır) */
export const filtersFromQuery = (q, { leadStatuses, leadSources }) => ({
  q: String(q.q || '').trim() || null, tag: q.tag || null, group: q.group || null,
  plasiyerId: parseInt(q.plasiyerId) || null, debtOnly: q.debtOnly === 'true', noOrderDays: parseInt(q.noOrderDays) || null,
  status: leadStatuses[q.status] ? q.status : null, leadSource: leadSources[q.leadSource] ? q.leadSource : null, city: String(q.city || '').trim() || null
});
