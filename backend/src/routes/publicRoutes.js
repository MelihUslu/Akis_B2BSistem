import express from 'express';
import { reportClientError, domainCheck, getPlans, slugAvailable, signup, verifyEmail, resendVerification, iyzicoCallback, iyzicoWebhook } from '../controllers/publicController.js';
import { platformContext } from '../middlewares/tenantMiddleware.js';
import { posCallback, paytrNotify } from '../controllers/paymentController.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { getPublicSite, startChat, getChat, postChat, postLead } from '../controllers/siteController.js';

const router = express.Router();

// Bu uçlar belirli bir kiracıya bağlı değildir
router.use(platformContext);

router.get('/plans', getPlans);
// Caddy on-demand TLS: yalnızca bize ait alan adlarına sertifika alınsın
router.get('/domain-check', domainCheck);
// Arayüz hata izleme
router.post('/client-errors', rateLimit({ windowMs: 60 * 1000, max: 20 }), reportClientError);
router.get('/slug-available', rateLimit({ windowMs: 60 * 1000, max: 30 }), slugAvailable);
router.post('/signup', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Çok fazla kayıt denemesi. Lütfen daha sonra tekrar deneyin.' }), signup);
router.post('/verify-email', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), verifyEmail);
router.post('/resend-verification', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), resendVerification);

// Tanıtım sitesi: ayarlar, canlı sohbet, demo talebi
router.get('/site', getPublicSite);
router.post('/chat', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Çok fazla sohbet açıldı. Biraz sonra tekrar deneyin.' }), startChat);
router.get('/chat/:id', rateLimit({ windowMs: 60 * 1000, max: 60 }), getChat);
router.post('/chat/:id/messages', rateLimit({ windowMs: 60 * 1000, max: 12, message: 'Çok hızlı mesaj gönderiyorsunuz. Biraz bekleyin.' }), postChat);
router.post('/leads', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyin.' }), postLead);

// iyzico ödeme formu dönüşü (form POST) ve abonelik bildirimleri
router.post('/iyzico/callback', express.urlencoded({ extended: false }), iyzicoCallback);
router.post('/iyzico/webhook', iyzicoWebhook);

// Firmanın sanal POS'u: bayi ödeme formu dönüşü
router.post('/pos/callback', express.urlencoded({ extended: false }), posCallback);
// PayTR ödeme bildirimi (her firmanın kendi adresi; PayTR mağaza panelinde Bildirim URL olarak girilir)
router.post('/paytr/notify/:slug', express.urlencoded({ extended: false }), paytrNotify);

export default router;
