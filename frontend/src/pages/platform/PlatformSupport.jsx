import { useEffect, useState } from 'react';
import { LifeBuoy, Search, Hourglass, CheckCheck, Archive, AlarmClock, Clock, Star } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import TicketThread from '../../components/shared/TicketThread';
import TicketList from '../../components/shared/TicketList';
import FilterTabs from '../../components/shared/FilterTabs';
import { TICKET_CATEGORIES } from '../../components/shared/supportMeta';

// Sık kullanılan yanıtlar; yazı alanına eklenir, gönderilmeden önce düzenlenebilir
const QUICK_REPLIES = [
  { label: 'İnceliyoruz', text: 'Merhaba, talebinizi aldık ve inceliyoruz. En kısa sürede dönüş yapacağız.' },
  { label: 'Ek bilgi iste', text: 'Merhaba, sorunu tekrarlayabilmemiz için hangi ekranda ve hangi adımlarla bu durumla karşılaştığınızı, varsa ekran görüntüsüyle paylaşabilir misiniz?' },
  { label: 'Çözüldü', text: 'Sorun giderildi. Kontrol edip bize bilgi verebilir misiniz? Başka bir sorunuz olmazsa talebi kapatacağız.' },
  { label: 'Özellik notu', text: 'Öneriniz için teşekkürler. Geliştirme listemize ekledik; hayata geçtiğinde duyurularda paylaşacağız.' },
];

// Tüm müşterilerden gelen destek talepleri
const PlatformSupport = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('OPEN');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const { alertElement, showAlert } = useAlert();

  const load = () => platformApi.get('/support')
    .then((r) => { setTickets(r.data); setNow(Date.now()); })
    .catch(() => {})
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const open = (id) => platformApi.get(`/support/${id}`).then((r) => setSelected(r.data));

  const reply = async (body, close, attachments) => {
    try {
      await platformApi.post(`/support/${selected.id}/messages`, { body, close, attachments });
      await open(selected.id);
      load();
      return true;
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Gönderilemedi.') });
      return false;
    }
  };

  const count = (st) => tickets.filter((t) => t.status === st).length;
  // Memnuniyet: puanlanan taleplerin ortalaması ve 4-5 verenlerin oranı (CSAT)
  const rated = tickets.filter((t) => t.rating);
  const avgRating = rated.length ? rated.reduce((s, t) => s + t.rating, 0) / rated.length : null;
  const csat = rated.length ? Math.round((rated.filter((t) => t.rating >= 4).length / rated.length) * 100) : null;
  const waiting = tickets.filter((t) => t.status === 'OPEN');
  const overdue = waiting.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now).length;
  const nextDue = waiting.filter((t) => t.dueAt && new Date(t.dueAt).getTime() >= now).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))[0];
  const urgent = waiting.filter((t) => t.priority === 'HIGH').length;

  const term = query.trim().toLocaleLowerCase('tr-TR');
  const visible = tickets
    .filter((t) => !filter || t.status === filter)
    .filter((t) => !category || t.category === category)
    .filter((t) => !term || [t.subject, t.tenant?.name, t.tenant?.slug, t.user?.name].some((v) => String(v || '').toLocaleLowerCase('tr-TR').includes(term)) || String(t.id) === term.replace('#', ''))
    // Bekleyenlerde hedef süresi en yakın (veya geçmiş) olan üstte
    .sort((a, b) => (filter === 'OPEN'
      ? new Date(a.dueAt || '9999-12-31') - new Date(b.dueAt || '9999-12-31')
      : new Date(b.updatedAt) - new Date(a.updatedAt)));

  return (
    <div className="space-y-6">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><LifeBuoy className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Destek Talepleri</h1>
          <p className="text-gray-500 text-sm mt-1">Müşterilerinizin yönetim panelinden açtığı talepler. Bekleyenler hedef yanıt süresi en yakın olandan başlar.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { icon: Hourglass, label: 'Yanıt bekleyen', value: count('OPEN'), sub: urgent ? `${urgent} tanesi acil` : 'acil talep yok', tone: 'bg-orange-50 text-orange-600', f: 'OPEN' },
          { icon: AlarmClock, label: 'Süresi geçen', value: overdue, sub: nextDue ? `sıradaki ${new Date(nextDue.dueAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}'e kadar` : 'hedef süre içindesiniz', tone: overdue ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600', f: 'OPEN' },
          { icon: CheckCheck, label: 'Yanıtlanan', value: count('ANSWERED'), sub: 'firmanın dönüşü bekleniyor', tone: 'bg-emerald-50 text-emerald-600', f: 'ANSWERED' },
          { icon: Archive, label: 'Kapalı', value: count('CLOSED'), sub: `toplam ${tickets.length} talep`, tone: 'bg-gray-100 text-gray-600', f: 'CLOSED' },
          { icon: Star, label: 'Memnuniyet', value: avgRating ? `${avgRating.toFixed(1)} / 5` : '—', sub: rated.length ? `%${csat} memnun · ${rated.length} puan` : 'henüz puan yok', tone: 'bg-amber-50 text-amber-600', f: 'CLOSED' },
        ].map((c) => (
          <button key={c.label} onClick={() => setFilter(c.f)} className={`text-left rounded-2xl p-4 ring-1 bg-white transition-all hover:-translate-y-0.5 hover:shadow-md ${filter === c.f && c.label !== 'Süresi geçen' ? 'ring-2 ring-blue-500' : c.label === 'Süresi geçen' && overdue ? 'ring-2 ring-red-300' : 'ring-gray-100'}`}>
            <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-gray-500">{c.label}</span><span className={`p-1.5 rounded-lg ${c.tone}`}><c.icon className="h-4 w-4" /></span></div>
            <p className="text-2xl font-black text-gray-900 mt-1 tabular-nums">{c.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{c.sub}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[26rem_minmax(0,1fr)] gap-6 items-start">
        <div className="card-premium">
          <div className="p-3 space-y-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Firma, konu, kişi veya talep no ara"
                className="w-full h-10 pl-10 pr-3 rounded-xl bg-gray-50 border border-transparent text-sm font-semibold outline-none focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-100 placeholder:text-gray-400 placeholder:font-medium" />
            </div>
            <FilterTabs compact value={filter} onChange={setFilter} tabs={[
              { id: 'OPEN', label: 'Bekleyen', icon: Hourglass, tone: 'orange', count: count('OPEN'), alert: true },
              { id: 'ANSWERED', label: 'Yanıtlanan', icon: CheckCheck, tone: 'emerald', count: count('ANSWERED') },
              { id: 'CLOSED', label: 'Kapalı', icon: Archive, tone: 'gray', count: count('CLOSED') },
              { id: '', label: 'Tümü', tone: 'slate', count: tickets.length },
            ]} />
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCategory('')} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${!category ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Tüm konular</button>
              {Object.entries(TICKET_CATEGORIES).map(([id, c]) => (
                <button key={id} onClick={() => setCategory(category === id ? '' : id)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${category === id ? `ring-2 ${c.ring} text-gray-900` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  <c.icon className="h-3 w-3" /> {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[calc(100vh-26rem)] min-h-[20rem] overflow-y-auto custom-scrollbar">
            {loading ? <p className="py-16 text-center text-sm text-gray-400">Yükleniyor…</p> : (
              <TicketList tickets={visible} selectedId={selected?.id} onSelect={open} side="PLATFORM" showTenant now={now}
                emptyText={filter === 'OPEN' ? 'Yanıt bekleyen talep yok. 🎉' : 'Bu filtrede talep yok.'} />
            )}
          </div>
        </div>

        {selected ? (
          <TicketThread ticket={selected} side="PLATFORM" onReply={reply} quickReplies={QUICK_REPLIES} showContext now={now}
            client={platformApi} uploadPath="/support/upload" onError={(message) => showAlert({ type: 'error', title: 'Dosya eklenemedi', message })}
            subtitle={`${selected.tenant?.name} (${selected.tenant?.slug}) · ${selected.user?.name} <${selected.user?.email}>`} />
        ) : (
          <div className="card-premium p-16 text-center">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-4"><LifeBuoy className="h-8 w-8" /></div>
            <p className="text-lg font-black text-gray-900">Bir talep seçin</p>
            <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1.5"><Clock className="h-4 w-4" /> Bekleyenler hedef süresi en yakın talepten başlar.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformSupport;
