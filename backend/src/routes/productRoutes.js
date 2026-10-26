import express from 'express';
import {
  getProducts, createProduct, updateProduct, deleteProduct, linkAlternative, bulkUpdate, getFilters,
  reorderProducts, resolveSkus, subscribeStockAlert, unsubscribeStockAlert,
  getSpecialPrices, replaceSpecialPrices, getFrequentProducts
} from '../controllers/productController.js';
import { verifyToken, checkRole, requirePermission, requireAnyPermission } from '../middlewares/authMiddleware.js';
import { imageUpload, excelUpload, uploadImage } from '../middlewares/upload.js';

const router = express.Router();

// Tüm ürün rotaları için login şart
router.use(verifyToken);

router.get('/', getProducts);
router.get('/filters', getFilters);

// Bayi self-servis
router.get('/frequent', checkRole(['BAYI']), getFrequentProducts);
router.post('/resolve-skus', checkRole(['BAYI']), resolveSkus);
router.post('/:id/stock-alert', checkRole(['BAYI']), subscribeStockAlert);
router.delete('/:id/stock-alert', checkRole(['BAYI']), unsubscribeStockAlert);

// Sadece ADMIN ürün ekleyebilir, alternatif bağlayabilir ve Excel yükleyebilir
router.post('/', requirePermission('CATALOG'), createProduct);
router.post('/reorder', requirePermission('CATALOG'), reorderProducts);
router.patch('/:id', requirePermission('CATALOG'), updateProduct);
router.delete('/:id', requirePermission('CATALOG'), deleteProduct);
router.get('/:id/special-prices', requirePermission('CATALOG'), getSpecialPrices);
router.put('/:id/special-prices', requirePermission('CATALOG'), replaceSpecialPrices);
router.post('/link-alternative', requirePermission('CATALOG'), linkAlternative);
// Ürün görseli ve firma logosu için ortak
router.post('/upload-image', requireAnyPermission('CATALOG', 'SETTINGS'), imageUpload.single('file'), uploadImage);
router.post('/bulk-update/:type', requirePermission('CATALOG'), excelUpload.single('file'), bulkUpdate);

export default router;
