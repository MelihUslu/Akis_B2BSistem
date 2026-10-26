import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Package } from 'lucide-react';
import api from '../../services/api';
import { formatDate, firstImage, RETURN_STATUS } from '../../utils/format';
import { t } from '../../i18n';

const BayiReturns = () => {
  const [returns, setReturns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get('/returns')
      .then((res) => setReturns(res.data))
      .catch(() => console.error('İade talepleri yüklenemedi'))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-orange-500 to-orange-700 p-3 md:p-3.5 rounded-2xl shadow-lg shadow-orange-500/25 shrink-0"><RotateCcw className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{t('İade / Değişim Taleplerim')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('Yeni talep oluşturmak için ilgili siparişin detay sayfasına gidin.')}</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('Yükleniyor...')}</div>
      ) : returns.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
          {t('Henüz iade veya değişim talebiniz yok.')}
        </div>
      ) : (
        <div className="space-y-4">
          {returns.map((r) => {
            const img = firstImage(r.product.images);
            const status = RETURN_STATUS[r.status];
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col md:flex-row md:items-center gap-5">
                <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {img ? <img src={img} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">#RMA-{r.id} · {r.type === 'RETURN' ? t('İade') : t('Değişim')} · {formatDate(r.createdAt)}</p>
                  <p className="font-bold text-gray-900 mt-1">{r.product.name} <span className="text-gray-400 font-semibold">× {r.quantity}</span></p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{r.reason}</p>
                  {r.adminNote && <p className="text-xs font-bold text-indigo-600 mt-1">{t('Yanıt:')} {r.adminNote}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${status.className}`}>{t(status.label)}</span>
                  <Link to={`/bayi/orders/${r.orderId}`} className="text-xs font-black text-indigo-600 hover:underline">#AK-{r.orderId}</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BayiReturns;
