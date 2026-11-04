import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../../services/api';
import { ShoppingBag, Search, Package, Tag, X, Loader2, CheckCircle2, ShoppingCart, LayoutGrid, List } from 'lucide-react';
import ProductDetailModal from '../../components/bayi/ProductDetailModal';
import QuoteRequestModal from '../../components/bayi/QuoteRequestModal';
import FilterBar from '../../components/bayi/catalog/FilterBar';
import OrderTable from '../../components/bayi/catalog/OrderTable';
import ProductGrid from '../../components/bayi/catalog/ProductGrid';
import { CategoryBanner } from '../../components/bayi/catalog/CategoryParts';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import useAlert from '../../hooks/useAlert';
import usePortalSettings from '../../hooks/usePortalSettings';
import { formatTRY, normalizeQty } from '../../utils/format';
import { cartQtyFor, canSelect, EMPTY_CATALOG_FILTERS } from '../../utils/catalog';
import { t } from '../../i18n';

const PAGE_SIZE = 24;
// Görünüm tercihi (kart / liste) kullanıcı başına bu tarayıcıda saklanır; diğeri seçilene kadar varsayılan kalır
const viewKey = (userId) => `akis_catalog_view_${userId || 'anon'}`;
const readView = (userId) => { try { return localStorage.getItem(viewKey(userId)) === 'table' ? 'table' : 'grid'; } catch { return 'grid'; } };

const buildQuery = (f, search, page) => {
  const q = new URLSearchParams({ page, limit: PAGE_SIZE, sort: f.sort });
  if (search) q.set('search', search);
  if (f.category) q.set('categoryId', f.category);
  if (f.brand) q.set('brand', f.brand);
  if (f.min) q.set('minPrice', f.min);
  if (f.max) q.set('maxPrice', f.max);
  if (f.favorites) q.set('favorites', 'true');
  if (f.inStock) q.set('inStock', 'true');
  const options = Object.fromEntries(Object.entries(f.options).filter(([, v]) => v).map(([k, v]) => [k, [v]]));
  if (Object.keys(options).length) q.set('options', JSON.stringify(options));
  return q.toString();
};

/**
 * Bayi kataloğu: sipariş tablosu. Filtreler üstte tek satırda; satırda miktar girilip eklenir (Enter da ekler),
 * işaretlenen satırlar alttaki çubuktan topluca sepete eklenir. Varyantlar satırın altında açılır.
 */
const ProductCatalog = () => {
  const [categories, setCategories] = useState([]);
  const [facets, setFacets] = useState({ brands: [], options: [] });
  const [company, setCompany] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [f, setF] = useState(EMPTY_CATALOG_FILTERS);
  const { user } = useAuth();
  const [view, setView] = useState(() => readView(user?.id)); // grid (kartlar, varsayılan) | table

  // Yüklenen sonuç, hangi sorgu için yüklendiğiyle birlikte tutulur (anahtar farklıysa "yükleniyor")
  const [result, setResult] = useState({ key: null, items: [], page: 1, pages: 1, total: 0, rules: null });
  const [loadingMore, setLoadingMore] = useState(false);

  const [qtys, setQtys] = useState({});
  const [selected, setSelected] = useState({}); // id → { item, parent }
  const [detail, setDetail] = useState(null);
  const [quoteItems, setQuoteItems] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const { alertElement, showAlert } = useAlert();
  const portal = usePortalSettings();
  const { cart, cartTotal, addToCart, setIsCartOpen } = useCart();

  const queryKey = JSON.stringify([f, search]);
  const isLoading = result.key !== queryKey;
  const rules = result.rules;

  useEffect(() => {
    Promise.all([
      api.get('/categories').then((r) => setCategories(r.data)),
      api.get('/products/filters').then((r) => setFacets(r.data)),
      api.get('/auth/me').then((r) => setCompany(r.data.company))
    ]).catch(() => {});
  }, []);

  // Arama yazmayı bırakınca uygulanır
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let alive = true;
    api.get(`/products?${buildQuery(f, search, 1)}`)
      .then((r) => { if (alive) setResult({ key: queryKey, items: r.data.data, page: 1, pages: r.data.pagination.pages, total: r.data.pagination.total, rules: r.data.rules }); })
      .catch(() => { if (alive) setResult((prev) => ({ ...prev, key: queryKey, items: [], total: 0, pages: 1 })); });
    return () => { alive = false; };
  }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    setLoadingMore(true);
    api.get(`/products?${buildQuery(f, search, result.page + 1)}`)
      .then((r) => setResult((prev) => ({ ...prev, items: [...prev.items, ...r.data.data], page: prev.page + 1, pages: r.data.pagination.pages })))
      .catch(() => showAlert({ type: 'error', title: t('Hata'), message: t('Ürünler yüklenemedi.') }))
      .finally(() => setLoadingMore(false));
  };

  // Varyant → ana ürün (sepette "Ana ürün · seçenek" adıyla görünsün)
  const parentOf = useMemo(() => new Map(result.items.flatMap((p) => (p.variants || []).map((v) => [v.id, p]))), [result.items]);

  const flash = (message) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  };

  const qtyOf = (item) => qtys[item.id] ?? (item.moq || 1);
  const select = (item, on = true) => setSelected((prev) => {
    const next = { ...prev };
    if (on) next[item.id] = { item, parent: parentOf.get(item.id) || null };
    else delete next[item.id];
    return next;
  });
  // Miktar değişen satır kendiliğinden işaretlenir (toplu eklemeye hazır)
  const setQty = (item, val, normalize) => {
    setQtys((prev) => ({ ...prev, [item.id]: normalize ? normalizeQty(val, item) : val }));
    if (canSelect(item)) select(item, true);
  };
  const step = (item, dir) => setQty(item, Math.max(item.moq || 1, normalizeQty(qtyOf(item), item) + dir * (item.stepQuantity || 1)), true);

  const putInCart = (item, quantity, parent = parentOf.get(item.id)) => {
    addToCart({ ...item, price: item.netPrice, parentName: parent ? parent.name : undefined, variantLabel: item.variantLabel }, quantity);
  };

  const addOne = (item) => {
    const parent = parentOf.get(item.id);
    const quantity = normalizeQty(qtyOf(item), item);
    if (item.priceHidden) {
      setQuoteItems([{ productId: item.id, name: parent?.name || item.name, sku: item.sku, variantLabel: item.variantLabel, quantity, unit: item.unit }]);
      return;
    }
    putInCart(item, quantity, parent);
    select(item, false);
    flash(`${t('Sepete eklendi')}: ${quantity} ${item.unit} · ${parent ? `${parent.name} (${item.variantLabel})` : item.name}`);
  };

  const selectedList = Object.values(selected);
  const selectedTotal = selectedList.reduce((s, { item }) => s + item.netPrice * normalizeQty(qtyOf(item), item), 0);
  const addSelected = () => {
    selectedList.forEach(({ item, parent }) => putInCart(item, normalizeQty(qtyOf(item), item), parent));
    flash(t('{n} ürün sepete eklendi', { n: selectedList.length }));
    setSelected({});
  };

  const selectable = result.items.filter((p) => !p.requiresVariant && canSelect(p));
  const allSelected = selectable.length > 0 && selectable.every((p) => selected[p.id]);
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else setSelected((prev) => ({ ...prev, ...Object.fromEntries(selectable.map((p) => [p.id, { item: p, parent: null }])) }));
  };

  // Ürün detay penceresinden ekleme (variant seçilmiş olabilir)
  const addFromDetail = (product, variant = null, qty = null) => {
    const item = variant || product;
    const quantity = qty ?? normalizeQty(qtyOf(item), item);
    if (item.priceHidden) {
      setQuoteItems([{ productId: item.id, name: product.name, sku: item.sku, variantLabel: variant?.variantLabel, quantity, unit: item.unit }]);
      return;
    }
    putInCart(item, quantity, variant ? product : null);
    setDetail(null);
    flash(`${t('Sepete eklendi')}: ${quantity} ${item.unit} · ${product.name}${variant ? ` (${variant.variantLabel})` : ''}`);
  };

  const updateItem = (id, patch) => {
    const apply = (p) => (p.id === id ? { ...p, ...patch } : { ...p, variants: p.variants?.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
    setResult((prev) => ({ ...prev, items: prev.items.map(apply) }));
    setDetail((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  };

  const toggleFavorite = async (product) => {
    try {
      const res = product.isFavorite ? await api.delete(`/lists/favorites/${product.id}`) : await api.post(`/lists/favorites/${product.id}`);
      if (f.favorites && !res.data.isFavorite) setResult((prev) => ({ ...prev, items: prev.items.filter((p) => p.id !== product.id), total: prev.total - 1 }));
      else updateItem(product.id, { isFavorite: res.data.isFavorite });
    } catch {
      showAlert({ type: 'error', title: t('Hata'), message: t('Favori güncellenemedi.') });
    }
  };

  const toggleStockAlert = async (item, isOn = item.hasStockAlert) => {
    try {
      const res = isOn ? await api.delete(`/products/${item.id}/stock-alert`) : await api.post(`/products/${item.id}/stock-alert`);
      updateItem(item.id, { hasStockAlert: !isOn });
      flash(res.data.message);
    } catch (error) {
      showAlert({ type: 'error', title: t('İşlem Başarısız'), message: error.response?.data?.message || t('Stok bildirimi ayarlanamadı.') });
    }
  };

  const row = {
    qtyOf, setQty, step,
    isSelected: (item) => Boolean(selected[item.id]),
    toggle: (item) => select(item, !selected[item.id]),
    add: addOne,
    open: setDetail,
    favorite: toggleFavorite,
    stockAlert: (item) => toggleStockAlert(item),
    inCart: (item) => cartQtyFor(item, cart),
    // Stokta olmayan ürün için teklif talebi (Ayarlar → Sipariş ve Teslimat)
    quoteOutOfStock: portal.quoteOutOfStock,
    quote: (item) => {
      const parent = parentOf.get(item.id);
      setQuoteItems([{ productId: item.id, name: parent?.name || item.name, sku: item.sku, variantLabel: item.variantLabel, quantity: Math.max(item.moq || 1, 1), unit: item.unit, outOfStock: !item.inStock }]);
    }
  };

  // Etkin filtreler: tek tıkla kaldırılabilen etiketler
  const chips = [];
  if (search) chips.push({ key: 'search', label: `"${search}"`, clear: () => setSearchInput('') });
  if (f.brand) chips.push({ key: 'brand', label: f.brand, clear: () => setF({ ...f, brand: '' }) });
  if (f.min || f.max) chips.push({ key: 'price', label: `${f.min || 0} – ${f.max || '∞'} ₺`, clear: () => setF({ ...f, min: '', max: '' }) });
  if (f.inStock) chips.push({ key: 'stock', label: t('Stoktakiler'), clear: () => setF({ ...f, inStock: false }) });
  if (f.favorites) chips.push({ key: 'fav', label: t('Favorilerim'), clear: () => setF({ ...f, favorites: false }) });
  Object.entries(f.options).filter(([, v]) => v).forEach(([k, v]) => chips.push({ key: `o-${k}`, label: `${k}: ${v}`, clear: () => setF({ ...f, options: { ...f.options, [k]: '' } }) }));
  const hasFilters = chips.length > 0 || Boolean(f.category);
  const clearAll = () => { setF({ ...EMPTY_CATALOG_FILTERS, sort: f.sort }); setSearchInput(''); };

  const showBar = selectedList.length > 0 || cart.length > 0 || notice;
  const changeView = (v) => { setView(v); try { localStorage.setItem(viewKey(user?.id), v); } catch { /* gizli sekme */ } };

  return (
    <div className="space-y-5">
      {alertElement}

      <PageHeader icon={ShoppingBag} title={t('Katalog')}
        subtitle={company && <>{company.name} · {t('Özel İskonto (%{n})', { n: company.netDiscount || 0 })}</>}
        actions={<>
          {rules?.qtyRate > 0 && (
            <span className="inline-flex items-center h-10 px-3 rounded-xl text-xs font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50">
              <Tag className="h-3.5 w-3.5 mr-1.5" /> {t('{n} ve üzeri alımlarda sepette ekstra %{rate} indirim', { n: rules.qtyThreshold, rate: rules.qtyRate })}
            </span>
          )}
          <div role="group" aria-label={t('Görünüm')} className="flex bg-gray-100 rounded-xl p-1">
            {[['grid', LayoutGrid, t('Kart')], ['table', List, t('Liste')]].map(([v, Icon, label]) => (
              <button key={v} onClick={() => changeView(v)} aria-pressed={view === v}
                className={`h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-black transition-colors ${view === v ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </>} />

      {/* Arama + filtreler: kaydırırken üstte kalır */}
      <div className="md:sticky md:top-[4.5rem] z-20 -mx-3 md:-mx-8 lg:-mx-12 px-3 md:px-8 lg:px-12 py-3 bg-navy-50/90 backdrop-blur border-b border-gray-200/70 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('Ürün adı, SKU, barkod veya marka ile ara')}
            className="w-full h-12 pl-12 pr-10 rounded-xl bg-white border border-gray-200 text-[15px] font-medium outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100 placeholder:text-gray-400 [&::-webkit-search-cancel-button]:appearance-none" />
          {searchInput && <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700" aria-label={t('Temizle')}><X className="h-4 w-4" /></button>}
        </div>
        <FilterBar value={f} onChange={setF} categories={categories} facets={facets} />
      </div>

      {f.category && <CategoryBanner categories={categories} value={f.category} onPick={(id) => setF({ ...f, category: id })} />}

      <div className="flex flex-wrap items-center gap-2 min-h-[2rem]">
        <p className="text-sm font-bold text-gray-900 mr-1">{isLoading ? t('Aranıyor…') : t('{n} ürün', { n: result.total.toLocaleString('tr-TR') })}</p>
        {chips.map((c) => (
          <button key={c.key} onClick={c.clear} className="flex items-center h-7 pl-2.5 pr-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200">
            {c.label} <X className="h-3.5 w-3.5 ml-1 text-gray-500" />
          </button>
        ))}
        {chips.length > 0 && <button onClick={clearAll} className="text-xs font-bold text-brand-600 hover:underline px-1">{t('Tümünü temizle')}</button>}
        <div className="ml-auto flex items-center gap-3">
          <p className="hidden xl:block text-xs text-gray-400">{t("İpucu: miktarı yazıp Enter'a basınca ürün sepete eklenir.")}</p>
          {view === 'grid' && selectable.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded accent-brand-600" /> {t('Tümünü seç')}
            </label>
          )}
        </div>
      </div>

      {isLoading ? (view === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[22rem] rounded-2xl border border-gray-200 bg-gray-50/60 animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          <div className="h-11 list-head" />
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[4.5rem] animate-pulse bg-gray-50/50" />)}
        </div>
      )) : result.items.length === 0 ? (
        <EmptyState icon={Package} action={hasFilters && <button onClick={clearAll} className="btn-secondary">{t('Filtreleri temizle')}</button>}>
          {hasFilters ? t('Bu filtrelere uyan ürün bulunamadı.') : t('Katalogda henüz ürün yok.')}
        </EmptyState>
      ) : view === 'grid' ? (
        <ProductGrid items={result.items} row={row} />
      ) : (
        <OrderTable items={result.items} row={row} allSelected={allSelected} onToggleAll={toggleAll} />
      )}

      {!isLoading && result.page < result.pages && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-gray-400">{t('{shown} / {total} ürün gösteriliyor', { shown: result.items.length, total: result.total })}</p>
          <button onClick={loadMore} disabled={loadingMore} className="flex items-center h-10 px-6 rounded-xl bg-white border border-gray-200 text-sm font-bold text-gray-700 hover:border-brand-300 hover:text-brand-600 disabled:opacity-60">
            {loadingMore && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {t('Daha fazla göster')}
          </button>
        </div>
      )}

      {/* Alt çubuk: seçilenler, son işlem, sepet özeti */}
      {/* Seçim / bildirim yoksa yalnızca sağda küçük sepet düğmesi */}
      {showBar && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-20 flex justify-end pointer-events-none">
          <div className={`pointer-events-auto bg-navy-900 dark:bg-navy-800 ring-1 ring-white/10 text-white rounded-2xl shadow-2xl flex flex-wrap items-center gap-x-4 gap-y-2 ${selectedList.length > 0 || notice ? 'w-full px-4 py-3' : 'p-1.5'}`}>
            {selectedList.length > 0 ? (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm"><b>{t('{n} ürün seçili', { n: selectedList.length })}</b> <span className="text-white/60">· {formatTRY(selectedTotal)}</span></p>
                <button onClick={addSelected} className="h-9 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-black flex items-center gap-1.5"><ShoppingCart className="h-4 w-4" /> {t('Seçilenleri sepete ekle')}</button>
                <button onClick={() => setSelected({})} className="text-xs font-bold text-white/60 hover:text-white">{t('Vazgeç')}</button>
              </div>
            ) : notice ? (
              <p className="flex items-center text-sm min-w-0"><CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400 shrink-0" /><span className="truncate">{notice}</span></p>
            ) : null}
            {cart.length > 0 && (
              <button onClick={() => setIsCartOpen(true)} className="ml-auto flex items-center gap-2 h-9 pl-3 pr-4 rounded-lg bg-white/10 hover:bg-white/20 text-sm">
                <ShoppingCart className="h-4 w-4" /> <span className="font-bold">{t('{n} kalem', { n: cart.length })}</span> <span className="text-white/70">· {formatTRY(cartTotal)}</span>
                <span className="text-xs font-black text-brand-300 ml-1">{t('Sepete git')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {detail && (
        <ProductDetailModal key={detail.id} product={detail} rules={rules} onClose={() => setDetail(null)}
          onAddToCart={addFromDetail} onRequestQuote={setQuoteItems} onToggleFavorite={toggleFavorite} onToggleStockAlert={toggleStockAlert} onOpenProduct={setDetail} />
      )}
      {quoteItems && (
        <QuoteRequestModal items={quoteItems} onClose={() => setQuoteItems(null)}
          onDone={(message) => { setQuoteItems(null); setDetail(null); showAlert({ type: 'success', title: t('Teklif Talebi Gönderildi'), message }); }} />
      )}
    </div>
  );
};

export default ProductCatalog;
