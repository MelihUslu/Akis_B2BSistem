import { useEffect, useState } from 'react';
import { Search, BookOpen, ChevronRight } from 'lucide-react';
import { TICKET_CATEGORIES } from '../shared/supportMeta';

/**
 * Yardım merkezi: arama + konu türü + yazı listesi. Destek sayfasında talep seçili değilken görünür.
 * onOpen(id): yazıyı açar.
 */
const HelpCenter = ({ client, onOpen }) => {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [articles, setArticles] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      client.get('/account/help', { params: { q: q.trim() || undefined, category: category || undefined } })
        .then((r) => setArticles(r.data)).catch(() => setArticles([]));
    }, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [q, category]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card-premium overflow-hidden">
      <div className="px-6 pt-6 pb-5 bg-gradient-to-br from-indigo-600 to-indigo-600 text-white">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-100"><BookOpen className="h-4 w-4" /> Yardım Merkezi</p>
        <p className="text-xl font-black mt-1.5">Size nasıl yardımcı olabiliriz?</p>
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sorunuzu yazın: ör. excel yükleme, kargo, fatura…"
            className="w-full h-12 pl-11 pr-4 rounded-xl bg-white text-gray-900 text-sm font-semibold outline-none ring-4 ring-white/20 placeholder:text-gray-400 placeholder:font-medium" />
        </div>
      </div>
      <div className="px-6 py-3 flex flex-wrap gap-1.5 border-b border-gray-100">
        <button onClick={() => setCategory('')} className={`h-8 px-3 rounded-lg text-xs font-bold ${!category ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Tümü</button>
        {Object.entries(TICKET_CATEGORIES).filter(([id]) => id !== 'OTHER').map(([id, c]) => (
          <button key={id} onClick={() => setCategory(category === id ? '' : id)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold ${category === id ? `ring-2 ${c.ring} text-gray-900` : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
      </div>
      <div className="divide-y divide-gray-50 max-h-[calc(100vh-30rem)] min-h-[12rem] overflow-y-auto custom-scrollbar">
        {!articles ? <p className="py-10 text-center text-sm text-gray-400">Yükleniyor…</p>
          : articles.length === 0 ? (
            <p className="py-10 px-6 text-center text-sm text-gray-400">Aramanıza uygun yazı bulamadık. Yeni bir destek talebi açın, hemen yardımcı olalım.</p>
          ) : articles.map((a) => {
            const c = TICKET_CATEGORIES[a.category] || TICKET_CATEGORIES.USAGE;
            return (
              <button key={a.id} onClick={() => onOpen(a.id)} className="w-full text-left px-6 py-3.5 flex items-center gap-3 hover:bg-slate-50 group">
                <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${c.tile}`}><c.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-gray-900 group-hover:text-indigo-700">{a.title}</span>
                  {a.summary && <span className="block text-xs text-gray-500 truncate">{a.summary}</span>}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 shrink-0" />
              </button>
            );
          })}
      </div>
    </div>
  );
};

export default HelpCenter;
