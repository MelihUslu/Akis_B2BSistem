import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  ShoppingBag, 
  History, 
  CreditCard, 
  User as UserIcon,
  LogOut,
  Zap,
  RotateCcw,
  FileSignature,
  BookMarked,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TenantBrand from './TenantBrand';
import InstallAppButton from './InstallAppButton';
import LanguageSwitcher from './LanguageSwitcher';
import { t } from '../i18n';
import { getActing } from '../utils/acting';
import { dealerCan } from '../utils/permissions';

// mobile: telefonda açılır menü olarak gösterilir; onNavigate menüyü kapatır
const BayiSidebar = ({ mobile = false, onNavigate }) => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { name: t('Ürün Kataloğu'), path: '/bayi', icon: ShoppingBag },
    { name: t('Hızlı Sipariş'), path: '/bayi/quick-order', icon: Zap, cap: 'PRICES' },
    { name: t('Listelerim'), path: '/bayi/lists', icon: BookMarked },
    { name: t('Siparişlerim'), path: '/bayi/orders', icon: History },
    { name: t('Tekliflerim'), path: '/bayi/quotes', icon: FileSignature, cap: 'PRICES' },
    { name: t('İade / Değişim'), path: '/bayi/returns', icon: RotateCcw, cap: 'RETURNS' },
    { name: t('Finansal Durum'), path: '/bayi/finance', icon: CreditCard, cap: 'FINANCE' },
    { name: t('Profilim'), path: '/bayi/profile', icon: UserIcon },
  ].filter((i) => (!getActing() || !['/bayi/returns', '/bayi/profile'].includes(i.path)) // bayi adına modunda bayinin kendi işleri
    && (!i.cap || dealerCan(user, i.cap))); // bayi kullanıcı yetkileri

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`w-64 bg-navy-900 flex-col h-screen top-0 py-8 overflow-y-auto ${mobile ? 'flex' : 'hidden lg:flex sticky'}`}>
      {/* Logo Section */}
      <div className="px-8 mb-8 flex justify-between items-start">
        <div className="flex flex-col items-start">
          <TenantBrand onDark />
          <span className="text-[10px] font-black text-brand-400 uppercase tracking-[0.2em] mt-2">{t('BAYİ PANELİ')}</span>
        </div>
        {mobile && <button onClick={onNavigate} className="p-2 text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>}
      </div>
      
      <nav className="flex-1 px-4 space-y-1.5 mb-6">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/bayi'}
            onClick={onNavigate}
            className={({ isActive }) => `
              flex items-center px-5 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 group
              ${isActive 
                ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-black/20'
                : 'text-white/70 hover:text-white hover:bg-white/5'}
            `}
          >
            <item.icon className={`h-5 w-5 mr-4 transition-colors ${location.pathname === item.path || (location.pathname.startsWith('/bayi') && item.path === '/bayi' && location.pathname === '/bayi') ? 'text-white' : 'text-navy-300 group-hover:text-white'}`} />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 mb-4 space-y-3">
        <InstallAppButton />
        {mobile && <LanguageSwitcher className="w-fit !bg-white/10" />}
      </div>

      {/* Çıkış masaüstünde sağ üstteki kullanıcı menüsünde; telefonda açılan menüde burada da durur */}
      {mobile && <div className="px-4 border-t border-white/5 pt-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center px-5 py-4 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all group"
        >
          <LogOut className="h-5 w-5 mr-4 text-red-500/60 group-hover:text-red-400" />
          {t('Çıkış Yap')}
        </button>
      </div>}
    </aside>
  );
};

export default BayiSidebar;
