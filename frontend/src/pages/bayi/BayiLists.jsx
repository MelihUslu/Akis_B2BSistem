import React, { useEffect, useState } from 'react';
import { Heart, Repeat, BookMarked, ShoppingCart, Trash2, Pencil, Package, Layers } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useCart } from '../../context/CartContext';
import useAlert from '../../hooks/useAlert';
import ProductDetailModal from '../../components/bayi/ProductDetailModal';
import QuoteRequestModal from '../../components/bayi/QuoteRequestModal';
import { formatTRY, formatDate, firstImage, normalizeQty } from '../../utils/format';

const TABS = [
  { id: 'favorites', label: 'Favorilerim', icon: Heart },
  { id: 'frequent', label: 'Sık Aldıklarım', icon: Repeat },
  { id: 'templates', label: 'Sipariş Şablonları', icon: BookMarked },
];

const ProductRow = ({ product, onAdd, onOpen, extra }) => {
  const title = product.parentName || product.name;
  const img = firstImage(product.images);
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="w-14 h-14 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
        {img ? <img src={img} className="w-full h-full object-cover" /> : <Package className="h-5 w-5 text-gray-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{title}</p>
        {product.variantLabel && <p className="text-[11px] font-black text-indigo-600">{product.variantLabel}</p>}
        <p className="text-[11px] text-gray-400 font-semibold">{product.sku}{extra && ` · ${extra}`}</p>
      </div>
      <div className="text-right">
        {product.requiresVariant ? null : product.priceHidden
          ? <p className="text-xs font-bold text-gray-400">Teklif</p>
          : <p className="text-sm font-black text-gray-900">{formatTRY(product.netPrice)}</p>}
        {!product.requiresVariant && !product.inStock && <p className="text-[10px] font-black text-red-500">Tükendi</p>}
      </div>
      {product.requiresVariant ? (
        <button onClick={() => onOpen(product)} className="flex items-center px-3 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase"><Layers className="h-3.5 w-3.5 mr-1" /> Seç</button>
      ) : (
        <button disabled={!product.inStock} onClick={() => onAdd(product)} className="flex items-center px-3 py-2 rounded-xl bg-gray-900 text-white text-[10px] font-black uppercase disabled:opacity-30"><ShoppingCart className="h-3.5 w-3.5 mr-1" /> Ekle</button>
      )}
    </div>
  );
};

const BayiLists = () => {
  const [tab, setTab] = useState('favorites');
  const [favorites, setFavorites] = useState(null);
  const [frequent, setFrequent] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [detail, setDetail] = useState(null);
  const [quoteItems, setQuoteItems] = useState(null);
  const { addToCart, setIsCartOpen } = useCart();
  const { alertElement, showAlert, confirm } = useAlert();

  const loadFavorites = () => api.get('/products', { params: { favorites: true, limit: 100 } }).then((r) => setFavorites(r.data.data)).catch(() => setFavorites([]));
  const loadTemplates = () => api.get('/lists/templates').then((r) => setTemplates(r.data)).catch(() => setTemplates([]));

  useEffect(() => {
    if (tab === 'favorites' && !favorites) loadFavorites();
    if (tab === 'frequent' && !frequent) api.get('/products/frequent').then((r) => setFrequent(r.data)).catch(() => setFrequent([]));
    if (tab === 'templates' && !templates) loadTemplates();
  }, [tab]);

  const addOne = (product, variant = null, qty = null) => {
    const item = variant || product;
    if (item.priceHidden) {
      setQuoteItems([{ productId: item.id, name: product.parentName || product.name, sku: item.sku, variantLabel: item.variantLabel, quantity: qty || item.moq || 1, unit: item.unit }]);
      return;
    }
    addToCart({ ...item, price: item.netPrice, parentName: variant ? product.name : item.parentName, variantLabel: item.variantLabel }, qty ?? normalizeQty(item.moq, item));
    setDetail(null);
    setIsCartOpen(true);
  };

  const applyTemplate = async (t) => {
    try {
      const res = await api.post('/products/resolve-skus', { skus: t.items.map(i => i.sku) });
      const bySku = new Map(res.data.found.map(p => [p.sku, p]));
      const skipped = [];
      let added = 0;
      for (const i of t.items) {
        const p = bySku.get(i.sku);
        if (!p || p.priceHidden || !p.inStock || p.requiresVariant) { skipped.push(i.sku); continue; }
        addToCart({ ...p, price: p.netPrice }, i.quantity);
        added++;
      }
      if (added) setIsCartOpen(true);
      if (skipped.length) showAlert({ type: added ? 'warning' : 'error', title: 'Bazı ürünler eklenmedi', message: `Şu an sipariş edilemeyen kodlar: ${skipped.join(', ')}` });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Şablon sepete eklenemedi.') });
    }
  };

  const [renaming, setRenaming] = useState(null); // { id, name }
  const saveRename = async () => {
    try {
      await api.patch(`/lists/templates/${renaming.id}`, { name: renaming.name });
      setRenaming(null);
      loadTemplates();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Şablon güncellenemedi.') });
    }
  };

  const removeTemplate = async (t) => {
    const ok = await confirm({ title: `"${t.name}" silinsin mi?`, message: 'Bu işlem geri alınamaz.', confirmText: 'Sil' });
    if (!ok) return;
    await api.delete(`/lists/templates/${t.id}`);
    loadTemplates();
  };

  const toggleFavorite = async (product) => {
    await api.delete(`/lists/favorites/${product.id}`);
    setDetail(null);
    loadFavorites();
  };

  const toggleStockAlert = async (product, isOn) => {
    const res = isOn ? await api.delete(`/products/${product.id}/stock-alert`) : await api.post(`/products/${product.id}/stock-alert`);
    showAlert({ type: 'success', title: isOn ? 'Bildirim Kaldırıldı' : 'Haber Vereceğiz', message: res.data.message });
  };

  const list = { favorites, frequent }[tab];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {alertElement}
      {detail && (
        <ProductDetailModal product={detail} onClose={() => setDetail(null)} onAddToCart={addOne}
          onRequestQuote={setQuoteItems} onToggleFavorite={toggleFavorite} onToggleStockAlert={toggleStockAlert} onOpenProduct={setDetail} />
      )}
      {quoteItems && (
        <QuoteRequestModal items={quoteItems} onClose={() => setQuoteItems(null)}
          onDone={(message) => { setQuoteItems(null); setDetail(null); showAlert({ type: 'success', title: 'Teklif Talebi Gönderildi', message }); }} />
      )}

      <div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 md:p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><BookMarked className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Listelerim</h1>
            <p className="text-gray-500 text-sm mt-1">Favorileriniz, sık aldığınız ürünler ve kayıtlı sepetleriniz.</p>
          </div>
        </div>
      </div>

      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 w-full sm:w-fit overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center px-4 py-2 text-xs font-black rounded-lg whitespace-nowrap ${tab === t.id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
            <t.icon className="h-4 w-4 mr-1.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab !== 'templates' && (
        <div className="card-premium divide-y divide-gray-50">
          {!list ? <p className="p-8 text-center text-gray-400">Yükleniyor...</p>
            : list.length === 0 ? (
              <p className="p-10 text-center text-gray-400 font-bold">
                {tab === 'favorites' ? 'Henüz favori ürününüz yok. Katalogda ürün kartındaki kalbe tıklayın.' : 'Son 6 ayda sipariş verdiğiniz ürün bulunmuyor.'}
              </p>
            ) : list.map(p => (
              <ProductRow key={p.id} product={p} onAdd={(x) => addOne(x)} onOpen={setDetail}
                extra={tab === 'frequent' ? `${p.orderCount} siparişte, toplam ${p.totalQuantity} ${p.unit}` : null} />
            ))}
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-4">
          {!templates ? <p className="p-8 text-center text-gray-400">Yükleniyor...</p>
            : templates.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 font-bold">
                Henüz şablon yok. Sepetinizdeki "Şablon Kaydet" ile düzenli siparişlerinizi kaydedin.
              </div>
            ) : templates.map(t => (
              <div key={t.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  {renaming?.id === t.id ? (
                    <div className="flex gap-2">
                      <input autoFocus className="premium-input !py-2" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveRename()} />
                      <button onClick={saveRename} className="px-3 rounded-xl bg-indigo-600 text-white text-xs font-black">Kaydet</button>
                    </div>
                  ) : <p className="font-black text-gray-900">{t.name}</p>}
                  <p className="text-xs text-gray-400 font-semibold mt-1">{t.items.length} kalem · {t.user?.name} · {formatDate(t.updatedAt)}</p>
                  <p className="text-[11px] text-gray-500 mt-1 truncate">{t.items.map(i => `${i.sku} × ${i.quantity}`).join(', ')}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setRenaming({ id: t.id, name: t.name })} className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => removeTemplate(t)} className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  <button onClick={() => applyTemplate(t)} className="flex items-center px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-black"><ShoppingCart className="h-4 w-4 mr-1.5" /> Sepete Ekle</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default BayiLists;
