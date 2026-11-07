import express from 'express';
import { getMyFeed, createMyFeed, deleteMyFeed } from '../controllers/dealerFeedController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

// Bayinin XML ürün beslemesi adresi (Profilim)
const router = express.Router();
router.use(verifyToken, checkRole(['BAYI']));
router.get('/', getMyFeed);
router.post('/', createMyFeed);
router.delete('/', deleteMyFeed);

export default router;
