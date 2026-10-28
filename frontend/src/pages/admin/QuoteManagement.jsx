import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSignature, Plus, Search, Clock, PenLine, ShieldCheck, Send, CheckCircle2, Layers, Store } from 'lucide-react';
import FilterTabs from '../../components/shared/FilterTabs';
import api from '../../services/api';
import { formatTRY, formatDate } from '../../utils/format';
import { QUOTE_STATUS, RESPONSE_LABEL } from '../../utils/quote';

const FILTERS = [
  { id: 'PENDING', label: 'Bayi Talepleri', icon: Clock, tone: 'orange' },
  { id: 'DRAFT', label: 'Taslak', icon: PenLine, tone: 'slate' },
  { id: 'PENDING_APPROVAL', label: 'Onay Bekleyen', icon: ShieldCheck, tone: 'violet' },
  { id: 'QUOTED', label: 'Gönderilen', icon: Send, tone: 'blue' },
  { id: 'ACCEPTED', label: 'Kabul Edilen', icon: CheckCircle2, tone: 'emerald' },
  { id: '', label: 'Tümü', icon: Layers, tone: 'gray' },
];

const QuoteManagement = () => {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState({ status: '', q: '', companyId: '', from: '', to: '' });
  const [query, setQuery] = useState(filter);

  useEffect(() => { api.get('/companies', { params: { kind: 'DEALER,CUSTOMER' } }).then((r) => setCompanies(r.data)).catch(() => {}); }, []);
  // Arama kutusu yazarken her harfte istek atmasın
  useEffect(() => {
    const id = setTimeout(() => setQuery(filter), 300);
    return () => clearTimeout(id);
  }, [filter]);
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v));
    api.get('/quotes', { params }).then((r) => setQuotes(r.data)).catch(() => setQuotes([]));
  }, [query]);

  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><FileSignature className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Teklifler</h1>
            <p className="text-gray-500 text-sm mt-1">Müşteriye teklif hazırlayın (isteğe bağlı yapay zekâ ile), onaylatın, gönderin ve kabul edilenleri siparişe dönüştürün.</p>
          </div>
        </div>
        <Link to="/admin/quotes/new" className="btn-gradient shrink-0"><Plus className="h-4 w-4 mr-2" /> Yeni Teklif</Link>
      </div>

      <FilterTabs tabs={FILTERS} value={filter.status} onChange={(status) => setFilter({ ...filter, status })} />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_16rem_10rem_10rem] gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input className="premium-input !pl-10" placeholder="Teklif no (TK-12), başlık veya müşteri ara" value={filter.q} onChange={set('q')} />
        </div>
        <select className="premium-input" value={filter.companyId} onChange={set('companyId')}>
          <option value="">Tüm müşteriler</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" className="premium-input" title="Başlangıç" value={filter.from} onChange={set('from')} />
        <input type="date" className="premium-input" title="Bitiş" value={filter.to} onChange={set('to')} />
      </div>

      {!quotes ? (
        <div className="text-center py-12 text-gray-400">Yükleniyor...</div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">Bu filtrede teklif yok.</div>
      ) : (
        // Sütunlar listenin kendi genişliğine göre: geniş → 7 sütun, orta → tarihler başlığın altında, dar → kart düzeni
        <div className="@container bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="hidden @[40rem]:grid @[40rem]:grid-cols-[5rem_minmax(0,1fr)_8.5rem_8rem] @[64rem]:grid-cols-[5rem_minmax(12rem,1fr)_6.5rem_6.5rem_8.5rem_8rem_8rem] gap-4 px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-50">
            <span>Teklif</span><span>Başlık / Müşteri</span><span className="hidden @[64rem]:block">Oluşturma</span><span className="hidden @[64rem]:block">Geçerlilik</span><span className="text-right">Tutar</span><span>Durum</span><span className="hidden @[64rem]:block">Hazırlayan</span>
          </div>
          {quotes.map((q) => {
            const status = QUOTE_STATUS[q.status] || QUOTE_STATUS.DRAFT;
            return (
              <button key={q.id} onClick={() => navigate(`/admin/quotes/${q.id}`)}
                className="w-full text-left grid grid-cols-2 @[40rem]:grid-cols-[5rem_minmax(0,1fr)_8.5rem_8rem] @[64rem]:grid-cols-[5rem_minmax(12rem,1fr)_6.5rem_6.5rem_8.5rem_8rem_8rem] gap-x-4 gap-y-1 px-5 py-4 border-b border-gray-50 last:border-0 hover:bg-indigo-50/40 items-center">
                <span className="font-black text-gray-900">{q.code}{q.revision > 1 && <span className="text-[10px] text-gray-400 font-bold"> · R{q.revision}</span>}</span>
                <span className="min-w-0 col-span-2 @[40rem]:col-span-1 order-first @[40rem]:order-none">
                  <span className="block font-bold text-gray-900 truncate">{q.title || (q.source === 'DEALER' ? 'Bayi teklif talebi' : 'Başlıksız teklif')}</span>
                  <span className="block text-xs text-indigo-600 font-semibold truncate">{q.company.name}</span>
                  <span className="hidden @[40rem]:block @[64rem]:hidden text-[11px] text-gray-400 truncate">{formatDate(q.createdAt)}{q.validUntil && ` → ${formatDate(q.validUntil)}`}{q.preparedBy && ` · ${q.preparedBy}`}</span>
                </span>
                <span className="text-xs text-gray-500 @[40rem]:hidden @[64rem]:block">{formatDate(q.createdAt)}</span>
                <span className="text-xs text-gray-500 @[40rem]:hidden @[64rem]:block">{q.validUntil ? formatDate(q.validUntil) : '—'}</span>
                <span className="text-sm font-black text-gray-900 @[40rem]:text-right">{q.totalAmount !== null ? formatTRY(q.totalAmount) : '—'} <span className="text-[10px] text-gray-400">{q.currency}</span></span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${status.className}`}>{status.label}</span>
                  {q.responseType === 'REVISION_REQUESTED' && q.status === 'QUOTED' && <span className="text-[10px] font-black text-amber-600">{RESPONSE_LABEL.REVISION_REQUESTED}</span>}
                  {q.order && <span className="text-[10px] font-black text-emerald-600">#AK-{q.order.id}</span>}
                </span>
                <span className="text-xs text-gray-500 truncate @[40rem]:hidden @[64rem]:block">
                  {q.preparedBy || (q.requestedBy ? <span className="flex items-center"><Store className="h-3 w-3 mr-1 text-orange-400" />Talep: {q.requestedBy}</span> : '—')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuoteManagement;
