import express from 'express';
import { orderStats, getOrders, getOrderById, exportOrders, partialApproveOrder, shipOrder, completeOrder, readyOrder, createOrder, quoteOrder, cancelOrderByDealer, addPartialShipment, setDespatch } from '../controllers/orderController.js';
import { verifyToken, checkRole, requirePermission, adminNeeds } from '../middlewares/authMiddleware.js';
import { createShipment, refreshShipment, cancelShipment } from '../controllers/cargoController.js';
import { getOrderInvoice, issueInvoice, setInvoiceNumber, removeInvoice, invoicePdfRedirect } from '../controllers/invoicingController.js';
import { heavyLimit } from '../middlewares/heavyLimit.js';
import { requireDealer } from '../services/dealerAccess.js';

const router = express.Router();

router.use(verifyToken);

// Bayi kendi siparişlerini, yönetici (Siparişler ya da Finans yetkisiyle) tüm siparişleri görür
const ORDER_READ = adminNeeds('ORDERS', 'FINANCE');
router.get('/', ORDER_READ, getOrders);
router.get('/export', ORDER_READ, heavyLimit, exportOrders);
router.get('/stats', requirePermission('ORDERS'), orderStats);
// Fatura: bayi kendi siparişininkini görür; kesme / numara girme yönetici işidir
router.get('/:id/invoice', ORDER_READ, requireDealer('PRICES'), getOrderInvoice);
router.get('/:id/invoice/pdf', ORDER_READ, requireDealer('PRICES'), invoicePdfRedirect);
router.post('/:id/invoice', requirePermission('ORDERS'), issueInvoice);
router.put('/:id/invoice', requirePermission('ORDERS'), (req, res) => setInvoiceNumber(req, res, 'MANUAL'));
router.delete('/:id/invoice', requirePermission('ORDERS'), removeInvoice);
// Kargo firması entegrasyonu: gönderi oluştur / durumu güncelle / iptal
router.post('/:id/shipment', requirePermission('ORDERS'), createShipment);
router.post('/:id/shipment/refresh', requirePermission('ORDERS'), refreshShipment);
router.delete('/:id/shipment', requirePermission('ORDERS'), cancelShipment);
router.get('/:id', ORDER_READ, getOrderById);
router.post('/quote', checkRole(['BAYI']), requireDealer('PRICES'), quoteOrder);
router.post('/', checkRole(['BAYI']), createOrder);
// Bayi onay bekleyen siparişini iptal eder
router.patch('/:id/cancel', checkRole(['BAYI']), cancelOrderByDealer);

// Sadece ADMIN yönetebilir
router.patch('/:id/partial-approve', requirePermission('ORDERS'), partialApproveOrder);
router.patch('/:id/ship', requirePermission('ORDERS'), shipOrder);
router.patch('/:id/ready', requirePermission('ORDERS'), readyOrder);
router.patch('/:id/complete', requirePermission('ORDERS'), completeOrder);
// Kısmi sevkiyat (kalem / miktar seçerek) ve irsaliye numarası
router.post('/:id/shipments', requirePermission('ORDERS'), addPartialShipment);
router.patch('/:id/despatch', requirePermission('ORDERS'), setDespatch);

export default router;
