/**
 * Çek / senet portföyü (Finans → Çek / Senet). Çek / senetle alınan tahsilat portföye girer; tahsilat cariyi o anda
 * alacaklandırmıştır. Durumlar ve cariye etkisi:
 *   PORTFOY → BANKADA (tahsile verildi) → TAHSIL (tahsil edildi): cari değişmez.
 *   PORTFOY → CIRO: tedarikçiye ödeme olarak verilir; tedarikçinin carisine ödeme (borç) yazılır.
 *   PORTFOY / BANKADA / CIRO → KARSILIKSIZ: tahsilat ters kaydedilir (müşteri yeniden borçlanır); ciroluysa
 *     tedarikçiye yapılan ödeme de ters kaydedilir (tedarikçiye borç yeniden doğar). İkisi tek işlemde.
 *   PORTFOY / BANKADA → IADE: çek müşteriye geri verildi; tahsilat ters kaydedilir.
 *   IPTAL: tahsilat cari ekranından ters kaydedildi (partnerLedgerService).
 */
import prisma from '../utils/prisma.js';
import { recordPayment, reverseEntryInTx, LedgerError } from './partnerLedgerService.js';

export const STATUS = {
  PORTFOY: 'Portföyde', BANKADA: 'Tahsile verildi', TAHSIL: 'Tahsil edildi', CIRO: 'Ciro edildi',
  KARSILIKSIZ: 'Karşılıksız', IADE: 'İade edildi', IPTAL: 'İptal (tahsilat ters kaydedildi)'
};
export const KIND = { CHECK: 'Çek', NOTE: 'Senet' };
const ACTIVE = ['PORTFOY', 'BANKADA'];

// İşlem → hangi durumlardan, hangi duruma
const ACTIONS = {
  deposit: { from: ['PORTFOY'], to: 'BANKADA' },
  collect: { from: ['PORTFOY', 'BANKADA'], to: 'TAHSIL' },
  endorse: { from: ['PORTFOY'], to: 'CIRO' },
  bounce: { from: ['PORTFOY', 'BANKADA', 'CIRO'], to: 'KARSILIKSIZ' },
  return: { from: ['PORTFOY', 'BANKADA'], to: 'IADE' }
};

const text = (v, max) => String(v ?? '').trim().slice(0, max) || null;
const day = (d) => new Date(d).toISOString().slice(0, 10);

const view = (c) => ({
  id: c.id, kind: c.kind, kindLabel: KIND[c.kind], number: c.number, bankName: c.bankName, drawer: c.drawer,
  amount: c.amount, currency: c.currency, dueDate: c.dueDate, status: c.status, statusLabel: STATUS[c.status], statusAt: c.statusAt,
  company: c.company, endorsedTo: c.endorsedTo || null, receiptNo: c.payment?.receiptNo ?? null, receivedAt: c.payment?.paymentDate ?? c.createdAt,
  history: c.history || []
});
const include = {
  company: { select: { id: true, name: true, kind: true } },
  endorsedTo: { select: { id: true, name: true } },
  payment: { select: { receiptNo: true, paymentDate: true } }
};

/** Liste + özet: durum, tür, vade aralığı, arama (no, banka, keşideci, cari) */
export const listCheques = async ({ status, kind, from, to, q } = {}) => {
  const where = {
    ...(STATUS[status] && { status }),
    ...(KIND[kind] && { kind }),
    ...((from || to) && { dueDate: { ...(from && { gte: new Date(`${from}T00:00:00`) }), ...(to && { lte: new Date(`${to}T23:59:59`) }) } }),
    ...(q && { OR: [
      { number: { contains: q, mode: 'insensitive' } }, { bankName: { contains: q, mode: 'insensitive' } },
      { drawer: { contains: q, mode: 'insensitive' } }, { company: { name: { contains: q, mode: 'insensitive' } } }
    ] })
  };
  const [rows, groups] = await Promise.all([
    prisma.cheque.findMany({ where, include, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 500 }),
    prisma.cheque.groupBy({ by: ['status', 'currency'], _sum: { amount: true }, _count: { _all: true } })
  ]);
  // Elde (portföyde + bankada) olanlar vadesine göre: vadesi geçmiş, 7 gün içinde, sonrası
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 864e5);
  const active = await prisma.cheque.findMany({ where: { status: { in: ACTIVE } }, select: { amount: true, currency: true, dueDate: true } });
  const bucket = (fn) => active.filter(fn).reduce((m, c) => ({ ...m, [c.currency]: (m[c.currency] || 0) + c.amount }), {});
  return {
    cheques: rows.map(view),
    summary: {
      byStatus: groups.map((g) => ({ status: g.status, label: STATUS[g.status], currency: g.currency, count: g._count._all, amount: g._sum.amount || 0 })),
      overdue: bucket((c) => c.dueDate < now),
      dueThisWeek: bucket((c) => c.dueDate >= now && c.dueDate <= week)
    }
  };
};

const appendHistory = (cheque, status, user, note) => [...(cheque.history || []), { status, at: new Date(), by: user.name, ...(note && { note }) }];

/** Tahsilatın (ya da ciro ödemesinin) cari hareketi; elle ters kaydedildiyse işlem yapılamaz */
const paymentEntry = async (tx, paymentId) => {
  const entry = await tx.financialTransaction.findFirst({ where: { paymentId, source: 'PAYMENT' }, include: { reversedBy: true } });
  if (!entry) throw new LedgerError('Çekin cari hareketi bulunamadı.');
  if (entry.reversedBy) throw new LedgerError('Bu ödemenin cari hareketi zaten ters kaydedilmiş.');
  return entry;
};

/**
 * Durum değişikliği. action: deposit | collect | endorse | bounce | return. body: { note, supplierId (ciro) }
 * Aynı çek üzerinde eşzamanlı iki işlemden yalnızca biri yürür (durum koşullu güncelleme).
 */
export const changeChequeStatus = async (id, action, body, user) => {
  const rule = ACTIONS[action];
  if (!rule) throw new LedgerError('Geçersiz işlem.');
  const cheque = await prisma.cheque.findUnique({ where: { id }, include });
  if (!cheque) throw new LedgerError('Çek / senet bulunamadı.', 404);
  if (!rule.from.includes(cheque.status)) throw new LedgerError(`${KIND[cheque.kind]} "${STATUS[cheque.status]}" durumunda; bu işlem yapılamaz.`);
  const note = text(body.note, 300);
  const claim = (tx, data) => tx.cheque.updateMany({ where: { id, status: cheque.status }, data: { status: rule.to, statusAt: new Date(), history: appendHistory(cheque, rule.to, user, note), ...data } });
  const conflict = () => new LedgerError('Bu çek / senet bu arada başka bir işlemle değişti; sayfayı yenileyin.', 409);

  if (action === 'deposit' || action === 'collect') {
    const r = await claim(prisma, {});
    if (r.count !== 1) throw conflict();
  } else if (action === 'endorse') {
    // Ciro: önce çek alınır (iki kez ciro edilmesin), sonra tedarikçiye ödeme yazılır; ödeme olmazsa çek portföye döner
    const supplier = await prisma.company.findFirst({ where: { id: parseInt(body.supplierId) || 0, kind: 'SUPPLIER' } });
    if (!supplier) throw new LedgerError('Ciro edilecek tedarikçiyi seçin.');
    const r = await claim(prisma, { endorsedToId: supplier.id });
    if (r.count !== 1) throw conflict();
    try {
      const payment = await recordPayment({
        company: supplier, user,
        body: {
          direction: 'OUT', method: cheque.kind, amount: cheque.amount, currency: cheque.currency, dueDate: day(cheque.dueDate),
          reference: cheque.number, bankName: cheque.bankName, note: [`Ciro: ${cheque.company.name} ${KIND[cheque.kind].toLocaleLowerCase('tr')}i`, cheque.drawer && `keşideci ${cheque.drawer}`, note].filter(Boolean).join(' · ')
        }
      });
      await prisma.cheque.update({ where: { id }, data: { endorsePaymentId: payment.id } });
    } catch (error) {
      await prisma.cheque.updateMany({ where: { id, status: 'CIRO', endorsePaymentId: null }, data: { status: cheque.status, endorsedToId: null, history: cheque.history } });
      throw error;
    }
  } else {
    // Karşılıksız / iade: tahsilat (ve ciroluysa tedarikçiye ödeme) ters kaydedilir; hepsi tek işlemde
    const why = action === 'bounce' ? `Karşılıksız ${KIND[cheque.kind].toLocaleLowerCase('tr')}` : `${KIND[cheque.kind]} iade edildi`;
    await prisma.$transaction(async (tx) => {
      const r = await claim(tx, {});
      if (r.count !== 1) throw conflict();
      const reason = [why, cheque.number && `no ${cheque.number}`, note].filter(Boolean).join(' · ');
      await reverseEntryInTx(tx, await paymentEntry(tx, cheque.paymentId), reason, user, { cheque: false });
      if (cheque.status === 'CIRO' && cheque.endorsePaymentId) {
        await reverseEntryInTx(tx, await paymentEntry(tx, cheque.endorsePaymentId), reason, user, { cheque: false });
      }
    });
  }
  return view(await prisma.cheque.findUnique({ where: { id }, include }));
};
