import express from 'express';
import { getCompanies, createCompany, updateCompany, resetPassword } from '../controllers/companyController.js';
import { listDealerUsers, addDealerUser, updateDealerUser, resetDealerUserPassword } from '../controllers/teamController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(checkRole(['ADMIN']));

// Bayi listesi tüm yöneticilere açık (özel fiyat, kupon gibi ekranlarda bayi seçimi için)
router.get('/', getCompanies);
router.post('/', requirePermission('DEALERS'), createCompany);
router.patch('/:id', requirePermission('DEALERS'), updateCompany);
router.post('/:companyId/reset-password', requirePermission('DEALERS'), resetPassword);

// Bayinin kullanıcıları (şube / çalışan hesapları)
router.get('/:companyId/users', requirePermission('DEALERS'), listDealerUsers);
router.post('/:companyId/users', requirePermission('DEALERS'), addDealerUser);
router.patch('/:companyId/users/:userId', requirePermission('DEALERS'), updateDealerUser);
router.post('/:companyId/users/:userId/reset-password', requirePermission('DEALERS'), resetDealerUserPassword);

export default router;
