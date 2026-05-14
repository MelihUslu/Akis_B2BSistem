import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ShoppingCart, User } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import BayiSidebar from '../components/BayiSidebar';
import ProductCatalog from '../pages/bayi/ProductCatalog';
import BayiOrders from '../pages/bayi/BayiOrders';
import BayiFinance from '../pages/bayi/BayiFinance';
import CheckoutPage from '../pages/bayi/CheckoutPage';
import CartDrawer from '../components/CartDrawer';

const BayiProfile = () => <div className="p-8">Hesap Ayarları</div>;

const BayiLayout = () => {
  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-[#0f172a]">
      <BayiSidebar />
      
      {/* Main Content Area - The "Sheet" */}
      <div className="flex-1 flex flex-col min-h-screen bg-white rounded-l-[2.5rem] shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden relative">
        <header className="px-12 py-5 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-40">
          <div className="flex-1">
             <h2 className="text-xl font-black text-gray-900 tracking-tighter uppercase">AKİS <span className="text-indigo-600">B2B</span></h2>
          </div>
          
          <div className="flex items-center space-x-6">
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

            <div className="h-8 w-px bg-gray-100" />

            <div className="flex items-center space-x-3 pl-4 border-l border-gray-50 group cursor-pointer">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-gray-900 leading-none">{user?.name || 'Değerli Bayimiz'}</p>
                <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Bayi Hesabı</p>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-black text-[10px] shadow-sm">
                 <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar px-12 py-8 bg-white">
          <Routes>
            <Route index element={<ProductCatalog />} />
            <Route path="orders" element={<BayiOrders />} />
            <Route path="finance" element={<BayiFinance />} />
            <Route path="profile" element={<BayiProfile />} />
            <Route path="checkout" element={<CheckoutPage />} />
          </Routes>
        </main>
      </div>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </div>
  );
};

export default BayiLayout;
