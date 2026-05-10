import React from 'react';
import { Routes, Route } from 'react-router-dom';
import BayiSidebar from '../components/BayiSidebar';
import ProductCatalog from '../pages/bayi/ProductCatalog';
import BayiOrders from '../pages/bayi/BayiOrders';
import BayiFinance from '../pages/bayi/BayiFinance';

// Bayi sayfaları için placeholder'lar
const BayiProfile = () => <div className="p-8">Hesap Ayarları</div>;

const BayiLayout = () => {
  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <BayiSidebar />
      <div className="flex-1 overflow-auto">
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
          <div className="px-8 py-4 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-800">Ürün Kataloğu</h2>
            <div className="flex items-center space-x-4">
              <div className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">
                BAYİ
              </div>
              <span className="text-sm text-gray-600 font-medium">Örnek Bayi A.Ş.</span>
            </div>
          </div>
        </header>

        <main>
          <Routes>
            <Route index element={<ProductCatalog />} />
            <Route path="orders" element={<BayiOrders />} />
            <Route path="finance" element={<BayiFinance />} />
            <Route path="profile" element={<BayiProfile />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default BayiLayout;
