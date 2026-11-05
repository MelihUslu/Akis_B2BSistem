import prisma from '../utils/prisma.js';
import { notifyCompany, safeNotify } from '../services/notificationService.js';
import { emitEvent } from '../services/webhookService.js';
import {
  recordPayment, reverseTransaction, listTransactions, agingReport, PAYMENT_METHODS, SOURCES, AGING_BUCKETS
} from '../services/partnerLedgerService.js';
import { fail, loadPartner, sendWorkbook } from './partnerController.js';
import { localDay } from '../utils/dates.js';

/**
 * Cari defteri uçları (Finans yetkisi): tahsilat / ödeme, hareket listesi ve Excel, ters kayıt, yaşlandırma.
 */

export const createPayment = async (req, res) => {
  try {
    const company = await loadPartner(req.params.id);
    const payment = await recordPayment({ company, body: req.body, user: req.user });
    if (payment.direction === 'IN') {
      safeNotify(notifyCompany(company.id, { type: 'PAYMENT', title: 'Ödemeniz alındı', message: `₺${payment.amount.toLocaleString('tr-TR')} (${PAYMENT_METHODS[payment.method]}) carinize işlendi.`, link: '/bayi/finance' }));
      emitEvent(req.tenant.id, 'payment.received', { companyId: company.id, externalCode: company.externalCode, amount: payment.amount, method: payment.method, reference: payment.reference, receiptNo: payment.receiptNo });
    }
    res.locals.auditEntityId = company.id;
    res.status(201).json({ message: `${payment.direction === 'IN' ? 'Tahsilat' : 'Ödeme'} kaydedildi (makbuz ${payment.receiptNo}).`, payment });
  } catch (error) {
    fail(res, error, 'Tahsilat kaydedilemedi.');
  }
};

// Makbuz yazdırma verisi
export const getPayment = async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: parseInt(req.params.paymentId) || 0 },
    include: { company: { select: { id: true, name: true, kind: true, taxOffice: true, taxNumber: true, address: true, phone: true, externalCode: true, currentBalance: true, currency: true } } }
  });
  if (!payment || !payment.company) return res.status(404).json({ message: 'Tahsilat bulunamadı.' });
  res.json({ ...payment, methodLabel: PAYMENT_METHODS[payment.method] || payment.method });
};

export const getTransactions = async (req, res) => {
  try {
    const company = await loadPartner(req.params.id);
    const result = await listTransactions(company, req.query);
    const take = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    res.json({
      ...result,
      rows: result.rows.slice((page - 1) * take, page * take),
      balance: company.currentBalance,
      pagination: { total: result.rows.length, page, pages: Math.max(1, Math.ceil(result.rows.length / take)) },
      sources: SOURCES
    });
  } catch (error) {
    fail(res, error, 'Hareketler getirilemedi.');
  }
};

export const exportTransactions = async (req, res) => {
  try {
    const company = await loadPartner(req.params.id);
    const { rows, openingBalance } = await listTransactions(company, req.query);
    const data = [...rows].reverse().map((t) => ({
      'Tarih': t.date.toLocaleDateString('tr-TR'),
      'Kaynak': SOURCES[t.source] || t.source,
      'Açıklama': t.description || '',
      'Borç': t.type === 'DEBT' ? t.amount : '',
      'Alacak': t.type === 'CREDIT' ? t.amount : '',
      'Bakiye': t.balanceAfter,
      'Bakiye Durumu': t.balanceAfter < 0 ? 'Borçlu' : t.balanceAfter > 0 ? 'Alacaklı' : '',
      'Para Birimi': t.currency === 'TRY' ? 'TL' : t.currency,
      'Kur': t.currency === 'TRY' ? '' : t.rate,
      'TL Karşılığı': t.amountTRY ?? '',
      'Not': t.reversed ? 'Ters kaydedildi' : '',
      'Giren': t.createdByName || ''
    }));
    if (!req.query.from) data.unshift({ 'Tarih': '', 'Kaynak': '', 'Açıklama': 'Açılış bakiyesi', 'Borç': '', 'Alacak': '', 'Bakiye': openingBalance, 'Bakiye Durumu': '', 'Not': '', 'Giren': '' });
    await sendWorkbook(res, data, 'Hareketler', `cari-hareketler-${company.id}-${localDay()}.xlsx`, [12, 14, 60, 14, 14, 14, 12, 10, 10, 14, 16, 18]);
  } catch (error) {
    fail(res, error, 'Excel oluşturulamadı.');
  }
};

export const reverse = async (req, res) => {
  try {
    const original = await prisma.financialTransaction.findUnique({ where: { id: parseInt(req.params.txId) || 0 }, select: { companyId: true } });
    if (!original || original.companyId !== parseInt(req.params.id)) return res.status(404).json({ message: 'Hareket bulunamadı.' });
    await reverseTransaction({ id: parseInt(req.params.txId), reason: req.body.reason, user: req.user });
    res.json({ message: 'Ters kayıt oluşturuldu, bakiye düzeltildi.' });
  } catch (error) {
    fail(res, error, 'Ters kayıt yapılamadı.');
  }
};

// Yaşlandırma raporu (ekran / Excel)
export const getAging = async (req, res) => {
  try {
    const kinds = String(req.query.kind || 'DEALER,CUSTOMER').split(',').filter((k) => ['DEALER', 'CUSTOMER'].includes(k));
    const report = await agingReport({ kinds: kinds.length ? kinds : ['DEALER', 'CUSTOMER'] });
    if (req.query.format === 'xlsx') {
      const data = report.rows.map((r) => ({
        'Cari': r.name, 'Cari Kodu': r.externalCode || '', 'Tür': r.kind === 'DEALER' ? 'Bayi' : 'Müşteri', 'Telefon': r.phone || '', 'Para Birimi': r.currency === 'TRY' ? 'TL' : r.currency,
        ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.label, r[b.key]])), 'Toplam Borç': r.total,
        'En Eski Gecikme (gün)': r.oldestOverdueDays ?? ''
      }));
      for (const [cur, t] of Object.entries(report.totalsByCurrency)) {
        data.push({ 'Cari': `TOPLAM (${cur === 'TRY' ? 'TL' : cur})`, 'Para Birimi': cur === 'TRY' ? 'TL' : cur, ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.label, t[b.key]])), 'Toplam Borç': t.total });
      }
      data.push({ 'Cari': 'GENEL TOPLAM (güncel kurla TL)', 'Para Birimi': 'TL', ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.label, report.totals[b.key]])), 'Toplam Borç': report.totals.total });
      return await sendWorkbook(res, data, 'Yaşlandırma', `borc-yaslandirma-${localDay()}.xlsx`, [34, 14, 10, 16, 10, 16, 12, 12, 12, 12, 18, 14]);
    }
    res.json(report);
  } catch (error) {
    fail(res, error, 'Yaşlandırma raporu hazırlanamadı.');
  }
};
