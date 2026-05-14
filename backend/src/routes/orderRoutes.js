import express from 'express';
import { getOrders, partialApproveOrder, shipOrder, createOrder } from '../controllers/orderController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

// Herkes kendi yetkisi dahilinde görebilir/oluşturabilir
router.get('/', getOrders);
router.post('/', createOrder);

// Sadece ADMIN yönetebilir
router.patch('/:id/partial-approve', checkRole(['ADMIN']), partialApproveOrder);
router.patch('/:id/ship', checkRole(['ADMIN']), shipOrder);

export default router;
