import express from 'express';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import { getCart, saveCart } from '../controllers/cartController.js';

const router = express.Router();
router.use(verifyToken, checkRole(['BAYI']));

router.get('/', getCart);
router.put('/', saveCart);

export default router;
