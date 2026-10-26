import React, { useState } from 'react';
import { Zap, ClipboardPaste, Plus, Trash2, ShoppingCart, AlertTriangle, Search } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useCart } from '../../context/CartContext';
import useAlert from '../../hooks/useAlert';
import { formatTRY, normalizeQty } from '../../utils/format';

let rowSeq = 0;
const nextKey = () => ++rowSeq;
const emptyRow = () => ({ key: nextKey(), sku: '', quantity: '' });

// "SKU<TAB>Miktar", "SKU;Miktar", "SKU,Miktar" veya "SKU Miktar" satırlarını ayrıştırır (Excel'den kopyala-yapıştır)
const parsePaste = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sku, qty] = line.split(/\t|;|,|\s+/).filter(Boolean);
      return { key: nextKey(), sku: sku || '', quantity: qty || '' };
    })
    .filter((r) => r.sku && !/^(sku|stok)/i.test(r.sku));

const QuickOrder = () => {
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [paste, setPaste] = useState('');
  const [resolved, setResolved] = useState(null); // { lines, notFound }
  const [loading, setLoading] = useState(false);
  const { addToCart, setIsCartOpen } = useCart();
  const { alertElement, showAlert } = useAlert();

  const updateRow = (key, field, value) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  const applyPaste = () => {
    const parsed = parsePaste(paste);
    if (parsed.length === 0) return;
    setRows((prev) => [...prev.filter((r) => r.sku), ...parsed]);
    setPaste('');
  };

  const resolve = async () => {
    const filled = rows.filter((r) => r.sku.trim());
    if (filled.length === 0) return;
    setLoading(true);
    try {
      const res = await api.post('/products/resolve-skus', { skus: filled.map((r) => r.sku.trim()) });
      const byCode = new Map();
      res.data.found.forEach((p) => { byCode.set(p.sku, p); if (p.barcode) byCode.set(p.barcode, p); });

      const lines = filled
        .map((r) => {
          const product = byCode.get(r.sku.trim());
          return product && { product, quantity: normalizeQty(r.quantity || product.moq, product), requested: r.quantity };
        })
        .filter(Boolean);
      setResolved({ lines, notFound: res.data.notFound });
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Ürünler bulunamadı.') });
    } finally {
      setLoading(false);
    }
  };

  const addAll = () => {
    const addable = resolved.lines.filter((l) => !l.product.priceHidden && !l.product.requiresVariant);
    addable.forEach((l) => addToCart({ ...l.product, price: l.product.netPrice }, l.quantity));
    const skipped = resolved.lines.length - addable.length;
    setResolved(null);
    setRows([emptyRow(), emptyRow(), emptyRow()]);
    setIsCartOpen(true);
    if (skipped > 0) {
      showAlert({ type: 'warning', title: 'Bazı ürünler eklenmedi', message: `${skipped} ürün eklenmedi: fiyat teklifi gerekiyor ya da varyant seçilmesi gerekiyor (varyantın kendi SKU'sunu girin).` });
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-6xl mx-auto">
      {alertElement}
      <div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 md:p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><Zap className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Hızlı Sipariş</h1>
            <p className="text-gray-500 text-sm mt-1">SKU / barkod ve miktar girin ya da Excel'den iki sütunu (SKU, Miktar) kopyalayıp yapıştırın.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-premium p-6 space-y-3">
          <div className="grid grid-cols-[1fr_8rem_2.5rem] gap-3 text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">
            <span>SKU / Barkod</span><span>Miktar</span><span />
          </div>
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_8rem_2.5rem] gap-3">
              <input className="premium-input font-mono" placeholder="AK-18-MATKAP" value={row.sku} onChange={(e) => updateRow(row.key, 'sku', e.target.value)} />
              <input className="premium-input" type="number" min="1" placeholder="Adet" value={row.quantity} onChange={(e) => updateRow(row.key, 'quantity', e.target.value)} />
              <button onClick={() => setRows(rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [emptyRow()])} className="text-gray-300 hover:text-red-500 flex items-center justify-center">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex justify-between pt-3">
            <button onClick={() => setRows([...rows, emptyRow()])} className="flex items-center text-xs font-black text-indigo-600 hover:underline">
              <Plus className="h-4 w-4 mr-1" /> Satır Ekle
            </button>
            <button onClick={resolve} disabled={loading} className="btn-gradient disabled:opacity-60">
              <Search className="h-4 w-4 mr-2" /> {loading ? 'Aranıyor...' : 'Ürünleri Getir'}
            </button>
          </div>
        </div>

        <div className="card-premium p-6 space-y-4">
          <label className="premium-label flex items-center"><ClipboardPaste className="h-3.5 w-3.5 mr-1.5" /> Excel'den Yapıştır</label>
          <textarea
            className="premium-input h-48 font-mono resize-none"
            placeholder={'AK-18-MATKAP\t10\nEA-7-ANAHTAR\t24\nIG-SB-BOT\t5'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button onClick={applyPaste} className="w-full py-3 rounded-2xl bg-gray-900 text-white text-xs font-black uppercase tracking-widest hover:bg-gray-800">
            Listeye Aktar
          </button>
        </div>
      </div>

      {resolved && (
        <div className="card-premium">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-black text-gray-900">Bulunan Ürünler ({resolved.lines.length})</h3>
            <button onClick={addAll} disabled={resolved.lines.length === 0} className="btn-gradient disabled:opacity-50">
              <ShoppingCart className="h-4 w-4 mr-2" /> Tümünü Sepete Ekle
            </button>
          </div>
          {resolved.notFound.length > 0 && (
            <p className="mx-6 mt-4 text-xs font-bold text-amber-800 bg-amber-50 p-3 rounded-xl flex items-center">
              <AlertTriangle className="h-4 w-4 mr-2" /> Bulunamayan kodlar: {resolved.notFound.join(', ')}
            </p>
          )}
          <div className="divide-y divide-gray-50">
            {resolved.lines.map(({ product, quantity, requested }) => (
              <div key={product.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900">{product.parentName || product.name}</p>
                  {product.variantLabel && <p className="text-xs font-black text-indigo-600">{product.variantLabel}</p>}
                  {product.requiresVariant && <p className="text-xs font-black text-amber-600">Bu ana ürün kodudur — varyantın SKU'sunu girin.</p>}
                  <p className="text-xs text-gray-400 font-semibold">
                    {product.sku} · Stok: {product.stock}
                    {requested && parseInt(requested) !== quantity && <span className="text-amber-600"> · Miktar MOQ/koli kuralına göre {quantity} yapıldı</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-gray-900">{product.priceHidden ? 'Fiyat teklifi gerekli' : formatTRY(product.netPrice * quantity)}</p>
                  <p className="text-xs text-gray-400 font-semibold">{quantity} {product.unit}{!product.priceHidden && ` × ${formatTRY(product.netPrice)}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickOrder;
