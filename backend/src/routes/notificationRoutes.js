import express from 'express';
import { getNotifications, markRead, markAllRead, pushConfig, pushSubscribe, pushUnsubscribe } from '../controllers/notificationController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getNotifications);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.get('/push', pushConfig);
router.post('/push/subscribe', pushSubscribe);
router.post('/push/unsubscribe', pushUnsubscribe);

export default router;
