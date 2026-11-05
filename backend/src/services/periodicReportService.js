import { workbookBuffer } from '../utils/xlsxStream.js';
import prisma from '../utils/prisma.js';
import { buildSalesReport } from './reportService.js';
import { getExchangeRates, toTRY } from './exchangeRateService.js';
import { notifyAdmins, safeNotify } from './notificationService.js';

/**
 * Dönemsel müşteri takip raporu (haftalık / aylık).
 *
 * İçerik: dönem cirosu ve sipariş veren müşteri sayısı (önceki dönemle karşılaştırmalı), yeni müşteriler,
 * cari hareketler (yazılan borç, tahsilat, açık alacak), her müşterinin durumu ve öncelikli "aranacaklar" listesi.
 *
 * Müşteri durumu (sipariş alışkanlığına göre, raporun bitiş tarihi esas alınır):
 *   - Olağan aralık: son 12 aydaki siparişler arasındaki gün farklarının ortancası (en az 2 aralık yoksa 30 gün),
 *     7–120 gün arasına sınırlanır. Böylece haftada bir alan müşteri 3 hafta sessiz kalınca, ayda bir alan ancak
 *     1,5 ay sessiz kalınca uyarı verir.
 *   - Kaybedildi:   son siparişten bu yana geçen süre ≥ max(kayıp eşiği, 3 × olağan aralık)
 *   - Risk altında: geçen süre ≥ max(10 gün, 1,5 × olağan aralık)
 *   - Düşüşte:      son 90 günün alımı, önceki 90 güne göre %40'tan fazla düşmüş
 *   - Yeni:         ilk siparişi bu dönemde
 *   - Hiç sipariş vermedi: 14 günden eski hesap, hiç siparişi yok
 *   - Aktif:        diğerleri
 * Aranacaklar sırası: müşterinin son 12 aylık değeri (logaritmik) × gecikme oranı (geçen süre / olağan aralık, en çok 6)
 * × durum ağırlığı. Yani büyük ve alışkanlığından en çok sapmış müşteri en üstte.
 */

const DAY = 24 * 60 * 60 * 1000;
const TR_OFFSET = 3 * 60 * 60 * 1000; // Türkiye UTC+3 (yaz saati yok)
const r2 = (n) => Math.round(Number((n * 100).toPrecision(15))) / 100;
const KEY = 'periodic_report';
const SOLD = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED']; // satış sayılan siparişler (satış raporuyla aynı)

export const STATUS = {
  LOST: 'Kaybedildi', AT_RISK: 'Risk altında', DECLINING: 'Düşüşte', NEW: 'Yeni', ACTIVE: 'Aktif', NEVER: 'Hiç sipariş vermedi'
};
const WEIGHT = { AT_RISK: 1.2, DECLINING: 1, LOST: 0.8 };

// ─── Ayarlar ───────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  weekly: { enabled: true, weekday: 1, hour: 9 }, // Pazartesi 09:00, önceki 7 gün
  monthly: { enabled: true, day: 1, hour: 9 }, // Ayın 1'i 09:00, önceki ay
  lostDays: 60
};

const int = (v, min, max, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
export const normalizeSettings = (raw = {}) => ({
  weekly: { enabled: raw.weekly?.enabled ?? DEFAULT_SETTINGS.weekly.enabled, weekday: int(raw.weekly?.weekday, 1, 7, 1), hour: int(raw.weekly?.hour, 0, 23, 9) },
  monthly: { enabled: raw.monthly?.enabled ?? DEFAULT_SETTINGS.monthly.enabled, day: int(raw.monthly?.day, 1, 28, 1), hour: int(raw.monthly?.hour, 0, 23, 9) },
  lostDays: int(raw.lostDays, 14, 365, 60)
});

export const loadSettings = async () => {
  const row = await prisma.setting.findFirst({ where: { key: KEY } });
  try { return normalizeSettings(row ? JSON.parse(row.value) : {}); } catch { return normalizeSettings(); }
};
export const saveSettings = async (tenantId, raw) => {
  const settings = normalizeSettings({ ...raw, weekly: { ...raw.weekly, enabled: Boolean(raw.weekly?.enabled) }, monthly: { ...raw.monthly, enabled: Boolean(raw.monthly?.enabled) } });
  const value = JSON.stringify(settings);
  await prisma.setting.upsert({ where: { tenantId_key: { tenantId, key: KEY } }, update: { value }, create: { key: KEY, value } });
  return settings;
};

// ─── Dönemler (Türkiye saatiyle) ────────────────────────────────────────────

const trParts = (d) => { const t = new Date(d.getTime() + TR_OFFSET); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay() || 7, h: t.getUTCHours() }; };
const trMidnight = (y, m, d) => new Date(Date.UTC(y, m, d) - TR_OFFSET);

/**
 * Şu ana kadar zamanı gelmiş en son raporun dönemi.
 * Haftalık: seçilen gün ve saatte, önceki 7 tam gün. Aylık: seçilen gün ve saatte, önceki takvim ayı.
 */
export const latestDuePeriod = (kind, settings, now = new Date()) => {
  const p = trParts(now);
  if (kind === 'WEEKLY') {
    const s = settings.weekly;
    let back = (p.wd - s.weekday + 7) % 7;
    if (back === 0 && p.h < s.hour) back = 7;
    const dueDay = trMidnight(p.y, p.m, p.d - back);
    return { period: 'WEEKLY', from: new Date(dueDay.getTime() - 7 * DAY), to: new Date(dueDay.getTime() - 1), dueAt: new Date(dueDay.getTime() + s.hour * 3600e3) };
  }
  const s = settings.monthly;
  const thisMonthDue = p.d > s.day || (p.d === s.day && p.h >= s.hour);
  const dueMonth = thisMonthDue ? p.m : p.m - 1;
  const dueAt = new Date(trMidnight(p.y, dueMonth, s.day).getTime() + s.hour * 3600e3);
  return { period: 'MONTHLY', from: trMidnight(p.y, dueMonth - 1, 1), to: new Date(trMidnight(p.y, dueMonth, 1).getTime() - 1), dueAt };
};

// ─── Rapor ─────────────────────────────────────────────────────────────────

const median = (arr) => { const a = [...arr].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const fmt = (d) => new Date(d.getTime() + TR_OFFSET).toISOString().slice(0, 10).split('-').reverse().join('.');
const money = (n) => `${Math.round(n).toLocaleString('tr-TR')} TL`;

export const buildCustomerReport = async ({ from, to, period = 'CUSTOM', lostDays = 60 }) => {
  const len = to.getTime() - from.getTime() + 1;
  const ref = to; // durumlar dönem sonuna göre
  const since = new Date(ref.getTime() - 400 * DAY);

  const [sales, prevSales, companies, orders, firstLast, txs, rates] = await Promise.all([
    buildSalesReport({ from, to }),
    buildSalesReport({ from: new Date(from.getTime() - len), to: new Date(from.getTime() - 1) }),
    prisma.company.findMany({
      where: { kind: { in: ['DEALER', 'CUSTOMER'] }, status: 'ACTIVE' },
      select: {
        id: true, name: true, kind: true, phone: true, authorizedPerson: true, currency: true, currentBalance: true, riskLimit: true, createdAt: true,
        owner: { select: { name: true } }, plasiyer: { select: { name: true } }, contacts: { select: { name: true, phone: true }, take: 1 }
      }
    }),
    prisma.order.findMany({ where: { status: { not: 'CANCELLED' }, createdAt: { gte: since, lte: ref } }, select: { companyId: true, createdAt: true, subtotal: true, discountAmount: true, status: true } }),
    prisma.order.groupBy({ by: ['companyId'], where: { status: { not: 'CANCELLED' }, createdAt: { lte: ref } }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.financialTransaction.findMany({
      where: { date: { gte: from, lte: to }, company: { kind: { in: ['DEALER', 'CUSTOMER'] } } },
      select: { type: true, source: true, amount: true, amountTRY: true, rate: true }
    }),
    getExchangeRates().then((r) => r.rates).catch(() => ({}))
  ]);

  // Sipariş geçmişi müşteri bazında
  const byCompany = new Map();
  for (const o of orders) {
    const list = byCompany.get(o.companyId) || [];
    list.push({ at: o.createdAt.getTime(), amount: Math.max(0, (o.subtotal || 0) - (o.discountAmount || 0)) });
    byCompany.set(o.companyId, list);
  }
  const span = Object.fromEntries(firstLast.map((g) => [g.companyId, { first: g._min.createdAt, last: g._max.createdAt }]));

  const customers = companies.map((c) => {
    const hist = (byCompany.get(c.id) || []).sort((a, b) => a.at - b.at);
    const first = span[c.id]?.first || null;
    const last = span[c.id]?.last || null;
    const year = hist.filter((h) => h.at >= ref.getTime() - 365 * DAY);
    const days = [...new Set(year.map((h) => Math.floor(h.at / DAY)))];
    const gaps = days.slice(1).map((d, i) => d - days[i]);
    const typical = gaps.length >= 2 ? median(gaps) : null;
    const expected = Math.min(120, Math.max(7, typical ?? 30));
    const daysSince = last ? Math.floor((ref.getTime() - last.getTime()) / DAY) : null;
    const sum = (a, b) => hist.filter((h) => h.at > ref.getTime() - a * DAY && h.at <= ref.getTime() - b * DAY).reduce((s, h) => s + h.amount, 0);
    const rev90 = sum(90, 0);
    const prev90 = sum(180, 90);
    const revenue12m = year.reduce((s, h) => s + h.amount, 0);
    const inPeriod = hist.filter((h) => h.at >= from.getTime());
    const periodRevenue = inPeriod.reduce((s, h) => s + h.amount, 0);

    let status;
    let reason;
    if (!last) {
      status = c.createdAt < new Date(ref.getTime() - 14 * DAY) ? 'NEVER' : 'NEW';
      reason = status === 'NEVER' ? `Hesap ${fmt(c.createdAt)} tarihinde açıldı, hiç sipariş vermedi.` : 'Yeni hesap.';
    } else if (daysSince >= Math.max(lostDays, 3 * expected)) {
      status = 'LOST';
      reason = `${daysSince >= 60 ? `${Math.floor(daysSince / 30)} aydır` : `${daysSince} gündür`} sipariş yok (son sipariş ${fmt(last)}).`;
    } else if (daysSince >= Math.max(10, 1.5 * expected)) {
      status = 'AT_RISK';
      reason = typical ? `Genelde ~${Math.round(typical)} günde bir sipariş verir; ${daysSince} gündür vermedi.` : `${daysSince} gündür sipariş vermedi.`;
    } else if (prev90 > 0 && rev90 < prev90 * 0.6) {
      status = 'DECLINING';
      reason = `Son 3 ayda alımı %${Math.round((1 - rev90 / prev90) * 100)} düştü (${money(prev90)} → ${money(rev90)}).`;
    } else if (first && first >= from && first <= to) {
      status = 'NEW';
      reason = `İlk siparişini ${fmt(first)} tarihinde verdi.`;
    } else {
      status = 'ACTIVE';
      reason = typical ? `Düzenli: ~${Math.round(typical)} günde bir sipariş.` : 'Sipariş veriyor.';
    }
    // Bu dönemde kayba düştü: dönem başında eşiğin altındaydı, sonunda üstünde
    const lostThisPeriod = status === 'LOST' && last && (from.getTime() - last.getTime()) / DAY < Math.max(lostDays, 3 * expected);
    const overdue = daysSince != null ? Math.min(6, daysSince / expected) : 0;
    const score = WEIGHT[status] && daysSince <= 365 ? r2(Math.log10(1 + revenue12m) * Math.max(overdue, status === 'DECLINING' ? 1 : 0) * WEIGHT[status]) : 0;
    const balanceTRY = toTRY(c.currentBalance, c.currency, rates);

    return {
      id: c.id, name: c.name, kind: c.kind, status, reason, score, lostThisPeriod,
      phone: c.contacts[0]?.phone || c.phone || '', contact: c.contacts[0]?.name || c.authorizedPerson || '',
      owner: c.owner?.name || c.plasiyer?.name || '',
      lastOrderAt: last, daysSince, typicalDays: typical ? Math.round(typical) : null,
      orders12m: year.length, revenue12m: r2(revenue12m), rev90: r2(rev90), prev90: r2(prev90), periodRevenue: r2(periodRevenue), periodOrders: inPeriod.length,
      balance: r2(c.currentBalance), currency: c.currency, receivableTRY: balanceTRY != null && balanceTRY < 0 ? r2(-balanceTRY) : 0,
      overLimit: c.riskLimit > 0 && -c.currentBalance > c.riskLimit
    };
  });

  // Eğilim: haftalık dönemde son 8 hafta, daha uzun dönemde son 6 takvim ayı (satış sayılan siparişler)
  const weekly = len <= 10 * DAY;
  const buckets = [];
  if (weekly) {
    const end = trParts(new Date(ref.getTime()));
    const endDay = trMidnight(end.y, end.m, end.d + 1);
    for (let i = 7; i >= 0; i--) buckets.push({ from: new Date(endDay.getTime() - (i + 1) * 7 * DAY), to: new Date(endDay.getTime() - i * 7 * DAY - 1) });
  } else {
    const e = trParts(ref);
    for (let i = 5; i >= 0; i--) buckets.push({ from: trMidnight(e.y, e.m - i, 1), to: new Date(trMidnight(e.y, e.m - i + 1, 1).getTime() - 1) });
  }
  const sold = orders.filter((o) => SOLD.includes(o.status));
  const trend = buckets.map((b) => {
    const inB = sold.filter((o) => o.createdAt >= b.from && o.createdAt <= b.to);
    return {
      from: b.from, to: b.to,
      label: weekly ? fmt(b.from).slice(0, 5) : new Date(b.from.getTime() + TR_OFFSET).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      customers: new Set(inB.map((o) => o.companyId)).size,
      orders: inB.length,
      revenue: r2(inB.reduce((sum, o) => sum + Math.max(0, (o.subtotal || 0) - (o.discountAmount || 0)), 0))
    };
  });

  const statusCounts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, customers.filter((c) => c.status === k).length]));
  const callList = customers.filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);

  const tl = (t) => (t.amountTRY ?? t.amount * (t.rate || 1));
  const debt = txs.filter((t) => t.type === 'DEBT').reduce((s, t) => s + tl(t), 0);
  const collected = txs.filter((t) => t.type === 'CREDIT' && t.source === 'PAYMENT').reduce((s, t) => s + tl(t), 0);
  const returns = txs.filter((t) => t.type === 'CREDIT' && t.source === 'RETURN').reduce((s, t) => s + tl(t), 0);
  const otherCredit = txs.filter((t) => t.type === 'CREDIT' && !['PAYMENT', 'RETURN'].includes(t.source)).reduce((s, t) => s + tl(t), 0);

  const s = sales.summary;
  const p = prevSales.summary;
  return {
    range: { from, to, period },
    generatedAt: new Date(),
    lostDays,
    summary: {
      revenue: s.revenue, revenuePrev: p.revenue, orders: s.orders, ordersPrev: p.orders,
      customers: s.dealers, customersPrev: p.dealers, averageOrder: s.averageOrder,
      newCustomers: customers.filter((c) => c.status === 'NEW' && c.lastOrderAt).length,
      activeAccounts: customers.length,
      lostThisPeriod: customers.filter((c) => c.lostThisPeriod).length,
      // Daha önce sipariş vermiş ama bu dönemde vermemiş müşteriler
      silent: customers.filter((c) => c.lastOrderAt && c.periodOrders === 0).length
    },
    cari: {
      debt: r2(debt), collected: r2(collected), returns: r2(returns), otherCredit: r2(otherCredit),
      net: r2(debt - collected - returns - otherCredit),
      collectionRate: debt > 0 ? r2((collected / debt) * 100) : null,
      receivable: r2(customers.reduce((sum, c) => sum + c.receivableTRY, 0)),
      overLimit: customers.filter((c) => c.overLimit).length
    },
    statusCounts,
    trend: { unit: weekly ? 'week' : 'month', points: trend },
    callList,
    topCustomers: sales.dealers.slice(0, 10).map((d) => ({ id: d.id, name: d.name, orders: d.orders, revenue: d.revenue, share: d.share })),
    topDebtors: customers.filter((c) => c.receivableTRY > 0).sort((a, b) => b.receivableTRY - a.receivableTRY).slice(0, 15)
      .map((c) => ({ id: c.id, name: c.name, receivableTRY: c.receivableTRY, balance: c.balance, currency: c.currency, overLimit: c.overLimit, daysSince: c.daysSince })),
    customers: customers.sort((a, b) => (b.score - a.score) || ((b.daysSince ?? 9999) - (a.daysSince ?? 9999)))
  };
};

// ─── Excel ─────────────────────────────────────────────────────────────────

const PERIOD_LABEL = { WEEKLY: 'Haftalık', MONTHLY: 'Aylık', CUSTOM: 'Seçilen dönem' };
const change = (now, prev) => (prev ? `${now >= prev ? '+' : ''}${Math.round(((now - prev) / prev) * 100)}%` : '');

export const reportTitle = (r) => `${PERIOD_LABEL[r.range.period] || ''} müşteri raporu · ${fmt(new Date(r.range.from))} – ${fmt(new Date(r.range.to))}`;

export const customerReportWorkbook = (r) => {
  const sheets = [];
  const add = (name, rows, widths) => sheets.push({ name, rows: rows.length ? rows : [{ Bilgi: 'Kayıt yok' }], widths });
  const s = r.summary;
  const c = r.cari;
  const date = (d) => (d ? fmt(new Date(d)) : '');
  add('Özet', [
    { Gösterge: 'Dönem', Değer: `${date(r.range.from)} – ${date(r.range.to)}`, 'Önceki dönem': '', Değişim: '' },
    { Gösterge: 'Sipariş veren müşteri', Değer: s.customers, 'Önceki dönem': s.customersPrev, Değişim: change(s.customers, s.customersPrev) },
    { Gösterge: 'Ciro (KDV hariç, TL)', Değer: s.revenue, 'Önceki dönem': s.revenuePrev, Değişim: change(s.revenue, s.revenuePrev) },
    { Gösterge: 'Sipariş sayısı', Değer: s.orders, 'Önceki dönem': s.ordersPrev, Değişim: change(s.orders, s.ordersPrev) },
    { Gösterge: 'Ortalama sipariş (TL)', Değer: s.averageOrder },
    { Gösterge: 'Yeni müşteri (ilk sipariş)', Değer: s.newCustomers },
    { Gösterge: 'Bu dönem kayba düşen müşteri', Değer: s.lostThisPeriod },
    { Gösterge: 'Cariye yazılan borç (TL)', Değer: c.debt },
    { Gösterge: 'Tahsilat (TL)', Değer: c.collected },
    { Gösterge: 'İade alacağı (TL)', Değer: c.returns },
    { Gösterge: 'Tahsilat oranı (%)', Değer: c.collectionRate ?? '' },
    { Gösterge: 'Toplam açık alacak (TL, bugün)', Değer: c.receivable },
    { Gösterge: 'Risk limitini aşan müşteri', Değer: c.overLimit },
    ...Object.entries(STATUS).map(([k, label]) => ({ Gösterge: `Durum: ${label}`, Değer: r.statusCounts[k] || 0 }))
  ], [32, 22, 16, 10]);
  add('Aranacaklar', r.callList.map((x, i) => ({
    Sıra: i + 1, Müşteri: x.name, Durum: STATUS[x.status], Neden: x.reason, Yetkili: x.contact, Telefon: x.phone, Sorumlu: x.owner,
    'Son sipariş': date(x.lastOrderAt), 'Kaç gündür': x.daysSince ?? '', 'Olağan aralık (gün)': x.typicalDays ?? '', 'Son 12 ay ciro (TL)': x.revenue12m, 'Açık alacak (TL)': x.receivableTRY
  })), [6, 30, 14, 50, 18, 16, 16, 12, 10, 12, 16, 14]);
  add('Müşteri durumu', r.customers.map((x) => ({
    Müşteri: x.name, Tür: x.kind === 'DEALER' ? 'Bayi' : 'Müşteri', Durum: STATUS[x.status], Açıklama: x.reason, Telefon: x.phone, Sorumlu: x.owner,
    'Son sipariş': date(x.lastOrderAt), 'Kaç gündür': x.daysSince ?? '', 'Kaç aydır': x.daysSince != null ? Math.floor(x.daysSince / 30) : '',
    'Son 12 ay sipariş': x.orders12m, 'Son 12 ay ciro (TL)': x.revenue12m, 'Dönem ciro (TL)': x.periodRevenue, 'Son 90 gün (TL)': x.rev90, 'Önceki 90 gün (TL)': x.prev90, 'Açık alacak (TL)': x.receivableTRY
  })), [30, 8, 14, 50, 16, 16, 12, 10, 9, 10, 16, 14, 14, 16, 14]);
  add('En çok alanlar', r.topCustomers.map((x, i) => ({ Sıra: i + 1, Müşteri: x.name, Sipariş: x.orders, 'Ciro (TL)': x.revenue, 'Pay (%)': x.share })), [6, 30, 10, 14, 10]);
  add('Açık alacaklar', r.topDebtors.map((x) => ({ Müşteri: x.name, 'Açık alacak (TL)': x.receivableTRY, Bakiye: x.balance, 'Para birimi': x.currency, 'Limit aşımı': x.overLimit ? 'Evet' : '', 'Son siparişten beri (gün)': x.daysSince ?? '' })), [30, 16, 14, 10, 10, 20]);
  return workbookBuffer(sheets);
};

// ─── Zamanlanmış üretim ───────────────────────────────────────────────────

/**
 * Saatlik işte firma bağlamında çağrılır: zamanı gelmiş ve henüz üretilmemiş rapor varsa üretir,
 * yöneticilere bildirim (ve tercihlerine göre e-posta) gönderir. Kaçırılan rapor 3 gün içinde telafi edilir.
 */
export const runPeriodicReports = async (now = new Date()) => {
  const settings = await loadSettings();
  const created = [];
  for (const kind of ['WEEKLY', 'MONTHLY']) {
    if (!settings[kind === 'WEEKLY' ? 'weekly' : 'monthly'].enabled) continue;
    const due = latestDuePeriod(kind, settings, now);
    if (now - due.dueAt > 3 * DAY) continue;
    const exists = await prisma.periodicReport.findFirst({ where: { period: kind, from: due.from }, select: { id: true } });
    if (exists) continue;
    const data = await buildCustomerReport({ from: due.from, to: due.to, period: kind, lostDays: settings.lostDays });
    let report;
    try {
      report = await prisma.periodicReport.create({ data: { period: kind, from: due.from, to: due.to, data: JSON.parse(JSON.stringify(data)) } });
    } catch (error) {
      if (error.code === 'P2002') continue; // başka sunucu üretti
      throw error;
    }
    created.push(report);
    const s = data.summary;
    const risky = (data.statusCounts.AT_RISK || 0) + (data.statusCounts.DECLINING || 0);
    safeNotify(notifyAdmins({
      type: 'REPORT', anyPermission: ['ORDERS', 'FINANCE'],
      title: `${PERIOD_LABEL[kind]} müşteri raporu hazır`,
      message: `${fmt(due.from)} – ${fmt(due.to)}: ${s.customers} müşteri sipariş verdi (${money(s.revenue)}). ${risky} müşteri risk altında / düşüşte${s.lostThisPeriod ? `, ${s.lostThisPeriod} müşteri kayba düştü` : ''}. Aranacaklar listesini inceleyin.`,
      link: `/admin/reports?rapor=${report.id}`,
      dedupeKey: `report:${report.id}`
    }));
  }
  return created;
};
