import { NavLink } from 'react-router-dom';
import { ShoppingBag, Zap, ShoppingCart, History, Menu } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { t } from '../../i18n';

// Telefonda alt sekme çubuğu (uygulama hissi): katalog, hızlı sipariş, sepet, siparişler, menü
const MobileTabBar = ({ onMenu }) => {
  const { cartCount, setIsCartOpen } = useCart();
  const item = 'flex-1 h-16 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold';
  const link = ({ isActive }) => `${item} ${isActive ? 'text-brand-600' : 'text-gray-400'}`;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-100 flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <NavLink to="/bayi" end className={link}><ShoppingBag className="h-5 w-5" />{t('Katalog')}</NavLink>
      <NavLink to="/bayi/quick-order" className={link}><Zap className="h-5 w-5" />{t('Hızlı Sipariş')}</NavLink>
      <button type="button" onClick={() => setIsCartOpen(true)} className={`${item} text-gray-400 relative`}>
        <span className="relative">
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && <span className="absolute -top-1.5 -right-2.5 bg-red-500 text-white text-[10px] font-black min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center">{cartCount}</span>}
        </span>
        {t('Sepet')}
      </button>
      <NavLink to="/bayi/orders" className={link}><History className="h-5 w-5" />{t('Siparişlerim')}</NavLink>
      <button type="button" onClick={onMenu} className={`${item} text-gray-400`}><Menu className="h-5 w-5" />{t('Daha fazla')}</button>
    </nav>
  );
};

export default MobileTabBar;
