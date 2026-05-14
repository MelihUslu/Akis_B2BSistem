import express from 'express';
import { getCategories, createCategory, updateCategory, deleteCategory, reorderCategories } from '../controllers/categoryController.js';
import { uploadImage } from '../controllers/productController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/images/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

const router = express.Router();

router.get('/', verifyToken, getCategories);
router.post('/reorder', verifyToken, checkRole(['ADMIN']), reorderCategories);
router.post('/', verifyToken, checkRole(['ADMIN']), createCategory);
router.post('/upload-image', verifyToken, checkRole(['ADMIN']), upload.single('file'), uploadImage);
router.patch('/:id', verifyToken, checkRole(['ADMIN']), updateCategory);
router.delete('/:id', verifyToken, checkRole(['ADMIN']), deleteCategory);

export default router;
