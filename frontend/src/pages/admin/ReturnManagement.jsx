import { useEffect, useState } from 'react';
import {
  RotateCcw, Package, Check, X as XIcon, CheckCheck, Clock, CheckCircle2, Ban, PackageCheck, Layers
} from 'lucide-react';
import FilterTabs from '../../components/shared/FilterTabs';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate, formatTRY, firstImage, RETURN_STATUS } from '../../utils/format';

const FILTERS = [
  { id: 'PENDING', label: 'Bekleyen', icon: Clock, tone: 'orange' },
  { id: 'APPROVED', label: 'Onaylı', icon: CheckCircle2, tone: 'emerald' },
  { id: 'REJECTED', label: 'Reddedilen', icon: Ban, tone: 'red' },
  { id: 'COMPLETED', label: 'Tamamlanan', icon: PackageCheck, tone: 'blue' },
  { id: '', label: 'Tümü', icon: Layers, tone: 'slate' },
];

const ReturnManagement = () => {
  const [returns, setReturns] = useState([]);
  const [filter, setFilter] = useState('PENDING');
  const [loadedFilter, setLoadedFilter] = useState(null);
  const isLoading = loadedFilter !== filter; // seçili filtrenin listesi henüz gelmedi
  const [decision, setDecision] = useState(null); // { request, status, adminNote, restock }
  const [preview, setPreview] = useState(null);
  const { alertElement, showAlert } = useAlert();

  const load = () => {
    const current = filter;
    api.get('/returns', { params: current ? { status: current } : {} })
      .then((res) => setReturns(res.data))
      .catch(() => console.error('İade talepleri yüklenemedi'))
      .finally(() => setLoadedFilter(current));
  };

  useEffect(load, [filter]);

  const submitDecision = async () => {
    try {
      const { request, ...body } = decision;
      const res = await api.patch(`/returns/${request.id}`, body);
      setDecision(null);
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
      load();
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Talep güncellenemedi.') });
    }
  };

  return (
    <div className="space-y-6">
      {alertElement}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <img src={preview} className="relative max-h-[85vh] max-w-full rounded-2xl shadow-2xl" />
        </div>
      )}

      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setDecision(null)} />
          <div className="modal-panel w-full max-w-md p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="modal-icon"><RotateCcw className="h-5 w-5" /></span>
              <h3 className="modal-title">#RMA-{decision.request.id} · {{ APPROVED: 'Onayla', REJECTED: 'Reddet', COMPLETED: 'Tamamlandı İşaretle' }[decision.status]}</h3>
            </div>
            {decision.status === 'APPROVED' && decision.request.type === 'RETURN' && (
              <p className="text-xs font-bold text-emerald-800 bg-emerald-50 p-3 rounded-xl">
                Bayinin carisine {formatTRY(decision.request.orderItem.price * decision.request.quantity * (1 + decision.request.orderItem.vatRate / 100))} (KDV dahil) alacak yazılacak.
              </p>
            )}
            {decision.status === 'APPROVED' && (
              <label className="flex items-center text-sm font-bold text-gray-700 cursor-pointer">
                <input type="checkbox" className="mr-3 h-4 w-4" checked={decision.restock} onChange={(e) => setDecision({ ...decision, restock: e.target.checked })} />
                Ürünü stoğa geri ekle ({decision.request.quantity} adet)
              </label>
            )}
            <div>
              <label className="premium-label">Bayiye Not</label>
              <textarea className="premium-input h-24 resize-none" placeholder="Örn: Ürünü kargo ile merkeze gönderin." value={decision.adminNote} onChange={(e) => setDecision({ ...decision, adminNote: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDecision(null)} className="btn-secondary flex-1">Vazgeç</button>
              <button onClick={submitDecision} className={`flex-1 py-3 rounded-xl font-bold text-white ${decision.status === 'REJECTED' ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-4">
          <div className="page-icon"><RotateCcw className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">İade / Değişim (RMA) Talepleri</h1>
            <p className="text-gray-500 text-sm mt-1">Bayilerin fotoğraflı iade ve değişim taleplerini inceleyin.</p>
          </div>
        </div>
        </div>
        <FilterTabs tabs={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : returns.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">Bu filtrede talep yok.</div>
      ) : (
        <div className="space-y-4">
          {returns.map((r) => {
            const img = firstImage(r.product.images);
            const status = RETURN_STATUS[r.status];
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-5">
                  <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {img ? <img src={img} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                      #RMA-{r.id} · {r.type === 'RETURN' ? 'İade' : 'Değişim'} · #AK-{r.orderId} · {formatDate(r.createdAt, true)}
                    </p>
                    <p className="font-bold text-gray-900 mt-1">{r.product.name} <span className="text-gray-400 font-semibold">({r.product.sku}) × {r.quantity}</span></p>
                    <p className="text-xs font-bold text-indigo-600 mt-0.5">{r.company.name} · {r.user.name}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase self-start md:self-center ${status.className}`}>{status.label}</span>
                </div>

                <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-xl">{r.reason}</p>

                {r.photos.length > 0 && (
                  <div className="flex gap-3 flex-wrap">
                    {r.photos.map((url) => (
                      <button key={url} onClick={() => setPreview(url)} className="w-20 h-20 rounded-xl overflow-hidden border border-gray-100 hover:ring-2 hover:ring-indigo-300">
                        <img src={url} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}

                {r.adminNote && <p className="text-xs font-bold text-gray-500">Not: {r.adminNote}</p>}

                <div className="flex gap-3 justify-end">
                  {r.status === 'PENDING' && (
                    <>
                      <button onClick={() => setDecision({ request: r, status: 'REJECTED', adminNote: '', restock: false })} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100">
                        <XIcon className="h-4 w-4 mr-1.5" /> Reddet
                      </button>
                      <button onClick={() => setDecision({ request: r, status: 'APPROVED', adminNote: '', restock: r.type === 'RETURN' })} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600">
                        <Check className="h-4 w-4 mr-1.5" /> Onayla
                      </button>
                    </>
                  )}
                  {r.status === 'APPROVED' && (
                    <button onClick={() => setDecision({ request: r, status: 'COMPLETED', adminNote: r.adminNote || '', restock: false })} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-white bg-gray-900 hover:bg-gray-800">
                      <CheckCheck className="h-4 w-4 mr-1.5" /> Tamamlandı
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ReturnManagement;
