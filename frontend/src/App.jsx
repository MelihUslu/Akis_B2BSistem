import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import PageLoader from './components/PageLoader';
import { APP_MODE } from './utils/tenant';
import { I18nProvider } from './i18n';

// Kod bölme: her mod / panel / sayfa yalnızca gerektiğinde indirilir
const Login = lazy(() => import('./pages/Login'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const DealerApplication = lazy(() => import('./pages/DealerApplication'));
const Impersonate = lazy(() => import('./pages/Impersonate'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const ApiDocs = lazy(() => import('./pages/developer/ApiDocs'));
const PrintOrder = lazy(() => import('./pages/print/PrintOrder'));
const PrintStatement = lazy(() => import('./pages/print/PrintStatement'));
const PrintLabel = lazy(() => import('./pages/print/PrintLabel'));
const PrintQuote = lazy(() => import('./pages/print/PrintQuote'));
const QuoteShare = lazy(() => import('./pages/QuoteShare'));
const PrintReceipt = lazy(() => import('./pages/print/PrintReceipt'));
const StatementShare = lazy(() => import('./pages/StatementShare'));
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const BayiLayout = lazy(() => import('./layouts/BayiLayout'));
const PlatformApp = lazy(() => import('./pages/platform/PlatformApp'));
const RootApp = lazy(() => import('./pages/root/RootApp'));
const TenantNotFound = lazy(() => import('./pages/root/TenantNotFound'));

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/bayi'} replace />;
  }

  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();
  const { loading, notFound } = useTenant();

  if (loading) return null;
  if (notFound) return <Suspense fallback={null}><TenantNotFound /></Suspense>;

  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/impersonate" element={<Impersonate />} />
      <Route path="/login" element={user ? <Navigate to={user.role === 'ADMIN' ? '/admin' : '/bayi'} /> : <Login />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/developer" element={<ApiDocs />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/basvuru" element={user ? <Navigate to="/" replace /> : <DealerApplication />} />
      <Route path="/print/order/:id" element={<ProtectedRoute allowedRoles={['ADMIN', 'BAYI']}><PrintOrder /></ProtectedRoute>} />
      <Route path="/print/quote/:id" element={<ProtectedRoute allowedRoles={['ADMIN', 'BAYI']}><PrintQuote /></ProtectedRoute>} />
      {/* Müşteriye gönderilen teklif bağlantısı (giriş gerekmez) */}
      <Route path="/teklif/:token" element={<QuoteShare />} />
      {/* Cariye gönderilen ekstre / mutabakat bağlantısı */}
      <Route path="/ekstre/:token" element={<StatementShare />} />
      <Route path="/print/receipt/:id" element={<ProtectedRoute allowedRoles={['ADMIN']}><PrintReceipt /></ProtectedRoute>} />
      <Route path="/print/label/:id" element={<ProtectedRoute allowedRoles={['ADMIN']}><PrintLabel /></ProtectedRoute>} />
      <Route path="/print/statement" element={<ProtectedRoute allowedRoles={['BAYI']}><PrintStatement /></ProtectedRoute>} />
      <Route path="/print/statement/:companyId" element={<ProtectedRoute allowedRoles={['ADMIN']}><PrintStatement /></ProtectedRoute>} />
      
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminLayout />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/bayi/*" 
        element={
          <ProtectedRoute allowedRoles={['BAYI']}>
            <BayiLayout />
          </ProtectedRoute>
        } 
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  );
};

// Firma portalı (<firma>.alanadi.com): admin + bayi panelleri
const TenantApp = () => (
  <I18nProvider>
    <TenantProvider>
      <AuthProvider>
        <CartProvider>
          <Router>
            <AppRoutes />
          </Router>
        </CartProvider>
      </AuthProvider>
    </TenantProvider>
  </I18nProvider>
);

function App() {
  if (APP_MODE === 'platform') return <Router><Suspense fallback={<PageLoader />}><PlatformApp /></Suspense></Router>;
  if (APP_MODE === 'root') return <Router><Suspense fallback={<PageLoader />}><RootApp /></Suspense></Router>;
  return <TenantApp />;
}

export default App;
