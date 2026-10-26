import express from 'express';
import { getInvoicingSettings, saveInvoicingSettings, testInvoicing } from '../controllers/invoicingController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';

// E-fatura sağlayıcı ayarları (Ayarlar → E-Fatura)
const router = express.Router();
router.use(verifyToken, requirePermission('SETTINGS'));
router.get('/', getInvoicingSettings);
router.put('/', saveInvoicingSettings);
router.post('/test', testInvoicing);

export default router;
