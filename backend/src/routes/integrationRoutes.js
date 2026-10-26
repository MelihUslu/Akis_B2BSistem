import express from 'express';
import {
  listIntegration, createApiKey, revokeApiKey, createWebhook, updateWebhook, deleteWebhook, testWebhook,
  apiListProducts, apiUpdateStock, apiUpdatePrices, apiUpsertProducts, apiListCompanies, apiUpsertCompanies,
  apiSyncBalances, apiListOrders, apiGetOrder, apiMarkExported, apiUpdateOrderStatus
} from '../controllers/integrationController.js';
import { verifyToken, requirePermission } from '../middlewares/authMiddleware.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';
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

// Dış sistemler (ERP / entegratör): /api/v1, API anahtarı ile
export const integrationApiRoutes = express.Router();
integrationApiRoutes.use(apiKeyAuth, rateLimit({ windowMs: 60 * 1000, max: 600, message: 'Dakikalık istek sınırı aşıldı (600).' }));
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
