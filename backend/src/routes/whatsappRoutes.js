import express from 'express';
import { getChannel, connectChannel, updateAiSettings, disconnectChannel, previewReply, listConversations, getConversation, sendAgentMessage, setConversationStatus } from '../controllers/whatsappController.js';
import { verifyToken, requirePermission, requireAnyPermission } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = express.Router();

router.use(verifyToken);

// Bağlantı ve yapay zekâ ayarları (ayar yetkisi); durum bilgisi gelen kutusunu görenlere de açık
router.get('/channel', requireAnyPermission('MESSAGES', 'SETTINGS'), getChannel);
router.put('/channel', requirePermission('SETTINGS'), rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), connectChannel);
router.patch('/channel', requirePermission('SETTINGS'), updateAiSettings);
router.delete('/channel', requirePermission('SETTINGS'), disconnectChannel);
router.post('/preview', requireAnyPermission('MESSAGES', 'SETTINGS'), rateLimit({ windowMs: 60 * 1000, max: 10 }), previewReply);

// Gelen kutusu
router.get('/conversations', requirePermission('MESSAGES'), listConversations);
router.get('/conversations/:id', requirePermission('MESSAGES'), getConversation);
router.post('/conversations/:id/messages', requirePermission('MESSAGES'), sendAgentMessage);
router.patch('/conversations/:id', requirePermission('MESSAGES'), setConversationStatus);

export default router;
