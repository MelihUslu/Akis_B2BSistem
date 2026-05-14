import express from 'express';
import multer from 'multer';
import path from 'path';
import { getProducts, createProduct, updateProduct, linkAlternative, bulkUpdate, getFilters, uploadImage, reorderProducts } from '../controllers/productController.js';
import { verifyToken, checkRole } from '../middlewares/authMiddleware.js';

// Multer Disk Storage Config for Images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/images/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });
const excelUpload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Tüm ürün rotaları için login şart
router.use(verifyToken);

router.get('/', getProducts);
router.get('/filters', getFilters);

// Sadece ADMIN ürün ekleyebilir, alternatif bağlayabilir ve Excel yükleyebilir
router.post('/', checkRole(['ADMIN']), createProduct);
router.post('/reorder', checkRole(['ADMIN']), reorderProducts);
router.patch('/:id', checkRole(['ADMIN']), updateProduct);
router.post('/link-alternative', checkRole(['ADMIN']), linkAlternative);
router.post('/upload-image', checkRole(['ADMIN']), upload.single('file'), uploadImage);
router.post('/bulk-update/:type', checkRole(['ADMIN']), excelUpload.single('file'), bulkUpdate);

export default router;
