import express from 'express';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { listTargets, createTarget, updateTarget, deleteTarget, closeTarget, myTargets } from '../controllers/targetController.js';
import { requireDealer } from '../services/dealerAccess.js';

const router = express.Router();
router.use(verifyToken);

// Bayi kendi hedeflerini görür; tanımlama ve kapatma finans yetkisindedir
router.get('/mine', checkRole(['BAYI']), requireDealer('FINANCE'), myTargets);
router.get('/', requirePermission('FINANCE'), listTargets);
router.post('/', requirePermission('FINANCE'), createTarget);
router.patch('/:id', requirePermission('FINANCE'), updateTarget);
router.delete('/:id', requirePermission('FINANCE'), deleteTarget);
router.post('/:id/close', requirePermission('FINANCE'), closeTarget);

export default router;
