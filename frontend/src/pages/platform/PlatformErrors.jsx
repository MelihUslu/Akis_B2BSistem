import { useEffect, useState } from 'react';
import { Bug, Monitor, Server, CheckCircle2, RotateCcw, ChevronDown } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import FilterTabs from '../../components/shared/FilterTabs';
import { formatDate } from '../../utils/format';

// Sunucu ve tarayıcı hataları: aynı hata tek satırda sayılır; ilk kez görülen hata e-postayla bildirilir
const PlatformErrors = () => {
  const [filter, setFilter] = useState('open');
  const [result, setResult] = useState(null);
  const [openId, setOpenId] = useState(null);
  const { alertElement, showAlert } = useAlert();

  const load = () => platformApi.get('/errors', { params: { status: filter } }).then((r) => setResult(r.data)).catch(() => {});
  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = async (row, reopen = false) => {
    try {
      const res = await platformApi.post(`/errors/${row.id}/resolve`, { reopen });
      showAlert({ type: 'success', title: 'Hata', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Olmadı', message: errorMessage(err, 'İşlem yapılamadı.') });
    }
  };

  return (
    <div className="space-y-6">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="page-icon"><Bug className="h-6 w-6 text-brand-400" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Hatalar</h1>
          <p className="text-gray-500 text-sm mt-1">Sunucuda ve kullanıcıların tarayıcısında oluşan hatalar. Yeni bir hata ilk görüldüğünde PLATFORM_ALERT_EMAIL adresine bildirilir.</p>
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-4"><p className="text-[11px] font-bold text-gray-500">Açık hata türü</p><p className="text-2xl font-black text-rose-600">{result.stats.open}</p></div>
          <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-4"><p className="text-[11px] font-bold text-gray-500">Son 24 saatte görülen</p><p className="text-2xl font-black text-gray-900">{result.stats.last24h}</p></div>
        </div>
      )}

      <FilterTabs value={filter} onChange={setFilter} tabs={[
        { id: 'open', label: 'Açık', tone: 'red', count: result?.stats.open },
        { id: 'resolved', label: 'Çözülen', tone: 'emerald' },
        { id: '', label: 'Tümü', tone: 'slate' },
      ]} />

      <div className="card-premium">
        {!result ? <p className="p-10 text-center text-gray-400">Yükleniyor…</p> : result.data.length === 0 ? (
          <div className="py-16 text-center"><CheckCircle2 className="h-10 w-10 mx-auto text-emerald-300 mb-2" /><p className="text-sm text-gray-500">Kayıtlı hata yok.</p></div>
        ) : (
          <div className="divide-y divide-gray-100">
            {result.data.map((e, i) => (
              <div key={e.id} className={i % 2 ? 'bg-slate-50/60' : 'bg-white'}>
                <button onClick={() => setOpenId(openId === e.id ? null : e.id)} className="w-full text-left flex items-start gap-3 px-4 py-3">
                  <span className={`p-1.5 rounded-lg shrink-0 ${e.source === 'CLIENT' ? 'bg-violet-50 text-violet-600' : 'bg-rose-50 text-rose-600'}`} title={e.source === 'CLIENT' ? 'Tarayıcı' : 'Sunucu'}>
                    {e.source === 'CLIENT' ? <Monitor className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-gray-900 truncate">{e.message}</span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">
                      {[e.method && e.path ? `${e.method} ${e.path}` : e.path, e.tenantName, e.statusCode && `HTTP ${e.statusCode}`, `son ${formatDate(e.lastSeenAt, true)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-black tabular-nums" title="Kaç kez oluştu">×{e.count}</span>
                  <ChevronDown className={`h-4 w-4 mt-1 text-gray-400 shrink-0 transition-transform ${openId === e.id ? 'rotate-180' : ''}`} />
                </button>
                {openId === e.id && (
                  <div className="px-4 pb-4 space-y-2">
                    <p className="text-[11px] text-gray-500">İlk: {formatDate(e.firstSeenAt, true)}{e.userAgent && ` · ${e.userAgent.slice(0, 90)}`}</p>
                    {e.stack && <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto max-h-72">{e.stack}</pre>}
                    {e.resolvedAt
                      ? <button onClick={() => resolve(e, true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 text-xs font-bold text-gray-700"><RotateCcw className="h-3.5 w-3.5" /> Yeniden aç</button>
                      : <button onClick={() => resolve(e)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold"><CheckCircle2 className="h-3.5 w-3.5" /> Çözüldü</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformErrors;
