import { Suspense, lazy, useState } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router-dom';
import ErrorBoundary from '../components/ErrorBoundary';
import { ShoppingCart, Menu, ChevronDown } from 'lucide-react';
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

const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr-TR');

const BayiLayout = () => {
  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen bg-[#0f172a]">
      <BayiSidebar />
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-64 animate-in slide-in-from-left duration-200"><BayiSidebar mobile onNavigate={() => setMenuOpen(false)} /></div>
        </div>
      )}
      
      {/* Main Content Area - The "Sheet" */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-white lg:rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-clip relative">
        <header className="px-4 md:px-8 lg:px-12 py-4 lg:py-5 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-40 gap-3"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <div className="flex-1 flex items-center gap-3 min-w-0">
             <button onClick={() => setMenuOpen(true)} className="lg:hidden p-2 -ml-2 rounded-xl text-gray-600 hover:bg-gray-100" aria-label={t('Menü')}><Menu className="h-6 w-6" /></button>
             <div className="truncate lg:hidden"><TenantBrand textClass="text-gray-900" /></div>
          </div>
          
          <div className="flex items-center space-x-3 md:space-x-6">
            <LanguageSwitcher className="hidden sm:flex" />
            <ThemeToggle className="hidden sm:block" />
            <NotificationBell />

            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-500 rounded-xl transition-all group"
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-lg animate-in zoom-in duration-300">
                  {cartCount}
                </span>
              )}
            </button>

            <div className="h-8 w-px bg-gray-100 hidden sm:block" />

            <Link to="/bayi/profile" title={t('Profilim')} className="hidden sm:flex items-center space-x-3 pl-4 border-l border-gray-50 group">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-gray-900 leading-none">{user?.name || t('Değerli Bayimiz')}</p>
                <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mt-1">{t('Bayi Hesabı')}</p>
              </div>
              <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-[10px] shadow-sm">
                {initials(user?.name)}
              </div>
              <ChevronDown className="hidden md:block h-3 w-3 text-gray-300 group-hover:text-indigo-500" />
            </Link>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-3 md:px-8 lg:px-12 py-4 md:py-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8 bg-white">
          <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route index element={<ProductCatalog />} />
            <Route path="quick-order" element={<QuickOrder />} />
            <Route path="lists" element={<BayiLists />} />
            <Route path="quotes" element={<BayiQuotes />} />
            <Route path="orders" element={<BayiOrders />} />
            <Route path="orders/:id" element={<BayiOrderDetail />} />
            <Route path="returns" element={<BayiReturns />} />
            <Route path="finance" element={<BayiFinance />} />
            <Route path="profile" element={<BayiProfile />} />
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
