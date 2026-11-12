import express from 'express';
import { systemStatus } from '../services/systemStatus.js';
import { backupOverview } from '../services/backupStatus.js';
import { updateStatus } from '../services/updateService.js';
import { getSiteAdmin, putSiteAdmin, listChats, getChatAdmin, replyChat, updateChat, listLeads, updateLead } from '../controllers/siteController.js';
import { monitoringOverview, listJobRuns, listExternalCalls, listApiRequests, listSlowRequests, monitoringFilters } from '../services/monitoringReport.js';
import {
  platformLogin, getDashboard, listTenants, getTenant, createTenant, updateTenant, addManualPayment,
  resetTenantAdminPassword, listPlans, createPlan, updatePlan, syncPlanToIyzico, listPayments, listTransfers, approveTransfer, rejectTransfer,
  platformVerifyTwoFactor, platformForgotPassword, platformResetPassword, retrySubscriptionInvoice, subscriptionInvoicePdfUrl, listErrors, resolveError, platformTwoFactorStatus, platformTwoFactorSetup, platformTwoFactorEnable, platformTwoFactorDisable,
  impersonateTenant, exportTenantData, reopenTenant, purgeTenantData, platformAuditLogs,
  listAnnouncements, createAnnouncement, deleteAnnouncement, listSupportTickets, getSupportTicket, replySupportTicket,
  listHelpArticles, createHelpArticle, updateHelpArticle, deleteHelpArticle
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
router.get('/transfers', listTransfers);
router.post('/transfers/:id/approve', approveTransfer);
router.post('/transfers/:id/reject', rejectTransfer);
router.post('/payments/:id/invoice', retrySubscriptionInvoice);
router.get('/payments/:id/invoice/pdf', subscriptionInvoicePdfUrl);
router.post('/tenants/:id/impersonate', impersonateTenant);
router.get('/tenants/:id/export', exportTenantData);
router.post('/tenants/:id/reopen', reopenTenant);
router.post('/tenants/:id/purge', purgeTenantData);
router.get('/audit-logs', platformAuditLogs);
router.get('/errors', listErrors);
router.get('/system', async (req, res) => res.json(await systemStatus()));
// Güncelleme bildirimi: yeni sürüm + güvenlik açığı (yalnızca bildirir; güncellemeyi sunucuda elle yaparsınız)
router.get('/updates', (req, res) => res.json(updateStatus({ refresh: req.query.refresh === '1' })));
// Yedekler: son yedek, Google Drive kopyası ve her çalışmanın kaydı (scripts/backup.sh)
router.get('/backups', async (req, res) => res.json(await backupOverview()));
// İzleme (istek metrikleri, arka plan işleri, dış servisler, entegrasyon API'si)
// Tanıtım sitesi ayarları, canlı sohbet ve satış talepleri
router.get('/site', getSiteAdmin);
router.put('/site', putSiteAdmin);
router.get('/chats', listChats);
router.get('/chats/:id', getChatAdmin);
router.post('/chats/:id/messages', replyChat);
router.patch('/chats/:id', updateChat);
router.get('/leads', listLeads);
router.patch('/leads/:id', updateLead);
router.get('/monitoring/overview', async (req, res) => res.json(await monitoringOverview(Math.min(Math.max(parseInt(req.query.hours) || 24, 1), 24 * 14))));
router.get('/monitoring/filters', async (req, res) => res.json(await monitoringFilters()));
router.get('/monitoring/jobs', async (req, res) => res.json(await listJobRuns(req.query)));
router.get('/monitoring/external', async (req, res) => res.json(await listExternalCalls(req.query)));
router.get('/monitoring/api-requests', async (req, res) => res.json(await listApiRequests(req.query)));
router.get('/monitoring/slow', async (req, res) => res.json(await listSlowRequests(req.query)));
router.post('/errors/:id/resolve', resolveError);
router.get('/announcements', listAnnouncements);
router.post('/announcements', createAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);
router.post('/support/upload', supportUpload.single('file'), uploadSupportFile);
router.get('/support', listSupportTickets);
router.get('/support/:id', getSupportTicket);
router.post('/support/:id/messages', replySupportTicket);
router.get('/help', listHelpArticles);
router.post('/help', createHelpArticle);
router.put('/help/:id', updateHelpArticle);
router.delete('/help/:id', deleteHelpArticle);

export default router;
