import express from 'express';
import { listAddresses, createAddress, updateAddress, deleteAddress } from '../controllers/addressController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

// Bayinin kendi teslimat adresleri
const router = express.Router();
router.use(verifyToken, checkRole(['BAYI']));
router.get('/', listAddresses);
router.post('/', createAddress);
router.patch('/:id', updateAddress);
router.delete('/:id', deleteAddress);

export default router;
