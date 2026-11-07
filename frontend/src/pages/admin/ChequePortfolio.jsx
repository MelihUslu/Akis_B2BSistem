import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Search, Landmark, CheckCircle2, ArrowRightLeft, XCircle, Undo2, AlertTriangle, CalendarClock, History } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import PageHeader from '../../components/shared/PageHeader';
import FilterTabs from '../../components/shared/FilterTabs';
import EmptyState from '../../components/shared/EmptyState';
import Modal from '../../components/shared/Modal';
import { formatMoney, formatDate } from '../../utils/format';

const STATUS_TONE = {
  PORTFOY: 'bg-brand-100 text-brand-700', BANKADA: 'bg-blue-100 text-blue-700', TAHSIL: 'bg-emerald-100 text-emerald-700',
  CIRO: 'bg-violet-100 text-violet-700', KARSILIKSIZ: 'bg-red-100 text-red-600', IADE: 'bg-gray-200 text-gray-600', IPTAL: 'bg-gray-100 text-gray-500'
};
const TABS = [
  ['ACTIVE', 'Elde', 'blue'], ['PORTFOY', 'Portföyde', 'blue'], ['BANKADA', 'Tahsilde', 'blue'], ['TAHSIL', 'Tahsil edildi', 'emerald'],
  ['CIRO', 'Ciro edildi', 'violet'], ['KARSILIKSIZ', 'Karşılıksız', 'red'], ['ALL', 'Tümü', 'slate']
];
// Durumdan yapılabilecek işlemler (sunucudaki kurallarla aynı)
const ACTIONS = [
  { id: 'deposit', label: 'Tahsile ver', icon: Landmark, from: ['PORTFOY'], hint: 'Çek tahsil için bankaya verildi. Cari değişmez.' },
  { id: 'collect', label: 'Tahsil edildi', icon: CheckCircle2, from: ['PORTFOY', 'BANKADA'], hint: 'Para hesaba geçti. Cari değişmez.' },
  { id: 'endorse', label: 'Ciro et', icon: ArrowRightLeft, from: ['PORTFOY'], hint: 'Tedarikçiye ödeme olarak verilir; tedarikçinin carisine ödeme yazılır.' },
  { id: 'bounce', label: 'Karşılıksız', icon: XCircle, from: ['PORTFOY', 'BANKADA', 'CIRO'], danger: true, hint: 'Tahsilat ters kaydedilir, müşteri yeniden borçlanır. Ciroluysa tedarikçiye ödeme de ters kaydedilir.' },
  { id: 'return', label: 'Müşteriye iade', icon: Undo2, from: ['PORTFOY', 'BANKADA'], danger: true, hint: 'Çek müşteriye geri verildi; tahsilat ters kaydedilir, müşteri yeniden borçlanır.' },
];

const sumText = (byCurrency) => {
  const entries = Object.entries(byCurrency || {});
  return entries.length ? entries.map(([c, a]) => formatMoney(a, c)).join(' + ') : '—';
};

const ActionModal = ({ cheque, action, onClose, onDone, showAlert }) => {
  const [note, setNote] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (action.id === 'endorse') api.get('/partners', { params: { kind: 'SUPPLIER', limit: 200, sort: 'name' } }).then((r) => setSuppliers(r.data.data)).catch(() => setSuppliers([]));
  }, [action.id]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/cheques/${cheque.id}/${action.id}`, { note, supplierId });
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
      onDone();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Çek / senet güncellenemedi.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal as="form" onSubmit={submit} icon={action.icon} title={`${action.label} · ${cheque.kindLabel} ${cheque.number || ''}`} subtitle={`${cheque.company.name} · ${formatMoney(cheque.amount, cheque.currency)} · vade ${formatDate(cheque.dueDate)}`} onClose={onClose}
      footer={<><button type="button" onClick={onClose} className="btn-secondary">Vazgeç</button><button disabled={busy || (action.id === 'endorse' && !supplierId)} className={action.danger ? 'h-12 px-5 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50' : 'btn-gradient disabled:opacity-50'}>{action.label}</button></>}>
      <p className={`text-sm rounded-xl p-3 ${action.danger ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>{action.hint}</p>
      {action.id === 'endorse' && (
        <div>
          <label className="premium-label" htmlFor="ch-supplier">Tedarikçi</label>
          {suppliers === null ? <p className="text-sm text-gray-400">Yükleniyor...</p> : suppliers.length === 0 ? (
            <p className="text-sm text-amber-700">Tedarikçi carisi yok. Cari Hesaplar'dan tedarikçi ekleyin.</p>
          ) : (
            <select id="ch-supplier" required className="premium-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Seçin</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      )}
      <div>
        <label className="premium-label" htmlFor="ch-note">Not</label>
        <input id="ch-note" className="premium-input" maxLength={300} placeholder="İsteğe bağlı (ör. banka, protesto bilgisi)" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
};

const HistoryModal = ({ cheque, onClose }) => (
  <Modal icon={History} title={`${cheque.kindLabel} ${cheque.number || ''} · geçmiş`} subtitle={cheque.company.name} onClose={onClose}>
    <ol className="space-y-2 text-sm">
      {cheque.history.map((h, i) => (
        <li key={i} className="flex gap-3"><span className="text-gray-400 whitespace-nowrap">{formatDate(h.at, true)}</span><span><b>{h.status}</b> · {h.by}{h.note && ` · ${h.note}`}</span></li>
      ))}
      {!cheque.history.length && <li className="text-gray-400">Geçmiş kaydı yok (portföy kurulmadan önce alınmış).</li>}
    </ol>
  </Modal>
);

const ChequePortfolio = () => {
  const { alertElement, showAlert } = useAlert();
  const [tab, setTab] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [action, setAction] = useState(null); // { cheque, action }
  const [history, setHistory] = useState(null);

  const load = () => {
    const params = { ...(q.trim() && { q: q.trim() }), ...(!['ACTIVE', 'ALL'].includes(tab) && { status: tab }) };
    api.get('/cheques', { params }).then((r) => setData(r.data)).catch(() => setData({ cheques: [], summary: { byStatus: [], overdue: {}, dueThisWeek: {} } }));
  };
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [tab, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (status) => data?.summary.byStatus.filter((s) => s.status === status).reduce((n, s) => n + s.count, 0);
  const amountOf = (statuses) => data?.summary.byStatus.filter((s) => statuses.includes(s.status)).reduce((m, s) => ({ ...m, [s.currency]: (m[s.currency] || 0) + s.amount }), {});
  const rows = (data?.cheques || []).filter((c) => tab !== 'ACTIVE' || ['PORTFOY', 'BANKADA'].includes(c.status));
  const now = new Date();

  return (
    <div className="space-y-6">
      {alertElement}
      {action && <ActionModal cheque={action.cheque} action={action.action} showAlert={showAlert} onClose={() => setAction(null)} onDone={() => { setAction(null); load(); }} />}
      {history && <HistoryModal cheque={history} onClose={() => setHistory(null)} />}
      <PageHeader icon={Banknote} title="Çek / Senet" subtitle="Müşterilerden alınan çek ve senetler. Portföye cari ekranındaki tahsilattan girer." />

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            ['Elde (portföy + tahsilde)', sumText(amountOf(['PORTFOY', 'BANKADA'])), `${(count('PORTFOY') || 0) + (count('BANKADA') || 0)} adet`, Banknote, 'text-brand-600'],
            ['Vadesi geçmiş', sumText(data.summary.overdue), 'Elde olup vadesi geçenler', AlertTriangle, 'text-red-600'],
            ['7 gün içinde vadeli', sumText(data.summary.dueThisWeek), 'Elde olanlar', CalendarClock, 'text-amber-600'],
            ['Karşılıksız', sumText(amountOf(['KARSILIKSIZ'])), `${count('KARSILIKSIZ') || 0} adet`, XCircle, 'text-gray-500'],
          ].map(([label, value, sub, Icon, tone]) => (
            <div key={label} className="card-premium p-5">
              <p className="text-xs font-bold text-gray-500 flex items-center justify-between">{label} <Icon className={`h-4 w-4 ${tone}`} /></p>
              <p className="text-xl font-black text-gray-900 mt-2 tabular-nums">{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <FilterTabs value={tab} onChange={setTab} tabs={TABS.map(([id, label, tone]) => ({ id, label, tone, ...(data && !['ACTIVE', 'ALL'].includes(id) && { count: count(id) || 0 }) }))} />
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input pl-10" placeholder="No, banka, keşideci veya cari" aria-label="Çek / senet ara" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!data ? <p className="text-center text-gray-400 py-10">Yükleniyor...</p> : rows.length === 0 ? (
        <EmptyState icon={Banknote}>Bu filtrede çek / senet yok. Çek ya da senetle tahsilat, cari kartındaki "Tahsilat al" ile girilir.</EmptyState>
      ) : (
        <div className="card-premium overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="list-head">
              <tr className="text-left text-[11px] font-black uppercase tracking-widest whitespace-nowrap">
                <th className="px-4 py-3">Vade</th><th className="px-4 py-3">Tür / No</th><th className="px-4 py-3">Banka / Keşideci</th>
                <th className="px-4 py-3">Alındığı cari</th><th className="px-4 py-3 text-right">Tutar</th><th className="px-4 py-3">Durum</th><th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((c) => {
                const late = ['PORTFOY', 'BANKADA'].includes(c.status) && new Date(c.dueDate) < now;
                return (
                  <tr key={c.id} className="hover:bg-gray-50/60">
                    <td className={`px-4 py-3 whitespace-nowrap font-semibold ${late ? 'text-red-600' : 'text-gray-900'}`}>{formatDate(c.dueDate)}{late && <span className="block text-[11px]">vadesi geçti</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><b>{c.kindLabel}</b> {c.number || '—'}{c.receiptNo && <span className="block text-[11px] text-gray-400">makbuz {c.receiptNo}</span>}</td>
                    <td className="px-4 py-3 text-gray-600">{c.bankName || '—'}{c.drawer && <span className="block text-[11px] text-gray-400">{c.drawer}</span>}</td>
                    <td className="px-4 py-3"><Link to={`/admin/partners?id=${c.company.id}`} className="font-semibold text-gray-900 hover:text-brand-600">{c.company.name}</Link>
                      {c.endorsedTo && <span className="block text-[11px] text-violet-700">→ {c.endorsedTo.name}</span>}</td>
                    <td className="px-4 py-3 text-right font-black tabular-nums whitespace-nowrap">{formatMoney(c.amount, c.currency)}</td>
                    <td className="px-4 py-3"><button type="button" onClick={() => setHistory(c)} title="Geçmiş" className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${STATUS_TONE[c.status]}`}>{c.statusLabel}</button></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {ACTIONS.filter((a) => a.from.includes(c.status)).map((a) => (
                          <button key={a.id} type="button" onClick={() => setAction({ cheque: c, action: a })}
                            className={`h-8 px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${a.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 bg-gray-50 hover:bg-gray-100'}`}>
                            <a.icon className="h-3.5 w-3.5" /> {a.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ChequePortfolio;
