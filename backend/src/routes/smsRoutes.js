import express from 'express';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { getSmsSettings, saveSmsSettings, listSmsHeaders, sendTestSms } from '../controllers/smsController.js';

// SMS bildirimi ayarları (Ayarlar → SMS): firma kendi Netgsm hesabını bağlar, açar / kapatır
const router = express.Router();
router.use(verifyToken, requirePermission('SETTINGS'));
router.get('/', getSmsSettings);
router.put('/', saveSmsSettings);
router.post('/headers', listSmsHeaders);
// Deneme SMS'i ücretlidir; yanlışlıkla art arda gönderilmesin
router.post('/test', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Çok fazla deneme SMS\'i. Biraz sonra tekrar deneyin.' }), sendTestSms);
export default router;
