import express from 'express';
import {
  register, login, handoffLogin, googleLogin, getMe, changePassword, listUsers,
  verifyTwoFactorLogin, forgotPassword, resetPassword, getNotificationPrefs, saveNotificationPrefs, twoFactorStatus, twoFactorSetup, twoFactorEnable, twoFactorDisable
} from '../controllers/authController.js';
import { verifyToken, checkRole, requirePermission, requireAnyPermission, blockImpersonation } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { blockGuard } from '../services/abuseGuard.js';

const router = express.Router();

router.post('/handoff', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), handoffLogin);
router.post('/google', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), googleLogin);
router.post('/login', blockGuard, rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar deneyin.' }), login);
router.post('/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' }), forgotPassword);
router.post('/reset-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), resetPassword);
router.post('/2fa/verify', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Çok fazla hatalı kod. 15 dakika sonra tekrar deneyin.' }), verifyTwoFactorLogin);
router.get('/me', verifyToken, getMe);
router.get('/notification-prefs', verifyToken, getNotificationPrefs);
router.put('/notification-prefs', verifyToken, saveNotificationPrefs);
router.get('/2fa', verifyToken, twoFactorStatus);
router.post('/2fa/setup', verifyToken, blockImpersonation, twoFactorSetup);
router.post('/2fa/enable', verifyToken, blockImpersonation, twoFactorEnable);
router.post('/2fa/disable', verifyToken, blockImpersonation, twoFactorDisable);
router.post('/change-password', verifyToken, blockImpersonation, changePassword);

// Kullanıcı oluşturma ve listeleme sadece ADMIN yetkisindedir
router.post('/register', verifyToken, requirePermission('SETTINGS'), register);
// Kullanıcı listesi (Ayarlar, Bayiler → plasiyer seçimi)
router.get('/users', verifyToken, checkRole(['ADMIN']), requireAnyPermission('SETTINGS', 'DEALERS'), listUsers);

export default router;
