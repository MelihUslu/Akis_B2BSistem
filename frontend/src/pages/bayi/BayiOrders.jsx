import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { History, Package, Truck, CheckCircle, Clock } from 'lucide-react';

const BayiOrders = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        // Not: Gerçek uygulamada sadece giriş yapan bayinin siparişleri filtrelenmelidir (API tarafında)
        const response = await axios.get('http://localhost:5001/api/orders');
        setOrders(response.data);
      } catch (error) {
        console.error('Siparişler yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <History className="mr-3 h-7 w-7 text-blue-600" />
          Sipariş Geçmişim
        </h1>
        <p className="text-gray-500 text-sm mt-1">Geçmiş ve mevcut tüm siparişlerinizin durumunu takip edin.</p>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
            Henüz siparişiniz bulunmuyor.
          </div>
        ) : orders.map((order) => (
          <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row justify-between gap-4">
              <div className="flex items-center space-x-6">
                <div className="bg-blue-50 p-3 rounded-xl">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Sipariş No</p>
                  <p className="font-bold text-gray-900 text-lg">#AK-{order.id}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Tarih</p>
                  <p className="text-sm font-medium text-gray-700">{new Date(order.createdAt).toLocaleDateString('tr-TR')}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Tutar</p>
                  <p className="font-black text-gray-900">₺{order.totalAmount.toLocaleString('tr-TR')}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right mr-4">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Durum</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    order.status === 'PENDING' ? 'bg-orange-100 text-orange-600' :
                    order.status === 'SHIPPED' ? 'bg-blue-100 text-blue-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {order.status === 'PENDING' ? 'Bekliyor' : 
                     order.status === 'PARTIAL_APPROVED' ? 'Parçalı Onaylandı' :
                     order.status === 'SHIPPED' ? 'Kargoda' : 'Tamamlandı'}
                  </span>
                </div>
                
                {order.trackingNumber && (
                  <div className="flex items-center bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                    <Truck className="h-4 w-4 text-gray-400 mr-2" />
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Takip No</p>
                      <p className="text-xs font-bold text-blue-600">{order.trackingNumber}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-gray-50 flex items-center space-x-8">
              <div className="flex items-center text-xs font-medium text-gray-500">
                <Clock className="h-3 w-3 mr-1 text-orange-500" />
                Hazırlanıyor
              </div>
              <div className="flex items-center text-xs font-medium text-gray-500">
                <CheckCircle className={`h-3 w-3 mr-1 ${order.status !== 'PENDING' ? 'text-green-500' : 'text-gray-300'}`} />
                Onaylandı
              </div>
              <div className="flex items-center text-xs font-medium text-gray-500">
                <Truck className={`h-3 w-3 mr-1 ${order.status === 'SHIPPED' ? 'text-blue-500' : 'text-gray-300'}`} />
                Kargoya Verildi
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BayiOrders;
