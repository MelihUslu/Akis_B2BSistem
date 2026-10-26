import express from 'express';
import { getBilling, startCheckout, cancelRenewal, subscriptionInvoice } from '../controllers/billingController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, requirePermission('SETTINGS'));

router.get('/', getBilling);
router.post('/checkout', startCheckout);
router.post('/cancel', cancelRenewal);
router.get('/payments/:id/invoice', subscriptionInvoice);

export default router;
