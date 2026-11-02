import express from 'express';
import { getSettings, updateSetting, getRates, getPortalSettings } from '../controllers/settingController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

// Okuma tüm yöneticilere açık (ör. ürün ekranındaki genel fiyat gizleme ayarı)
router.get('/', checkRole(['ADMIN']), getSettings);
router.get('/exchange-rates', getRates);
router.get('/portal', getPortalSettings);
router.post('/', requirePermission('SETTINGS'), updateSetting);

export default router;
