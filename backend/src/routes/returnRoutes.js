import express from 'express';
import { getReturns, createReturn, updateReturn } from '../controllers/returnController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { imageUpload, uploadImage } from '../middlewares/upload.js';
import { requireDealer } from '../services/dealerAccess.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', requireDealer('RETURNS'), getReturns);
router.post('/', checkRole(['BAYI']), requireDealer('RETURNS'), createReturn);
router.post('/upload-photo', checkRole(['BAYI']), requireDealer('RETURNS'), imageUpload.single('file'), uploadImage);
router.patch('/:id', requirePermission('ORDERS'), updateReturn);

export default router;
