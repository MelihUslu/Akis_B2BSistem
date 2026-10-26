import React from 'react';
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

// mobile: telefonda açılır menü olarak gösterilir; onNavigate menüyü kapatır
const BayiSidebar = ({ mobile = false, onNavigate }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { name: t('Ürün Kataloğu'), path: '/bayi', icon: ShoppingBag },
    { name: t('Hızlı Sipariş'), path: '/bayi/quick-order', icon: Zap },
    { name: t('Listelerim'), path: '/bayi/lists', icon: BookMarked },
    { name: t('Siparişlerim'), path: '/bayi/orders', icon: History },
    { name: t('Tekliflerim'), path: '/bayi/quotes', icon: FileSignature },
    { name: t('İade / Değişim'), path: '/bayi/returns', icon: RotateCcw },
    { name: t('Finansal Durum'), path: '/bayi/finance', icon: CreditCard },
    { name: t('Profilim'), path: '/bayi/profile', icon: UserIcon },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`w-64 bg-[#0f172a] flex-col h-screen top-0 py-8 overflow-y-auto ${mobile ? 'flex' : 'hidden lg:flex sticky'}`}>
      {/* Logo Section */}
      <div className="px-8 mb-10 flex justify-between items-start">
        <div className="flex flex-col group cursor-pointer">
          <TenantBrand />
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mt-0.5">{t('BAYİ PANELİ')}</span>
        </div>
        {mobile && <button onClick={onNavigate} className="p-2 text-gray-400 hover:text-white"><X className="h-5 w-5" /></button>}
      </div>
      
      <nav className="flex-1 px-4 space-y-1 mb-6">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/bayi'}
            onClick={onNavigate}
            className={({ isActive }) => `
              flex items-center px-5 py-4 rounded-xl text-sm font-bold transition-all duration-300 group
              ${isActive 
                ? 'bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-400' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'}
            `}
          >
            <item.icon className={`h-5 w-5 mr-4 transition-colors ${location.pathname === item.path || (location.pathname.startsWith('/bayi') && item.path === '/bayi' && location.pathname === '/bayi') ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 mb-4 space-y-3">
        <InstallAppButton />
        {mobile && <LanguageSwitcher className="w-fit !bg-white/10" />}
      </div>

      {/* Bottom Menu - Premium Upgrade Box style */}
      <div className="px-6 mb-6">
        <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl p-5 border border-indigo-500/20">
          <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">{t('DESTEK')}</p>
          <p className="text-[11px] text-gray-400 leading-relaxed mb-3">{t('Müşteri temsilcinizle hemen iletişime geçin.')}</p>
          {import.meta.env.VITE_SUPPORT_PHONE && <p className="text-[11px] font-bold text-gray-300">{import.meta.env.VITE_SUPPORT_PHONE}</p>}
          {import.meta.env.VITE_SUPPORT_EMAIL && (
            <a href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL}`} className="mt-3 block w-full py-2.5 bg-indigo-500 text-white text-[10px] font-black rounded-lg hover:bg-indigo-600 transition-colors text-center">
              {import.meta.env.VITE_SUPPORT_EMAIL}
            </a>
          )}
        </div>
      </div>

      <div className="px-4 border-t border-white/5 pt-4">
        <button
          onClick={handleLogout}
          className="w-full flex items-center px-5 py-4 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all group"
        >
          <LogOut className="h-5 w-5 mr-4 text-red-500/60 group-hover:text-red-400" />
          {t('Çıkış Yap')}
        </button>
      </div>
    </aside>
  );
};

export default BayiSidebar;
