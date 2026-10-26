import express from 'express';
import { domainCheck, getPlans, slugAvailable, signup, verifyEmail, resendVerification, iyzicoCallback, iyzicoWebhook } from '../controllers/publicController.js';
import { platformContext } from '../middlewares/tenantMiddleware.js';
import { posCallback, paytrNotify } from '../controllers/paymentController.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = express.Router();

// Bu uçlar belirli bir kiracıya bağlı değildir
router.use(platformContext);

router.get('/plans', getPlans);
// Caddy on-demand TLS: yalnızca bize ait alan adlarına sertifika alınsın
router.get('/domain-check', domainCheck);
router.get('/slug-available', rateLimit({ windowMs: 60 * 1000, max: 30 }), slugAvailable);
router.post('/signup', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.' }), signup);
router.post('/verify-email', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), verifyEmail);
router.post('/resend-verification', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), resendVerification);

// iyzico ödeme formu dönüşü (form POST) ve abonelik bildirimleri
router.post('/iyzico/callback', express.urlencoded({ extended: false }), iyzicoCallback);
router.post('/iyzico/webhook', iyzicoWebhook);

// Firmanın sanal POS'u: bayi ödeme formu dönüşü
router.post('/pos/callback', express.urlencoded({ extended: false }), posCallback);
// PayTR ödeme bildirimi (her firmanın kendi adresi; PayTR mağaza panelinde Bildirim URL olarak girilir)
router.post('/paytr/notify/:slug', express.urlencoded({ extended: false }), paytrNotify);

export default router;
