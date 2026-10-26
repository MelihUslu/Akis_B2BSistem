import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import TenantBrand from './TenantBrand';
import { can } from '../utils/permissions';
import { 
  LayoutDashboard, Package, Users, ShoppingCart, CreditCard, BarChart3, Settings, LogOut, Box, UserCheck, ChevronLeft, ChevronRight, RotateCcw, Crown, FileSignature, TicketPercent, LifeBuoy, X
} from 'lucide-react';

const PLAN_BOX = {
  TRIAL: { title: 'DENEME SÜRÜMÜ', text: 'Deneme süreniz bitmeden bir paket seçin.', cta: 'Paketleri Gör' },
  TRIAL_EXPIRED: { title: 'DENEME BİTTİ', text: 'Bayileriniz portala giremiyor.', cta: 'Paket Seç' },
  EXPIRED: { title: 'SÜRE DOLDU', text: 'Bayileriniz portala giremiyor.', cta: 'Ödeme Yap' },
  PAST_DUE: { title: 'ÖDEME BEKLENİYOR', text: 'Son ödemeniz alınamadı.', cta: 'Abonelik' },
  ACTIVE: { title: 'ABONELİK', text: 'Paketinizi ve limitlerinizi görüntüleyin.', cta: 'Abonelik' },
};

// mobile: telefonda çekmece olarak açılır (daraltma yok); onNavigate menüyü kapatır
const Sidebar = ({ mobile = false, onNavigate }) => {
  const [collapsedState, setIsCollapsed] = useState(false);
  const isCollapsed = !mobile && collapsedState;
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { tenant } = useTenant();
  const planBox = PLAN_BOX[tenant?.access?.reason] || PLAN_BOX.ACTIVE;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Ana Sayfa', path: '/admin', icon: LayoutDashboard },
    { name: 'Kategoriler', path: '/admin/categories', icon: Box, perm: 'CATALOG' },
    { name: 'Ürün Yönetimi', path: '/admin/products', icon: Package, perm: 'CATALOG' },
    { name: 'Bayi Yönetimi', path: '/admin/dealers', icon: UserCheck, perm: 'DEALERS' },
    { name: 'Siparişler', path: '/admin/orders', icon: ShoppingCart, perm: 'ORDERS' },
    { name: 'Teklifler', path: '/admin/quotes', icon: FileSignature, perm: 'ORDERS' },
    { name: 'İade / RMA', path: '/admin/returns', icon: RotateCcw, perm: 'ORDERS' },
    { name: 'Kampanyalar', path: '/admin/coupons', icon: TicketPercent, perm: 'CATALOG' },
    { name: 'Finans & Prim', path: '/admin/finance', icon: CreditCard, perm: 'FINANCE' },
    { name: 'Raporlar', path: '/admin/reports', icon: BarChart3, perm: ['ORDERS', 'FINANCE'] },
    { name: 'Abonelik', path: '/admin/subscription', icon: Crown, perm: 'SETTINGS' },
    { name: 'Destek', path: '/admin/support', icon: LifeBuoy },
  ].filter(item => !item.perm || [].concat(item.perm).some((p) => can(user, p)));

  return (
    <aside className={`
      ${isCollapsed ? 'w-24' : 'w-72'} 
      ${mobile ? 'flex h-full overflow-y-auto' : 'hidden lg:flex h-screen sticky top-0'} flex-col py-8 transition-all duration-700 ease-in-out relative z-50
      bg-[#0f172a]
    `}>
      {/* Collapse Toggle Button */}
      {mobile ? (
        <button onClick={onNavigate} className="absolute right-4 top-6 p-2 text-gray-400 hover:text-white" aria-label="Menüyü kapat"><X className="h-5 w-5" /></button>
      ) : (
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 bg-indigo-600 text-white p-1.5 rounded-full shadow-lg hover:bg-indigo-700 transition-colors z-[60]"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}

      {/* Logo Section */}
      <div className={`px-8 mb-10 transition-all ${isCollapsed ? 'px-6' : 'px-8'}`}>
        <div className="flex items-center group cursor-pointer">
          <TenantBrand compact={isCollapsed} textClass="text-white" />
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 px-4 space-y-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/admin'}
            onClick={onNavigate}
            title={isCollapsed ? item.name : ''}
            className={({ isActive }) => `
              flex items-center rounded-2xl transition-all duration-300 group
              ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'}
              ${isActive 
                ? 'bg-indigo-600/10 text-indigo-600 border-l-2 border-indigo-500' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'}
            `}
          >
            <item.icon className={`transition-all duration-700 ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} ${location.pathname === item.path ? 'text-indigo-600' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {!isCollapsed && <span className="text-sm font-bold whitespace-nowrap">{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Menu - PRO PLAN Box (Only visible when expanded) */}
      {!isCollapsed && can(user, 'SETTINGS') && (
        <div className="px-6 mb-6 animate-in fade-in duration-500">
          <div className={`rounded-2xl p-5 border transition-all duration-700 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border-indigo-500/20`}>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{planBox.title}</p>
            <p className={`text-[11px] leading-relaxed mb-3 transition-colors duration-700 text-gray-400`}>{planBox.text}</p>
            <button onClick={() => { onNavigate?.(); navigate('/admin/subscription'); }} className="w-full py-2.5 bg-indigo-500 text-white text-[10px] font-black rounded-lg hover:bg-indigo-600 transition-colors">{planBox.cta}</button>
          </div>
        </div>
      )}

      {/* Settings & Logout */}
      <div className="px-4 space-y-2">
        {can(user, 'SETTINGS') && <NavLink
          to="/admin/settings"
          onClick={onNavigate}
          title={isCollapsed ? 'Ayarlar' : ''}
          className={`flex items-center rounded-2xl text-sm font-bold transition-all duration-700 group ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'} text-gray-400 hover:text-white hover:bg-white/5`}
        >
          <Settings className={`transition-all duration-700 ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} text-gray-500 group-hover:text-gray-300`} />
          {!isCollapsed && <span className="whitespace-nowrap">Ayarlar</span>}
        </NavLink>}
        <button 
          onClick={handleLogout}
          title={isCollapsed ? 'Çıkış Yap' : ''}
          className={`w-full flex items-center rounded-2xl text-sm font-bold text-red-500 hover:bg-red-500/10 transition-all group ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'}`}
        >
          <LogOut className={`transition-all duration-700 ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} text-red-500/60 group-hover:text-red-500`} />
          {!isCollapsed && <span className="whitespace-nowrap">Çıkış Yap</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
