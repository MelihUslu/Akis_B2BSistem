import fs from 'fs/promises';
import path from 'path';
import { workbookBuffer } from '../utils/xlsxStream.js';
import prisma, { currentTenantId } from '../utils/prisma.js';
import { localDay, localMonth } from '../utils/dates.js';
import { CASH_DOC_DIR, CASH_DOC_TYPES } from '../middlewares/upload.js';
import { getExchangeRates } from '../services/exchangeRateService.js';
import { notifyAdmins, safeNotify } from '../services/notificationService.js';
import { loadOpenMoves } from '../services/partnerLedgerService.js';

/**
 * Gelir-gider: elle girilen giderler (kira, maaş, fatura…) ve satış dışı gelirler.
 * Özet nakit bazlıdır: carilerden yapılan tahsilatlar gelire, tedarikçilere yapılan ödemeler gidere
 * otomatik eklenir (yalnızca okunur; ayrıca girilmez, çift sayılmaz).
 * Aylık ya da yıllık görünüm, önceki döneme göre karşılaştırma, kategori bütçeleri, düzenli kayıtlar, fiş / fatura eki.
 */

export const CATEGORIES = {
  OUT: ['Kira', 'Maaş / SGK', 'Elektrik, su, doğalgaz', 'İnternet, telefon', 'Yakıt / araç', 'Kargo / nakliye', 'Vergi / harç', 'Banka masrafı', 'Ofis / kırtasiye', 'Yemek', 'Bakım / onarım', 'Reklam', 'Diğer'],
  IN: ['Faiz geliri', 'Kira geliri', 'Hurda / ikinci el satış', 'Diğer']
};
const SUPPLIER = 'Tedarikçi ödemeleri';
const METHODS = ['CASH', 'BANK', 'CARD'];
const METHOD_TR = { CASH: 'Nakit', BANK: 'Banka', CARD: 'Kart' };
const VAT_RATES = [0, 1, 10, 20];
const BUDGET_KEY = 'cash_budgets';
const MAX_ENTRIES = 3000;

class CashError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const round2 = (n) => Math.round(n * 100) / 100;
const vatOf = (amount, rate) => (rate > 0 ? round2(amount - amount / (1 + rate / 100)) : 0);
// "15.000,50" / "15000,50" / "15000.50" → 15000.5
const parseAmount = (v) => {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};
const ym = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`; // m: 0–11

const fail = (res, error, fallback) => {
  if (error instanceof CashError) return res.status(error.status).json({ message: error.message });
  console.error(fallback, error);
  res.status(500).json({ message: fallback });
};

// ─── Dönem ───────────────────────────────────────────────────────────────────

// Aylık (month=YYYY-MM) ya da yıllık (year=YYYY) dönem; tarihler firmanın saat diliminde
const periodOf = (q) => {
  if (q.period === 'year') {
    const y = parseInt(q.year || localMonth().slice(0, 4));
    if (!(y >= 2000 && y <= 2100)) throw new CashError('Geçersiz yıl.');
    return { period: 'year', key: String(y), from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), prevFrom: new Date(y - 1, 0, 1), trendFrom: new Date(y, 0, 1) };
  }
  const [y, m] = String(q.month || localMonth()).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new CashError('Geçersiz ay.');
  return { period: 'month', key: ym(y, m - 1), from: new Date(y, m - 1, 1), to: new Date(y, m, 1), prevFrom: new Date(y, m - 2, 1), trendFrom: new Date(y, m - 12, 1) };
};

// ─── Kayıt doğrulama ─────────────────────────────────────────────────────────

const parseFields = (body) => {
  const type = body.type === 'IN' ? 'IN' : body.type === 'OUT' ? 'OUT' : null;
  if (!type) throw new CashError('Gelir mi gider mi seçin.');
  const category = String(body.category || '').trim().slice(0, 60);
  if (!category) throw new CashError('Kategori seçin.');
  if (category === SUPPLIER) throw new CashError(`"${SUPPLIER}" cari hesaplardan otomatik gelir; başka bir kategori seçin.`);
  const amount = round2(parseAmount(body.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) throw new CashError('Geçerli bir tutar girin.');
  const vatRate = VAT_RATES.includes(Number(body.vatRate)) ? Number(body.vatRate) : 0;
  const method = METHODS.includes(body.method) ? body.method : null;
  const description = String(body.description || '').trim().slice(0, 500) || null;
  return { type, category, amount, vatRate, method, description };
};

const parseEntry = (body) => {
  const date = body.date ? new Date(`${String(body.date).slice(0, 10)}T12:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) throw new CashError('Geçerli bir tarih girin.');
  return { ...parseFields(body), date };
};

const parseDay = (v) => {
  const d = parseInt(v);
  if (!(d >= 1 && d <= 28)) throw new CashError('Ayın günü 1 ile 28 arasında olmalı (her ayda olan bir gün).');
  return d;
};

// ─── Veriyi topla ────────────────────────────────────────────────────────────

// Carilerden tahsilat ve tedarikçi ödemeleri (TL karşılığı) — cari kayıtları yalnızca okunur
const partnerFlows = async (from, to) => {
  const payments = await prisma.payment.findMany({
    where: { status: 'COMPLETED', paymentDate: { gte: from, lt: to } },
    select: { amount: true, currency: true, rate: true, direction: true, paymentDate: true }
  });
  return payments.map((p) => ({ type: p.direction === 'OUT' ? 'OUT' : 'IN', amount: p.currency === 'TRY' ? p.amount : p.amount * (p.rate || 1), date: p.paymentDate, vatRate: 0 }));
};

const summarize = (entries, flows) => {
  const sum = (list, type) => round2(list.filter((e) => e.type === type).reduce((s, e) => s + e.amount, 0));
  const collections = sum(flows, 'IN');
  const supplierPayments = sum(flows, 'OUT');
  const otherIncome = sum(entries, 'IN');
  const expenses = sum(entries, 'OUT');
  const income = round2(collections + otherIncome);
  const expense = round2(supplierPayments + expenses);
  const vat = (type) => round2(entries.filter((e) => e.type === type).reduce((s, e) => s + vatOf(e.amount, e.vatRate), 0));
  return { income, expense, net: round2(income - expense), collections, otherIncome, supplierPayments, expenses, vat: { input: vat('OUT'), output: vat('IN') } };
};

const loadBudgets = async () => {
  const row = await prisma.setting.findFirst({ where: { key: BUDGET_KEY } });
  try {
    const parsed = JSON.parse(row?.value || '{}');
    return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k && Number(v) > 0).map(([k, v]) => [k, round2(Number(v))]));
  } catch {
    return {};
  }
};

// Düzenli kaydın bir sonraki tarihi (bu ayınki oluşturulduysa gelecek ay)
const nextRun = (r, now = new Date()) => {
  const cur = localMonth(now);
  const [y, m] = cur.split('-').map(Number);
  const done = r.lastRunMonth && r.lastRunMonth >= cur;
  return new Date(y, m - 1 + (done ? 1 : 0), r.dayOfMonth, 12);
};

const publicEntry = ({ storedName, mimeType, ...e }) => ({ ...e, hasFile: Boolean(storedName) }); // eslint-disable-line no-unused-vars

const loadPeriod = async (q) => {
  const p = periodOf(q);
  const start = p.prevFrom < p.trendFrom ? p.prevFrom : p.trendFrom;
  const [all, flows, budgets, recurring] = await Promise.all([
    prisma.cashEntry.findMany({ where: { date: { gte: start, lt: p.to } }, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
    partnerFlows(start, p.to),
    loadBudgets(),
    prisma.cashRecurring.findMany({ orderBy: [{ isActive: 'desc' }, { dayOfMonth: 'asc' }] })
  ]);
  const within = (from, to) => (x) => x.date >= from && x.date < to;
  const cur = within(p.from, p.to);
  // Süren dönem önceki dönemin aynı süresiyle karşılaştırılır (ör. 1–3 Kasım ↔ 1–3 Ekim); biten dönem tamamıyla
  const nowTs = Date.now();
  const partial = nowTs < p.to.getTime();
  const prevTo = partial ? new Date(Math.min(p.from.getTime(), p.prevFrom.getTime() + (nowTs - p.from.getTime()))) : p.from;
  const prev = within(p.prevFrom, prevTo);
  const entries = all.filter(cur);
  const periodFlows = flows.filter(cur);

  // Kategoriler: giderler + tedarikçi ödemeleri; bütçe aylık, yıllık görünümde ×12
  const factor = p.period === 'year' ? 12 : 1;
  const byCategory = new Map(Object.keys(budgets).map((c) => [c, 0]));
  for (const e of entries.filter((x) => x.type === 'OUT')) byCategory.set(e.category, (byCategory.get(e.category) || 0) + e.amount);
  const supplier = periodFlows.filter((f) => f.type === 'OUT').reduce((s, f) => s + f.amount, 0);
  if (supplier > 0) byCategory.set(SUPPLIER, supplier);
  const categories = [...byCategory].map(([category, amount]) => ({ category, amount: round2(amount), budget: budgets[category] ? round2(budgets[category] * factor) : null }))
    .sort((a, b) => b.amount - a.amount || (b.budget || 0) - (a.budget || 0));

  // 12 aylık eğilim (aylıkta seçilen aya kadar, yıllıkta o yılın ayları)
  const trend = [];
  for (let i = 0; i < 12; i++) {
    const from = new Date(p.trendFrom.getFullYear(), p.trendFrom.getMonth() + i, 1);
    const to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const s = summarize(all.filter(within(from, to)), flows.filter(within(from, to)));
    trend.push({ key: ym(from.getFullYear(), from.getMonth()), income: s.income, expense: s.expense, net: s.net });
  }

  // Dönem içi nakit akışı: aylıkta gün gün, yıllıkta ay ay; birikimli net (bugünden sonrası boş)
  const now = new Date();
  const flow = [];
  let running = 0;
  const buckets = p.period === 'year' ? 12 : new Date(p.from.getFullYear(), p.from.getMonth() + 1, 0).getDate();
  for (let i = 0; i < buckets; i++) {
    const from = p.period === 'year' ? new Date(p.from.getFullYear(), i, 1) : new Date(p.from.getFullYear(), p.from.getMonth(), i + 1);
    const to = p.period === 'year' ? new Date(p.from.getFullYear(), i + 1, 1) : new Date(p.from.getFullYear(), p.from.getMonth(), i + 2);
    if (from > now) { flow.push({ key: p.period === 'year' ? ym(from.getFullYear(), i) : localDay(from), income: null, expense: null, cumulative: null }); continue; }
    const s = summarize(entries.filter(within(from, to)), periodFlows.filter(within(from, to)));
    running = round2(running + s.net);
    flow.push({ key: p.period === 'year' ? ym(from.getFullYear(), i) : localDay(from), income: s.income, expense: s.expense, cumulative: running });
  }

  return {
    period: p.period,
    key: p.key,
    summary: summarize(entries, periodFlows),
    previous: { ...summarize(all.filter(prev), flows.filter(prev)), partial },
    categories,
    trend,
    flow,
    budgets,
    recurring: recurring.map((r) => ({ ...r, nextDate: r.isActive ? nextRun(r, now) : null })),
    entries: entries.slice(0, MAX_ENTRIES).map(publicEntry),
    truncated: entries.length > MAX_ENTRIES
  };
};

// ─── Uçlar ───────────────────────────────────────────────────────────────────

export const listCash = async (req, res) => {
  try {
    // Kategori önerileri: hazır liste + firmanın daha önce kullandıkları
    const used = await prisma.cashEntry.groupBy({ by: ['type', 'category'] });
    const suggestions = Object.fromEntries(['IN', 'OUT'].map((t) => [t, [...new Set([...CATEGORIES[t].filter((c) => c !== 'Diğer'), ...used.filter((u) => u.type === t).map((u) => u.category), 'Diğer'])]]));
    res.json({ ...(await loadPeriod(req.query)), suggestions });
  } catch (error) {
    fail(res, error, 'Gelir-gider kayıtları yüklenemedi.');
  }
};

export const createCash = async (req, res) => {
  try {
    const data = parseEntry(req.body);
    const entry = await prisma.$transaction(async (tx) => {
      // "Her ay tekrarla": bu kayıt ilk ay sayılır, sonraki aylar otomatik oluşur
      let recurringId = null;
      if (req.body.repeat) {
        const { date, ...fields } = data;
        const rule = await tx.cashRecurring.create({
          data: { ...fields, dayOfMonth: Math.min(28, parseInt(localDay(date).slice(8, 10))), lastRunMonth: localMonth(date), createdByName: req.user.name || null }
        });
        recurringId = rule.id;
      }
      return tx.cashEntry.create({ data: { ...data, recurringId, createdByName: req.user.name || null } });
    });
    if (entry.type === 'OUT') safeNotify(checkBudgets());
    res.locals.auditEntityId = entry.id;
    res.status(201).json({ message: `${entry.type === 'IN' ? 'Gelir' : 'Gider'} kaydedildi.${entry.recurringId ? ' Her ay otomatik eklenecek.' : ''}`, entry: publicEntry(entry) });
  } catch (error) {
    fail(res, error, 'Kayıt eklenemedi.');
  }
};

export const updateCash = async (req, res) => {
  try {
    const id = parseInt(req.params.id) || 0;
    await assertEditable(id);
    const updated = await prisma.cashEntry.updateMany({ where: { id, sourceRef: null }, data: parseEntry(req.body) });
    if (updated.count === 0) throw new CashError('Kayıt bulunamadı.', 404);
    safeNotify(checkBudgets());
    res.locals.auditEntityId = id;
    res.json({ message: 'Kayıt güncellendi.' });
  } catch (error) {
    fail(res, error, 'Kayıt güncellenemedi.');
  }
};

const removeFile = (storedName) => (storedName ? fs.unlink(path.join(CASH_DOC_DIR, storedName)).catch(() => {}) : null);

// Personel ödemesinden (masraf, avans, prim) oluşan kayıt ödemeyle birlikte Personel Yönetimi'nden geri alınır;
// burada değiştirilirse ya da silinirse talep "ödendi" görünmeye devam eder ve ödeme tekrar kaydedilebilirdi
const LINKED = 'Bu kayıt personel ödemesinden oluştu; değiştirmek için Personel Yönetimi\'nden ödemeyi geri alın.';
const assertEditable = async (id) => {
  const entry = await prisma.cashEntry.findFirst({ where: { id }, select: { sourceRef: true } });
  if (entry?.sourceRef) throw new CashError(LINKED, 409);
};

export const deleteCash = async (req, res) => {
  const entry = await prisma.cashEntry.findFirst({ where: { id: parseInt(req.params.id) || 0 } });
  if (!entry) return res.status(404).json({ message: 'Kayıt bulunamadı.' });
  if (entry.sourceRef) return res.status(409).json({ message: LINKED });
  await prisma.cashEntry.delete({ where: { id: entry.id } });
  await removeFile(entry.storedName);
  res.locals.auditEntityId = entry.id;
  res.json({ message: 'Kayıt silindi.' });
};

// ─── Fiş / fatura ────────────────────────────────────────────────────────────

export const uploadCashFile = async (req, res) => {
  try {
    if (!req.file) throw new CashError('Dosya seçin.');
    const entry = await prisma.cashEntry.findFirst({ where: { id: parseInt(req.params.id) || 0 } });
    if (!entry || entry.sourceRef) {
      await fs.unlink(req.file.path).catch(() => {});
      throw entry ? new CashError(LINKED, 409) : new CashError('Kayıt bulunamadı.', 404);
    }
    await prisma.cashEntry.update({
      where: { id: entry.id },
      data: { fileName: req.file.originalname.slice(0, 120), storedName: req.file.filename, mimeType: CASH_DOC_TYPES[path.extname(req.file.filename).toLowerCase()] }
    });
    await removeFile(entry.storedName); // eski belge
    res.locals.auditEntityId = entry.id;
    res.status(201).json({ message: 'Belge eklendi.' });
  } catch (error) {
    fail(res, error, 'Belge yüklenemedi.');
  }
};

export const downloadCashFile = async (req, res) => {
  const entry = await prisma.cashEntry.findFirst({ where: { id: parseInt(req.params.id) || 0 } });
  if (!entry?.storedName) return res.status(404).json({ message: 'Belge bulunamadı.' });
  const file = path.resolve(CASH_DOC_DIR, entry.storedName);
  if (!file.startsWith(path.resolve(CASH_DOC_DIR)) || !entry.storedName.startsWith(`t${currentTenantId()}-`)) return res.status(404).end();
  res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(file, entry.fileName || entry.storedName, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Dosya bulunamadı.' });
  });
};

export const deleteCashFile = async (req, res) => {
  const entry = await prisma.cashEntry.findFirst({ where: { id: parseInt(req.params.id) || 0 } });
  if (!entry?.storedName) return res.status(404).json({ message: 'Belge bulunamadı.' });
  if (entry.sourceRef) return res.status(409).json({ message: LINKED });
  await prisma.cashEntry.update({ where: { id: entry.id }, data: { fileName: null, storedName: null, mimeType: null } });
  await removeFile(entry.storedName);
  res.json({ message: 'Belge kaldırıldı.' });
};

// ─── Bütçeler ────────────────────────────────────────────────────────────────

export const saveBudgets = async (req, res) => {
  try {
    const input = req.body?.budgets && typeof req.body.budgets === 'object' ? req.body.budgets : {};
    const budgets = {};
    for (const [k, v] of Object.entries(input).slice(0, 50)) {
      const category = String(k).trim().slice(0, 60);
      const amount = round2(parseAmount(v));
      if (!category || !amount) continue;
      if (!Number.isFinite(amount) || amount < 0 || amount >= 1e10) throw new CashError(`${category}: geçerli bir tutar girin.`);
      budgets[category] = amount;
    }
    await prisma.setting.upsert({
      where: { tenantId_key: { tenantId: currentTenantId(), key: BUDGET_KEY } },
      update: { value: JSON.stringify(budgets) },
      create: { key: BUDGET_KEY, value: JSON.stringify(budgets) }
    });
    safeNotify(checkBudgets());
    res.json({ message: Object.keys(budgets).length ? `${Object.keys(budgets).length} kategori için aylık bütçe kaydedildi.` : 'Bütçeler kaldırıldı.', budgets });
  } catch (error) {
    fail(res, error, 'Bütçe kaydedilemedi.');
  }
};

// ─── Düzenli gelir / gider ───────────────────────────────────────────────────

/**
 * Zamanı gelen düzenli kayıtları oluşturur (saatlik zamanlanmış iş ve kural eklenince).
 * Her ay bir kez: lastRunMonth koşullu güncellenir, iki çalışma aynı ayı iki kez yazamaz.
 */
export const runRecurringCash = async (now = new Date(), onlyId = null) => {
  const cur = localMonth(now);
  const today = parseInt(localDay(now).slice(8, 10));
  const [y, m] = cur.split('-').map(Number);
  const rules = await prisma.cashRecurring.findMany({
    where: { isActive: true, dayOfMonth: { lte: today }, OR: [{ lastRunMonth: null }, { lastRunMonth: { lt: cur } }], ...(onlyId && { id: onlyId }) }
  });
  let created = 0;
  for (const r of rules) {
    const claimed = await prisma.cashRecurring.updateMany({ where: { id: r.id, OR: [{ lastRunMonth: null }, { lastRunMonth: { lt: cur } }] }, data: { lastRunMonth: cur } });
    if (!claimed.count) continue;
    await prisma.cashEntry.create({
      data: { type: r.type, category: r.category, amount: r.amount, vatRate: r.vatRate, method: r.method, description: r.description, date: new Date(y, m - 1, r.dayOfMonth, 12), recurringId: r.id, createdByName: 'Düzenli kayıt' }
    });
    created++;
  }
  return created;
};

export const createRecurring = async (req, res) => {
  try {
    const fields = parseFields(req.body);
    const dayOfMonth = parseDay(req.body.dayOfMonth);
    const cur = localMonth();
    // Bu ayın günü geçtiyse: "bu ayınkini de ekle" seçilmediyse ilk kayıt gelecek ay
    const rule = await prisma.cashRecurring.create({
      data: { ...fields, dayOfMonth, lastRunMonth: req.body.includeThisMonth === false ? cur : null, createdByName: req.user.name || null }
    });
    const created = await runRecurringCash(new Date(), rule.id);
    res.locals.auditEntityId = rule.id;
    res.status(201).json({ message: `Düzenli ${rule.type === 'IN' ? 'gelir' : 'gider'} eklendi: her ayın ${dayOfMonth}. günü.${created ? ' Bu ayın kaydı da oluşturuldu.' : ''}`, recurring: rule });
  } catch (error) {
    fail(res, error, 'Düzenli kayıt eklenemedi.');
  }
};

export const updateRecurring = async (req, res) => {
  try {
    const id = parseInt(req.params.id) || 0;
    const data = 'isActive' in req.body && Object.keys(req.body).length === 1
      ? { isActive: Boolean(req.body.isActive) }
      : { ...parseFields(req.body), dayOfMonth: parseDay(req.body.dayOfMonth), ...('isActive' in req.body && { isActive: Boolean(req.body.isActive) }) };
    const updated = await prisma.cashRecurring.updateMany({ where: { id }, data });
    if (updated.count === 0) throw new CashError('Düzenli kayıt bulunamadı.', 404);
    res.locals.auditEntityId = id;
    res.json({ message: data.isActive === false ? 'Düzenli kayıt durduruldu.' : 'Düzenli kayıt güncellendi.' });
  } catch (error) {
    fail(res, error, 'Düzenli kayıt güncellenemedi.');
  }
};

// Kural silinir; daha önce oluşturduğu kayıtlar kalır
export const deleteRecurring = async (req, res) => {
  const deleted = await prisma.cashRecurring.deleteMany({ where: { id: parseInt(req.params.id) || 0 } });
  if (deleted.count === 0) return res.status(404).json({ message: 'Düzenli kayıt bulunamadı.' });
  res.json({ message: 'Düzenli kayıt silindi. Geçmiş kayıtlar duruyor.' });
};

// ─── Bütçe bildirimi ─────────────────────────────────────────────────────────

/**
 * Bu ayın kategori bütçeleri: %90'a gelince ve aşılınca Finans yetkililerine bildirim (her eşik ayda bir kez).
 * Gider kaydı / bütçe değişince ve saatlik işte (düzenli kayıtlardan sonra) çalışır.
 */
export const checkBudgets = async (now = new Date()) => {
  const budgets = await loadBudgets();
  const names = Object.keys(budgets);
  if (!names.length) return 0;
  const month = localMonth(now);
  const [y, m] = month.split('-').map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  const rows = await prisma.cashEntry.groupBy({ by: ['category'], where: { type: 'OUT', category: { in: names }, date: { gte: from, lt: to } }, _sum: { amount: true } });
  const spent = Object.fromEntries(rows.map((r) => [r.category, r._sum.amount || 0]));
  if (budgets[SUPPLIER]) spent[SUPPLIER] = (await partnerFlows(from, to)).filter((f) => f.type === 'OUT').reduce((t, f) => t + f.amount, 0);
  const tl = (n) => `₺${round2(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let sent = 0;
  for (const category of names) {
    const used = spent[category] || 0;
    const pct = (used / budgets[category]) * 100;
    if (pct < 90) continue;
    const over = pct > 100;
    await notifyAdmins({
      type: 'BUDGET',
      title: over ? `${category} bütçesi aşıldı` : `${category} bütçesinin %${Math.floor(pct)}'i kullanıldı`,
      message: over
        ? `Bu ay ${tl(used)} harcandı; aylık bütçe ${tl(budgets[category])} (${tl(used - budgets[category])} fazla).`
        : `Bu ay ${tl(used)} harcandı; aylık bütçe ${tl(budgets[category])}, kalan ${tl(budgets[category] - used)}.`,
      link: '/admin/cash',
      dedupeKey: `cash-budget:${month}:${category}:${over ? 'over' : 'near'}`
    });
    sent++;
  }
  return sent;
};

// ─── Önümüzdeki 30 günün nakit tahmini ───────────────────────────────────────

const HORIZON = 30;

/**
 * Açık kalemler (cari yaşlandırmadaki kural: ödemeler en eski borcu kapatır). Cari kayıtları yalnızca okunur.
 * receivable: bayi / müşteri borçları (bize ödeyecekleri), payable: tedarikçi alacakları (bizim ödeyeceğimiz).
 */
const openItems = async (side) => {
  const receivable = side === 'receivable';
  const companies = await prisma.company.findMany({
    where: receivable ? { kind: { in: ['DEALER', 'CUSTOMER'] }, currentBalance: { lt: 0 } } : { kind: 'SUPPLIER', currentBalance: { gt: 0 } },
    select: { id: true, name: true, currentBalance: true, paymentTermDays: true, currency: true }
  });
  if (!companies.length) return [];
  const moves = await loadOpenMoves(companies.map((c) => c.id), { type: receivable ? 'DEBT' : 'CREDIT', excludeSources: ['REVERSAL', 'PAYMENT'], cover: companies.map((c) => Math.abs(c.currentBalance)) });
  const byCompany = new Map();
  for (const t of moves) {
    if (!byCompany.has(t.companyId)) byCompany.set(t.companyId, []);
    byCompany.get(t.companyId).push(t);
  }
  const items = [];
  for (const c of companies) {
    let remaining = round2(Math.abs(c.currentBalance));
    for (const t of byCompany.get(c.id) || []) { // en yeni → en eski
      if (remaining <= 0) break;
      const part = Math.min(remaining, t.amount);
      remaining = round2(remaining - part);
      const due = t.order?.dueDate ? new Date(t.order.dueDate) : new Date(new Date(t.date).getTime() + (c.paymentTermDays || 0) * 864e5);
      items.push({ companyId: c.id, name: c.name, currency: c.currency, amount: part, due });
    }
    if (remaining > 0) items.push({ companyId: c.id, name: c.name, currency: c.currency, amount: remaining, due: null }); // açılış / devir
  }
  return items;
};

export const cashForecast = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + HORIZON + 1);
    const rates = (await getExchangeRates()).rates || {};
    const toTRY = (amount, currency) => (currency === 'TRY' || !currency ? amount : rates[currency] ? amount * rates[currency] : null);

    const [receivables, payables, checks, rules] = await Promise.all([
      openItems('receivable'),
      openItems('payable'),
      prisma.payment.findMany({
        where: { status: 'COMPLETED', method: { in: ['CHECK', 'NOTE'] }, dueDate: { gte: today, lt: end } },
        select: { id: true, amount: true, currency: true, rate: true, direction: true, method: true, dueDate: true, bankName: true, company: { select: { name: true } } }
      }),
      prisma.cashRecurring.findMany({ where: { isActive: true } })
    ]);

    const items = [];
    const overdue = { receivable: 0, payable: 0 };
    const addOpen = (list, type, source) => {
      // Aynı carinin aynı gün vadeli kalemleri tek satır
      const grouped = new Map();
      for (const it of list) {
        const amount = toTRY(it.amount, it.currency);
        if (amount == null || !it.due) continue;
        if (it.due < today) { overdue[source === 'RECEIVABLE' ? 'receivable' : 'payable'] += amount; continue; }
        if (it.due >= end) continue;
        const day = localDay(it.due);
        const key = `${it.companyId}:${day}`;
        const g = grouped.get(key) || { date: new Date(`${day}T12:00:00`), type, source, label: it.name, amount: 0 };
        g.amount += amount;
        grouped.set(key, g);
      }
      items.push(...grouped.values());
    };
    addOpen(receivables, 'IN', 'RECEIVABLE');
    addOpen(payables, 'OUT', 'PAYABLE');
    for (const c of checks) {
      items.push({ date: c.dueDate, type: c.direction === 'OUT' ? 'OUT' : 'IN', source: c.method === 'NOTE' ? 'NOTE' : 'CHECK', label: [c.company?.name, c.bankName].filter(Boolean).join(' · ') || (c.method === 'NOTE' ? 'Senet' : 'Çek'), amount: c.currency === 'TRY' ? c.amount : c.amount * (c.rate || 1) });
    }
    for (const r of rules) {
      for (let i = 0; i < 2; i++) { // bu ay ve gelecek ay
        const d = new Date(today.getFullYear(), today.getMonth() + i, r.dayOfMonth, 12);
        const monthKey = localMonth(d);
        if (d < today || d >= end || (r.lastRunMonth && r.lastRunMonth >= monthKey)) continue;
        items.push({ date: d, type: r.type, source: 'RECURRING', label: r.category, amount: r.amount });
      }
    }
    items.sort((a, b) => a.date - b.date || b.amount - a.amount);

    // Gün gün birikimli net (bugün = 0)
    const daily = [];
    let running = 0;
    for (let i = 0; i <= HORIZON; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const key = localDay(d);
      const dayItems = items.filter((x) => localDay(x.date) === key);
      const inflow = dayItems.filter((x) => x.type === 'IN').reduce((t, x) => t + x.amount, 0);
      const outflow = dayItems.filter((x) => x.type === 'OUT').reduce((t, x) => t + x.amount, 0);
      running += inflow - outflow;
      daily.push({ key, income: round2(inflow), expense: round2(outflow), cumulative: round2(running) });
    }
    const sum = (type, source) => round2(items.filter((x) => x.type === type && (!source || x.source === source)).reduce((t, x) => t + x.amount, 0));
    res.json({
      days: HORIZON,
      totals: {
        income: sum('IN'), expense: sum('OUT'), net: round2(sum('IN') - sum('OUT')),
        receivables: sum('IN', 'RECEIVABLE'), payables: sum('OUT', 'PAYABLE'),
        checksIn: round2(sum('IN', 'CHECK') + sum('IN', 'NOTE')), checksOut: round2(sum('OUT', 'CHECK') + sum('OUT', 'NOTE')),
        recurringIn: sum('IN', 'RECURRING'), recurringOut: sum('OUT', 'RECURRING')
      },
      overdue: { receivable: round2(overdue.receivable), payable: round2(overdue.payable) },
      daily,
      items: items.slice(0, 60).map((x) => ({ ...x, amount: round2(x.amount) }))
    });
  } catch (error) {
    fail(res, error, 'Nakit tahmini hesaplanamadı.');
  }
};

// ─── Excel ───────────────────────────────────────────────────────────────────

export const exportCash = async (req, res) => {
  try {
    const data = await loadPeriod(req.query);
    const s = data.summary;
    const sheets = [];
    const sheet = (rows, name, widths) => sheets.push({ name, rows, widths });
    sheet([
      { Kalem: 'Carilerden tahsilat', 'Tutar (TL)': s.collections },
      { Kalem: 'Diğer gelirler', 'Tutar (TL)': s.otherIncome },
      { Kalem: 'TOPLAM GELİR', 'Tutar (TL)': s.income },
      { Kalem: 'Tedarikçi ödemeleri', 'Tutar (TL)': s.supplierPayments },
      { Kalem: 'Giderler', 'Tutar (TL)': s.expenses },
      { Kalem: 'TOPLAM GİDER', 'Tutar (TL)': s.expense },
      { Kalem: 'NET', 'Tutar (TL)': s.net },
      { Kalem: 'Giderlerdeki KDV (indirilecek)', 'Tutar (TL)': s.vat.input },
      { Kalem: 'Diğer gelirlerdeki KDV (hesaplanan)', 'Tutar (TL)': s.vat.output }
    ], 'Özet', [34, 16]);
    sheet(data.categories.map((c) => ({ Kategori: c.category, 'Gider (TL)': c.amount, 'Bütçe (TL)': c.budget ?? '', 'Kullanım %': c.budget ? Math.round((c.amount / c.budget) * 100) : '' })), 'Kategoriler', [26, 14, 14, 12]);
    sheet(data.entries.map((e) => ({
      Tarih: localDay(e.date), Tür: e.type === 'IN' ? 'Gelir' : 'Gider', Kategori: e.category, 'Tutar (TL)': e.amount,
      'KDV %': e.vatRate, 'KDV (TL)': vatOf(e.amount, e.vatRate), Ödeme: METHOD_TR[e.method] || '', Açıklama: e.description || '',
      Düzenli: e.recurringId ? 'Evet' : '', Belge: e.hasFile ? 'Var' : '', Giren: e.createdByName || ''
    })), 'Kayıtlar', [12, 8, 24, 14, 7, 12, 10, 40, 8, 7, 18]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const buffer = await workbookBuffer(sheets);
    res.setHeader('Content-Disposition', `attachment; filename="gelir-gider-${data.key}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    fail(res, error, 'Excel oluşturulamadı.');
  }
};
