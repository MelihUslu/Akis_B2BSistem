import express from 'express';
import { getReturns, createReturn, updateReturn } from '../controllers/returnController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { imageUpload, uploadImage } from '../middlewares/upload.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', getReturns);
router.post('/', checkRole(['BAYI']), createReturn);
router.post('/upload-photo', checkRole(['BAYI']), imageUpload.single('file'), uploadImage);
router.patch('/:id', requirePermission('ORDERS'), updateReturn);

export default router;
