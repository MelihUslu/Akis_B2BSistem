import express from 'express';
import {
  platformLogin, getDashboard, listTenants, getTenant, createTenant, updateTenant, addManualPayment,
  resetTenantAdminPassword, listPlans, createPlan, updatePlan, syncPlanToIyzico, listPayments,
  platformVerifyTwoFactor, platformForgotPassword, platformResetPassword, retrySubscriptionInvoice, subscriptionInvoicePdfUrl, listErrors, resolveError, platformTwoFactorStatus, platformTwoFactorSetup, platformTwoFactorEnable, platformTwoFactorDisable,
  impersonateTenant, exportTenantData, reopenTenant, purgeTenantData, platformAuditLogs,
  listAnnouncements, createAnnouncement, deleteAnnouncement, listSupportTickets, getSupportTicket, replySupportTicket
} from '../controllers/platformController.js';
import { auditTrail } from '../services/auditService.js';
import { supportUpload, uploadSupportFile } from '../middlewares/upload.js';
import { platformContext } from '../middlewares/tenantMiddleware.js';
import { verifyPlatform } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = express.Router();

// Platform uçları kiracı filtresi olmadan çalışır; bu yüzden sadece SUPER_ADMIN erişebilir
router.use(platformContext);

router.post('/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), platformLogin);
router.post('/auth/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' }), platformForgotPassword);
router.post('/auth/reset-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), platformResetPassword);
router.post('/auth/2fa/verify', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), platformVerifyTwoFactor);

router.use(verifyPlatform, auditTrail);

router.get('/me/2fa', platformTwoFactorStatus);
router.post('/me/2fa/setup', platformTwoFactorSetup);
router.post('/me/2fa/enable', platformTwoFactorEnable);
router.post('/me/2fa/disable', platformTwoFactorDisable);

router.get('/dashboard', getDashboard);
router.get('/tenants', listTenants);
router.post('/tenants', createTenant);
router.get('/tenants/:id', getTenant);
router.patch('/tenants/:id', updateTenant);
router.post('/tenants/:id/payments', addManualPayment);
router.post('/tenants/:id/admins/:userId/reset-password', resetTenantAdminPassword);
router.get('/plans', listPlans);
router.post('/plans', createPlan);
router.patch('/plans/:id', updatePlan);
router.post('/plans/:id/sync-iyzico', syncPlanToIyzico);
router.get('/payments', listPayments);
router.post('/payments/:id/invoice', retrySubscriptionInvoice);
router.get('/payments/:id/invoice/pdf', subscriptionInvoicePdfUrl);
router.post('/tenants/:id/impersonate', impersonateTenant);
router.get('/tenants/:id/export', exportTenantData);
router.post('/tenants/:id/reopen', reopenTenant);
router.post('/tenants/:id/purge', purgeTenantData);
router.get('/audit-logs', platformAuditLogs);
router.get('/errors', listErrors);
router.post('/errors/:id/resolve', resolveError);
router.get('/announcements', listAnnouncements);
router.post('/announcements', createAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);
router.post('/support/upload', supportUpload.single('file'), uploadSupportFile);
router.get('/support', listSupportTickets);
router.get('/support/:id', getSupportTicket);
router.post('/support/:id/messages', replySupportTicket);

export default router;
