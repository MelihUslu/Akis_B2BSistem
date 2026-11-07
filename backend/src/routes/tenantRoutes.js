import express from 'express';
import { getPublicTenant, updateTenant, getPosSettings, savePosSettings, removePosSettings, savePosInstallments } from '../controllers/tenantController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/public', getPublicTenant);
router.patch('/', verifyToken, requirePermission('SETTINGS'), updateTenant);
router.get('/pos', verifyToken, requirePermission('SETTINGS'), getPosSettings);
router.put('/pos', verifyToken, requirePermission('SETTINGS'), savePosSettings);
router.put('/pos/installments', verifyToken, requirePermission('SETTINGS'), savePosInstallments);
router.delete('/pos', verifyToken, requirePermission('SETTINGS'), removePosSettings);

export default router;
