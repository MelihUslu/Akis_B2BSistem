import express from 'express';
import {
  listIntegration, createApiKey, revokeApiKey, createWebhook, updateWebhook, deleteWebhook, testWebhook, listDeliveries, redeliverWebhook,
  apiListProducts, apiUpdateStock, apiUpdatePrices, apiUpsertProducts, apiListCompanies, apiUpsertCompanies,
  apiSyncBalances, apiListOrders, apiGetOrder, apiMarkExported, apiUpdateOrderStatus, apiSendSampleEvent
} from '../controllers/integrationController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';
import { apiRequestLogger } from '../services/monitoring.js';
import { setInvoiceNumber } from '../controllers/invoicingController.js';
import prisma from '../utils/prisma.js';
import { rateLimit } from '../middlewares/rateLimit.js';

// Panel: anahtar ve webhook yönetimi (X-Tenant + oturum)
export const integrationAdminRoutes = express.Router();
integrationAdminRoutes.use(verifyToken, requirePermission('SETTINGS'));
integrationAdminRoutes.get('/', listIntegration);
integrationAdminRoutes.post('/keys', createApiKey);
integrationAdminRoutes.delete('/keys/:id', revokeApiKey);
integrationAdminRoutes.post('/webhooks', createWebhook);
integrationAdminRoutes.patch('/webhooks/:id', updateWebhook);
integrationAdminRoutes.delete('/webhooks/:id', deleteWebhook);
integrationAdminRoutes.post('/webhooks/:id/test', testWebhook);
integrationAdminRoutes.get('/webhooks/:id/deliveries', listDeliveries);
integrationAdminRoutes.post('/deliveries/:deliveryId/redeliver', redeliverWebhook);

// Dış sistemler (ERP / entegratör): /api/v1, API anahtarı ile
export const integrationApiRoutes = express.Router();
integrationApiRoutes.use(apiRequestLogger, apiKeyAuth, rateLimit({ windowMs: 60 * 1000, max: 600, message: 'Dakikalık istek sınırı aşıldı (600).' }));
integrationApiRoutes.get('/products', apiListProducts);
integrationApiRoutes.put('/products/stock', apiUpdateStock);
integrationApiRoutes.put('/products/prices', apiUpdatePrices);
integrationApiRoutes.post('/products/upsert', apiUpsertProducts);
integrationApiRoutes.get('/companies', apiListCompanies);
integrationApiRoutes.post('/companies/upsert', apiUpsertCompanies);
integrationApiRoutes.put('/companies/balances', apiSyncBalances);
integrationApiRoutes.get('/orders', apiListOrders);
integrationApiRoutes.get('/orders/:id', apiGetOrder);
integrationApiRoutes.post('/orders/:id/exported', apiMarkExported);
integrationApiRoutes.patch('/orders/:id/status', apiUpdateOrderStatus);
// ERP'de kesilen faturanın numarası / PDF adresi (bayi sipariş detayında görür)
integrationApiRoutes.put('/orders/:id/invoice', async (req, res) => {
  req.user = { role: 'ADMIN' }; // API anahtarı firma yöneticisi yetkisiyle çalışır
  if (req.apiKey?.isTest) {
    const exists = await prisma.order.count({ where: { id: parseInt(req.params.id) } });
    if (!exists) return res.status(404).json({ error: 'Sipariş bulunamadı.' });
    if (!String(req.body.number || '').trim()) return res.status(400).json({ error: 'Fatura numarası girin.' });
    return res.json({ ok: true, dryRun: true });
  }
  return setInvoiceNumber(req, res, 'ERP');
});
integrationApiRoutes.post('/webhooks/test', apiSendSampleEvent);
