import { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import { ShoppingCart, Menu, UserRound, History, CreditCard, LogOut } from 'lucide-react';
import { UserMenu } from '../components/shared/HeaderMenu';
import SupportMenu from '../components/bayi/SupportMenu';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import BayiSidebar from '../components/BayiSidebar';
import CartDrawer from '../components/CartDrawer';
import NotificationBell from '../components/NotificationBell';
import TenantBrand from '../components/TenantBrand';
import ThemeToggle from '../components/ThemeToggle';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MobileTabBar from '../components/bayi/MobileTabBar';
import PageLoader from '../components/PageLoader';
import { t } from '../i18n';
import ActingBanner from '../components/bayi/ActingBanner';
import { getActing, stopActing } from '../utils/acting';

const ProductCatalog = lazy(() => import('../pages/bayi/ProductCatalog'));
const BayiOrders = lazy(() => import('../pages/bayi/BayiOrders'));
const BayiFinance = lazy(() => import('../pages/bayi/BayiFinance'));
const CheckoutPage = lazy(() => import('../pages/bayi/CheckoutPage'));
const BayiOrderDetail = lazy(() => import('../pages/bayi/BayiOrderDetail'));
const BayiReturns = lazy(() => import('../pages/bayi/BayiReturns'));
const BayiProfile = lazy(() => import('../pages/bayi/BayiProfile'));
const QuickOrder = lazy(() => import('../pages/bayi/QuickOrder'));
const BayiQuotes = lazy(() => import('../pages/bayi/BayiQuotes'));
const BayiLists = lazy(() => import('../pages/bayi/BayiLists'));

const BayiLayout = () => {
  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const acting = getActing();

  return (
    <div className="flex min-h-screen bg-navy-900">
      <BayiSidebar />
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-64 animate-in slide-in-from-left duration-200"><BayiSidebar mobile onNavigate={() => setMenuOpen(false)} /></div>
        </div>
      )}
      
      {/* Main Content Area - The "Sheet" */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-navy-50 lg:rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-clip relative">
        <ActingBanner />
        <header className="px-4 md:px-8 lg:px-12 py-4 lg:py-5 flex justify-between items-center bg-navy-50/80 backdrop-blur-md sticky top-0 z-40 gap-3"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <div className="flex-1 flex items-center gap-3 min-w-0">
             <button onClick={() => setMenuOpen(true)} className="lg:hidden p-2 -ml-2 rounded-xl text-gray-600 hover:bg-gray-100" aria-label={t('Menü')}><Menu className="h-6 w-6" /></button>
             <div className="truncate lg:hidden"><TenantBrand textClass="text-gray-900" /></div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <LanguageSwitcher className="hidden sm:flex" />
            <ThemeToggle className="hidden sm:block" />
            <SupportMenu />
            <NotificationBell />

            <button 
              onClick={() => setIsCartOpen(true)}
              aria-label={t('Sepetim')}
              className="relative p-2 bg-brand-50 hover:bg-brand-100 text-brand-500 rounded-xl transition-all group"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[11px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-lg animate-in zoom-in duration-300">
                  {cartCount}
                </span>
              )}
            </button>

            <UserMenu name={user?.name || t('Değerli Bayimiz')} role={acting ? `${acting.name} adına` : t('Bayi Hesabı')} email={user?.email} items={acting ? [
              { label: t('Siparişlerim'), icon: History, to: '/bayi/orders' },
              { label: t('Finansal Durum'), icon: CreditCard, to: '/bayi/finance' },
              { divider: true },
              { label: 'Bayi adına moddan çık', icon: LogOut, onClick: () => { const back = acting.back || '/admin/orders'; stopActing(); navigate(back); } }
            ] : [
              { label: t('Profilim'), icon: UserRound, to: '/bayi/profile' },
              { label: t('Siparişlerim'), icon: History, to: '/bayi/orders' },
              { label: t('Finansal Durum'), icon: CreditCard, to: '/bayi/finance' },
              { divider: true },
              { label: t('Çıkış Yap'), icon: LogOut, danger: true, onClick: () => { logout(); navigate('/login'); } }
            ]} />
          </div>
        </header>

        <main className="flex-1 min-w-0 px-3 md:px-8 lg:px-12 py-4 md:py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8 bg-navy-50">
          <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<ProductCatalog />} />
            <Route path="quick-order" element={<QuickOrder />} />
            <Route path="lists" element={<BayiLists />} />
            <Route path="quotes" element={<BayiQuotes />} />
            <Route path="orders" element={<BayiOrders />} />
            <Route path="orders/:id" element={<BayiOrderDetail />} />
            {/* İade talebi ve profil bayinin kendisine aittir; bayi adına modunda açılmaz */}
            <Route path="returns" element={acting ? <Navigate to="/bayi" replace /> : <BayiReturns />} />
            <Route path="finance" element={<BayiFinance />} />
            <Route path="profile" element={acting ? <Navigate to="/bayi" replace /> : <BayiProfile />} />
            <Route path="checkout" element={<CheckoutPage />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <MobileTabBar onMenu={() => setMenuOpen(true)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
};

export default BayiLayout;
