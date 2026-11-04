import { useEffect, useState } from 'react';
import { Users, Check, X, CalendarDays, Receipt } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import EmptyState from '../shared/EmptyState';
import { formatDate, formatTRY } from '../../utils/format';
import { LEAVE_TYPES, CLAIM_TYPES, HALF, days, claimState } from './hrMeta';
import { StatusPill, DecisionNote, FileLink, RejectModal, ListCard, Row } from './HrUi';

/**
 * Ekibim (departman yöneticisi): yöneticisi olduğum personelin izin ve masraf / avans talepleri. Yönetici, Personel
 * yetkisi olmadan bu taleplere karar verir; ödeme Finans yetkisiyle ayrıca yapılır.
 */
const TeamPanel = ({ showAlert, confirm, onChanged }) => {
  const [data, setData] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { kind: 'leaves' | 'claims', item }
  const load = () => api.get('/hr/team').then((r) => setData(r.data)).catch(() => setData({ members: [], leaves: [], claims: [] }));
  useEffect(() => { load(); }, []);

  const done = (msg) => { load(); onChanged?.(); showAlert({ type: 'success', title: 'Kaydedildi', message: msg }); };
  const fail = (err) => showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Karar kaydedilemedi.') });
  const approve = async (kind, item) => {
    const what = kind === 'leaves' ? `${LEAVE_TYPES[item.type]}, ${formatDate(item.startDate)} – ${formatDate(item.endDate)} (${days(item.days)})` : `${CLAIM_TYPES[item.type]} ${formatTRY(item.amount)} · ${item.description}`;
    if (!(await confirm({ type: 'info', title: 'Onaylansın mı?', message: `${item.employee.name}: ${what}`, confirmText: 'Onayla' }))) return;
    api.post(`/hr/${kind}/${item.id}/approve`).then((r) => done(r.data.message)).catch(fail);
  };
  const reject = (reason) => api.post(`/hr/${rejecting.kind}/${rejecting.item.id}/reject`, { reason }).then((r) => { setRejecting(null); done(r.data.message); }).catch(fail);

  if (!data) return null;
  const pending = [...data.leaves.filter((l) => l.status === 'PENDING').map((item) => ({ kind: 'leaves', item })), ...data.claims.filter((c) => c.status === 'PENDING').map((item) => ({ kind: 'claims', item }))];
  const recent = [...data.leaves.filter((l) => l.status !== 'PENDING').map((item) => ({ kind: 'leaves', item })), ...data.claims.filter((c) => c.status !== 'PENDING').map((item) => ({ kind: 'claims', item }))]
    .sort((a, b) => new Date(b.item.decidedAt || b.item.createdAt) - new Date(a.item.decidedAt || a.item.createdAt)).slice(0, 20);

  const item = ({ kind, item: x }, actions) => (
    <Row key={`${kind}-${x.id}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 flex items-center justify-center">{kind === 'leaves' ? <CalendarDays className="h-4 w-4 text-brand-600" /> : <Receipt className="h-4 w-4 text-brand-600" />}</span>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-bold text-gray-900">{x.employee.name}</p>
          {kind === 'leaves' ? <>
            <p className="text-sm text-gray-700">{LEAVE_TYPES[x.type]} · {days(x.days)}{x.half && ` · ${HALF[x.half]}`}</p>
            <p className="text-xs text-gray-500">{x.half || x.startDate === x.endDate ? formatDate(x.startDate) : `${formatDate(x.startDate)} – ${formatDate(x.endDate)}`}{x.note ? ` · “${x.note}”` : ''}</p>
            {x.balance && <p className={`text-xs font-semibold ${x.status === 'PENDING' && x.days > x.balance.remaining ? 'text-red-600' : 'text-gray-500'}`}>Kalan yıllık izin {days(x.balance.remaining)}</p>}
          </> : <>
            <p className="text-sm text-gray-700">{CLAIM_TYPES[x.type]} · <b className="tabular-nums">{formatTRY(x.amount)}</b> · {formatDate(x.date)}</p>
            <p className="text-xs text-gray-500 break-words">{x.description}</p>
            <FileLink claim={x} />
          </>}
          <DecisionNote item={x} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={kind === 'claims' ? claimState(x) : x.status} />
          {actions}
        </div>
      </div>
    </Row>
  );

  return (
    <div className="space-y-5">
      {rejecting && <RejectModal title="Talebi reddet" subtitle={rejecting.item.employee.name} onClose={() => setRejecting(null)} onSubmit={reject} />}
      <div className="flex flex-wrap gap-2">
        {data.members.map((m) => (
          <span key={m.id} className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl bg-white ring-1 ring-gray-100 text-xs ${m.isActive ? '' : 'opacity-50'}`}>
            <Users className="h-3.5 w-3.5 text-gray-400" /> <b className="text-gray-900">{m.name}</b>
            {m.leaveBalance && <span className="text-gray-500">· kalan izin {days(m.leaveBalance.remaining)}</span>}
          </span>
        ))}
      </div>
      <h2 className="text-sm font-black text-gray-900">Karar bekleyen ({pending.length})</h2>
      {pending.length === 0 ? <EmptyState icon={Check}>Ekibinizden karar bekleyen talep yok.</EmptyState> : (
        <ListCard>
          {pending.map((p) => item(p, <>
            <button type="button" onClick={() => approve(p.kind, p.item)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-emerald-700"><Check className="h-4 w-4" /> Onayla</button>
            <button type="button" onClick={() => setRejecting(p)} className="h-9 px-3 rounded-xl ring-1 ring-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-1 hover:bg-red-50"><X className="h-4 w-4" /> Reddet</button>
          </>))}
        </ListCard>
      )}
      {recent.length > 0 && <>
        <h2 className="text-sm font-black text-gray-900">Son kararlar</h2>
        <ListCard>{recent.map((p) => item(p, null))}</ListCard>
      </>}
    </div>
  );
};

export default TeamPanel;
