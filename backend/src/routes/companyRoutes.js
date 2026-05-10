import express from 'express';
import { getCompanies, createCompany, updateCompany, resetPassword } from '../controllers/companyController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken);
router.use(checkRole(['ADMIN'])); // Sadece ADMIN bayi yönetebilir

router.get('/', getCompanies);
router.post('/', createCompany);
router.patch('/:id', updateCompany);
router.post('/:companyId/reset-password', resetPassword);

export default router;
