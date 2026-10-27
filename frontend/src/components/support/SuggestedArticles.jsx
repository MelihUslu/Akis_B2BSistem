import { useEffect, useState } from 'react';
import { Lightbulb, ChevronRight } from 'lucide-react';

/**
 * Yeni talep yazılırken konuya uygun yardım yazılarını önerir (talep açmadan çözüm).
 */
const SuggestedArticles = ({ client, text, onOpen }) => {
  const [list, setList] = useState([]);
  const query = text.trim();

  useEffect(() => {
    if (query.length < 4) return undefined; // kısa metinde öneri gizlenir (aşağıda)
    const timer = setTimeout(() => {
      client.get('/account/help', { params: { q: query.slice(0, 300), limit: 3 } }).then((r) => setList(r.data)).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  if (!list.length || query.length < 4) return null;
  return (
    <div className="rounded-xl bg-amber-50/70 ring-1 ring-amber-200 p-3">
      <p className="flex items-center gap-1.5 text-xs font-black text-amber-800 mb-1.5"><Lightbulb className="h-4 w-4" /> Bu yazılar sorununuzu hemen çözebilir</p>
      <div className="space-y-0.5">
        {list.map((a) => (
          <button key={a.id} type="button" onClick={() => onOpen(a.id)} className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg text-sm font-semibold text-amber-900 hover:bg-amber-100">
            <span className="flex-1 truncate">{a.title}</span><ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedArticles;
