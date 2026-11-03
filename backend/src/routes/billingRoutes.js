import express from 'express';
import { getBilling, startCheckout, cancelRenewal, subscriptionInvoice, notifyTransfer, cancelTransfer } from '../controllers/billingController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, requirePermission('SETTINGS'));

router.get('/', getBilling);
router.post('/checkout', startCheckout);
router.post('/cancel', cancelRenewal);
router.post('/transfer', notifyTransfer);
router.delete('/transfer/:id', cancelTransfer);
router.get('/payments/:id/invoice', subscriptionInvoice);

export default router;
