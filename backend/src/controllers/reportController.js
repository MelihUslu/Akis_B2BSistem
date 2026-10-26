import { parseRange, buildSalesReport, reportWorkbook } from '../services/reportService.js';

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
    const name = `satis-raporu-${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ message: error.message || 'Rapor oluşturulamadı.' });
  }
};
