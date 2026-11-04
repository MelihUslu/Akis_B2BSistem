import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, UserSearch, FileSpreadsheet, TrendingUp, ShoppingCart, Users, Package, Percent, Layers, PackageX, CalendarRange, Info } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import FilterTabs from '../../components/shared/FilterTabs';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate } from '../../utils/format';
import CustomerReport from '../../components/reports/CustomerReport';

const iso = (d) => d.toLocaleDateString('sv-SE'); // yerel tarih, YYYY-MM-DD
const PRESETS = [
  { id: '7', label: 'Son 7 gün', range: () => { const t = new Date(); return [iso(new Date(t - 6 * 864e5)), iso(t)]; } },
  { id: '30', label: 'Son 30 gün', range: () => { const t = new Date(); return [iso(new Date(t - 29 * 864e5)), iso(t)]; } },
  { id: 'month', label: 'Bu ay', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)]; } },
  { id: 'lastMonth', label: 'Geçen ay', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))]; } },
  { id: 'year', label: 'Bu yıl', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), 0, 1)), iso(t)]; } },
];

const Kpi = ({ icon: Icon, label, value, sub, tone }) => (
  <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-gray-500">{label}</span>
      <span className={`p-1.5 rounded-lg ${tone}`}><Icon className="h-4 w-4" /></span>
    </div>
    <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums truncate">{value}</p>
    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{sub || ' '}</p>
  </div>
);

const Bar = ({ value, tone = 'bg-blue-500' }) => (
  <div className="h-1.5 w-full max-w-[8rem] rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
);

const Table = ({ head, children, empty }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[40rem] text-left text-sm">
      <thead className="list-head"><tr className="text-[11px] font-black uppercase tracking-[0.15em] whitespace-nowrap">{head.map((h, i) => <th key={h} className={`px-4 py-3 ${i > 0 && typeof h === 'string' && /Ciro|Miktar|Sipariş|Pay|Marj|Maliyet|Stok/.test(h) ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100/70">
        {children}
        {empty && <tr><td colSpan={head.length} className="py-14 text-center text-sm text-gray-400">{empty}</td></tr>}
      </tbody>
    </table>
  </div>
);

const zebra = (i) => (i % 2 ? 'bg-slate-50/70' : 'bg-white');

// Satış raporları: ciro trendi, ürün / bayi / kategori kırılımı ve satılmayan ürünler
// Satış raporu sekmesi: tarih aralığına göre ciro, kâr, ürün / bayi / kategori kırılımı
const SalesReport = () => {
  const [preset, setPreset] = useState('30');
  const [range, setRange] = useState(() => PRESETS[1].range());
  const [tab, setTab] = useState('products');
  const [report, setReport] = useState(null);
  const [loadedRange, setLoadedRange] = useState(null);
  const loading = loadedRange !== range; // seçili aralığın raporu henüz gelmedi
  const { alertElement, showAlert } = useAlert();

  useEffect(() => {
    api.get('/reports/sales', { params: { from: range[0], to: range[1] } })
      .then((r) => setReport(r.data))
      .catch((err) => showAlert({ type: 'error', title: 'Rapor alınamadı', message: errorMessage(err, 'Rapor oluşturulamadı.') }))
      .finally(() => setLoadedRange(range));
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePreset = (id) => { setPreset(id); setRange(PRESETS.find((p) => p.id === id).range()); };
  const exportExcel = () => downloadFile('/reports/sales/export', { from: range[0], to: range[1] }, 'satis-raporu.xlsx')
    .catch(() => showAlert({ type: 'error', title: 'Hata', message: 'Excel oluşturulamadı.' }));

  const s = report?.summary;
  const maxProduct = report?.products[0]?.revenue || 1;

  return (
    <div className="space-y-6">
      {alertElement}
      {/* Tarih aralığı */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => choosePreset(p.id)}
            className={`h-10 px-3.5 rounded-xl text-xs font-bold transition-all ${preset === p.id ? 'bg-slate-800 text-white shadow-md' : 'bg-white ring-1 ring-gray-100 text-gray-600 hover:bg-gray-50'}`}>{p.label}</button>
        ))}
        <div className={`flex items-center gap-1 h-10 px-3 rounded-xl text-sm ${preset === 'custom' ? 'bg-white ring-2 ring-slate-800' : 'bg-white ring-1 ring-gray-100'}`}>
          <CalendarRange className="h-4 w-4 text-gray-400" />
          <input type="date" className="bg-transparent outline-none text-xs font-semibold text-gray-700" value={range[0]} max={range[1]} onChange={(e) => { setPreset('custom'); setRange([e.target.value, range[1]]); }} />
          <span className="text-gray-300">–</span>
          <input type="date" className="bg-transparent outline-none text-xs font-semibold text-gray-700" value={range[1]} min={range[0]} onChange={(e) => { setPreset('custom'); setRange([range[0], e.target.value]); }} />
        </div>
        <button onClick={exportExcel} disabled={!report} className="md:ml-auto flex items-center h-10 px-4 rounded-xl bg-white ring-1 ring-gray-100 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:ring-emerald-200 shrink-0 disabled:opacity-50">
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel'e Aktar
        </button>
      </div>

      {/* Özet */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
        <Kpi icon={TrendingUp} label="Ciro" value={s ? formatTRY(s.revenue) : '—'} sub={s ? `${s.quantity.toLocaleString('tr-TR')} birim satıldı` : ''} tone="bg-blue-50 text-blue-600" />
        <Kpi icon={ShoppingCart} label="Sipariş" value={s ? s.orders.toLocaleString('tr-TR') : '—'} sub={s ? `ortalama ${formatTRY(s.averageOrder)}` : ''} tone="bg-emerald-50 text-emerald-600" />
        <Kpi icon={Users} label="Sipariş veren bayi" value={s ? s.dealers.toLocaleString('tr-TR') : '—'} sub={report?.dealers[0] ? `en çok: ${report.dealers[0].name}` : ''} tone="bg-violet-50 text-violet-600" />
        <Kpi icon={Percent} label="Brüt kâr" value={s?.grossProfit != null ? formatTRY(s.grossProfit) : '—'}
          sub={s?.margin != null ? `%${s.margin} marj · cironun %${s.costCoverage}'inde maliyet biliniyor` : 'Ürünlere maliyet girilirse hesaplanır'} tone="bg-amber-50 text-amber-600" />
      </div>

      {/* Trend */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-gray-900">Ciro trendi <span className="text-gray-400 font-semibold">({report?.range.grouping === 'month' ? 'aylık' : 'günlük'})</span></h3>
          {report && <span className="text-[11px] text-gray-400">{formatDate(report.range.from)} – {formatDate(report.range.to)}</span>}
        </div>
        <div className="h-64">
          {report?.trend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.trend} margin={{ left: 8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#B7865F" stopOpacity={0.35} /><stop offset="100%" stopColor="#B7865F" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => (v.length === 7 ? new Date(`${v}-01`).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' }) : new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }))} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => `₺${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}b`} />
                <Tooltip formatter={(v, n) => (n === 'revenue' ? [formatTRY(v), 'Ciro'] : [v, 'Sipariş'])} labelFormatter={(l) => l} contentStyle={{ borderRadius: 12, border: '1px solid #eef2f7', fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#B7865F" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">{loading ? 'Yükleniyor…' : 'Bu aralıkta onaylanmış sipariş yok.'}</div>
          )}
        </div>
      </div>

      {/* Kırılımlar */}
      <FilterTabs value={tab} onChange={setTab} tabs={[
        { id: 'products', label: 'Ürünler', icon: Package, tone: 'blue', count: report?.products.length },
        { id: 'dealers', label: 'Bayiler', icon: Users, tone: 'violet', count: report?.dealers.length },
        { id: 'categories', label: 'Kategoriler', icon: Layers, tone: 'emerald', count: report?.categories.length },
        { id: 'unsold', label: 'Satılmayanlar', icon: PackageX, tone: 'orange', count: report?.unsold.length },
      ]} />

      <div className="card-premium">
        {tab === 'products' && (
          <Table head={['Ürün', 'Kategori', 'Miktar', 'Sipariş', 'Ciro', 'Marj']} empty={!report?.products.length && 'Satış yok.'}>
            {report?.products.map((p, i) => (
              <tr key={p.id} className={zebra(i)}>
                <td className="px-4 py-3">
                  <p className="font-bold text-gray-900">{p.name}</p>
                  <span className="font-mono text-[11px] text-gray-500 bg-gray-100/80 px-1.5 py-0.5 rounded-md">{p.sku}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{p.category}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.quantity.toLocaleString('tr-TR')} <span className="text-gray-400 text-xs">{p.unit}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{p.orders}</td>
                <td className="px-4 py-3 text-right">
                  <p className="font-black tabular-nums">{formatTRY(p.revenue)}</p>
                  <div className="flex justify-end mt-1"><Bar value={(p.revenue / maxProduct) * 100} /></div>
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-bold ${p.margin == null ? 'text-gray-300' : p.margin < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{p.margin == null ? '—' : `%${p.margin}`}</td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'dealers' && (
          <Table head={['Bayi', 'Grup', 'Sipariş', 'Miktar', 'Ciro', 'Pay']} empty={!report?.dealers.length && 'Satış yok.'}>
            {report?.dealers.map((d, i) => (
              <tr key={d.id} className={zebra(i)}>
                <td className="px-4 py-3 font-bold text-gray-900">{d.name}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-md bg-blue-50/70 text-blue-700 text-[11px] font-semibold">{d.group}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{d.orders}</td>
                <td className="px-4 py-3 text-right tabular-nums">{d.quantity.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums">{formatTRY(d.revenue)}</td>
                <td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><Bar value={d.share} tone="bg-violet-500" /><span className="text-xs font-bold tabular-nums w-12 text-right">%{d.share}</span></div></td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'categories' && (
          <Table head={['Kategori', 'Miktar', 'Ciro', 'Pay']} empty={!report?.categories.length && 'Satış yok.'}>
            {report?.categories.map((c, i) => (
              <tr key={c.id} className={zebra(i)}>
                <td className="px-4 py-3 font-bold text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.quantity.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums">{formatTRY(c.revenue)}</td>
                <td className="px-4 py-3"><div className="flex items-center justify-end gap-2"><Bar value={c.share} tone="bg-emerald-500" /><span className="text-xs font-bold tabular-nums w-12 text-right">%{c.share}</span></div></td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'unsold' && (
          <>
            <p className="flex items-center gap-2 px-4 py-3 text-xs text-gray-500 border-b border-gray-100"><Info className="h-3.5 w-3.5" /> Seçilen aralıkta hiç satılmayan aktif ürünler; stoğu yüksek olanlar üstte. Kampanya veya fiyat gözden geçirmek için iyi bir başlangıç.</p>
            <Table head={['Ürün', 'Kategori', 'Stok', 'Eklenme']} empty={!report?.unsold.length && 'Tüm ürünler satılmış. 🎉'}>
              {report?.unsold.map((p, i) => (
                <tr key={p.id} className={zebra(i)}>
                  <td className="px-4 py-3"><p className="font-bold text-gray-900">{p.name}</p><span className="font-mono text-[11px] text-gray-500">{p.sku}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-600">{p.category}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.stock.toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Raporlar: müşteri takip raporu (haftalık / aylık, kayıp ve risk analizi) ve satış raporu.
 * Bildirimden gelen bağlantı (?rapor=ID) müşteri takibi sekmesinde o raporu açar.
 */
const ReportsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab = params.get('sekme') === 'satis' ? 'sales' : 'customers';
  const setTab = (t) => setParams(t === 'sales' ? { sekme: 'satis' } : {});
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><BarChart3 className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Raporlar</h1>
            <p className="text-gray-500 text-sm mt-1">{tab === 'sales' ? 'Onaylanan siparişlere göre satış, kâr ve bayi performansı (KDV hariç).' : 'Haftalık ve aylık müşteri takibi: kim sipariş verdi, kim kayba gidiyor, kimi aramalısınız.'}</p>
          </div>
        </div>
        <div className="inline-flex p-1 rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm shrink-0">
          {[['customers', 'Müşteri takibi', UserSearch], ['sales', 'Satış raporu', TrendingUp]].map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-10 px-4 rounded-xl text-sm font-black flex items-center gap-2 ${tab === k ? 'bg-slate-800 text-white' : 'text-gray-600 hover:text-gray-900'}`}><Icon className="h-4 w-4" /> {l}</button>
          ))}
        </div>
      </div>
      {tab === 'sales' ? <SalesReport /> : <CustomerReport />}
    </div>
  );
};

export default ReportsPage;
