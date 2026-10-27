import express from 'express';
import { viewSharedQuote, respondSharedQuote } from '../controllers/quoteShareController.js';
import { rateLimit } from '../middlewares/rateLimit.js';

// Müşteriye gönderilen teklif bağlantısı (giriş gerektirmez; firma alt alan adından belirlenir)
const router = express.Router();

router.get('/:token', rateLimit({ windowMs: 60 * 1000, max: 60 }), viewSharedQuote);
router.post('/:token/respond', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin.' }), respondSharedQuote);

export default router;
