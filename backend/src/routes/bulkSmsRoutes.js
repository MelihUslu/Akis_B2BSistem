import express from 'express';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { bulkSmsMeta, bulkSmsRecipients, sendBulkSms, bulkSmsCampaigns, bulkSmsCampaign } from '../controllers/bulkSmsController.js';

// Toplu SMS (Müşteriler → Toplu SMS): "Toplu SMS" yetkisi; firmada SMS açıkken gönderilir
const router = express.Router();
router.use(verifyToken, requirePermission('SMS'));
router.get('/meta', bulkSmsMeta);
router.get('/recipients', bulkSmsRecipients);
// Her gönderim ücretli: yanlışlıkla art arda gönderilmesin
router.post('/send', rateLimit({ windowMs: 10 * 60 * 1000, max: 10, message: 'Çok fazla toplu gönderim. Biraz sonra tekrar deneyin.' }), sendBulkSms);
router.get('/campaigns', bulkSmsCampaigns);
router.get('/campaigns/:id', bulkSmsCampaign);
export default router;
