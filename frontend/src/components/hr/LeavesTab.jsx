import { useEffect, useState } from 'react';
import { CalendarDays, Check, X, Clock, CheckCircle2, Ban, List } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import EmptyState from '../shared/EmptyState';
import FilterTabs from '../shared/FilterTabs';
import { formatDate } from '../../utils/format';
import { LEAVE_TYPES, HALF, days } from './hrMeta';
import { StatusPill, DecisionNote, RejectModal, ListCard, Row } from './HrUi';

/**
 * İzin talepleri (Personel yetkilisi): onay bekleyenler önce; onay ya da gerekçeli ret.
 * Kendi talebinize karar veremezsiniz (sunucu reddeder; firma sahibi hariç).
 */
const LeavesTab = ({ showAlert, confirm, onChanged, me }) => {
  const [status, setStatus] = useState('PENDING');
  const [data, setData] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const load = () => api.get('/hr/leaves', { params: { status: status === 'ALL' ? undefined : status } }).then((r) => setData(r.data)).catch(() => setData({ rows: [], counts: {} }));
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg) => { load(); onChanged?.(); showAlert({ type: 'success', title: 'Kaydedildi', message: msg }); };
  const approve = async (l) => {
    const after = l.balance ? ` Onaydan sonra kalan yıllık izin: ${days(Math.round((l.balance.remaining - l.days) * 10) / 10)}.` : '';
    if (!(await confirm({ type: 'info', title: 'İzin onaylansın mı?', message: `${l.employee.name}: ${LEAVE_TYPES[l.type]}, ${formatDate(l.startDate)} – ${formatDate(l.endDate)} (${days(l.days)}).${after}`, confirmText: 'Onayla' }))) return;
    try { done((await api.post(`/hr/leaves/${l.id}/approve`)).data.message); } catch (err) { showAlert({ type: 'error', title: 'Onaylanamadı', message: errorMessage(err, 'İzin onaylanamadı.') }); }
  };
  const reject = async (reason) => {
    try {
      const res = await api.post(`/hr/leaves/${rejecting.id}/reject`, { reason });
      setRejecting(null);
      done(res.data.message);
    } catch (err) {
      showAlert({ type: 'error', title: 'Reddedilemedi', message: errorMessage(err, 'İzin reddedilemedi.') });
    }
  };

  const c = data?.counts || {};
  return (
    <div className="space-y-4">
      {rejecting && <RejectModal title="İzni reddet" subtitle={`${rejecting.employee.name} · ${LEAVE_TYPES[rejecting.type]}`} onClose={() => setRejecting(null)} onSubmit={reject} />}
      <FilterTabs value={status} onChange={setStatus} tabs={[
        { id: 'PENDING', label: 'Onay bekleyen', icon: Clock, tone: 'orange', count: c.PENDING || 0, alert: true },
        { id: 'APPROVED', label: 'Onaylanan', icon: CheckCircle2, tone: 'emerald', count: c.APPROVED || 0 },
        { id: 'REJECTED', label: 'Reddedilen', icon: Ban, tone: 'red', count: c.REJECTED || 0 },
        { id: 'ALL', label: 'Tümü', icon: List }
      ]} />
      {data && data.rows.length === 0 ? (
        <EmptyState icon={CalendarDays}>{status === 'PENDING' ? 'Onay bekleyen izin talebi yok.' : 'Kayıt yok.'}</EmptyState>
      ) : (
        <ListCard>
          {(data?.rows || []).map((l) => {
            const own = me?.employee?.id === l.employeeId && !me?.isOwner;
            return (
              <Row key={l.id}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{l.employee.name}</p>
                    <p className="text-xs text-gray-500 truncate">{[l.employee.title, l.employee.department].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-gray-800">{LEAVE_TYPES[l.type]} · {days(l.days)}{l.half && <span className="font-semibold text-gray-500"> · {HALF[l.half]}</span>}</p>
                    <p className="text-xs text-gray-600">{l.half ? formatDate(l.startDate) : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`} · talep {formatDate(l.createdAt)}</p>
                    {l.balance && (
                      <p className={`text-xs font-semibold ${l.status === 'PENDING' && l.days > l.balance.remaining ? 'text-red-600' : 'text-gray-500'}`}>
                        Kalan yıllık izin {days(l.balance.remaining)}{l.status === 'PENDING' && ` · onaydan sonra ${days(Math.round((l.balance.remaining - l.days) * 10) / 10)}`}
                      </p>
                    )}
                    {l.note && <p className="text-xs text-gray-500 break-words">“{l.note}”</p>}
                    <DecisionNote item={l} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <StatusPill status={l.status} />
                    {l.status === 'PENDING' && (own ? <span className="text-[11px] font-semibold text-gray-400">Kendi talebiniz: başka yetkili karar verir</span> : <>
                      <button type="button" onClick={() => approve(l)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-emerald-700"><Check className="h-4 w-4" /> Onayla</button>
                      <button type="button" onClick={() => setRejecting(l)} className="h-9 px-3 rounded-xl ring-1 ring-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-1 hover:bg-red-50"><X className="h-4 w-4" /> Reddet</button>
                    </>)}
                  </div>
                </div>
              </Row>
            );
          })}
        </ListCard>
      )}
    </div>
  );
};

export default LeavesTab;
