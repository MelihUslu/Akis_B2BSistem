import express from 'express';
import { getPayments, createPayment } from '../controllers/paymentController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verifyToken, getPayments);
router.post('/', verifyToken, createPayment);

export default router;
