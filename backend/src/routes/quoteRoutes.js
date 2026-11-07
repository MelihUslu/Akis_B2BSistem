import express from 'express';
import {
  listQuotes, getQuote, createQuote, cancelQuote, acceptQuote, dealerFeedback, rejectQuote, quoteAccess,
  quoteMeta, quoteCatalog, priceQuote, aiDraft, createStaffQuote, updateStaffQuote, deleteStaffQuote,
  submitQuote, approveQuote, withdrawQuote, reviseQuote, createShareLink, revokeShareLink, emailQuote,
  convertQuoteToOrder, quoteDocument, quoteHistory, forwardQuote
} from '../controllers/quoteController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { requireDealer } from '../services/dealerAccess.js';

const router = express.Router();

router.use(verifyToken);

// Personel (Teklifler yetkisi) — sabit yollar :id'den önce
const staff = requirePermission('QUOTES');
router.get('/meta', staff, quoteMeta);
router.get('/catalog', staff, quoteCatalog);
router.post('/price', staff, priceQuote);
router.post('/ai/draft', staff, rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: 'Kısa sürede çok fazla yapay zekâ isteği yapıldı. Birkaç dakika sonra tekrar deneyin.' }), aiDraft);
router.post('/draft', staff, createStaffQuote);

// Ortak: bayi kendi tekliflerini, personel tümünü görür
// Teklif fiyat belgesidir: fiyatı göremeyen bayi kullanıcısı teklif ekranlarını kullanamaz
const prices = requireDealer('PRICES');
router.get('/', quoteAccess, prices, listQuotes);
router.get('/:id', quoteAccess, prices, getQuote);
router.get('/:id/document', quoteAccess, prices, quoteDocument);

// Bayi
router.post('/', checkRole(['BAYI']), prices, createQuote);
router.post('/:id/accept', checkRole(['BAYI']), prices, acceptQuote);
router.post('/:id/forward', checkRole(['BAYI']), prices, forwardQuote);
router.post('/:id/feedback', checkRole(['BAYI']), prices, dealerFeedback);
router.post('/:id/cancel', checkRole(['BAYI']), prices, cancelQuote);

// Personel
router.put('/:id', staff, updateStaffQuote);
router.delete('/:id', staff, deleteStaffQuote);
router.get('/:id/history', staff, quoteHistory);
router.post('/:id/submit', staff, submitQuote);
router.post('/:id/approve', staff, requirePermission('QUOTE_APPROVAL'), approveQuote);
router.post('/:id/withdraw', staff, withdrawQuote);
router.post('/:id/revise', staff, reviseQuote);
router.post('/:id/reject', staff, rejectQuote);
router.post('/:id/share', staff, createShareLink);
router.delete('/:id/share', staff, revokeShareLink);
router.post('/:id/email', staff, rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: 'Çok fazla e-posta gönderimi. Lütfen daha sonra tekrar deneyin.' }), emailQuote);
router.post('/:id/convert', staff, requirePermission('ORDERS'), convertQuoteToOrder);

export default router;
