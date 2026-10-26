import express from 'express';
import { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, productStocks, transferStock } from '../controllers/warehouseController.js';
import { verifyToken, checkRole, requirePermission, requireAnyPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(verifyToken, checkRole(['ADMIN']));
// Depo listesi katalog ve sipariş ekranlarında da gerekir
router.get('/', requireAnyPermission('CATALOG', 'ORDERS', 'SETTINGS'), listWarehouses);
router.get('/stocks/:productId', requireAnyPermission('CATALOG', 'ORDERS'), productStocks);
router.post('/transfer', requirePermission('CATALOG'), transferStock);
router.post('/', requirePermission('SETTINGS'), createWarehouse);
router.patch('/:id', requirePermission('SETTINGS'), updateWarehouse);
router.delete('/:id', requirePermission('SETTINGS'), deleteWarehouse);

export default router;
