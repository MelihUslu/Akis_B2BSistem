import express from 'express';
import { listLeads, createLead, updateLead, deleteLead, exportLeads, getFormConfig, saveFormConfig } from '../controllers/customerLeadController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { heavyLimit } from '../middlewares/heavyLimit.js';

const router = express.Router();

router.use(verifyToken, requirePermission('LEADS'));

router.get('/', listLeads);
router.get('/export', heavyLimit, exportLeads);
router.get('/form', getFormConfig);
router.put('/form', saveFormConfig);
router.post('/', createLead);
router.patch('/:id', updateLead);
router.delete('/:id', deleteLead);

export default router;
