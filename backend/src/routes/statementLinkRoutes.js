import express from 'express';
import { viewStatementLink, respondStatementLink } from '../controllers/partnerExtrasController.js';
import { rateLimit } from '../middlewares/rateLimit.js';

// Cariye gönderilen ekstre bağlantısı (giriş gerektirmez; firma alt alan adından belirlenir)
const router = express.Router();

router.get('/:token', rateLimit({ windowMs: 60 * 1000, max: 60 }), viewStatementLink);
router.post('/:token/respond', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Çok fazla deneme yaptınız. Lütfen daha sonra tekrar deneyin.' }), respondStatementLink);

export default router;
