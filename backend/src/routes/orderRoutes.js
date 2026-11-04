import express from 'express';
import { orderStats, getOrders, getOrderById, exportOrders, partialApproveOrder, shipOrder, completeOrder, readyOrder, createOrder, quoteOrder, cancelOrderByDealer, addPartialShipment, setDespatch } from '../controllers/orderController.js';
import { verifyToken, checkRole, requirePermission } from '../middlewares/authMiddleware.js';
import { createShipment, refreshShipment, cancelShipment } from '../controllers/cargoController.js';
import { getOrderInvoice, issueInvoice, setInvoiceNumber, removeInvoice, invoicePdfRedirect } from '../controllers/invoicingController.js';

const router = express.Router();

router.use(verifyToken);

// Bayi kendi siparişlerini, admin tüm siparişleri görür
router.get('/', getOrders);
router.get('/export', exportOrders);
router.get('/stats', requirePermission('ORDERS'), orderStats);
// Fatura: bayi kendi siparişininkini görür; kesme / numara girme yönetici işidir
router.get('/:id/invoice', getOrderInvoice);
router.get('/:id/invoice/pdf', invoicePdfRedirect);
router.post('/:id/invoice', requirePermission('ORDERS'), issueInvoice);
router.put('/:id/invoice', requirePermission('ORDERS'), (req, res) => setInvoiceNumber(req, res, 'MANUAL'));
router.delete('/:id/invoice', requirePermission('ORDERS'), removeInvoice);
// Kargo firması entegrasyonu: gönderi oluştur / durumu güncelle / iptal
router.post('/:id/shipment', requirePermission('ORDERS'), createShipment);
router.post('/:id/shipment/refresh', requirePermission('ORDERS'), refreshShipment);
router.delete('/:id/shipment', requirePermission('ORDERS'), cancelShipment);
router.get('/:id', getOrderById);
router.post('/quote', checkRole(['BAYI']), quoteOrder);
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
