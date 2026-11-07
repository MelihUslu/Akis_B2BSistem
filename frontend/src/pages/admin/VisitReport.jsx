import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPinned, MapPin, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';
import { formatDate } from '../../utils/format';

const RESULT_TONE = { ORDER: 'bg-emerald-100 text-emerald-700', PAYMENT: 'bg-blue-100 text-blue-700', INFO: 'bg-brand-100 text-brand-700', NO_CONTACT: 'bg-gray-100 text-gray-600' };
const mapUrl = (v) => `https://www.google.com/maps?q=${v.lat},${v.lng}`;

/**
 * Saha ziyaretleri (Bayiler yetkisi): plasiyerlerin planlı ve yapılan ziyaretleri, plasiyer başına özet ve
 * 30 gündür ziyaret edilmeyen bayiler. Ziyaretler plasiyer panelinden kaydedilir.
 */
const VisitReport = () => {
  const [filter, setFilter] = useState({ userId: '', from: '', to: '' });
  const [data, setData] = useState(null);

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v));
    api.get('/visits', { params }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [filter]);

  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <PageHeader icon={MapPinned} title="Saha Ziyaretleri" subtitle="Plasiyerlerin bayi ziyaretleri. Plasiyer, panelinden ziyareti planlar ve kaydeder (sonuç, not, konum)." />

      <div className="card-premium p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="premium-label" htmlFor="vr-user">Plasiyer</label>
          <select id="vr-user" className="premium-input" value={filter.userId} onChange={set('userId')}>
            <option value="">Hepsi</option>
            {(data?.plasiyers || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.isActive ? '' : ' (pasif)'}</option>)}
          </select>
        </div>
        <div><label className="premium-label" htmlFor="vr-from">Başlangıç</label><input id="vr-from" type="date" className="premium-input" value={filter.from || data?.from || ''} onChange={set('from')} /></div>
        <div><label className="premium-label" htmlFor="vr-to">Bitiş</label><input id="vr-to" type="date" className="premium-input" value={filter.to || data?.to || ''} onChange={set('to')} /></div>
      </div>

      {!data ? <p className="text-center text-gray-400 py-10">Yükleniyor...</p> : (
        <>
          {data.summary.length === 0 ? (
            <EmptyState icon={MapPinned}>Plasiyer yok. Ayarlar → Ekip'ten plasiyer ekleyip bayi kartında sorumlu plasiyeri seçin.</EmptyState>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data.summary.map((p) => (
                <div key={p.id} className="card-premium p-5 space-y-2">
                  <p className="font-black text-gray-900">{p.name}{!p.isActive && <span className="ml-2 text-xs text-gray-400">pasif</span>}</p>
                  <p className="text-sm text-gray-600"><b className="text-gray-900">{p.done}</b> ziyaret · {p.visitedDealers} / {p.dealers} bayi · {p.planned} planlı</p>
                  <p className="text-xs text-gray-500">Sipariş {p.byResult.ORDER} · Tahsilat {p.byResult.PAYMENT} · Bilgilendirme {p.byResult.INFO} · Görüşülemedi {p.byResult.NO_CONTACT}</p>
                </div>
              ))}
            </div>
          )}

          {data.stale.length > 0 && (
            <section className="card-premium p-5 space-y-3">
              <h2 className="font-black text-gray-900 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" /> {data.staleDays} gündür ziyaret edilmeyen bayiler ({data.stale.length})</h2>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 text-sm divide-y divide-gray-50 md:divide-y-0">
                {data.stale.slice(0, 60).map((d) => (
                  <li key={d.id} className="py-1.5 flex justify-between gap-3">
                    <Link to={`/admin/partners?id=${d.id}`} className="truncate font-semibold text-gray-900 hover:text-brand-600">{d.name}</Link>
                    <span className="text-gray-500 whitespace-nowrap">{d.plasiyer} · {d.lastVisitAt ? formatDate(d.lastVisitAt) : 'hiç'}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.visits.length === 0 ? <EmptyState icon={MapPin}>Bu aralıkta ziyaret yok.</EmptyState> : (
            <div className="card-premium overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="list-head">
                  <tr className="text-left text-[11px] font-black uppercase tracking-widest whitespace-nowrap">
                    <th className="px-4 py-3">Tarih</th><th className="px-4 py-3">Plasiyer</th><th className="px-4 py-3">Bayi</th><th className="px-4 py-3">Sonuç</th><th className="px-4 py-3">Not</th><th className="px-4 py-3">Konum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.visits.map((v) => (
                    <tr key={v.id} className={v.status === 'PLANNED' ? 'bg-gray-50/50 text-gray-500' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap">{v.status === 'DONE' ? formatDate(v.doneAt, true) : `${formatDate(v.plannedFor)} · planlı`}</td>
                      <td className="px-4 py-3">{v.user.name}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{v.company.name}</td>
                      <td className="px-4 py-3">{v.result ? <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${RESULT_TONE[v.result]}`}>{v.resultLabel}</span> : <span className="text-xs">{v.statusLabel}</span>}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={v.note || ''}>{v.note || '—'}</td>
                      <td className="px-4 py-3">{v.lat != null ? <a href={mapUrl(v)} target="_blank" rel="noreferrer" className="text-brand-600 font-semibold hover:underline inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Harita{v.accuracy != null && ` (±${v.accuracy} m)`}</a> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VisitReport;
