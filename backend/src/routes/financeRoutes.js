import express from 'express';
import { createTransaction, getPlasiyerPoints } from '../controllers/financeController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(checkRole(['ADMIN']));

router.post('/transaction', createTransaction);
router.get('/plasiyer-points', getPlasiyerPoints);

export default router;
