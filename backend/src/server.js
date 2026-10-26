import express from 'express';
import cors from 'cors';
import { PORT, isAllowedOrigin } from './config.js';
import accountRoutes from './routes/accountRoutes.js';
import { auditTrail } from './services/auditService.js';
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import companyRoutes from './routes/companyRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import settingRoutes from './routes/settingRoutes.js';
import returnRoutes from './routes/returnRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import tenantRoutes from './routes/tenantRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import platformRoutes from './routes/platformRoutes.js';
import listRoutes from './routes/listRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import quoteRoutes from './routes/quoteRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import { integrationAdminRoutes, integrationApiRoutes } from './routes/integrationRoutes.js';
import { globalSearch } from './controllers/searchController.js';
import { applyAsDealer } from './controllers/companyController.js';
import { verifyToken, checkRole } from './middlewares/authMiddleware.js';
import { rateLimit } from './middlewares/rateLimit.js';
import { resolveTenant, loadTenantByHost } from './middlewares/tenantMiddleware.js';
import { startNotificationJobs } from './services/notificationService.js';

const app = express();

app.set('trust proxy', 1); // Reverse proxy arkasında gerçek IP (rate limit için)
app.use(cors({
  // Kök alan adı + alt alan adları her zaman; doğrulanmış özel alan adları veritabanından
  origin: async (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    try { cb(null, Boolean(await loadTenantByHost(new URL(origin).hostname))); } catch { cb(null, false); }
  },
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant', 'X-Tenant-Host']
}));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static('uploads'));

// Kiracıdan bağımsız uçlar
app.use('/api/public', publicRoutes);
app.use('/api/platform', platformRoutes);
// ERP / entegratör API'si (API anahtarı ile, firma anahtardan belirlenir)
app.use('/api/v1', integrationApiRoutes);

// Buradan sonraki tüm uçlar X-Tenant başlığındaki firmanın bağlamında çalışır
const tenantApi = express.Router();
tenantApi.use(resolveTenant, auditTrail);
tenantApi.use('/auth', authRoutes);
tenantApi.use('/tenant', tenantRoutes);
tenantApi.use('/billing', billingRoutes);
tenantApi.use('/products', productRoutes);
tenantApi.use('/companies', companyRoutes);
tenantApi.use('/orders', orderRoutes);
tenantApi.use('/finance', financeRoutes);
tenantApi.use('/categories', categoryRoutes);
tenantApi.use('/payments', paymentRoutes);
tenantApi.use('/settings', settingRoutes);
tenantApi.use('/returns', returnRoutes);
tenantApi.use('/notifications', notificationRoutes);
tenantApi.use('/dashboard', dashboardRoutes);
tenantApi.use('/lists', listRoutes);
tenantApi.use('/coupons', couponRoutes);
tenantApi.use('/quotes', quoteRoutes);
tenantApi.use('/team', teamRoutes);
tenantApi.use('/integrations', integrationAdminRoutes);
tenantApi.use('/account', accountRoutes);
tenantApi.get('/search', verifyToken, checkRole(['ADMIN']), globalSearch);
tenantApi.post('/dealer-applications', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Çok fazla başvuru denemesi. Lütfen daha sonra tekrar deneyin.' }), applyAsDealer);
app.use('/api', tenantApi);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Akis B2B Backend is running' });
});

// Multer ve diğer beklenmeyen hatalar için Türkçe JSON yanıtı
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Dosya boyutu çok büyük.' });
  console.error('Unhandled error:', err);
  res.status(err.status || 400).json({ message: err.message || 'Beklenmeyen bir hata oluştu.' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startNotificationJobs();
});
