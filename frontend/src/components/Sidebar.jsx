import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Package, Users, ShoppingCart, 
  CreditCard, Settings, LogOut, Box, UserCheck,
  Menu, ChevronLeft, ChevronRight
} from 'lucide-react';

const Sidebar = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { name: 'Ana Sayfa', path: '/admin', icon: LayoutDashboard },
    { name: 'Kategoriler', path: '/admin/categories', icon: Box },
    { name: 'Ürün Yönetimi', path: '/admin/products', icon: Package },
    { name: 'Bayi Yönetimi', path: '/admin/dealers', icon: UserCheck },
    { name: 'Siparişler', path: '/admin/orders', icon: ShoppingCart },
    { name: 'Finans & Prim', path: '/admin/finance', icon: CreditCard },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-24' : 'w-72'} bg-[#0f172a] flex flex-col h-screen sticky top-0 py-8 transition-all duration-300 ease-in-out relative z-50`}>
      {/* Collapse Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-10 bg-indigo-600 text-white p-1.5 rounded-full shadow-lg hover:bg-indigo-700 transition-colors z-[60]"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* Logo Section */}
      <div className={`px-8 mb-10 transition-all ${isCollapsed ? 'px-6' : 'px-8'}`}>
        <div className="flex items-center group cursor-pointer">
          <span className={`font-black text-white tracking-tighter uppercase transition-all ${isCollapsed ? 'text-lg' : 'text-2xl'}`}>
            AKİS { !isCollapsed && <span className="text-indigo-500">B2B</span> }
          </span>
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 px-4 space-y-2">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={isCollapsed ? item.name : ''}
            className={({ isActive }) => `
              flex items-center rounded-2xl transition-all duration-300 group
              ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'}
              ${isActive 
                ? 'bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-400' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'}
            `}
          >
            <item.icon className={`transition-all ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} ${location.pathname === item.path ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {!isCollapsed && <span className="text-sm font-bold whitespace-nowrap">{item.name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Menu - PRO PLAN Box (Only visible when expanded) */}
      {!isCollapsed && (
        <div className="px-6 mb-6 animate-in fade-in duration-500">
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl p-5 border border-indigo-500/20">
            <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">PRO PLAN</p>
            <p className="text-[11px] text-gray-400 leading-relaxed mb-3">Tüm özellikleri sınırsız kullanın.</p>
            <button className="w-full py-2.5 bg-indigo-500 text-white text-[10px] font-black rounded-lg hover:bg-indigo-600 transition-colors">Yükselt</button>
          </div>
        </div>
      )}

      {/* Settings & Logout */}
      <div className="px-4 space-y-2">
        <NavLink
          to="/admin/settings"
          title={isCollapsed ? 'Ayarlar' : ''}
          className={`flex items-center rounded-2xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all group ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'}`}
        >
          <Settings className={`transition-all ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} text-gray-500 group-hover:text-gray-300`} />
          {!isCollapsed && <span className="whitespace-nowrap">Ayarlar</span>}
        </NavLink>
        <button 
          onClick={handleLogout}
          title={isCollapsed ? 'Çıkış Yap' : ''}
          className={`w-full flex items-center rounded-2xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all group ${isCollapsed ? 'justify-center p-4' : 'px-5 py-4'}`}
        >
          <LogOut className={`transition-all ${isCollapsed ? 'h-7 w-7' : 'h-5 w-5 mr-4'} text-red-500/60 group-hover:text-red-400`} />
          {!isCollapsed && <span className="whitespace-nowrap">Çıkış Yap</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
