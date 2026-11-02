import express from 'express';
import { listLeads, createLead, updateLead, deleteLead, exportLeads } from '../controllers/customerLeadController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, requirePermission('LEADS'));

router.get('/', listLeads);
router.get('/export', exportLeads);
router.post('/', createLead);
router.patch('/:id', updateLead);
router.delete('/:id', deleteLead);

export default router;
