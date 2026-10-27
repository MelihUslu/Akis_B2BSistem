import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { History, Package, Truck, RotateCw, ChevronRight, FileSpreadsheet } from 'lucide-react';
import { downloadFile } from '../../utils/download';
import { carrierName } from '../../utils/cargo';
import OrderTimeline from '../../components/OrderTimeline';
import useReorder from '../../hooks/useReorder';
import useAlert from '../../hooks/useAlert';
import { formatTRY, formatDate, ORDER_STATUS } from '../../utils/format';
import { t } from '../../i18n';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';

const BayiOrders = () => {
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const reorder = useReorder();
  const { alertElement, showAlert } = useAlert();

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const response = await api.get('/orders');
        setOrders(response.data);
      } catch {
        console.error('Siparişler yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const handleReorder = async (order) => {
    try {
      const { added, skipped } = await reorder(order);
      if (skipped.length > 0) {
        showAlert({
          type: added > 0 ? 'warning' : 'error',
          title: added > 0 ? t('Kısmen Sepete Eklendi') : t('Sepete Eklenemedi'),
          message: t('Şu ürünler şu an sipariş edilemiyor: {list}', { list: skipped.join(', ') }),
        });
      }
    } catch (error) {
      showAlert({ type: 'error', title: t('Hata'), message: error.message });
    }
  };

  return (
    <div className="space-y-6">
      {alertElement}
      <PageHeader icon={History} tone="blue" title={t('Sipariş Geçmişim')} subtitle={t('Geçmiş ve mevcut tüm siparişlerinizin durumunu takip edin.')}
        actions={<button onClick={() => downloadFile('/orders/export', {}, 'siparislerim.xlsx')} className="flex items-center h-11 px-4 rounded-2xl bg-white border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:text-emerald-700 hover:border-emerald-200"><FileSpreadsheet className="h-4 w-4 mr-1.5" /> {t("Excel'e Aktar")}</button>} />

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">{t('Yükleniyor...')}</div>
        ) : orders.length === 0 ? (
          <EmptyState icon={History}>{t('Henüz siparişiniz bulunmuyor.')}</EmptyState>
        ) : orders.map((order) => {
          const status = ORDER_STATUS[order.status] || ORDER_STATUS.PENDING;
          return (
            <div key={order.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex items-center space-x-6 flex-wrap gap-y-3">
                  <div className="bg-blue-50 p-3 rounded-xl">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">{t('Sipariş No')}</p>
                    <p className="font-bold text-gray-900 text-lg">#AK-{order.id}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">{t('Tarih')}</p>
                    <p className="text-sm font-medium text-gray-700">{formatDate(order.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">{t('Tutar')}</p>
                    <p className="font-black text-gray-900">{formatTRY(order.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">{t('Kalem')}</p>
                    <p className="text-sm font-medium text-gray-700">{order.items.length}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-right mr-2">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('Durum')}</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${status.className}`}>{t(status.label)}</span>
                  </div>

                  {order.trackingNumber && (
                    <div className="flex items-center bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
                      <Truck className="h-4 w-4 text-gray-400 mr-2" />
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{t('Takip No')}</p>
                        <p className="text-xs font-bold text-blue-600">{carrierName(order.cargoCompany)} {order.trackingNumber}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <OrderTimeline order={order} compact />
                <div className="flex items-center gap-3">
                  {order.status !== 'CANCELLED' && (
                    <button onClick={() => handleReorder(order)} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                      <RotateCw className="h-3.5 w-3.5 mr-1.5" /> {t('Yeniden Sipariş Ver')}
                    </button>
                  )}
                  <Link to={`/bayi/orders/${order.id}`} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-white bg-gray-900 hover:bg-gray-800 transition-colors">
                    {t('Detay')} <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BayiOrders;
