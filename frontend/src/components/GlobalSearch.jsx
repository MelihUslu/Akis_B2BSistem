import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, UserCheck, ShoppingCart } from 'lucide-react';
import api from '../services/api';
import { formatTRY, ORDER_STATUS } from '../utils/format';

/**
 * Üst bar araması: ürün (ad/SKU/barkod), bayi (unvan/vergi no/cari kodu), sipariş (AK-12 / bayi adı).
 */
const GlobalSearch = ({ dark = false }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const t = setTimeout(() => api.get('/search', { params: { q } }).then((r) => { setResults(r.data); setOpen(true); }).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const go = (path) => { setOpen(false); setQ(''); navigate(path); };
  const empty = results && !results.products.length && !results.companies.length && !results.orders.length;

  return (
    <div className="relative w-full max-w-lg" ref={ref}>
      <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${dark ? 'text-slate-500' : 'text-gray-400'}`} />
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
        placeholder="Ürün, bayi veya sipariş ara (SKU, vergi no, AK-12)..."
        className={`w-full h-11 pl-10 pr-4 rounded-xl text-sm font-semibold outline-none transition-all ${dark ? 'bg-white/5 text-white placeholder:text-slate-500' : 'bg-gray-100/80 ring-1 ring-gray-200/70 text-gray-900 placeholder:text-gray-500 placeholder:font-medium hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-blue-300 focus:shadow-sm'}`}
      />
      {open && results && (
        <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 max-h-[28rem] overflow-y-auto">
          {empty && <p className="p-5 text-xs font-bold text-gray-400 text-center">Sonuç bulunamadı.</p>}
          {results.products.length > 0 && (
            <div className="py-2">
              <p className="px-4 py-1 text-[9px] font-black text-gray-400 uppercase tracking-widest">Ürünler</p>
              {results.products.map(p => (
                <button key={`p${p.id}`} onClick={() => go(`/admin/products?search=${encodeURIComponent(p.parent ? p.parent.name : p.sku)}`)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3">
                  <Package className="h-4 w-4 text-indigo-400" />
                  <span className="text-xs font-bold text-gray-800 truncate">{p.parent ? `${p.parent.name} · ` : ''}{p.name.replace(`${p.parent?.name} - `, '')}</span>
                  <span className="ml-auto text-[10px] font-mono text-gray-400">{p.sku}</span>
                </button>
              ))}
            </div>
          )}
          {results.companies.length > 0 && (
            <div className="py-2 border-t border-gray-50">
              <p className="px-4 py-1 text-[9px] font-black text-gray-400 uppercase tracking-widest">Bayiler</p>
              {results.companies.map(c => (
                <button key={`c${c.id}`} onClick={() => go(`/admin/dealers?search=${encodeURIComponent(c.name)}`)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-gray-800 truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-gray-400">{c.status === 'PENDING' ? 'Başvuru' : c.taxNumber}</span>
                </button>
              ))}
            </div>
          )}
          {results.orders.length > 0 && (
            <div className="py-2 border-t border-gray-50">
              <p className="px-4 py-1 text-[9px] font-black text-gray-400 uppercase tracking-widest">Siparişler</p>
              {results.orders.map(o => (
                <button key={`o${o.id}`} onClick={() => go(`/admin/orders?q=AK-${o.id}`)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-3">
                  <ShoppingCart className="h-4 w-4 text-pink-400" />
                  <span className="text-xs font-bold text-gray-800">#AK-{o.id}</span>
                  <span className="text-xs text-gray-500 truncate">{o.company.name}</span>
                  <span className="ml-auto text-[10px] font-bold text-gray-500 whitespace-nowrap">{formatTRY(o.totalAmount)} · {ORDER_STATUS[o.status]?.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
