import express from 'express';
import {
  listPartners, getPartner, createPartner, updatePartner, deletePartner, partnerAccess, partnerMeta,
  exportPartners, importTemplate, importPartners, convertToDealer
} from '../controllers/partnerController.js';
import { createPayment, getPayment, getTransactions, exportTransactions, reverse } from '../controllers/partnerLedgerController.js';
import { addNote, updateNote, deleteNote, uploadDocument, downloadDocument, deleteDocument, createStatementLink } from '../controllers/partnerExtrasController.js';
import { verifyToken, checkRole, requireAnyPermission, requirePermission } from '../middlewares/authMiddleware.js';
import { excelUpload, partnerDocUpload } from '../middlewares/upload.js';

// Cari Hesaplar (bayi + portal dışı müşteri + tedarikçi)
const router = express.Router();
const finance = requirePermission('FINANCE');

router.use(verifyToken, checkRole(['ADMIN']));

router.get('/', partnerAccess, listPartners);
router.get('/meta', partnerAccess, partnerMeta);
router.get('/export', partnerAccess, exportPartners);
router.get('/import/template', partnerAccess, importTemplate);
router.post('/import', partnerAccess, excelUpload.single('file'), importPartners);
// Teklif hazırlayan personel de hızlıca müşteri kartı açabilir (türü kontrolcüde denetlenir)
router.post('/', requireAnyPermission('FINANCE', 'DEALERS', 'QUOTES'), createPartner);
router.get('/payments/:paymentId', finance, getPayment);

router.get('/:id', partnerAccess, getPartner);
router.patch('/:id', partnerAccess, updatePartner);
router.delete('/:id', partnerAccess, deletePartner);
router.post('/:id/convert-to-dealer', requirePermission('DEALERS'), convertToDealer);

// Cari defteri (Finans)
router.post('/:id/payments', finance, createPayment);
router.get('/:id/transactions', finance, getTransactions);
router.get('/:id/transactions/export', finance, exportTransactions);
router.post('/:id/transactions/:txId/reverse', finance, reverse);
router.post('/:id/statement-link', finance, createStatementLink);

// Notlar ve belgeler
router.post('/:id/notes', partnerAccess, addNote);
router.patch('/:id/notes/:noteId', partnerAccess, updateNote);
router.delete('/:id/notes/:noteId', partnerAccess, deleteNote);
router.post('/:id/documents', partnerAccess, partnerDocUpload.single('file'), uploadDocument);
router.get('/:id/documents/:docId', partnerAccess, downloadDocument);
router.delete('/:id/documents/:docId', partnerAccess, deleteDocument);

export default router;
