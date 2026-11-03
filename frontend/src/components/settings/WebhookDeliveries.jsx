import { useEffect, useState } from 'react';
import { RefreshCw, RotateCw, ChevronDown } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';

const STATUS = {
  SUCCESS: { label: 'Gönderildi', className: 'bg-emerald-100 text-emerald-700' },
  PENDING: { label: 'Yeniden denenecek', className: 'bg-amber-100 text-amber-700' },
  SENDING: { label: 'Gönderiliyor', className: 'bg-indigo-100 text-indigo-700' },
  FAILED: { label: 'Başarısız', className: 'bg-red-100 text-red-700' }
};

// Bir webhook'un son gönderimleri: durum, deneme sayısı, hata; gövdeyi gör, elle yeniden gönder
const WebhookDeliveries = ({ hookId, showAlert }) => {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  const load = () => api.get(`/integrations/webhooks/${hookId}/deliveries`).then((r) => setData(r.data)).catch(() => setData({ data: [] }));
  useEffect(() => { load(); }, [hookId]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = async (d) => {
    try {
      const res = await api.post(`/integrations/deliveries/${d.id}/redeliver`);
      showAlert({ type: res.data.delivery?.status === 'SUCCESS' ? 'success' : 'warning', title: 'Yeniden gönderim', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Gönderilemedi.') });
    }
    load();
  };

  if (!data) return <p className="text-xs text-gray-400 py-2">Yükleniyor…</p>;
  return (
    <div className="mt-2 rounded-xl ring-1 ring-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-[11px] font-bold text-gray-500">
        <span>Son {data.data.length} gönderim · başarısız olanlar {data.maxAttempts} kez denenir</span>
        <button onClick={load} className="inline-flex items-center gap-1 hover:text-gray-800"><RefreshCw className="h-3 w-3" /> Yenile</button>
      </div>
      {data.data.length === 0 && <p className="text-xs text-gray-400 px-3 py-3">Henüz gönderim yok.</p>}
      <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto custom-scrollbar">
        {data.data.map((d, i) => {
          const st = STATUS[d.status] || STATUS.PENDING;
          return (
            <div key={d.id} className={i % 2 ? 'bg-slate-50/60' : 'bg-white'}>
              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded-md font-bold ${st.className}`}>{st.label}</span>
                <code className="font-mono font-bold text-gray-800">{d.event}</code>
                <span className="text-gray-400">{formatDate(d.createdAt, true)}</span>
                <span className="text-gray-400">· {d.attempts} deneme{d.lastStatusCode ? ` · HTTP ${d.lastStatusCode}` : ''}</span>
                {d.status === 'PENDING' && d.attempts > 0 && <span className="text-amber-600">· sonraki {formatDate(d.nextAttemptAt, true)}</span>}
                <span className="ml-auto flex items-center gap-1">
                  <button onClick={() => retry(d)} title="Yeniden gönder" className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><RotateCw className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setOpen(open === d.id ? null : d.id)} title="Ayrıntı" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700"><ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === d.id ? 'rotate-180' : ''}`} /></button>
                </span>
              </div>
              {open === d.id && (
                <div className="px-3 pb-3 space-y-1">
                  {d.lastError && <p className="text-[11px] text-red-600">Hata: {d.lastError}</p>}
                  <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto">{(() => { try { return JSON.stringify(JSON.parse(d.body), null, 2); } catch { return d.body; } })()}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WebhookDeliveries;
