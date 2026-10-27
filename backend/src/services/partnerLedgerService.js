import prisma from '../utils/prisma.js';
import { round2 } from './pricingService.js';

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

  const reference = str(body.reference, 80);
  const bankName = str(body.bankName, 80);
  const note = str(body.note, 500);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const agg = await tx.payment.aggregate({ _max: { receiptNo: true } });
        const receiptNo = (agg._max.receiptNo || 0) + 1;
        const payment = await tx.payment.create({
          data: {
            companyId: company.id, amount, method, direction, status: 'COMPLETED', paymentDate: date, receiptNo,
            reference, bankName, dueDate: ['CHECK', 'NOTE'].includes(method) ? dueDate : null, note,
            userId: user.id, createdByName: user.name
          }
        });
        const label = direction === 'IN' ? 'Tahsilat' : 'Ödeme';
        const description = [`${label} · ${PAYMENT_METHODS[method]}`, `Makbuz ${receiptNo}`, reference, bankName, dueDate && ['CHECK', 'NOTE'].includes(method) && `vade ${dueDate.toLocaleDateString('tr-TR')}`, note]
          .filter(Boolean).join(' · ');
        const delta = direction === 'IN' ? amount : -amount;
        await tx.financialTransaction.create({
          data: { companyId: company.id, type: direction === 'IN' ? 'CREDIT' : 'DEBT', amount, description, date, source: 'PAYMENT', paymentId: payment.id, createdByName: user.name }
        });
        await tx.company.update({ where: { id: company.id }, data: { currentBalance: { increment: delta } } });
        return payment;
      });
    } catch (error) {
      if (error.code !== 'P2002' || attempt === 4) throw error;
    }
  }
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
    return await prisma.$transaction(async (tx) => {
      const reversal = await tx.financialTransaction.create({
        data: {
          companyId: original.companyId,
          type: original.type === 'DEBT' ? 'CREDIT' : 'DEBT',
          amount: original.amount,
          description: `Ters kayıt: ${original.description || ''} — ${why}`.slice(0, 500),
          source: 'REVERSAL',
          reversalOfId: original.id,
          createdByName: user.name
        }
      });
      // Borç ters kaydı cariyi alacaklandırır (bakiye artar), alacak ters kaydı borçlandırır
      const delta = original.type === 'DEBT' ? original.amount : -original.amount;
      await tx.company.update({ where: { id: original.companyId }, data: { currentBalance: { increment: delta } } });
      if (original.paymentId) await tx.payment.update({ where: { id: original.paymentId }, data: { status: 'CANCELLED' } });
      return reversal;
    });
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
  { key: 'd30', label: '1–30 gün' },
  { key: 'd60', label: '31–60 gün' },
  { key: 'd90', label: '61–90 gün' },
  { key: 'd90plus', label: '90+ gün' },
  { key: 'unmatched', label: 'Açılış / eşleşmeyen' }
];

/**
 * Borç yaşlandırma. Ödemelerin en eski borçları kapattığı varsayılır (FIFO): carinin güncel borcu,
 * en yeni borç hareketlerinden geriye doğru dağıtılır. Her borcun vadesi sipariş vadesi; yoksa
 * hareket tarihi + carinin vade günü. Hareketle karşılanamayan kısım (ör. açılış bakiyesi) ayrı gösterilir.
 */
export const agingFor = (company, debts, now = new Date()) => {
  const out = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0]));
  let remaining = round2(-company.currentBalance);
  if (remaining <= 0) return { ...out, total: 0 };
  const total = remaining;
  for (const t of debts) { // en yeni → en eski
    if (remaining <= 0) break;
    const part = Math.min(remaining, t.amount);
    remaining = round2(remaining - part);
    const due = t.order?.dueDate ? new Date(t.order.dueDate) : new Date(new Date(t.date).getTime() + (company.paymentTermDays || 0) * 86400000);
    const late = Math.floor((now - due) / 86400000);
    const key = late <= 0 ? 'notDue' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90plus';
    out[key] = round2(out[key] + part);
  }
  out.unmatched = round2(out.unmatched + remaining);
  return { ...out, total };
};

const debtWhere = { type: 'DEBT', source: { not: 'REVERSAL' }, reversedBy: { is: null } };

export const agingReport = async ({ kinds = ['DEALER', 'CUSTOMER'], companyId } = {}) => {
  const companies = await prisma.company.findMany({
    where: { kind: { in: kinds }, currentBalance: { lt: 0 }, ...(companyId && { id: companyId }) },
    select: {
      id: true, name: true, kind: true, externalCode: true, phone: true, currentBalance: true, paymentTermDays: true,
      transactions: { where: debtWhere, orderBy: [{ date: 'desc' }, { id: 'desc' }], select: { amount: true, date: true, order: { select: { dueDate: true } } } }
    },
    orderBy: { currentBalance: 'asc' }
  });
  const now = new Date();
  const rows = companies.map(({ transactions, ...c }) => ({ ...c, ...agingFor(c, transactions, now) }));
  const totals = Object.fromEntries([...AGING_BUCKETS.map((b) => b.key), 'total'].map((k) => [k, round2(rows.reduce((s, r) => s + r[k], 0))]));
  return { buckets: AGING_BUCKETS, rows, totals };
};

// Cari özet kartı: son 12 ay satış / alış, son sipariş ve tahsilat, açık teklifler
export const partnerSummary = async (company) => {
  const since = new Date(Date.now() - 365 * 86400000);
  const SOLD = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED'];
  const [sales, lastOrder, lastIn, lastOut, openQuotes, purchases, aging] = await Promise.all([
    prisma.order.aggregate({ where: { companyId: company.id, status: { in: SOLD }, createdAt: { gte: since } }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.order.findFirst({ where: { companyId: company.id, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, totalAmount: true } }),
    prisma.payment.findFirst({ where: { companyId: company.id, status: 'COMPLETED', direction: 'IN' }, orderBy: { paymentDate: 'desc' }, select: { amount: true, paymentDate: true, method: true } }),
    prisma.payment.findFirst({ where: { companyId: company.id, status: 'COMPLETED', direction: 'OUT' }, orderBy: { paymentDate: 'desc' }, select: { amount: true, paymentDate: true, method: true } }),
    prisma.quoteRequest.count({ where: { companyId: company.id, status: { in: ['PENDING', 'DRAFT', 'PENDING_APPROVAL', 'QUOTED'] } } }),
    // Tedarikçide alış = elle / açılış / ERP alacak kayıtları (tahsilat ve ters kayıt hariç)
    company.kind === 'SUPPLIER'
      ? prisma.financialTransaction.aggregate({ where: { companyId: company.id, type: 'CREDIT', source: { in: ['MANUAL', 'OPENING', 'ERP'] }, reversedBy: { is: null }, date: { gte: since } }, _sum: { amount: true } })
      : null,
    company.currentBalance < 0 && company.kind !== 'SUPPLIER' ? agingReport({ kinds: [company.kind], companyId: company.id }) : null
  ]);
  return {
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
