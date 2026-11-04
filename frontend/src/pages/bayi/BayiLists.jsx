import { useEffect, useState } from 'react';
import { Heart, Repeat, BookMarked, ShoppingCart, Trash2, Pencil, Package, Layers } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useCart } from '../../context/CartContext';
import useAlert from '../../hooks/useAlert';
import ProductDetailModal from '../../components/bayi/ProductDetailModal';
import QuoteRequestModal from '../../components/bayi/QuoteRequestModal';
import { formatTRY, formatDate, firstImage, normalizeQty } from '../../utils/format';
import { t } from '../../i18n';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';

const TABS = [
  { id: 'favorites', label: t('Favorilerim'), icon: Heart },
  { id: 'frequent', label: t('Sık Aldıklarım'), icon: Repeat },
  { id: 'templates', label: t('Sipariş Şablonları'), icon: BookMarked },
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
        {product.variantLabel && <p className="text-[11px] font-black text-brand-600">{product.variantLabel}</p>}
        <p className="text-[11px] text-gray-400 font-semibold">{product.sku}{extra && ` · ${extra}`}</p>
      </div>
      <div className="text-right">
        {product.requiresVariant ? null : product.priceHidden
          ? <p className="text-xs font-bold text-gray-400">{t('Teklif')}</p>
          : <p className="text-sm font-black text-gray-900">{formatTRY(product.netPrice)}</p>}
        {!product.requiresVariant && !product.inStock && <p className="text-[11px] font-black text-red-500">{t('Tükendi')}</p>}
      </div>
      {product.requiresVariant ? (
        <button onClick={() => onOpen(product)} className="flex items-center px-3 py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-black"><Layers className="h-3.5 w-3.5 mr-1" /> {t('Seç')}</button>
      ) : (
        <button disabled={!product.inStock} onClick={() => onAdd(product)} className="flex items-center px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-black disabled:opacity-30"><ShoppingCart className="h-3.5 w-3.5 mr-1" /> {t('Ekle')}</button>
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
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const applyTemplate = async (tpl) => {
    try {
      const res = await api.post('/products/resolve-skus', { skus: tpl.items.map(i => i.sku) });
      const bySku = new Map(res.data.found.map(p => [p.sku, p]));
      const skipped = [];
      let added = 0;
      for (const i of tpl.items) {
        const p = bySku.get(i.sku);
        if (!p || p.priceHidden || !p.inStock || p.requiresVariant) { skipped.push(i.sku); continue; }
        addToCart({ ...p, price: p.netPrice }, i.quantity);
        added++;
      }
      if (added) setIsCartOpen(true);
      if (skipped.length) showAlert({ type: added ? 'warning' : 'error', title: t('Bazı ürünler eklenmedi'), message: t('Şu an sipariş edilemeyen kodlar: {list}', { list: skipped.join(', ') }) });
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('Şablon sepete eklenemedi.')) });
    }
  };

  const [renaming, setRenaming] = useState(null); // { id, name }
  const saveRename = async () => {
    try {
      await api.patch(`/lists/templates/${renaming.id}`, { name: renaming.name });
      setRenaming(null);
      loadTemplates();
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('Şablon güncellenemedi.')) });
    }
  };

  const removeTemplate = async (tpl) => {
    const ok = await confirm({ title: t('"{name}" silinsin mi?', { name: tpl.name }), message: t('Bu işlem geri alınamaz.'), confirmText: t('Sil') });
    if (!ok) return;
    await api.delete(`/lists/templates/${tpl.id}`);
    loadTemplates();
  };

  const toggleFavorite = async (product) => {
    await api.delete(`/lists/favorites/${product.id}`);
    setDetail(null);
    loadFavorites();
  };

  const toggleStockAlert = async (product, isOn) => {
    const res = isOn ? await api.delete(`/products/${product.id}/stock-alert`) : await api.post(`/products/${product.id}/stock-alert`);
    showAlert({ type: 'success', title: isOn ? t('Bildirim Kaldırıldı') : t('Haber Vereceğiz'), message: res.data.message });
  };

  const list = { favorites, frequent }[tab];

  return (
    <div className="space-y-6">
      {alertElement}
      {detail && (
        <ProductDetailModal product={detail} onClose={() => setDetail(null)} onAddToCart={addOne}
          onRequestQuote={setQuoteItems} onToggleFavorite={toggleFavorite} onToggleStockAlert={toggleStockAlert} onOpenProduct={setDetail} />
      )}
      {quoteItems && (
        <QuoteRequestModal items={quoteItems} onClose={() => setQuoteItems(null)}
          onDone={(message) => { setQuoteItems(null); setDetail(null); showAlert({ type: 'success', title: t('Teklif Talebi Gönderildi'), message }); }} />
      )}

      <PageHeader icon={BookMarked} title={t('Listelerim')} subtitle={t('Favorileriniz, sık aldığınız ürünler ve kayıtlı sepetleriniz.')} />

      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 w-full sm:w-fit overflow-x-auto">
        {TABS.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center px-4 py-2 text-xs font-black rounded-lg whitespace-nowrap ${tab === item.id ? 'bg-white shadow-sm text-brand-600' : 'text-gray-400'}`}>
            <item.icon className="h-4 w-4 mr-1.5" /> {item.label}
          </button>
        ))}
      </div>

      {tab !== 'templates' && (list?.length === 0 ? (
        <EmptyState icon={tab === 'favorites' ? Heart : Repeat}>
          {tab === 'favorites' ? t('Henüz favori ürününüz yok. Katalogda ürün kartındaki kalbe tıklayın.') : t('Son 6 ayda sipariş verdiğiniz ürün bulunmuyor.')}
        </EmptyState>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {!list ? <p className="p-8 text-center text-gray-400">{t('Yükleniyor...')}</p>
            : list.map(p => (
              <ProductRow key={p.id} product={p} onAdd={(x) => addOne(x)} onOpen={setDetail}
                extra={tab === 'frequent' ? t('{orders} siparişte, toplam {qty} {unit}', { orders: p.orderCount, qty: p.totalQuantity, unit: p.unit }) : null} />
            ))}
        </div>
      ))}

      {tab === 'templates' && (
        <div className="space-y-4">
          {!templates ? <p className="p-8 text-center text-gray-400">{t('Yükleniyor...')}</p>
            : templates.length === 0 ? (
              <EmptyState icon={BookMarked}>{t('Henüz şablon yok. Sepetinizdeki "Şablon Kaydet" ile düzenli siparişlerinizi kaydedin.')}</EmptyState>
            ) : templates.map(tpl => (
              <div key={tpl.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  {renaming?.id === tpl.id ? (
                    <div className="flex gap-2">
                      <input autoFocus className="premium-input !py-2" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveRename()} />
                      <button onClick={saveRename} className="px-3 rounded-xl bg-brand-600 text-white text-xs font-black">{t('Kaydet')}</button>
                    </div>
                  ) : <p className="font-black text-gray-900">{tpl.name}</p>}
                  <p className="text-xs text-gray-400 font-semibold mt-1">{t('{n} kalem', { n: tpl.items.length })} · {tpl.user?.name} · {formatDate(tpl.updatedAt)}</p>
                  <p className="text-[11px] text-gray-500 mt-1 truncate">{tpl.items.map(i => `${i.sku} × ${i.quantity}`).join(', ')}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setRenaming({ id: tpl.id, name: tpl.name })} className="p-2.5 rounded-xl text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => removeTemplate(tpl)} className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  <button onClick={() => applyTemplate(tpl)} className="flex items-center px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-black"><ShoppingCart className="h-4 w-4 mr-1.5" /> {t('Sepete Ekle')}</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default BayiLists;
