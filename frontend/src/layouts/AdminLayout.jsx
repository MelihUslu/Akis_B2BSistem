import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AdminDashboardHome from '../pages/admin/AdminDashboardHome';
import ProductManagement from '../pages/admin/ProductManagement';
import DealerManagement from '../pages/admin/DealerManagement';
import OrderApproval from '../pages/admin/OrderApproval';
import FinanceManagement from '../pages/admin/FinanceManagement';
import CategoryManagement from '../pages/admin/CategoryManagement';
import { Bell, HelpCircle, User, Search, ChevronDown, Award, Sun, Moon } from 'lucide-react';

const AdminLayout = () => {
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  return (
    <div className={`flex min-h-screen transition-all duration-700 ${isDarkMode ? 'bg-[#F8FAFC]' : 'bg-[#0f172a]'}`}>
      {/* Sidebar */}
      <Sidebar isDarkMode={isDarkMode} />
      
      {/* Main Content Area - The "Sheet" */}
      <div className={`flex-1 flex flex-col min-h-screen rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden transition-all duration-700 ${isDarkMode ? 'bg-[#0f172a] shadow-none' : 'bg-white'}`}>
        {/* Minimalist Header */}
        <header className={`px-12 py-5 flex justify-between items-center sticky top-0 z-40 transition-all duration-700 ${isDarkMode ? 'bg-[#0f172a]/80 backdrop-blur-md border-b border-white/5' : 'bg-white/80 backdrop-blur-md'}`}>
           {/* Global Search Bar - Minimalist */}
           <div className="flex-1 max-lg">
              <div className="relative group">
                <Search className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${isDarkMode ? 'text-slate-500 group-focus-within:text-indigo-400' : 'text-gray-300 group-focus-within:text-indigo-500'}`} />
                <input 
                  type="text" 
                  placeholder="Ürün, bayi veya sipariş ara..." 
                  className={`w-full bg-transparent border-none pl-8 pr-4 py-2 text-xs font-bold focus:ring-0 outline-none transition-all ${isDarkMode ? 'text-white placeholder:text-slate-600' : 'text-gray-900 placeholder:text-gray-300'}`}
                />
              </div>
           </div>
           
           {/* Action Items & Profile */}
           <div className="flex items-center space-x-6">
              {/* Theme Toggle Button */}
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)}
                className={`p-2.5 rounded-xl transition-all duration-300 border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'}`}
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              <div className="flex items-center space-x-2 bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20">
                 <Award className="h-3 w-3 text-indigo-500" />
                 <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Premium Panel</span>
              </div>

              <button className={`transition-all relative ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-gray-300 hover:text-indigo-500'}`}>
                <Bell className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 bg-red-500 w-1.5 h-1.5 rounded-full border border-white"></span>
              </button>

              <div className={`flex items-center space-x-3 pl-4 border-l group cursor-pointer ${isDarkMode ? 'border-white/5' : 'border-gray-50'}`}>
                <div className="flex flex-col text-right mr-1">
                   <span className={`text-xs font-black leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Melih Uslu</span>
                   <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mt-1">Sistem Yöneticisi</span>
                </div>
                <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-[10px] shadow-sm">
                  MU
                </div>
                <ChevronDown className={`h-3 w-3 transition-colors ${isDarkMode ? 'text-slate-600 group-hover:text-white' : 'text-gray-300 group-hover:text-indigo-500'}`} />
              </div>
           </div>
        </header>

        {/* Content Section */}
        <main className={`flex-1 overflow-y-auto custom-scrollbar px-12 py-8 transition-all duration-700 ${isDarkMode ? 'bg-[#0f172a]' : 'bg-white'}`}>
          <div className={isDarkMode ? 'dark-theme-wrapper' : ''}>
            <Routes>
              <Route index element={<AdminDashboardHome />} />
              <Route path="products" element={<ProductManagement />} />
              <Route path="categories" element={<CategoryManagement />} />
              <Route path="dealers" element={<DealerManagement />} />
              <Route path="orders" element={<OrderApproval />} />
              <Route path="finance" element={<FinanceManagement />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
