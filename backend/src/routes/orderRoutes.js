import express from 'express';
import { orderStats, getOrders, getOrderById, exportOrders, partialApproveOrder, shipOrder, completeOrder, createOrder, quoteOrder } from '../controllers/orderController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

// Bayi kendi siparişlerini, admin tüm siparişleri görür
router.get('/', getOrders);
router.get('/export', exportOrders);
router.get('/stats', requirePermission('ORDERS'), orderStats);
router.get('/:id', getOrderById);
router.post('/quote', checkRole(['BAYI']), quoteOrder);
router.post('/', checkRole(['BAYI']), createOrder);

// Sadece ADMIN yönetebilir
router.patch('/:id/partial-approve', requirePermission('ORDERS'), partialApproveOrder);
router.patch('/:id/ship', requirePermission('ORDERS'), shipOrder);
router.patch('/:id/complete', requirePermission('ORDERS'), completeOrder);

export default router;
