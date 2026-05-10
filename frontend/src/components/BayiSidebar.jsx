import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  History, 
  CreditCard, 
  User as UserIcon,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BayiSidebar = () => {
  const { logout } = useAuth();

  const menuItems = [
    { name: 'Ürün Kataloğu', path: '/bayi', icon: ShoppingBag },
    { name: 'Siparişlerim', path: '/bayi/orders', icon: History },
    { name: 'Finansal Durum', path: '/bayi/finance', icon: CreditCard },
    { name: 'Profilim', path: '/bayi/profile', icon: UserIcon },
  ];

  return (
    <div className="w-64 bg-white h-screen border-r border-gray-100 flex flex-col shadow-sm">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-blue-600 tracking-tight">Akis B2B</h1>
        <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest">Bayi Paneli</p>
      </div>
      
      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/bayi'}
            className={({ isActive }) =>
              `flex items-center justify-between px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-blue-50 text-blue-600 shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`
            }
          >
            <div className="flex items-center">
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </div>
            <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100" />
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-50">
        <button
          onClick={logout}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-500 rounded-xl hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-5 w-5 mr-3" />
          Çıkış Yap
        </button>
      </div>
    </div>
  );
};

export default BayiSidebar;
