import express from 'express';
import { getCargoSettings, saveCargoSettings, testCargoSettings } from '../controllers/cargoController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';

// Kargo entegrasyonu ayarları (Ayarlar → Kargo)
const router = express.Router();
router.use(verifyToken, requirePermission('SETTINGS'));
router.get('/', getCargoSettings);
router.put('/', saveCargoSettings);
router.post('/test', testCargoSettings);

export default router;
