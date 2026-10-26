import express from 'express';
import { getPayments, payWithPos, getPosInfo, startPosCheckout } from '../controllers/paymentController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getPayments);
router.get('/pos-info', checkRole(['BAYI']), getPosInfo);
router.post('/pos', checkRole(['BAYI']), payWithPos); // Demo POS (sadece geliştirme ortamında, firma POS'u yoksa)
router.post('/pos/checkout', checkRole(['BAYI']), startPosCheckout);

export default router;
