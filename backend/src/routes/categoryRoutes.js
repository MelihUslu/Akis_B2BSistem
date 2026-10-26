import express from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories } from '../controllers/categoryController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { imageUpload, uploadImage } from '../middlewares/upload.js';

const router = express.Router();

router.get('/', verifyToken, getCategories);
router.post('/reorder', verifyToken, requirePermission('CATALOG'), reorderCategories);
router.post('/', verifyToken, requirePermission('CATALOG'), createCategory);
router.post('/upload-image', verifyToken, requirePermission('CATALOG'), imageUpload.single('file'), uploadImage);
router.patch('/:id', verifyToken, requirePermission('CATALOG'), updateCategory);
router.delete('/:id', verifyToken, requirePermission('CATALOG'), deleteCategory);

export default router;
