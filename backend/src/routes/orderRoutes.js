import express from 'express';
import { getOrders, partialApproveOrder, shipOrder } from '../controllers/orderController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(checkRole(['ADMIN'])); // Şimdilik sadece ADMIN yönetebilir

router.get('/', getOrders);
router.patch('/:id/partial-approve', partialApproveOrder);
router.patch('/:id/ship', shipOrder);

export default router;
