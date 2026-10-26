import express from 'express';
import { supportUpload, uploadSupportFile } from '../middlewares/upload.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import {
  listAuditLogs, activeAnnouncements, supportMeta, listTickets, getTicket, createTicket, replyTicket, closeTicket,
  getDomain, setDomain, verifyDomain, removeDomain, exportData, closeAccount
} from '../controllers/accountController.js';
import { verifyToken, checkRole, requirePermission, blockImpersonation } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, checkRole(['ADMIN']));

router.get('/audit-logs', requirePermission('SETTINGS'), listAuditLogs);
router.get('/announcements', activeAnnouncements);

router.get('/support-meta', supportMeta);
router.post('/support/upload', rateLimit({ windowMs: 60 * 60 * 1000, max: 60, message: 'Çok fazla dosya yüklediniz. Biraz sonra tekrar deneyin.' }), supportUpload.single('file'), uploadSupportFile);
router.get('/support', listTickets);
router.post('/support', createTicket);
router.get('/support/:id', getTicket);
router.post('/support/:id/messages', replyTicket);
router.post('/support/:id/close', closeTicket);

router.get('/domain', requirePermission('SETTINGS'), getDomain);
router.put('/domain', requirePermission('SETTINGS'), setDomain);
router.post('/domain/verify', requirePermission('SETTINGS'), verifyDomain);
router.delete('/domain', requirePermission('SETTINGS'), removeDomain);

router.get('/export', requirePermission('SETTINGS'), exportData);
router.post('/close', requirePermission('SETTINGS'), blockImpersonation, closeAccount);

export default router;
