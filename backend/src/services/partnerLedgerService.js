import pkg from '@prisma/client';
import prisma, { currentTenantId, sequenceLock } from '../utils/prisma.js';
import { round2 } from './pricingService.js';
import { postEntry, rateOrCurrent, normalizeCurrency, CURRENCY_LABEL } from './accountPosting.js';
import { getExchangeRates } from './exchangeRateService.js';

/**
 * Cari defteri: tahsilat / ödeme kaydı, ters kayıt, hareket listesi, yaşlandırma ve cari özeti.
 * Bakiye işareti carinin gözünden: eksi = cari bize borçlu, artı = cari alacaklı.
 */

export class LedgerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const PAYMENT_METHODS = {
  CASH: 'Nakit',
  WIRE_TRANSFER: 'Havale / EFT',
  CARD: 'Kredi kartı (fiziki POS)',
  CHECK: 'Çek',
  NOTE: 'Senet',
  POS: 'Sanal POS',
  MANUAL: 'Diğer'
};
export const MANUAL_METHODS = ['CASH', 'WIRE_TRANSFER', 'CARD', 'CHECK', 'NOTE'];

export const SOURCES = {
  ORDER: 'Sipariş',
  RETURN: 'İade',
  PAYMENT: 'Tahsilat / ödeme',
  ERP: 'ERP',
  OPENING: 'Açılış',
  MANUAL: 'Manuel',
  REVERSAL: 'Ters kayıt'
};
// Bu kaynaklardaki hareketler kendi ekranından düzeltilir (sipariş onayı, iade), burada ters kayıt yapılmaz
const NOT_REVERSIBLE = ['ORDER', 'RETURN', 'ERP', 'REVERSAL'];

const str = (v, max) => {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Elle tahsilat (cariden para girişi) veya ödeme (cariye para çıkışı, ör. tedarikçiye).
 * Makbuz numarası firma içinde sıralıdır. Tahsilat cariyi alacaklandırır, ödeme borçlandırır.
 */
export const recordPayment = async ({ company, body, user }) => {
  const direction = body.direction === 'OUT' ? 'OUT' : 'IN';
  const method = MANUAL_METHODS.includes(body.method) ? body.method : null;
  const amount = round2(parseFloat(body.amount));
  if (!method) throw new LedgerError('Ödeme yöntemi seçin.');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) throw new LedgerError('Geçerli bir tutar girin.');
  const date = body.date ? new Date(`${String(body.date).slice(0, 10)}T12:00:00`) : new Date();
  if (Number.isNaN(date.getTime()) || date > new Date(Date.now() + 86400000)) throw new LedgerError('İşlem tarihi geçersiz (ileri tarih olamaz).');
  const dueDate = body.dueDate ? new Date(`${String(body.dueDate).slice(0, 10)}T12:00:00`) : null;
  if (['CHECK', 'NOTE'].includes(method) && (!dueDate || Number.isNaN(dueDate.getTime()))) throw new LedgerError(`${PAYMENT_METHODS[method]} için vade tarihi girin.`);

  // Ödenen para TL ya da carinin dövizi olabilir; dövizli caride kur elle verilebilir (yoksa güncel kur)
  const account = company.currency || 'TRY';
  const paid = normalizeCurrency(body.currency) || account;
  if (![account, 'TRY'].includes(paid)) throw new LedgerError(`Bu cariye TL veya ${CURRENCY_LABEL[account]} ile ödeme alınabilir.`);
  const rate = await rateOrCurrent(account, body.rate);
  const amountTRY = paid === 'TRY' ? amount : round2(amount * rate);
  const accountAmount = paid === account ? amount : round2(amountTRY / rate);

  const reference = str(body.reference, 80);
  const bankName = str(body.bankName, 80);
  const drawer = str(body.drawer, 120); // çek / senette keşideci (cariden farklı olabilir)
  const note = str(body.note, 500);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        await sequenceLock(tx, 'RECEIPT'); // makbuz numarası firma içinde sırayla
        const agg = await tx.payment.aggregate({ _max: { receiptNo: true } });
        const receiptNo = (agg._max.receiptNo || 0) + 1;
        const payment = await tx.payment.create({
          data: {
            companyId: company.id, amount, currency: paid, rate, accountAmount, method, direction, status: 'COMPLETED', paymentDate: date, receiptNo,
            reference, bankName, dueDate: ['CHECK', 'NOTE'].includes(method) ? dueDate : null, note,
            userId: user.id, createdByName: user.name
          }
        });
        const label = direction === 'IN' ? 'Tahsilat' : 'Ödeme';
        const fx = paid !== account ? `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${CURRENCY_LABEL[paid]} (kur ${rate})` : null;
        const description = [`${label} · ${PAYMENT_METHODS[method]}`, `Makbuz ${receiptNo}`, fx, reference, bankName, dueDate && ['CHECK', 'NOTE'].includes(method) && `vade ${dueDate.toLocaleDateString('tr-TR')}`, note]
          .filter(Boolean).join(' · ');
        await postEntry(tx, {
          company, type: direction === 'IN' ? 'CREDIT' : 'DEBT', amount: accountAmount, amountTRY, rate,
          description, date, source: 'PAYMENT', paymentId: payment.id, createdByName: user.name
        });
        // Çek / senetle tahsilat portföye girer (Finans → Çek / Senet)
        if (direction === 'IN' && ['CHECK', 'NOTE'].includes(method)) {
          await tx.cheque.create({
            data: {
              kind: method, paymentId: payment.id, companyId: company.id, number: reference, bankName, drawer, amount, currency: paid, dueDate,
              statusAt: new Date(), history: [{ status: 'PORTFOY', at: new Date(), by: user.name }]
            }
          });
        }
        return payment;
      }, { maxWait: 10000, timeout: 30000 }); // numara kilidi sırayla verir; yoğun yükte 5 sn yetmiyordu
    } catch (error) {
      if (error.code !== 'P2002' || attempt === 4) throw error;
    }
  }
};

/**
 * Ters kayıt (işlem içinde): tutarı ve kuru aynı, yönü ters hareket eklenir; bağlı tahsilat / ödeme iptal olur.
 * Cari ekranından elle yapılan ters kayıtta portföydeki çek de buna uyar (ciro ödemesi geri alınırsa çek portföye döner,
 * tahsilatı geri alınan çek iptal olur). Çek ekranı kendi durumunu yazdığı için cheque: false ile çağırır.
 */
export const reverseEntryInTx = async (tx, original, why, user, { cheque = true } = {}) => {
  const reversal = await postEntry(tx, {
    company: { id: original.companyId, currency: original.currency },
    type: original.type === 'DEBT' ? 'CREDIT' : 'DEBT',
    amount: original.amount,
    amountTRY: original.amountTRY ?? undefined,
    rate: original.rate,
    description: `Ters kayıt: ${original.description || ''} — ${why}`.slice(0, 500),
    source: 'REVERSAL',
    reversalOfId: original.id,
    createdByName: user.name
  });
  if (original.paymentId) {
    await tx.payment.update({ where: { id: original.paymentId }, data: { status: 'CANCELLED' } });
    if (cheque) {
      const at = new Date();
      const received = await tx.cheque.findFirst({ where: { paymentId: original.paymentId, status: { in: ['PORTFOY', 'BANKADA'] } } });
      if (received) {
        await tx.cheque.update({ where: { id: received.id }, data: { status: 'IPTAL', statusAt: at, history: [...(received.history || []), { status: 'IPTAL', at, by: user.name, note: `Tahsilat ters kaydedildi: ${why}` }] } });
      }
      const endorsed = await tx.cheque.findFirst({ where: { endorsePaymentId: original.paymentId, status: 'CIRO' } });
      if (endorsed) {
        await tx.cheque.update({
          where: { id: endorsed.id },
          data: { status: 'PORTFOY', statusAt: at, endorsedToId: null, endorsePaymentId: null, history: [...(endorsed.history || []), { status: 'PORTFOY', at, by: user.name, note: `Ciro ödemesi ters kaydedildi: ${why}` }] }
        });
      }
    }
  }
  return reversal;
};

/**
 * Ters kayıt: hareket silinmez; tutarı aynı, yönü ters bir hareket eklenir ve bakiye düzelir.
 * Bir hareket yalnızca bir kez ters kaydedilebilir (reversalOfId benzersiz). Bağlı tahsilat iptal edilir.
 */
export const reverseTransaction = async ({ id, reason, user }) => {
  const original = await prisma.financialTransaction.findUnique({ where: { id }, include: { reversedBy: true } });
  if (!original) throw new LedgerError('Hareket bulunamadı.', 404);
  if (NOT_REVERSIBLE.includes(original.source)) {
    throw new LedgerError(original.source === 'REVERSAL' ? 'Ters kayıt tekrar ters kaydedilemez.' : `${SOURCES[original.source]} hareketi kendi ekranından düzeltilir (sipariş onayı / iade).`);
  }
  if (original.reversedBy) throw new LedgerError('Bu hareket zaten ters kaydedilmiş.');
  const why = str(reason, 300);
  if (!why) throw new LedgerError('Ters kayıt nedenini yazın.');
  try {
    return await prisma.$transaction((tx) => reverseEntryInTx(tx, original, why, user));
  } catch (error) {
    if (error.code === 'P2002') throw new LedgerError('Bu hareket zaten ters kaydedilmiş.');
    throw error;
  }
};

/**
 * Hareketler (en yeni üstte), her satırda yürüyen bakiye. Filtre: tarih, borç/alacak, kaynak, açıklama.
 * Yürüyen bakiye filtreden bağımsız olarak tüm hareketler üzerinden hesaplanır.
 */
export const listTransactions = async (company, { from, to, type, source, q } = {}) => {
  const all = await prisma.financialTransaction.findMany({
    where: { companyId: company.id },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: { reversedBy: { select: { id: true } }, payment: { select: { id: true, receiptNo: true, method: true, direction: true } }, order: { select: { id: true, dueDate: true } } }
  });
  const movement = all.reduce((s, t) => s + (t.type === 'CREDIT' ? t.amount : -t.amount), 0);
  const openingBalance = round2(company.currentBalance - movement);
  let running = openingBalance;
  const rows = all.map((t) => {
    running = round2(running + (t.type === 'CREDIT' ? t.amount : -t.amount));
    return { ...t, balanceAfter: running, reversed: Boolean(t.reversedBy), reversible: !NOT_REVERSIBLE.includes(t.source) && !t.reversedBy };
  });
  const fromD = from ? new Date(`${from}T00:00:00`) : null;
  const toD = to ? new Date(`${to}T23:59:59.999`) : null;
  const term = String(q || '').trim().toLocaleLowerCase('tr-TR');
  const filtered = rows.filter((t) => (!fromD || t.date >= fromD) && (!toD || t.date <= toD)
    && (!type || t.type === type) && (!source || t.source === source)
    && (!term || (t.description || '').toLocaleLowerCase('tr-TR').includes(term)));
  const totals = filtered.reduce((s, t) => ({ debt: s.debt + (t.type === 'DEBT' ? t.amount : 0), credit: s.credit + (t.type === 'CREDIT' ? t.amount : 0) }), { debt: 0, credit: 0 });
  return { openingBalance, rows: filtered.reverse(), totals: { debt: round2(totals.debt), credit: round2(totals.credit) } };
};

export const AGING_BUCKETS = [
  { key: 'notDue', label: 'Vadesi gelmemiş' },
  { key: 'd30', label: '1–30 gün gecikmiş' },
  { key: 'd60', label: '31–60 gün gecikmiş' },
  { key: 'd90', label: '61–90 gün gecikmiş' },
  { key: 'd90plus', label: '90 günden fazla gecikmiş' },
  { key: 'unmatched', label: 'Tarihi bilinmeyen (açılış / devir)' }
];

/**
 * Borç yaşlandırma. Ödemelerin en eski borçları kapattığı varsayılır (FIFO): carinin güncel borcu,
 * en yeni borç hareketlerinden geriye doğru dağıtılır. Her borcun vadesi sipariş vadesi; yoksa
 * hareket tarihi + carinin vade günü. Hareketle karşılanamayan kısım (ör. açılış bakiyesi) ayrı gösterilir.
 */
export const agingFor = (company, debts, now = new Date()) => {
  const out = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0]));
  let remaining = round2(-company.currentBalance);
  if (remaining <= 0) return { ...out, total: 0, oldestOverdueDays: null, overdue: 0 };
  const total = remaining;
  let oldest = null; // ödenmemiş en eski borcun gecikme günü
  for (const t of debts) { // en yeni → en eski
    if (remaining <= 0) break;
    const part = Math.min(remaining, t.amount);
    remaining = round2(remaining - part);
    const due = t.order?.dueDate ? new Date(t.order.dueDate) : new Date(new Date(t.date).getTime() + (company.paymentTermDays || 0) * 86400000);
    const late = Math.floor((now - due) / 86400000);
    const key = late <= 0 ? 'notDue' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90plus';
    out[key] = round2(out[key] + part);
    if (late > 0 && (oldest === null || late > oldest)) oldest = late;
  }
  out.unmatched = round2(out.unmatched + remaining);
  const overdue = round2(out.d30 + out.d60 + out.d90 + out.d90plus);
  return { ...out, total, oldestOverdueDays: oldest, overdue };
};

const { Prisma } = pkg;

/**
 * Carilerin açık kalem hesabı için hareketler (en yeniden eskiye), sipariş vadesiyle birlikte, ters kaydedilenler hariç.
 * Tek düz SQL sorgusu: cari ve sipariş kimlikleri dizi parametresiyle gider, PostgreSQL'in 32.767 parametre sınırına
 * takılmaz (iç içe yüklemede büyük firmada yaşlandırma raporu açılmıyordu).
 * cover: her carinin açık tutarı (companyIds ile aynı sırada). Verilirse yalnızca bu tutarı karşılayan en yeni
 * hareketler gelir; FIFO'da daha eskileri zaten kapanmıştır. Büyük firmada (600 bin sipariş) yaşlandırma bütün borç
 * hareketlerini okuyordu: 1,6 sn (yük testi, 5 Kasım 2026). Süzme JavaScript'teki dağıtımdan geniş tutulur (+0,01).
 * Dönen yapı: [{ id, companyId, amount, date, order: { dueDate } | null }]
 */
export const loadOpenMoves = async (companyIds, { type, excludeSources = ['REVERSAL'], cover }) => {
  if (!companyIds.length) return [];
  const tenantId = currentTenantId();
  if (!tenantId) throw new Error('[Tenant] Cari hareketleri kiracı bağlamı olmadan okunamaz.');
  const open = cover
    ? Prisma.sql`, sum(ft.amount) OVER (PARTITION BY ft."companyId" ORDER BY ft.date DESC, ft.id DESC ROWS UNBOUNDED PRECEDING) - ft.amount AS before`
    : Prisma.empty;
  const covered = cover
    ? Prisma.sql`JOIN unnest(${companyIds}::int[], ${cover.map(Number)}::float8[]) AS c(id, open) ON c.id = m."companyId" AND m.before < c.open + 0.01`
    : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT m.id, m."companyId", m.amount, m.date, o."dueDate" FROM (
      SELECT ft.id, ft."companyId", ft.amount, ft.date, ft."orderId"${open}
      FROM "FinancialTransaction" ft
      WHERE ft."tenantId" = ${tenantId} AND ft."companyId" = ANY(${companyIds}) AND ft.type = ${type}
        AND NOT (ft.source = ANY(${excludeSources}))
        AND NOT EXISTS (SELECT 1 FROM "FinancialTransaction" r WHERE r."tenantId" = ${tenantId} AND r."reversalOfId" = ft.id)
    ) m
    ${covered}
    LEFT JOIN "Order" o ON o.id = m."orderId"
    ORDER BY m.date DESC, m.id DESC`;
  return rows.map((r) => ({ id: r.id, companyId: r.companyId, amount: r.amount, date: r.date, order: r.dueDate ? { dueDate: r.dueDate } : null }));
};

export const agingReport = async ({ kinds = ['DEALER', 'CUSTOMER'], companyId } = {}) => {
  const companies = await prisma.company.findMany({
    where: { kind: { in: kinds }, currentBalance: { lt: 0 }, ...(companyId && { id: companyId }) },
    select: { id: true, name: true, kind: true, externalCode: true, phone: true, currentBalance: true, paymentTermDays: true, currency: true },
    orderBy: { currentBalance: 'asc' }
  });
  // Borç hareketleri tek sorguda (cari başına alt sorgu yerine); ters kaydedilenler ayrıca çıkarılır
  const ids = companies.map((c) => c.id);
  const debts = await loadOpenMoves(ids, { type: 'DEBT', cover: companies.map((c) => -c.currentBalance) });
  const byCompany = new Map();
  for (const d of debts) {
    if (!byCompany.has(d.companyId)) byCompany.set(d.companyId, []);
    byCompany.get(d.companyId).push(d);
  }
  const now = new Date();
  const fx = (await getExchangeRates()).rates || {};
  const rows = companies.map((c) => {
    const a = agingFor(c, byCompany.get(c.id) || [], now);
    const rate = c.currency === 'TRY' ? 1 : fx[c.currency];
    return { ...c, ...a, totalTRY: rate ? round2(a.total * rate) : null, overdueTRY: rate ? round2(a.overdue * rate) : null };
  }).sort((x, y) => (y.oldestOverdueDays ?? -1) - (x.oldestOverdueDays ?? -1) || (y.overdueTRY ?? 0) - (x.overdueTRY ?? 0) || (y.totalTRY ?? 0) - (x.totalTRY ?? 0));
  // Farklı para birimleri toplanmaz: her para birimi için ayrı toplam, ayrıca güncel kurla TL karşılığı
  const keys = [...AGING_BUCKETS.map((b) => b.key), 'total'];
  const totalsByCurrency = {};
  for (const r of rows) {
    const t = totalsByCurrency[r.currency] || Object.fromEntries(keys.map((k) => [k, 0]));
    for (const k of keys) t[k] = round2(t[k] + r[k]);
    totalsByCurrency[r.currency] = t;
  }
  const totalsTRY = Object.fromEntries(keys.map((k) => [k, round2(Object.entries(totalsByCurrency).reduce((s, [cur, t]) => s + t[k] * (cur === 'TRY' ? 1 : (fx[cur] || 0)), 0))]));
  return { buckets: AGING_BUCKETS, rows, totalsByCurrency, totals: totalsTRY, rates: fx };
};

// Cari özet kartı: son 12 ay satış / alış, son sipariş ve tahsilat, açık teklifler
export const partnerSummary = async (company) => {
  const since = new Date(Date.now() - 365 * 86400000);
  const SOLD = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'];
  const [sales, lastOrder, lastIn, lastOut, openQuotes, purchases, aging] = await Promise.all([
    prisma.order.aggregate({ where: { companyId: company.id, status: { in: SOLD }, createdAt: { gte: since } }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.order.findFirst({ where: { companyId: company.id, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, totalAmount: true } }),
    prisma.payment.findFirst({ where: { companyId: company.id, status: 'COMPLETED', direction: 'IN' }, orderBy: { paymentDate: 'desc' }, select: { amount: true, currency: true, paymentDate: true, method: true } }),
    prisma.payment.findFirst({ where: { companyId: company.id, status: 'COMPLETED', direction: 'OUT' }, orderBy: { paymentDate: 'desc' }, select: { amount: true, currency: true, paymentDate: true, method: true } }),
    prisma.quoteRequest.count({ where: { companyId: company.id, status: { in: ['PENDING', 'DRAFT', 'PENDING_APPROVAL', 'QUOTED'] } } }),
    // Tedarikçide alış = elle / açılış / ERP alacak kayıtları (tahsilat ve ters kayıt hariç)
    company.kind === 'SUPPLIER'
      ? prisma.financialTransaction.aggregate({ where: { companyId: company.id, type: 'CREDIT', source: { in: ['MANUAL', 'OPENING', 'ERP'] }, reversedBy: { is: null }, date: { gte: since } }, _sum: { amount: true } })
      : null,
    company.currentBalance < 0 && company.kind !== 'SUPPLIER' ? agingReport({ kinds: [company.kind], companyId: company.id }) : null
  ]);
  // Dövizli caride kur farkı (bilgi): bakiyenin güncel kurla TL karşılığı − hareketlerin işlendiği kurlarla TL karşılığı.
  // Eksi: cari borcunun TL değeri arttı (lehimize); artı: aleyhimize. Açılış/hareket dışı bakiye hesaba katılmaz.
  let fx = null;
  if ((company.currency || 'TRY') !== 'TRY') {
    const rate = (await getExchangeRates()).rates?.[company.currency] || null;
    const book = await prisma.financialTransaction.groupBy({ by: ['type'], where: { companyId: company.id }, _sum: { amount: true, amountTRY: true } });
    const sum = (t, f) => book.find((b) => b.type === t)?._sum[f] || 0;
    const bookTRY = round2(sum('CREDIT', 'amountTRY') - sum('DEBT', 'amountTRY'));
    const covered = round2(sum('CREDIT', 'amount') - sum('DEBT', 'amount'));
    const valueTRY = rate ? round2(covered * rate) : null;
    fx = { currency: company.currency, rate, balanceTRY: rate ? round2(company.currentBalance * rate) : null, bookTRY, difference: valueTRY === null ? null : round2(valueTRY - bookTRY) };
  }
  return {
    fx,
    sales12m: round2(sales._sum.totalAmount || 0),
    orders12m: sales._count._all,
    avgOrder: sales._count._all ? round2((sales._sum.totalAmount || 0) / sales._count._all) : 0,
    lastOrder,
    lastPaymentIn: lastIn,
    lastPaymentOut: lastOut,
    openQuotes,
    purchases12m: purchases ? round2(purchases._sum.amount || 0) : null,
    aging: aging?.rows[0] || null
  };
};
