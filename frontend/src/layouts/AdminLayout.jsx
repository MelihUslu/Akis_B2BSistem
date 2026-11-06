import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldOff, Menu, LifeBuoy, UserRound, Crown, Settings, LogOut } from 'lucide-react';
import { UserMenu } from '../components/shared/HeaderMenu';
import { headerButtonClass } from '../utils/ui';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/NotificationBell';
import GlobalSearch from '../components/GlobalSearch';
import ThemeToggle from '../components/ThemeToggle';
import PageLoader from '../components/PageLoader';
import ImpersonationBanner from '../components/ImpersonationBanner';
import ErrorBoundary from '../components/ErrorBoundary';
import AnnouncementBar from '../components/AnnouncementBar';
import { useAuth } from '../context/AuthContext';
import { can, hasAnyPermission } from '../utils/permissions';

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
const QuoteEditor = lazy(() => import('../pages/admin/QuoteEditor'));
const PartnerManagement = lazy(() => import('../pages/admin/PartnerManagement'));
const CouponManagement = lazy(() => import('../pages/admin/CouponManagement'));
const SupportPage = lazy(() => import('../pages/admin/SupportPage'));
const AccountPage = lazy(() => import('../pages/admin/AccountPage'));
const ReportsPage = lazy(() => import('../pages/admin/ReportsPage'));
const CashPage = lazy(() => import('../pages/admin/CashPage'));
const LeadManagement = lazy(() => import('../pages/admin/LeadManagement'));
const BulkSms = lazy(() => import('../pages/admin/BulkSms'));
const BulkMail = lazy(() => import('../pages/admin/BulkMail'));
const WhatsAppPage = lazy(() => import('../pages/admin/WhatsAppPage'));
const HrManagement = lazy(() => import('../pages/admin/HrManagement'));
const StaffArea = lazy(() => import('../pages/hr/StaffArea'));

// Yetkisi olmayan sayfaya doğrudan girilirse (perm: tek yetki ya da yetkilerden biri)
const Guard = ({ perm, children }) => {
  const { user } = useAuth();
  if ([].concat(perm).some((p) => can(user, p))) return children;
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
  '/admin': 'Ana Sayfa', '/admin/products': 'Ürün Yönetimi', '/admin/categories': 'Kategoriler', '/admin/dealers': 'Bayi Yönetimi', '/admin/partners': 'Cari Hesaplar',
  '/admin/orders': 'Siparişler', '/admin/quotes': 'Teklifler', '/admin/returns': 'İade / RMA', '/admin/coupons': 'Kampanyalar',
  '/admin/finance': 'Finans & Prim', '/admin/cash': 'Gelir-Gider', '/admin/reports': 'Raporlar', '/admin/subscription': 'Abonelik', '/admin/settings': 'Ayarlar', '/admin/account': 'Hesabım'
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


const AdminLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  useRememberLastPage();

  return (
    <div className="flex min-h-screen bg-navy-900">
      <Sidebar />
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-72 max-w-[85vw] animate-slide-in-left"><Sidebar mobile onNavigate={() => setMenuOpen(false)} /></div>
        </div>
      )}

      {/* Main Content Area - The "Sheet" */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen lg:rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden bg-navy-50">
        <ImpersonationBanner />
        <header className="px-4 md:px-8 lg:px-12 py-3 lg:py-5 flex justify-between items-center gap-3 sticky top-0 z-40 bg-navy-50/80 backdrop-blur-md"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <button onClick={() => setMenuOpen(true)} className="lg:hidden p-2 -ml-2 rounded-xl text-gray-600 hover:bg-gray-100 shrink-0" aria-label="Menü"><Menu className="h-6 w-6" /></button>
          <div className="flex-1 min-w-0">
            {hasAnyPermission(user) && <GlobalSearch />}
          </div>

          <div className="flex items-center gap-2 md:gap-6 shrink-0">
            <ThemeToggle className="hidden sm:block" />

            <Link to="/admin/support" className={headerButtonClass} title="Destek"><LifeBuoy className="h-4 w-4" /><span className="hidden md:inline">Destek</span></Link>

            <NotificationBell />

            <UserMenu name={user?.name} role={user?.isOwner ? 'Firma Sahibi' : 'Yönetici'} email={user?.email} items={[
              { label: 'Hesabım', icon: UserRound, to: '/admin/account' },
              ...(can(user, 'SETTINGS') ? [{ label: 'Abonelik', icon: Crown, to: '/admin/subscription' }, { label: 'Ayarlar', icon: Settings, to: '/admin/settings' }] : []),
              { divider: true },
              { label: 'Çıkış Yap', icon: LogOut, danger: true, onClick: () => { logout(); navigate('/login'); } }
            ]} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar px-3 md:px-8 lg:px-12 py-4 md:py-8 bg-navy-50" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <AnnouncementBar />
          <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route index element={<AdminDashboardHome />} />
              <Route path="products" element={<Guard perm="CATALOG"><ProductManagement /></Guard>} />
              <Route path="categories" element={<Guard perm="CATALOG"><CategoryManagement /></Guard>} />
              <Route path="dealers" element={<Guard perm="DEALERS"><DealerManagement /></Guard>} />
              <Route path="partners" element={<Guard perm={['FINANCE', 'DEALERS']}><PartnerManagement /></Guard>} />
              <Route path="orders" element={<Guard perm="ORDERS"><OrderApproval /></Guard>} />
              <Route path="returns" element={<Guard perm="ORDERS"><ReturnManagement /></Guard>} />
              <Route path="finance" element={<Guard perm="FINANCE"><FinanceManagement /></Guard>} />
              <Route path="settings" element={<Guard perm="SETTINGS"><SettingsPage /></Guard>} />
              <Route path="subscription" element={<Guard perm="SETTINGS"><AdminSubscriptionPage /></Guard>} />
              <Route path="quotes" element={<Guard perm="QUOTES"><QuoteManagement /></Guard>} />
              <Route path="quotes/new" element={<Guard perm="QUOTES"><QuoteEditor /></Guard>} />
              <Route path="quotes/:id" element={<Guard perm="QUOTES"><QuoteEditor /></Guard>} />
              <Route path="whatsapp" element={<Guard perm={['MESSAGES', 'SETTINGS']}><WhatsAppPage /></Guard>} />
              <Route path="leads" element={<Guard perm="LEADS"><LeadManagement /></Guard>} />
              <Route path="sms" element={<Guard perm="SMS"><BulkSms /></Guard>} />
              <Route path="mail" element={<Guard perm="EMAIL"><BulkMail /></Guard>} />
              <Route path="coupons" element={<Guard perm="CATALOG"><CouponManagement /></Guard>} />
              <Route path="reports" element={<Guard perm={['ORDERS', 'FINANCE']}><ReportsPage /></Guard>} />
              <Route path="cash" element={<Guard perm="FINANCE"><CashPage /></Guard>} />
              <Route path="personel" element={<Guard perm={['HR', 'FINANCE']}><HrManagement /></Guard>} />
              <Route path="personel-alanim" element={<StaffArea />} />
              <Route path="support" element={<SupportPage />} />
              <Route path="account" element={<AccountPage />} />
            </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
