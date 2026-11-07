import express from 'express';
import { getCheques, updateCheque } from '../controllers/chequeController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

// Çek / senet portföyü (Finans → Çek / Senet)
const router = express.Router();
router.use(verifyToken, checkRole(['ADMIN']), requirePermission('FINANCE'));
router.get('/', getCheques);
router.post('/:id/:action', updateCheque);

export default router;
