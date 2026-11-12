import express from 'express';
import { getPayments, payWithPos, getPosInfo, startPosCheckout } from '../controllers/paymentController.js';
import { verifyToken, checkRole, adminNeeds } from '../middlewares/authMiddleware.js';
import { requireDealer } from '../services/dealerAccess.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', adminNeeds('FINANCE'), getPayments);
router.get('/pos-info', checkRole(['BAYI']), requireDealer('FINANCE'), getPosInfo);
router.post('/pos', checkRole(['BAYI']), requireDealer('FINANCE'), payWithPos); // Demo POS (sadece geliştirme ortamında, firma POS'u yoksa)
router.post('/pos/checkout', checkRole(['BAYI']), requireDealer('FINANCE'), startPosCheckout);

export default router;
