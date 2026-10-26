import express from 'express';
import { listQuotes, getQuote, createQuote, respondQuote, rejectQuote, cancelQuote, acceptQuote } from '../controllers/quoteController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', listQuotes);
router.get('/:id', getQuote);
router.post('/', checkRole(['BAYI']), createQuote);
router.post('/:id/accept', checkRole(['BAYI']), acceptQuote);
router.post('/:id/cancel', checkRole(['BAYI']), cancelQuote);
router.patch('/:id/respond', requirePermission('ORDERS'), respondQuote);
router.post('/:id/reject', requirePermission('ORDERS'), rejectQuote);

export default router;
