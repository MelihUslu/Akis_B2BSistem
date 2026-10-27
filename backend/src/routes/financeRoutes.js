import express from 'express';
import {
  createTransaction, getPlasiyerPoints, getFinanceSummary, getMyStatement, getCompanyStatement, reconcile, getReconciliations, exportStatement
} from '../controllers/financeController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { getAging } from '../controllers/partnerLedgerController.js';

const router = express.Router();

router.use(verifyToken);

// Bayi self-servis finans
router.get('/my-statement', checkRole(['BAYI']), getMyStatement);
router.get('/my-statement/export', checkRole(['BAYI']), exportStatement);
router.post('/reconcile', checkRole(['BAYI']), reconcile);

// Admin
router.post('/transaction', requirePermission('FINANCE'), createTransaction);
router.get('/summary', requirePermission('FINANCE'), getFinanceSummary);
router.get('/aging', requirePermission('FINANCE'), getAging);
router.get('/plasiyer-points', requirePermission('FINANCE'), getPlasiyerPoints);
router.get('/reconciliations', requirePermission('FINANCE'), getReconciliations);
router.get('/statement/:companyId', requirePermission('FINANCE'), getCompanyStatement);
router.get('/statement/:companyId/export', requirePermission('FINANCE'), exportStatement);

export default router;
