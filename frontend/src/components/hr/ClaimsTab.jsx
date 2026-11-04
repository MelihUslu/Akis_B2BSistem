import { useEffect, useState } from 'react';
import { Receipt, Check, X, Clock, Banknote, CheckCircle2, Ban, List, Undo2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import EmptyState from '../shared/EmptyState';
import FilterTabs from '../shared/FilterTabs';
import { formatDate, formatTRY } from '../../utils/format';
import { CLAIM_TYPES, claimState } from './hrMeta';
import { StatusPill, DecisionNote, PaymentNote, FileLink, RejectModal, PayModal, ListCard, Row } from './HrUi';

const CATEGORY = { EXPENSE: 'Personel masrafı', ADVANCE: 'Personel avansı' };

/**
 * Masraf ve avans talepleri. Onay (Personel yetkisi) ile ödeme (Finans yetkisi) ayrıdır: onaylanan talep
 * "ödeme bekliyor" olur; ödeme kaydedilince Gelir-Gider'e gider olarak bir kez yazılır.
 */
const ClaimsTab = ({ showAlert, confirm, onChanged, me }) => {
  const [status, setStatus] = useState(me?.canManage ? 'PENDING' : 'TO_PAY');
  const [data, setData] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [paying, setPaying] = useState(null);
  const load = () => api.get('/hr/claims', { params: { status: status === 'ALL' ? undefined : status } }).then((r) => setData(r.data)).catch(() => setData({ rows: [], counts: {} }));
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (msg) => { load(); onChanged?.(); showAlert({ type: 'success', title: 'Kaydedildi', message: msg }); };
  const fail = (title, fallback) => (err) => showAlert({ type: 'error', title, message: errorMessage(err, fallback) });

  const approve = async (c) => {
    if (!(await confirm({ type: 'info', title: `${CLAIM_TYPES[c.type]} onaylansın mı?`, message: `${c.employee.name}: ${formatTRY(c.amount)} · ${c.description}. Onay ödeme değildir; ödeme ayrıca kaydedilir.`, confirmText: 'Onayla' }))) return;
    api.post(`/hr/claims/${c.id}/approve`).then((r) => done(r.data.message)).catch(fail('Onaylanamadı', 'Talep onaylanamadı.'));
  };
  const reject = (reason) => api.post(`/hr/claims/${rejecting.id}/reject`, { reason })
    .then((r) => { setRejecting(null); done(r.data.message); }).catch(fail('Reddedilemedi', 'Talep reddedilemedi.'));
  const pay = (form) => api.post(`/hr/claims/${paying.id}/pay`, form)
    .then((r) => { setPaying(null); done(r.data.message); }).catch(fail('Ödeme kaydedilemedi', 'Ödeme kaydedilemedi.'));
  const unpay = async (c) => {
    if (!(await confirm({ title: 'Ödeme geri alınsın mı?', message: `${c.employee.name}: ${formatTRY(c.amount)}. Gelir-Gider'deki kayıt silinir, talep yeniden ödeme bekler.`, confirmText: 'Geri al' }))) return;
    api.post(`/hr/claims/${c.id}/unpay`).then((r) => done(r.data.message)).catch(fail('Geri alınamadı', 'Ödeme geri alınamadı.'));
  };

  const n = data?.counts || {};
  return (
    <div className="space-y-4">
      {rejecting && <RejectModal title={`${CLAIM_TYPES[rejecting.type]} talebini reddet`} subtitle={`${rejecting.employee.name} · ${formatTRY(rejecting.amount)}`} onClose={() => setRejecting(null)} onSubmit={reject} />}
      {paying && <PayModal title={`${CLAIM_TYPES[paying.type]} ödemesi · ${paying.employee.name}`} amount={paying.amount} category={CATEGORY[paying.type]} onClose={() => setPaying(null)} onSubmit={pay} />}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <FilterTabs value={status} onChange={setStatus} tabs={[
          { id: 'PENDING', label: 'Onay bekleyen', icon: Clock, tone: 'orange', count: n.PENDING || 0, alert: me?.canManage },
          { id: 'TO_PAY', label: 'Ödeme bekleyen', icon: Banknote, tone: 'blue', count: n.TO_PAY || 0, alert: me?.canPay },
          { id: 'PAID', label: 'Ödenen', icon: CheckCircle2, tone: 'emerald', count: n.PAID || 0 },
          { id: 'REJECTED', label: 'Reddedilen / iptal', icon: Ban, tone: 'red', count: n.REJECTED || 0 },
          { id: 'ALL', label: 'Tümü', icon: List }
        ]} />
        {data?.toPayTotal > 0 && <p className="text-sm text-gray-600 lg:ml-auto">Ödeme bekleyen toplam <b className="text-gray-900 tabular-nums">{formatTRY(data.toPayTotal)}</b></p>}
      </div>
      {data && data.rows.length === 0 ? (
        <EmptyState icon={Receipt}>Bu durumda talep yok.</EmptyState>
      ) : (
        <ListCard>
          {(data?.rows || []).map((c) => {
            const state = claimState(c);
            const own = me?.employee?.id === c.employeeId && !me?.isOwner;
            return (
              <Row key={c.id}>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{c.employee.name}</p>
                    <p className="text-xs text-gray-500 truncate">{[c.employee.title, c.employee.department].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-bold text-gray-800"><span className="text-gray-500 font-semibold">{CLAIM_TYPES[c.type]}</span> · <span className="tabular-nums">{formatTRY(c.amount)}</span> · {formatDate(c.date)}</p>
                    <p className="text-xs text-gray-600 break-words">{c.description}</p>
                    <FileLink claim={c} />
                    <DecisionNote item={c} />
                    <PaymentNote item={c} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <StatusPill status={state} />
                    {c.status === 'PENDING' && me?.canManage && (own ? <span className="text-[11px] font-semibold text-gray-400">Kendi talebiniz: başka yetkili karar verir</span> : <>
                      <button type="button" onClick={() => approve(c)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-emerald-700"><Check className="h-4 w-4" /> Onayla</button>
                      <button type="button" onClick={() => setRejecting(c)} className="h-9 px-3 rounded-xl ring-1 ring-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-1 hover:bg-red-50"><X className="h-4 w-4" /> Reddet</button>
                    </>)}
                    {state === 'TO_PAY' && me?.canPay && (
                      <button type="button" onClick={() => setPaying(c)} className="h-9 px-3 rounded-xl bg-navy-900 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-navy-950"><Banknote className="h-4 w-4" /> Öde</button>
                    )}
                    {state === 'PAID' && me?.canPay && (
                      <button type="button" onClick={() => unpay(c)} className="h-9 px-3 rounded-xl ring-1 ring-gray-200 text-gray-600 text-xs font-bold inline-flex items-center gap-1 hover:bg-gray-50" title="Yanlış girilen ödemeyi geri al"><Undo2 className="h-4 w-4" /> Geri al</button>
                    )}
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

export default ClaimsTab;
