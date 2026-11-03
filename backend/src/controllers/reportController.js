import prisma from '../utils/prisma.js';
import { parseRange, buildSalesReport, reportWorkbook } from '../services/reportService.js';
import { buildCustomerReport, customerReportWorkbook, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../services/periodicReportService.js';
import { localDay } from '../utils/dates.js';
import { cached } from '../utils/cache.js';
import { currentTenantId } from '../utils/prisma.js';

export const salesReport = async (req, res) => {
  try {
    res.json(await buildSalesReport(parseRange(req.query)));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Rapor oluşturulamadı.' });
  }
};

export const exportSalesReport = async (req, res) => {
  try {
    const range = parseRange(req.query);
    const buffer = reportWorkbook(await buildSalesReport(range));
    const name = `satis-raporu-${localDay(range.from)}_${localDay(range.to)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Rapor oluşturulamadı.' });
  }
};

// ─── Dönemsel müşteri takip raporu ───────────────────────────────────────────

const sendXlsx = (res, buffer, name) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(buffer);
};
const fileName = (r) => `musteri-raporu-${localDay(r.range.from)}_${localDay(r.range.to)}.xlsx`;

export const getPeriodicSettings = async (req, res) => {
  res.json({ settings: await loadSettings(), defaults: DEFAULT_SETTINGS });
};

export const updatePeriodicSettings = async (req, res) => {
  try {
    const settings = await saveSettings(req.tenant.id, req.body || {});
    res.json({ settings, message: 'Rapor ayarları kaydedildi.' });
  } catch (error) {
    console.error('updatePeriodicSettings error:', error);
    res.status(500).json({ message: 'Ayarlar kaydedilemedi.' });
  }
};

// Kayıtlı (zamanlanmış) raporların listesi
export const listPeriodicReports = async (req, res) => {
  const rows = await prisma.periodicReport.findMany({ orderBy: { from: 'desc' }, take: 60, select: { id: true, period: true, from: true, to: true, createdAt: true, data: true } });
  res.json(rows.map(({ data, ...r }) => ({ ...r, summary: data?.summary, statusCounts: data?.statusCounts })));
};

const loadReport = async (id) => prisma.periodicReport.findFirst({ where: { id: parseInt(id) || 0 } });

export const getPeriodicReport = async (req, res) => {
  const row = await loadReport(req.params.id);
  if (!row) return res.status(404).json({ message: 'Rapor bulunamadı.' });
  res.json({ id: row.id, ...row.data });
};

export const exportPeriodicReport = async (req, res) => {
  const row = await loadReport(req.params.id);
  if (!row) return res.status(404).json({ message: 'Rapor bulunamadı.' });
  sendXlsx(res, customerReportWorkbook(row.data), fileName(row.data));
};

// Seçilen tarih aralığı için anlık rapor (kaydedilmez)
// Firma + aralık başına 60 sn önbellek: aynı anda açan yöneticiler tek hesabı bekler
const liveReport = async (query) => {
  const range = parseRange(query);
  const settings = await loadSettings();
  return cached(`customer-report:${currentTenantId()}:${range.from.getTime()}:${range.to.getTime()}:${settings.lostDays}`, 60_000,
    () => buildCustomerReport({ ...range, period: 'CUSTOM', lostDays: settings.lostDays }));
};

export const livePeriodicReport = async (req, res) => {
  try {
    res.json(await liveReport(req.query));
  } catch (error) {
    if (!(error.message || '').includes('aralı')) console.error('livePeriodicReport error:', error);
    res.status(400).json({ message: error.message || 'Rapor oluşturulamadı.' });
  }
};

export const exportLivePeriodicReport = async (req, res) => {
  try {
    const r = await liveReport(req.query);
    sendXlsx(res, customerReportWorkbook(r), fileName(r));
  } catch (error) {
    res.status(400).json({ message: error.message || 'Rapor oluşturulamadı.' });
  }
};
