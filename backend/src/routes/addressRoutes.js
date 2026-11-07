import express from 'express';
import { listAddresses, createAddress, updateAddress, deleteAddress } from '../controllers/addressController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import { requireDealer } from '../services/dealerAccess.js';

// Bayinin kendi teslimat adresleri
const router = express.Router();
router.use(verifyToken, checkRole(['BAYI']));
router.get('/', listAddresses);
router.post('/', requireDealer('ADDRESSES'), createAddress);
router.patch('/:id', requireDealer('ADDRESSES'), updateAddress);
router.delete('/:id', requireDealer('ADDRESSES'), deleteAddress);

export default router;
