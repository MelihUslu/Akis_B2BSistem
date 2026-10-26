import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { ShieldOff, Award, ChevronDown } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/NotificationBell';
import GlobalSearch from '../components/GlobalSearch';
import ThemeToggle from '../components/ThemeToggle';
import PageLoader from '../components/PageLoader';
import ImpersonationBanner from '../components/ImpersonationBanner';
import AnnouncementBar from '../components/AnnouncementBar';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';

// Her sayfa ayrı bir parça (chunk) olarak, ilk açıldığında yüklenir
const AdminDashboardHome = lazy(() => import('../pages/admin/AdminDashboardHome'));
const ProductManagement = lazy(() => import('../pages/admin/ProductManagement'));
const DealerManagement = lazy(() => import('../pages/admin/DealerManagement'));
const OrderApproval = lazy(() => import('../pages/admin/OrderApproval'));
const FinanceManagement = lazy(() => import('../pages/admin/FinanceManagement'));
const CategoryManagement = lazy(() => import('../pages/admin/CategoryManagement'));
const ReturnManagement = lazy(() => import('../pages/admin/ReturnManagement'));
const SettingsPage = lazy(() => import('../pages/admin/SettingsPage'));
const AdminSubscriptionPage = lazy(() => import('../pages/admin/AdminSubscriptionPage'));
const QuoteManagement = lazy(() => import('../pages/admin/QuoteManagement'));
const CouponManagement = lazy(() => import('../pages/admin/CouponManagement'));
const SupportPage = lazy(() => import('../pages/admin/SupportPage'));
const AccountPage = lazy(() => import('../pages/admin/AccountPage'));

// Yetkisi olmayan sayfaya doğrudan girilirse
const Guard = ({ perm, children }) => {
  const { user } = useAuth();
  if (can(user, perm)) return children;
  return (
    <div className="py-24 text-center space-y-3">
      <ShieldOff className="h-12 w-12 mx-auto text-gray-300" />
      <p className="text-lg font-black text-gray-700">Bu bölüm için yetkiniz yok</p>
      <p className="text-sm text-gray-400">Firma yöneticinizden yetki isteyebilirsiniz.</p>
    </div>
  );
};

// Destek talebine "hangi ekrandan geldi" bilgisi eklenebilsin diye son ziyaret edilen sayfa saklanır
const PAGE_NAMES = {
  '/admin': 'Ana Sayfa', '/admin/products': 'Ürün Yönetimi', '/admin/categories': 'Kategoriler', '/admin/dealers': 'Bayi Yönetimi',
  '/admin/orders': 'Siparişler', '/admin/quotes': 'Teklifler', '/admin/returns': 'İade / RMA', '/admin/coupons': 'Kampanyalar',
  '/admin/finance': 'Finans & Prim', '/admin/subscription': 'Abonelik', '/admin/settings': 'Ayarlar', '/admin/account': 'Hesabım'
};
const useRememberLastPage = () => {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith('/admin/support')) return;
    try {
      sessionStorage.setItem('akis_last_page', JSON.stringify({ page: location.pathname + location.search, title: PAGE_NAMES[location.pathname] || '' }));
    } catch { /* gizli sekme */ }
  }, [location]);
};

const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR');

const AdminLayout = () => {
  const { user } = useAuth();
  useRememberLastPage();

  return (
    <div className="flex min-h-screen bg-[#0f172a]">
      <Sidebar />

      {/* Main Content Area - The "Sheet" */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden bg-white">
        <ImpersonationBanner />
        <header className="px-12 py-5 flex justify-between items-center sticky top-0 z-40 bg-white/80 backdrop-blur-md">
          <div className="flex-1">
            <GlobalSearch />
          </div>

          <div className="flex items-center space-x-6">
            <ThemeToggle />

            <div className="flex items-center space-x-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20">
              <Award className="h-3 w-3 text-indigo-500" />
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Premium Panel</span>
            </div>

            <NotificationBell />

            <Link to="/admin/account" title="Hesabım" className="flex items-center space-x-3 pl-4 border-l border-gray-50 group">
              <div className="flex flex-col text-right mr-1">
                <span className="text-xs font-black leading-none text-gray-900">{user?.name}</span>
                <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mt-1">{user?.isOwner ? 'Firma Sahibi' : 'Yönetici'}</span>
              </div>
              <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-[10px] shadow-sm">
                {initials(user?.name)}
              </div>
              <ChevronDown className="h-3 w-3 text-gray-300 group-hover:text-indigo-500" />
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar px-12 py-8 bg-white">
          <AnnouncementBar />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<AdminDashboardHome />} />
              <Route path="products" element={<Guard perm="CATALOG"><ProductManagement /></Guard>} />
              <Route path="categories" element={<Guard perm="CATALOG"><CategoryManagement /></Guard>} />
              <Route path="dealers" element={<Guard perm="DEALERS"><DealerManagement /></Guard>} />
              <Route path="orders" element={<Guard perm="ORDERS"><OrderApproval /></Guard>} />
              <Route path="returns" element={<Guard perm="ORDERS"><ReturnManagement /></Guard>} />
              <Route path="finance" element={<Guard perm="FINANCE"><FinanceManagement /></Guard>} />
              <Route path="settings" element={<Guard perm="SETTINGS"><SettingsPage /></Guard>} />
              <Route path="subscription" element={<Guard perm="SETTINGS"><AdminSubscriptionPage /></Guard>} />
              <Route path="quotes" element={<Guard perm="ORDERS"><QuoteManagement /></Guard>} />
              <Route path="coupons" element={<Guard perm="CATALOG"><CouponManagement /></Guard>} />
              <Route path="support" element={<SupportPage />} />
              <Route path="account" element={<AccountPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
