import express from 'express';
import {
  listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, productStocks, transferStock,
  manualAdjust, stockCount, listMovements, lowStock,
  listBins, createBin, updateBin, deleteBin, binContents, putAway, relocate,
  barcodeLookup, pickList
} from '../controllers/warehouseController.js';
import { verifyToken, checkRole, requirePermission, requireAnyPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.use(verifyToken, checkRole(['ADMIN']));

// Depo listesi katalog, sipariş ve depo ekranlarında gerekir
router.get('/', requireAnyPermission('WAREHOUSE', 'CATALOG', 'ORDERS', 'SETTINGS'), listWarehouses);
router.get('/stocks/:productId', requireAnyPermission('WAREHOUSE', 'CATALOG', 'ORDERS'), productStocks);

// ─── Depo yönetimi (WMS) — Depo yetkisi ───────────────────────────────────────
router.get('/movements', requirePermission('WAREHOUSE'), listMovements);
router.get('/low-stock', requirePermission('WAREHOUSE'), lowStock);
router.get('/picklist', requireAnyPermission('WAREHOUSE', 'ORDERS'), pickList);
router.get('/barcode/:code', requirePermission('WAREHOUSE'), barcodeLookup);
router.post('/adjust', requirePermission('WAREHOUSE'), manualAdjust);
router.post('/count', requirePermission('WAREHOUSE'), stockCount);
router.post('/transfer', requireAnyPermission('WAREHOUSE', 'CATALOG'), transferStock);

// Raf / göz
router.get('/bins', requirePermission('WAREHOUSE'), listBins);
router.post('/bins', requirePermission('WAREHOUSE'), createBin);
router.patch('/bins/:id', requirePermission('WAREHOUSE'), updateBin);
router.delete('/bins/:id', requirePermission('WAREHOUSE'), deleteBin);
router.get('/bins/:id/contents', requirePermission('WAREHOUSE'), binContents);
router.post('/bins/putaway', requirePermission('WAREHOUSE'), putAway);
router.post('/bins/relocate', requirePermission('WAREHOUSE'), relocate);

// Depo tanımlama (Ayarlar sekmesi ve Depo ekranından; geriye uyumluluk için SETTINGS de kabul)
router.post('/', requireAnyPermission('WAREHOUSE', 'SETTINGS'), createWarehouse);
router.patch('/:id', requireAnyPermission('WAREHOUSE', 'SETTINGS'), updateWarehouse);
router.delete('/:id', requireAnyPermission('WAREHOUSE', 'SETTINGS'), deleteWarehouse);

export default router;
