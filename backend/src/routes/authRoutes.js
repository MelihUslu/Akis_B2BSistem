import express from 'express';
import {
  register, login, getMe, changePassword, listUsers,
  verifyTwoFactorLogin, twoFactorStatus, twoFactorSetup, twoFactorEnable, twoFactorDisable
} from '../controllers/authController.js';
import { verifyToken, checkRole, requirePermission, blockImpersonation } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = express.Router();

router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' }), login);
router.post('/2fa/verify', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Çok fazla hatalı kod. 15 dakika sonra tekrar deneyin.' }), verifyTwoFactorLogin);
router.get('/me', verifyToken, getMe);
router.get('/2fa', verifyToken, twoFactorStatus);
router.post('/2fa/setup', verifyToken, blockImpersonation, twoFactorSetup);
router.post('/2fa/enable', verifyToken, blockImpersonation, twoFactorEnable);
router.post('/2fa/disable', verifyToken, blockImpersonation, twoFactorDisable);
router.post('/change-password', verifyToken, blockImpersonation, changePassword);

// Kullanıcı oluşturma ve listeleme sadece ADMIN yetkisindedir
router.post('/register', verifyToken, requirePermission('SETTINGS'), register);
router.get('/users', verifyToken, checkRole(['ADMIN']), listUsers);

export default router;
