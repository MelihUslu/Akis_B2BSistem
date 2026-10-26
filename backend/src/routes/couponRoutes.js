import express from 'express';
import { listCoupons, createCoupon, updateCoupon, deleteCoupon } from '../controllers/couponController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, requirePermission('CATALOG'));

router.get('/', listCoupons);
router.post('/', createCoupon);
router.patch('/:id', updateCoupon);
router.delete('/:id', deleteCoupon);

export default router;
