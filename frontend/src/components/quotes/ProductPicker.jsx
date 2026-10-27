import { useEffect, useRef, useState } from 'react';
import { Search, Package } from 'lucide-react';
import api from '../../services/api';
import { formatTRY } from '../../utils/format';

/**
 * Teklife ürün / varyant seçimi. Arama backend'de yapılır (ad, SKU, barkod, marka, kategori, varyant değerleri);
 * gösterilen fiyat seçili müşteriye geçerli birim fiyattır.
 */
const ProductPicker = ({ companyId, onPick, placeholder = 'Ürün adı, SKU veya özellik ile ara', autoFocus = false }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) return undefined;
    const id = setTimeout(() => {
      api.get('/quotes/catalog', { params: { q, companyId: companyId || undefined } })
        .then((r) => { setResults(r.data); setOpen(true); })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, companyId]);

  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const shown = q.trim().length >= 2 ? results : [];

  return (
    <div ref={box} className="relative">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input autoFocus={autoFocus} className="premium-input !pl-10 !bg-white" placeholder={placeholder} value={q}
        onChange={(e) => setQ(e.target.value)} onFocus={() => shown.length && setOpen(true)} />
      {open && shown.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-80 overflow-y-auto rounded-xl bg-white shadow-xl ring-1 ring-gray-100">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => { onPick(p); setQ(''); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-start gap-3 border-b border-gray-50 last:border-0">
              <Package className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900 truncate">{p.name}</span>
                <span className="block text-[11px] text-gray-500 truncate">{[p.variantLabel, p.sku, p.brand, p.packInfo].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-xs font-black text-gray-900">{p.unitPrice !== null ? formatTRY(p.unitPrice) : '—'}</span>
                <span className={`block text-[10px] font-bold ${p.stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>Stok {p.stock} {p.unit}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && shown.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl bg-white shadow-xl ring-1 ring-gray-100 px-4 py-3 text-xs text-gray-400">Eşleşen ürün yok.</div>
      )}
    </div>
  );
};

export default ProductPicker;
