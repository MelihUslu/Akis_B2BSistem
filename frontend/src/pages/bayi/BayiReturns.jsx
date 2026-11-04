import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Package } from 'lucide-react';
import api from '../../services/api';
import { formatDate, firstImage, RETURN_STATUS } from '../../utils/format';
import { t } from '../../i18n';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';

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
      <PageHeader icon={RotateCcw} tone="orange" title={t('İade / Değişim Taleplerim')} subtitle={t('Yeni talep oluşturmak için ilgili siparişin detay sayfasına gidin.')} />

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">{t('Yükleniyor...')}</div>
      ) : returns.length === 0 ? (
        <EmptyState icon={RotateCcw}>{t('Henüz iade veya değişim talebiniz yok.')}</EmptyState>
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
                  {r.adminNote && <p className="text-xs font-bold text-brand-600 mt-1">{t('Yanıt:')} {r.adminNote}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${status.className}`}>{t(status.label)}</span>
                  <Link to={`/bayi/orders/${r.orderId}`} className="text-xs font-black text-brand-600 hover:underline">#AK-{r.orderId}</Link>
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
