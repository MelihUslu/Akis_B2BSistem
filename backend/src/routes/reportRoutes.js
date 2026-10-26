import express from 'express';
import { salesReport, exportSalesReport } from '../controllers/reportController.js';
import { verifyToken, checkRole, requireAnyPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Satış ve kâr bilgisi içerdiği için sipariş veya finans yetkisi gerekir
router.use(verifyToken, checkRole(['ADMIN']), requireAnyPermission('ORDERS', 'FINANCE'));
router.get('/sales', salesReport);
router.get('/sales/export', exportSalesReport);

export default router;
