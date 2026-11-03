import express from 'express';
import {
  listCash, createCash, updateCash, deleteCash, exportCash, uploadCashFile, downloadCashFile, deleteCashFile,
  saveBudgets, createRecurring, updateRecurring, deleteRecurring
} from '../controllers/cashController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { cashDocUpload } from '../middlewares/upload.js';

const router = express.Router();

// Gelir-gider: Finans yetkisi
router.use(verifyToken, requirePermission('FINANCE'));
router.get('/', listCash);
router.get('/export', exportCash);
router.put('/budgets', saveBudgets);
router.post('/recurring', createRecurring);
router.put('/recurring/:id', updateRecurring);
router.delete('/recurring/:id', deleteRecurring);
router.post('/', createCash);
router.put('/:id', updateCash);
router.delete('/:id', deleteCash);
router.post('/:id/file', cashDocUpload.single('file'), uploadCashFile);
router.get('/:id/file', downloadCashFile);
router.delete('/:id/file', deleteCashFile);

export default router;
