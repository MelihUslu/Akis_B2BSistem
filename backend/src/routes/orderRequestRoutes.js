import express from 'express';
import { listOrderRequests, approveOrderRequest, rejectOrderRequest, cancelOrderRequest } from '../controllers/orderRequestController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

// Bayi içinde sipariş onayı (Siparişlerim → Onay talepleri)
const router = express.Router();
router.use(verifyToken, checkRole(['BAYI']));
router.get('/', listOrderRequests);
router.post('/:id/approve', approveOrderRequest);
router.post('/:id/reject', rejectOrderRequest);
router.post('/:id/cancel', cancelOrderRequest);

export default router;
