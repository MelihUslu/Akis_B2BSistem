import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, Package, Users, ShoppingCart, 
  CreditCard, Settings, LogOut, Box, UserCheck
} from 'lucide-react';

const Sidebar = () => {
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
    <aside className="w-64 bg-[#0f172a] flex flex-col h-screen sticky top-0 py-8">
      {/* Logo Section */}
      <div className="px-8 mb-10">
        <div className="flex items-center group cursor-pointer">
          <span className="text-2xl font-black text-white tracking-tighter uppercase">
            AKİS <span className="text-indigo-500">B2B</span>
          </span>
        </div>
      </div>

      {/* Main Menu */}
      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `
              flex items-center px-5 py-4 rounded-xl text-sm font-bold transition-all duration-300 group
              ${isActive 
                ? 'bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-400' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'}
            `}
          >
            <item.icon className={`h-5 w-5 mr-4 transition-colors ${location.pathname === item.path ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Menu - Premium Upgrade Box style */}
      <div className="px-6 mb-6">
        <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl p-5 border border-indigo-500/20">
          <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">PRO PLAN</p>
          <p className="text-[11px] text-gray-400 leading-relaxed mb-3">Tüm özellikleri sınırsız kullanın.</p>
          <button className="w-full py-2.5 bg-indigo-500 text-white text-[10px] font-black rounded-lg hover:bg-indigo-600 transition-colors">Yükselt</button>
        </div>
      </div>

      <div className="px-4 space-y-1">
        <NavLink
          to="/admin/settings"
          className="flex items-center px-5 py-4 rounded-xl text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all group"
        >
          <Settings className="h-5 w-5 mr-4 text-gray-500 group-hover:text-gray-300" />
          Ayarlar
        </NavLink>
        <button 
          onClick={handleLogout}
          className="w-full flex items-center px-5 py-4 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition-all group"
        >
          <LogOut className="h-5 w-5 mr-4 text-red-500/60 group-hover:text-red-400" />
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
