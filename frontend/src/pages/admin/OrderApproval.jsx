import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ShoppingCart, CheckCircle, XCircle, Truck, Info, ChevronDown } from 'lucide-react';

const OrderApproval = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [trackingNumber, setTrackingNumber] = useState('');

  const fetchOrders = async () => {
    try {
      const response = await axios.get('http://localhost:5001/api/orders');
      setOrders(response.data);
    } catch (error) {
      console.error('Siparişler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handlePartialApprove = async (orderId, items) => {
    try {
      const itemStatuses = items.map(item => ({
        itemId: item.id,
        status: item.status // 'APPROVED' veya 'CANCELLED'
      }));

      await axios.patch(`http://localhost:5001/api/orders/${orderId}/partial-approve`, { itemStatuses });
      alert('Sipariş başarıyla güncellendi');
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      alert('Hata oluştu');
    }
  };

  const handleShip = async (orderId) => {
    if (!trackingNumber) return alert('Lütfen takip no girin');
    try {
      await axios.patch(`http://localhost:5001/api/orders/${orderId}/ship`, { trackingNumber });
      alert('Sipariş kargoya verildi');
      setSelectedOrder(null);
      fetchOrders();
    } catch (error) {
      alert('Hata oluştu');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <ShoppingCart className="mr-3 h-7 w-7 text-blue-600" />
            Gelişmiş Sipariş Onay Sistemi
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gelen siparişleri inceleyin, kalem bazlı onay verin veya kargoya verin.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
            Bekleyen sipariş bulunmuyor.
          </div>
        ) : orders.map((order) => (
          <div key={order.id} className={`bg-white rounded-2xl border ${selectedOrder?.id === order.id ? 'border-blue-500 ring-2 ring-blue-50' : 'border-gray-100'} shadow-sm overflow-hidden transition-all`}>
            <div className="p-6 flex justify-between items-center cursor-pointer" onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}>
              <div className="flex items-center space-x-6">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Sipariş No</p>
                  <p className="font-bold text-gray-900">#AK-{order.id}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Bayi</p>
                  <p className="font-semibold text-gray-800">{order.company?.name}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Tutar</p>
                  <p className="font-black text-blue-600">₺{order.totalAmount.toLocaleString('tr-TR')}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Durum</p>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    order.status === 'PENDING' ? 'bg-orange-100 text-orange-600' :
                    order.status === 'SHIPPED' ? 'bg-blue-100 text-blue-600' :
                    'bg-green-100 text-green-600'
                  }`}>
                    {order.status === 'PENDING' ? 'Bekliyor' : 
                     order.status === 'PARTIAL_APPROVED' ? 'Parçalı Onaylandı' :
                     order.status === 'SHIPPED' ? 'Kargoda' : 'Tamamlandı'}
                  </span>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${selectedOrder?.id === order.id ? 'rotate-180' : ''}`} />
            </div>

            {selectedOrder?.id === order.id && (
              <div className="border-t border-gray-50 bg-gray-50/50 p-6 animate-in slide-in-from-top-2 duration-200">
                <h4 className="font-bold text-gray-700 mb-4 flex items-center">
                  <Info className="h-4 w-4 mr-2" /> Sipariş Kalemleri (Parçalı Onay)
                </h4>
                <div className="space-y-3 mb-6">
                  {order.items.map((item, idx) => (
                    <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                      <div className="flex items-center space-x-4">
                        <div className="bg-gray-50 p-2 rounded-lg text-xs font-bold text-gray-400">{idx + 1}</div>
                        <div>
                          <p className="font-semibold text-gray-900">{item.product?.name}</p>
                          <p className="text-xs text-gray-500">SKU: {item.product?.sku} | Miktar: {item.quantity} Adet</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <p className="text-sm font-bold text-gray-900">₺{(item.price * item.quantity).toLocaleString('tr-TR')}</p>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                          <button 
                            onClick={() => {
                              const newItems = [...selectedOrder.items];
                              newItems[idx].status = 'APPROVED';
                              setSelectedOrder({...selectedOrder, items: newItems});
                            }}
                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${item.status === 'APPROVED' ? 'bg-green-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            ONAYLA
                          </button>
                          <button 
                            onClick={() => {
                              const newItems = [...selectedOrder.items];
                              newItems[idx].status = 'CANCELLED';
                              setSelectedOrder({...selectedOrder, items: newItems});
                            }}
                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${item.status === 'CANCELLED' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            İPTAL
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <div className="flex items-center space-x-3">
                    <input 
                      type="text" 
                      placeholder="Kargo Takip No" 
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <button 
                      onClick={() => handleShip(order.id)}
                      className="flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors shadow-lg"
                    >
                      <Truck className="h-4 w-4 mr-2" /> Kargoya Ver
                    </button>
                  </div>
                  <button 
                    onClick={() => handlePartialApprove(order.id, selectedOrder.items)}
                    className="flex items-center px-8 py-2 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-colors shadow-xl"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" /> SEÇİLİ KALEMLERİ ONAYLA
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderApproval;
