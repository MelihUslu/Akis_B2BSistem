import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Award, CheckCircle2, AlertTriangle, CalendarClock, ArrowDownLeft, ArrowUpRight, BookUser, Banknote, ChevronRight, Hourglass, FileSpreadsheet } from 'lucide-react';
import { downloadFile } from '../../utils/download';
import api from '../../services/api';
import { formatTRY, formatDate } from '../../utils/format';
import { PARTNER_KINDS, AGING_LABELS } from '../../utils/partner';

const cariLink = (id) => `/admin/partners?id=${id}`;
const METHOD = { POS: 'Sanal POS', WIRE_TRANSFER: 'Havale / EFT', MANUAL: 'Manuel', CASH: 'Nakit', CARD: 'Kredi kartı', CHECK: 'Çek', NOTE: 'Senet' };

const Stat = ({ icon: Icon, tone, label, value, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
    <div className={`p-3 rounded-xl shrink-0 ${tone}`}><Icon className="h-5 w-5" /></div>
    <div className="min-w-0">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="text-xl font-black text-gray-900 tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Card = ({ icon: Icon, iconClass, title, children, empty }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="p-5 border-b border-gray-50 flex items-center gap-2"><Icon className={`h-5 w-5 ${iconClass}`} /><h3 className="font-bold text-gray-900">{title}</h3></div>
    <div className="divide-y divide-gray-50 max-h-[360px] overflow-auto">{empty ? <p className="text-center py-8 text-gray-400 text-sm">{empty}</p> : children}</div>
  </div>
);

const Row = ({ to, title, sub, right, rightClass = 'text-gray-900' }) => (
  <Link to={to} className="p-4 flex justify-between items-center gap-3 hover:bg-gray-50 transition-colors group">
    <span className="min-w-0"><span className="block text-sm font-bold text-gray-800 truncate">{title}</span><span className="block text-xs text-gray-500 truncate">{sub}</span></span>
    <span className="flex items-center gap-2 shrink-0"><span className={`text-sm font-black tabular-nums ${rightClass}`}>{right}</span><ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500" /></span>
  </Link>
);

/**
 * Finans ve Prim: tahsilat / vade takibi, plasiyer primleri ve mutabakatlar.
 * Cari bakiyeleri, hareket girişi ve ekstre Cari Hesaplar ekranındadır; buradaki her satır ilgili cariyi açar.
 */
const FinanceManagement = () => {
  const [summary, setSummary] = useState(null);
  const [plasiyerPoints, setPlasiyerPoints] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [aging, setAging] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/finance/summary'), api.get('/finance/plasiyer-points'), api.get('/finance/reconciliations'), api.get('/finance/aging')])
      .then(([s, p, r, a]) => { setSummary(s.data); setPlasiyerPoints(p.data); setReconciliations(r.data); setAging(a.data); })
      .catch(() => setSummary({ error: true }));
  }, []);

  const primTotal = plasiyerPoints.reduce((s, p) => s + p.points, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-3.5 rounded-2xl shadow-lg shadow-blue-500/25 shrink-0"><CreditCard className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Finans ve Prim</h1>
            <p className="text-gray-500 text-sm mt-1">Tahsilat ve vade takibi, plasiyer primleri, mutabakatlar. Cari bakiye, hareket girişi ve ekstre için <Link to="/admin/partners" className="text-indigo-600 font-bold hover:underline">Cari Hesaplar</Link>.</p>
          </div>
        </div>
        <Link to="/admin/partners" className="btn-gradient shrink-0"><BookUser className="h-4 w-4 mr-2" /> Cari Hesaplar</Link>
      </div>

      {!summary ? <div className="text-center py-12 text-gray-400">Yükleniyor...</div> : summary.error ? <div className="text-center py-12 text-gray-500">Finans özeti yüklenemedi.</div> : (<>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Stat icon={ArrowDownLeft} tone="bg-red-50 text-red-500" label="Toplam alacağımız" value={formatTRY(summary.receivable.amount)} sub={`${summary.receivable.count} borçlu bayi / müşteri`} />
          <Stat icon={AlertTriangle} tone="bg-orange-50 text-orange-500" label="Vadesi geçen" value={formatTRY(summary.overdue.amount)} sub={`${summary.overdue.count} sipariş`} />
          <Stat icon={CalendarClock} tone="bg-amber-50 text-amber-500" label="7 gün içinde vadesi gelen" value={formatTRY(summary.upcoming.amount)} sub={`${summary.upcoming.count} sipariş`} />
          <Stat icon={ArrowUpRight} tone="bg-slate-100 text-slate-600" label="Tedarikçilere borcumuz" value={formatTRY(summary.payable.amount)} sub={`${summary.payable.count} tedarikçi`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card icon={AlertTriangle} iconClass="text-orange-500" title="Vadesi geçen ve yaklaşan ödemeler" empty={!summary.overdue.count && !summary.upcoming.count && 'Vadesi gelen ödeme yok.'}>
            {[...summary.overdue.orders, ...summary.upcoming.orders].map((o) => {
              const late = new Date(o.dueDate) < new Date();
              return (
                <Row key={o.id} to={cariLink(o.company.id)} title={o.company.name}
                  sub={<>#AK-{o.id} · <span className={late ? 'text-red-600 font-bold' : 'text-amber-600 font-bold'}>{late ? 'Vadesi geçti' : 'Vade'} {formatDate(o.dueDate)}</span></>}
                  right={formatTRY(o.totalAmount)} />
              );
            })}
          </Card>

          <Card icon={ArrowDownLeft} iconClass="text-red-500" title="En borçlu cariler" empty={!summary.debtors.length && 'Borçlu cari yok.'}>
            {summary.debtors.map((d) => (
              <Row key={d.id} to={cariLink(d.id)} title={d.name}
                sub={<>{PARTNER_KINDS[d.kind]?.label}{d.riskLimit > 0 && ` · limit ${formatTRY(d.riskLimit)}`}{d.phone && ` · ${d.phone}`}</>}
                right={formatTRY(-d.currentBalance)} rightClass="text-red-600" />
            ))}
          </Card>

          <Card icon={Banknote} iconClass="text-emerald-500" title="Son tahsilatlar" empty={!summary.payments.length && 'Henüz tahsilat yok.'}>
            {summary.payments.map((p) => (
              <Row key={p.id} to={p.company ? cariLink(p.company.id) : '/admin/partners'} title={p.company?.name || '—'}
                sub={`${METHOD[p.method] || p.method}${p.receiptNo ? ` · makbuz ${p.receiptNo}` : ''} · ${formatDate(p.paymentDate, true)}`} right={formatTRY(p.amount)} rightClass="text-emerald-600" />
            ))}
          </Card>

          <Card icon={CheckCircle2} iconClass="text-emerald-500" title="Cari mutabakat onayları" empty={!reconciliations.length && 'Henüz mutabakat onayı yok.'}>
            {reconciliations.map((r) => (
              <Row key={r.id} to={cariLink(r.company?.id)} title={r.company?.name} sub={`${r.user?.name || `${r.responderName} (bağlantıyla)`} · ${formatDate(r.createdAt, true)}`}
                right={formatTRY(r.balance)} rightClass={r.balance >= 0 ? 'text-green-600' : 'text-red-600'} />
            ))}
          </Card>
        </div>

        {aging && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Hourglass className="h-5 w-5 text-red-500" /><h3 className="font-bold text-gray-900">Borç yaşlandırma</h3></div>
              <button onClick={() => downloadFile('/finance/aging', { format: 'xlsx' }, 'borc-yaslandirma.xlsx')} className="flex items-center px-3 h-9 rounded-xl text-xs font-black text-emerald-700 bg-emerald-50"><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</button>
            </div>
            {aging.rows.length === 0 ? <p className="text-center py-8 text-gray-400 text-sm">Borçlu cari yok.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[48rem]">
                  <thead className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase">
                    <tr><th className="px-4 py-2 text-left">Cari</th>{AGING_LABELS.map(([k, l]) => <th key={k} className="px-3 py-2 text-right">{l}</th>)}<th className="px-4 py-2 text-right">Toplam</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {aging.rows.slice(0, 50).map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2"><Link to={cariLink(r.id)} className="font-bold text-gray-800 hover:text-indigo-600">{r.name}</Link></td>
                        {AGING_LABELS.map(([k]) => <td key={k} className={`px-3 py-2 text-right tabular-nums ${r[k] > 0 && ['d60', 'd90', 'd90plus'].includes(k) ? 'text-red-600 font-black' : 'text-gray-700'}`}>{r[k] > 0 ? formatTRY(r[k]) : '—'}</td>)}
                        <td className="px-4 py-2 text-right font-black tabular-nums">{formatTRY(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-black">
                      <td className="px-4 py-2">Toplam</td>
                      {AGING_LABELS.map(([k]) => <td key={k} className="px-3 py-2 text-right tabular-nums">{formatTRY(aging.totals[k])}</td>)}
                      <td className="px-4 py-2 text-right tabular-nums">{formatTRY(aging.totals.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-50">Tahsilatların en eski borçları kapattığı varsayılır. Vade: sipariş vadesi, yoksa hareket tarihi + carinin vade günü. Hareketle eşleşmeyen tutar (ör. açılış bakiyesi) ayrı sütundadır.</p>
          </div>
        )}

        <Card icon={Award} iconClass="text-orange-500" title={`Plasiyer primleri${plasiyerPoints.length ? ` · toplam ${primTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} puan` : ''}`} empty={!plasiyerPoints.length && 'Henüz prim puanı bulunmuyor.'}>
          {plasiyerPoints.map((point) => (
            <Row key={point.id} to={point.order?.company ? cariLink(point.order.company.id) : '/admin/finance'} title={point.user?.name}
              sub={`Sipariş #AK-${point.orderId} · ${point.order?.company?.name || ''}`} right={`+${point.points.toFixed(2)} puan`} rightClass="text-orange-600" />
          ))}
        </Card>
      </>)}
    </div>
  );
};

export default FinanceManagement;
