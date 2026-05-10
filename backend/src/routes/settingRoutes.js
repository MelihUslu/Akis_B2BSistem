import express from 'express';
import { getSettings, updateSetting } from '../controllers/settingController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getSettings);
router.post('/', checkRole(['ADMIN']), updateSetting);

export default router;
