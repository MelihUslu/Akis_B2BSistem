import express from 'express';
import {
  salesReport, exportSalesReport, getPeriodicSettings, updatePeriodicSettings, listPeriodicReports, getPeriodicReport,
  exportPeriodicReport, livePeriodicReport, exportLivePeriodicReport
} from '../controllers/reportController.js';
import { verifyToken, checkRole, requireAnyPermission, requirePermission } from '../middlewares/authMiddleware.js';
import { heavyLimit } from '../middlewares/heavyLimit.js';

const router = express.Router();

// Satış ve kâr bilgisi içerdiği için sipariş veya finans yetkisi gerekir
router.use(verifyToken, checkRole(['ADMIN']), requireAnyPermission('ORDERS', 'FINANCE'));
router.get('/sales', salesReport);
router.get('/sales/export', heavyLimit, exportSalesReport);

// Dönemsel müşteri takip raporu; zamanlamayı ayar yetkisi olan değiştirir
router.get('/periodic/settings', getPeriodicSettings);
router.put('/periodic/settings', requirePermission('SETTINGS'), updatePeriodicSettings);
router.get('/periodic/live', heavyLimit, livePeriodicReport);
router.get('/periodic/live/export', heavyLimit, exportLivePeriodicReport);
router.get('/periodic', listPeriodicReports);
router.get('/periodic/:id', getPeriodicReport);
router.get('/periodic/:id/export', heavyLimit, exportPeriodicReport);

export default router;
