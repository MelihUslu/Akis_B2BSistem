import express from 'express';
import { getNotifications, markRead, markAllRead } from '../controllers/notificationController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getNotifications);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);

export default router;
