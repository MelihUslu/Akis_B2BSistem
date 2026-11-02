import express from 'express';
import {
  salesReport, exportSalesReport, getPeriodicSettings, updatePeriodicSettings, listPeriodicReports, getPeriodicReport,
  exportPeriodicReport, livePeriodicReport, exportLivePeriodicReport
} from '../controllers/reportController.js';
import { verifyToken, checkRole, requireAnyPermission, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Satış ve kâr bilgisi içerdiği için sipariş veya finans yetkisi gerekir
router.use(verifyToken, checkRole(['ADMIN']), requireAnyPermission('ORDERS', 'FINANCE'));
router.get('/sales', salesReport);
router.get('/sales/export', exportSalesReport);

// Dönemsel müşteri takip raporu; zamanlamayı ayar yetkisi olan değiştirir
router.get('/periodic/settings', getPeriodicSettings);
router.put('/periodic/settings', requirePermission('SETTINGS'), updatePeriodicSettings);
router.get('/periodic/live', livePeriodicReport);
router.get('/periodic/live/export', exportLivePeriodicReport);
router.get('/periodic', listPeriodicReports);
router.get('/periodic/:id', getPeriodicReport);
router.get('/periodic/:id/export', exportPeriodicReport);

export default router;
