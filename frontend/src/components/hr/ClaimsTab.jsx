import { useEffect, useState } from 'react';
import { Receipt, Check, X, Clock, Banknote, CheckCircle2, Ban, List, Wallet } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import EmptyState from '../shared/EmptyState';
import FilterTabs from '../shared/FilterTabs';
import { formatDate, formatTRY } from '../../utils/format';
import { CLAIM_TYPES, PAYMENT_KINDS, claimState } from './hrMeta';
import { StatusPill, DecisionNote, Payments, FileLink, RejectModal, PayModal, SettleModal, ListCard, Row } from './HrUi';

const CATEGORY = { EXPENSE: 'Personel masrafı', ADVANCE: 'Personel avansı' };

/**
 * Masraf ve avans talepleri. Onay (Personel yetkisi ya da personelin yöneticisi) ile ödeme (Finans yetkisi) ayrıdır.
 * Ödeme kısmi olabilir; her ödeme Gelir-Gider'e ayrı gider olarak yazılır. Masraf personelin açık avansından da
 * düşülebilir (avanstan mahsup). Ödenen avans, mahsup, nakit iade ya da maaştan kesintiyle kapanır.
 */
const ClaimsTab = ({ showAlert, confirm, onChanged, me }) => {
  const [status, setStatus] = useState(me?.canManage ? 'PENDING' : 'TO_PAY');
  const [data, setData] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [paying, setPaying] = useState(null);
  const [settling, setSettling] = useState(null);
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
  const settle = (form) => api.post(`/hr/claims/${settling.id}/settle`, form)
    .then((r) => { setSettling(null); done(r.data.message); }).catch(fail('Kaydedilemedi', 'Avans kapatılamadı.'));
  const undo = async (p) => {
    if (!(await confirm({ title: `${PAYMENT_KINDS[p.kind]} geri alınsın mı?`, message: `${formatTRY(p.amount)} · ${formatDate(p.date)}. ${p.kind === 'PAYOUT' || p.kind === 'REFUND' ? 'Gelir-Gider\'deki kayıt silinir.' : 'Avans yeniden açılır.'}`, confirmText: 'Geri al' }))) return;
    api.delete(`/hr/payments/${p.id}`).then((r) => done(r.data.message)).catch(fail('Geri alınamadı', 'Kayıt geri alınamadı.'));
  };

  const n = data?.counts || {};
  return (
    <div className="space-y-4">
      {rejecting && <RejectModal title={`${CLAIM_TYPES[rejecting.type]} talebini reddet`} subtitle={`${rejecting.employee.name} · ${formatTRY(rejecting.amount)}`} onClose={() => setRejecting(null)} onSubmit={reject} />}
      {paying && <PayModal title={`${CLAIM_TYPES[paying.type]} ödemesi · ${paying.employee.name}`} amount={paying.remaining} category={CATEGORY[paying.type]}
        openAdvance={paying.type === 'EXPENSE' ? paying.employeeOpenAdvance : 0} onClose={() => setPaying(null)} onSubmit={pay} />}
      {settling && <SettleModal advance={settling} onClose={() => setSettling(null)} onSubmit={settle} />}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <FilterTabs value={status} onChange={setStatus} tabs={[
          { id: 'PENDING', label: 'Onay bekleyen', icon: Clock, tone: 'orange', count: n.PENDING || 0, alert: me?.canManage },
          { id: 'TO_PAY', label: 'Ödeme bekleyen', icon: Banknote, tone: 'blue', count: n.TO_PAY || 0, alert: me?.canPay },
          { id: 'OPEN_ADVANCE', label: 'Açık avans', icon: Wallet, tone: 'violet', count: n.OPEN_ADVANCE || 0 },
          { id: 'PAID', label: 'Ödenen', icon: CheckCircle2, tone: 'emerald', count: n.PAID || 0 },
          { id: 'REJECTED', label: 'Reddedilen / iptal', icon: Ban, tone: 'red', count: n.REJECTED || 0 },
          { id: 'ALL', label: 'Tümü', icon: List }
        ]} />
        <div className="text-sm text-gray-600 lg:ml-auto space-y-0.5 lg:text-right">
          {data?.toPayTotal > 0 && <p>Ödeme bekleyen toplam <b className="text-gray-900 tabular-nums">{formatTRY(data.toPayTotal)}</b></p>}
          {data?.openAdvanceTotal > 0 && <p>Açık avans toplamı <b className="text-violet-700 tabular-nums">{formatTRY(data.openAdvanceTotal)}</b></p>}
        </div>
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
                    {state === 'PARTIAL' && <p className="text-xs font-bold text-sky-700">Ödenen {formatTRY(c.paidAmount)} · kalan {formatTRY(c.remaining)}</p>}
                    <Payments payments={c.payments} onUndo={me?.canPay ? undo : null} />
                    {c.type === 'ADVANCE' && c.paidAmount > 0 && (
                      <div className="rounded-xl bg-violet-50/60 px-3 py-2 space-y-0.5">
                        <p className="text-xs font-bold text-violet-700">{c.open > 0 ? `Açık avans ${formatTRY(c.open)}` : 'Avans kapandı'}{c.settledAmount > 0 && <span className="font-semibold text-violet-600"> · kapanan {formatTRY(c.settledAmount)}</span>}</p>
                        <Payments payments={c.settlements} onUndo={me?.canPay ? undo : null} />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <StatusPill status={state} />
                    {c.status === 'PENDING' && me?.canManage && (own ? <span className="text-[11px] font-semibold text-gray-400">Kendi talebiniz: başka yetkili karar verir</span> : <>
                      <button type="button" onClick={() => approve(c)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-emerald-700"><Check className="h-4 w-4" /> Onayla</button>
                      <button type="button" onClick={() => setRejecting(c)} className="h-9 px-3 rounded-xl ring-1 ring-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-1 hover:bg-red-50"><X className="h-4 w-4" /> Reddet</button>
                    </>)}
                    {(state === 'TO_PAY' || state === 'PARTIAL') && me?.canPay && (
                      <button type="button" onClick={() => setPaying(c)} className="h-9 px-3 rounded-xl bg-navy-900 text-white text-xs font-bold inline-flex items-center gap-1 hover:bg-navy-950"><Banknote className="h-4 w-4" /> Öde</button>
                    )}
                    {c.type === 'ADVANCE' && c.open > 0 && me?.canPay && (
                      <button type="button" onClick={() => setSettling(c)} className="h-9 px-3 rounded-xl ring-1 ring-violet-200 text-violet-700 text-xs font-bold inline-flex items-center gap-1 hover:bg-violet-50"><Wallet className="h-4 w-4" /> Avansı kapat</button>
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
