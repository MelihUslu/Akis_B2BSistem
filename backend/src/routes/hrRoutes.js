import express from 'express';
import * as hr from '../controllers/hrController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import { hrDocUpload } from '../middlewares/upload.js';
import { canManage, canPay } from '../services/hrService.js';

/**
 * Personel yönetimi. Bayi hesapları giremez (rol kontrolü); modül kapalıyken /status dışında hiçbir uç çalışmaz.
 * /me: personelin kendi kaydı (yönetici ya da plasiyer hesabı, bağlı personel kartı). Yönetim: Personel (HR) yetkisi.
 * Ödeme: Finans yetkisi. Ödeme bekleyen talepler ve primler Finans yetkilisine de listelenir.
 */
const router = express.Router();
const HR = hr.requireAny(canManage);
const PAY = hr.requireAny(canPay);
const HR_OR_PAY = hr.requireAny(canManage, canPay);

router.use(verifyToken, checkRole(['ADMIN', 'PLASIYER']));
router.get('/status', hr.status);
router.use(hr.requireHrModule);

// Personelin kendi alanı
router.get('/me', hr.me);
router.get('/me/leaves', hr.myLeaves);
router.post('/me/leaves', hr.createLeave);
router.post('/me/leaves/:id/cancel', hr.cancelLeave);
router.get('/me/claims', hr.myClaims);
router.post('/me/claims', hrDocUpload.single('file'), hr.createClaim);
router.post('/me/claims/:id/cancel', hr.cancelClaim);
router.get('/me/targets', hr.myTargets);
router.get('/me/announcements', hr.myAnnouncements);
router.get('/claims/:id/file', hr.claimFile); // sahibi ya da yetkili (kontrol uçta)

// Personel kartları
router.get('/employees', HR, hr.listEmployees);
router.post('/employees', HR, hr.createEmployee);
router.put('/employees/:id', HR, hr.updateEmployee);
router.get('/linkable-users', HR, hr.linkableUsers);
router.get('/departments', HR, hr.departments);

// İzinler
router.get('/leaves', HR, hr.listLeaves);
router.post('/leaves/:id/approve', HR, hr.decideLeave(true));
router.post('/leaves/:id/reject', HR, hr.decideLeave(false));

// Masraf ve avans: onay Personel, ödeme Finans
router.get('/claims', HR_OR_PAY, hr.listClaims);
router.post('/claims/:id/approve', HR, hr.decideClaim(true));
router.post('/claims/:id/reject', HR, hr.decideClaim(false));
router.post('/claims/:id/pay', PAY, hr.payClaim);
router.post('/claims/:id/unpay', PAY, hr.unpayClaim);

// Satış hedefi ve prim: tanım ve kapanış Personel, prim ödemesi Finans
router.get('/targets', HR_OR_PAY, hr.listTargets);
router.post('/targets', HR, hr.createTarget);
router.put('/targets/:id', HR, hr.updateTarget);
router.delete('/targets/:id', HR, hr.deleteTarget);
router.post('/targets/:id/close', HR, hr.closeTarget);
router.post('/targets/:id/pay', PAY, hr.payTarget);
router.post('/targets/:id/unpay', PAY, hr.unpayTarget);

// Şirket duyuruları
router.get('/announcements', HR, hr.listAnnouncements);
router.post('/announcements', HR, hr.createAnnouncement);
router.delete('/announcements/:id', HR, hr.deleteAnnouncement);

export default router;
