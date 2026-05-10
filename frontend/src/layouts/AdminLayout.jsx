import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import AdminDashboardHome from '../pages/admin/AdminDashboardHome';
import ProductManagement from '../pages/admin/ProductManagement';
import DealerManagement from '../pages/admin/DealerManagement';
import OrderApproval from '../pages/admin/OrderApproval';
import FinanceManagement from '../pages/admin/FinanceManagement';
import CategoryManagement from '../pages/admin/CategoryManagement';
import { Bell, HelpCircle, User, Search, ChevronDown, Sparkles } from 'lucide-react';

const AdminLayout = () => {
  return (
    <div className="flex min-h-screen bg-[#0f172a]"> {/* Dark Sidebar Background */}
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area - The "Sheet" */}
      <div className="flex-1 flex flex-col min-h-screen bg-white rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden">
        {/* Minimalist Header */}
        <header className="px-12 py-5 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-40">
           {/* Global Search Bar - Minimalist */}
           <div className="flex-1 max-lg">
              <div className="relative group">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300 group-focus-within:text-indigo-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Ürün, bayi veya sipariş ara..." 
                  className="w-full bg-transparent border-none pl-8 pr-4 py-2 text-xs font-bold focus:ring-0 outline-none transition-all placeholder:text-gray-300"
                />
              </div>
           </div>
           
           {/* Action Items & Profile */}
           <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100/50">
                 <Sparkles className="h-3 w-3 text-indigo-500" />
                 <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Premium Panel</span>
              </div>

              <button className="text-gray-300 hover:text-indigo-500 transition-all relative">
                <Bell className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 bg-red-500 w-1.5 h-1.5 rounded-full border border-white"></span>
              </button>

              <div className="flex items-center space-x-3 pl-4 border-l border-gray-50 group cursor-pointer">
                <div className="flex flex-col text-right mr-1">
                   <span className="text-xs font-black text-gray-900 leading-none">Melih Uslu</span>
                   <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mt-1">Sistem Yöneticisi</span>
                </div>
                <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black text-[10px] shadow-sm">
                  MU
                </div>
                <ChevronDown className="h-3 w-3 text-gray-300 group-hover:text-indigo-500 transition-colors" />
              </div>
           </div>
        </header>

        {/* Content Section */}
        <main className="flex-1 overflow-y-auto custom-scrollbar px-12 py-8 bg-white">
          <Routes>
            <Route index element={<AdminDashboardHome />} />
            <Route path="products" element={<ProductManagement />} />
            <Route path="categories" element={<CategoryManagement />} />
            <Route path="dealers" element={<DealerManagement />} />
            <Route path="orders" element={<OrderApproval />} />
            <Route path="finance" element={<FinanceManagement />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
