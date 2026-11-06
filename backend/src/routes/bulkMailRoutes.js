import express from 'express';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { bulkMailMeta, bulkMailRecipients, sendBulkMailTest, sendBulkMail, bulkMailCampaigns, bulkMailCampaign } from '../controllers/bulkMailController.js';

// Toplu e-posta (Müşteriler → Toplu E-posta): "Toplu e-posta" yetkisi
const router = express.Router();
router.use(verifyToken, requirePermission('EMAIL'));
router.get('/meta', bulkMailMeta);
router.get('/recipients', bulkMailRecipients);
router.post('/test', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: 'Çok fazla deneme e-postası. Biraz sonra tekrar deneyin.' }), sendBulkMailTest);
router.post('/send', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: 'Çok fazla toplu gönderim. Biraz sonra tekrar deneyin.' }), sendBulkMail);
router.get('/campaigns', bulkMailCampaigns);
router.get('/campaigns/:id', bulkMailCampaign);
export default router;
