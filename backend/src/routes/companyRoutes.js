import express from 'express';
import { getCompanies, createCompany, updateCompany, resetPassword } from '../controllers/companyController.js';
import { listDealerUsers, addDealerUser, updateDealerUser, resetDealerUserPassword } from '../controllers/teamController.js';
import { verifyToken, checkRole, requirePermission, requireAnyPermission } from '../middlewares/authMiddleware.js';
import { listAddresses, createAddress, updateAddress, deleteAddress } from '../controllers/addressController.js';

const router = express.Router();

router.use(verifyToken);
router.use(checkRole(['ADMIN']));

// Bayi listesi bayi seçimi olan ekranlara açık: bayiler, cari / hedef, sipariş (bayi adına), özel fiyat / kupon, teklif
router.get('/', requireAnyPermission('DEALERS', 'FINANCE', 'ORDERS', 'CATALOG', 'QUOTES'), getCompanies);
router.post('/', requirePermission('DEALERS'), createCompany);
router.patch('/:id', requirePermission('DEALERS'), updateCompany);
router.post('/:companyId/reset-password', requirePermission('DEALERS'), resetPassword);

// Bayinin kullanıcıları (şube / çalışan hesapları)
router.get('/:companyId/users', requirePermission('DEALERS'), listDealerUsers);
router.post('/:companyId/users', requirePermission('DEALERS'), addDealerUser);
router.patch('/:companyId/users/:userId', requirePermission('DEALERS'), updateDealerUser);
router.post('/:companyId/users/:userId/reset-password', requirePermission('DEALERS'), resetDealerUserPassword);

// Bayinin teslimat adresleri (yönetici bayi adına da düzenleyebilir)
router.get('/:companyId/addresses', requirePermission('DEALERS'), listAddresses);
router.post('/:companyId/addresses', requirePermission('DEALERS'), createAddress);
router.patch('/:companyId/addresses/:id', requirePermission('DEALERS'), updateAddress);
router.delete('/:companyId/addresses/:id', requirePermission('DEALERS'), deleteAddress);

export default router;
