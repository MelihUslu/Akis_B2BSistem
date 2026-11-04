import express from 'express';
import * as hr from '../controllers/hrController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import { hrDocUpload } from '../middlewares/upload.js';
import { canManage, canPay } from '../services/hrService.js';

/**
 * Personel yönetimi. Bayi hesapları giremez (rol kontrolü); modül kapalıyken /status dışında hiçbir uç çalışmaz.
 * /me: personelin kendi kaydı (yönetici, plasiyer ya da personel hesabı, bağlı personel kartı). Yönetim: Personel (HR)
 * yetkisi. Ödeme: Finans yetkisi. Onay / ret: Personel yetkisi ya da personelin yöneticisi (kontrol uçta).
 */
const router = express.Router();
const HR = hr.requireAny(canManage);
const PAY = hr.requireAny(canPay);
const HR_OR_PAY = hr.requireAny(canManage, canPay);

router.use(verifyToken, checkRole(['ADMIN', 'PLASIYER', 'PERSONEL']));
router.get('/status', hr.status);
router.use(hr.requireHrModule);

// Personelin kendi alanı
router.get('/me', hr.me);
router.get('/me/leaves', hr.myLeaves);
router.get('/me/leave-preview', hr.leavePreview);
router.post('/me/leaves', hr.createLeave);
router.post('/me/leaves/:id/cancel', hr.cancelLeave);
router.get('/me/claims', hr.myClaims);
router.post('/me/claims', hrDocUpload.single('file'), hr.createClaim);
router.post('/me/claims/:id/cancel', hr.cancelClaim);
router.get('/me/targets', hr.myTargets);
router.get('/me/announcements', hr.myAnnouncements);
router.get('/claims/:id/file', hr.claimFile); // sahibi, yöneticisi ya da yetkili (kontrol uçta)
router.get('/team', hr.myTeam); // departman yöneticisi: ekibinin talepleri

// İzin kuralları (Cumartesi, avans izin, tatil günleri)
router.get('/settings', HR, hr.getHrSettings);
router.put('/settings', HR, hr.saveHrSettings);

// Personel kartları
router.get('/employees', HR, hr.listEmployees);
router.post('/employees', HR, hr.createEmployee);
router.put('/employees/:id', HR, hr.updateEmployee);
router.post('/employees/:id/account', HR, hr.createEmployeeAccount);
router.get('/linkable-users', HR, hr.linkableUsers);
router.get('/departments', HR, hr.departments);

// İzinler
router.get('/leaves', HR, hr.listLeaves);
router.post('/leaves/:id/approve', hr.decideLeave(true)); // Personel yetkisi ya da yönetici
router.post('/leaves/:id/reject', hr.decideLeave(false));

// Masraf ve avans: onay Personel, ödeme Finans
router.get('/claims', HR_OR_PAY, hr.listClaims);
router.post('/claims/:id/approve', hr.decideClaim(true)); // Personel yetkisi ya da yönetici
router.post('/claims/:id/reject', hr.decideClaim(false));
router.post('/claims/:id/pay', PAY, hr.payClaim); // kısmi olabilir; avanstan mahsup
router.post('/claims/:id/settle', PAY, hr.settleClaim); // avans: iade ya da maaştan kesinti
router.delete('/payments/:id', PAY, hr.deletePayment); // ödemeyi / mahsubu / iadeyi geri al

// Satış hedefi ve prim: tanım ve kapanış Personel, prim ödemesi Finans
router.get('/targets', HR_OR_PAY, hr.listTargets);
router.post('/targets', HR, hr.createTarget);
router.put('/targets/:id', HR, hr.updateTarget);
router.delete('/targets/:id', HR, hr.deleteTarget);
router.post('/targets/:id/close', HR, hr.closeTarget);
router.post('/targets/:id/pay', PAY, hr.payTarget);

// Şirket duyuruları
router.get('/announcements', HR, hr.listAnnouncements);
router.post('/announcements', HR, hr.createAnnouncement);
router.delete('/announcements/:id', HR, hr.deleteAnnouncement);

export default router;
