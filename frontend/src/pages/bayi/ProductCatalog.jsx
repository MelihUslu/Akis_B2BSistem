import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  ShoppingCart, Search, Package,
  CheckCircle2, AlertCircle, XCircle, 
  Eye, Minus, Plus,
  Filter, SlidersHorizontal, BellRing, BellOff, Tag, Heart, Layers
} from 'lucide-react';
import ProductDetailModal from '../../components/bayi/ProductDetailModal';
import QuoteRequestModal from '../../components/bayi/QuoteRequestModal';
import { useCart } from '../../context/CartContext';
import useAlert from '../../hooks/useAlert';
import { formatTRY, firstImage, normalizeQty } from '../../utils/format';

// Varyantlı ürün kartı özeti: en düşük fiyat, stok durumu, seçenek sayısı
const variantSummary = (p) => {
  if (!p.requiresVariant || !p.variants?.length) return null;
  const priced = p.variants.filter(v => !v.priceHidden);
  return {
    minPrice: priced.length ? Math.min(...priced.map(v => v.netPrice)) : null,
    inStock: p.variants.some(v => v.inStock),
    count: p.variants.length
  };
};

const ProductCatalog = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ brands: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [page, setPage] = useState(1);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [buyQuantities, setBuyQuantities] = useState({});
  const [rules, setRules] = useState(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [optionFilters, setOptionFilters] = useState({}); // { Gramaj: '1 kg' }
  const [quoteItems, setQuoteItems] = useState(null);
  const { alertElement, showAlert } = useAlert();

  const { addToCart, setIsCartOpen } = useCart();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page,
        search,
        categoryId: selectedCategory,
        brand: selectedBrand,
        minPrice: priceRange.min,
        maxPrice: priceRange.max,
        ...(favoritesOnly && { favorites: 'true' }),
      });
      const selectedOptions = Object.fromEntries(Object.entries(optionFilters).filter(([, v]) => v).map(([k, v]) => [k, [v]]));
      if (Object.keys(selectedOptions).length) query.set('options', JSON.stringify(selectedOptions));

      const [pRes, cRes, fRes, uRes] = await Promise.all([
        api.get(`/products?${query.toString()}`),
        api.get('/categories'),
        api.get('/products/filters'),
        api.get('/auth/me')
      ]);

      setProducts(pRes.data.data);
      setRules(pRes.data.rules);
      setCategories(cRes.data);
      setFilters(fRes.data);
      setUserProfile(uRes.data);
    } catch (error) {
      console.error('Veri yükleme hatası');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, selectedBrand, selectedCategory, favoritesOnly, optionFilters]);

  // variant: seçilen varyant (varyantsız üründe null) · qty: verilmezse karttaki miktar
  const handleAddToCart = (product, variant = null, qty = null) => {
    const item = variant || product;
    if (item.priceHidden) {
      setQuoteItems([{ productId: item.id, name: product.name, sku: item.sku, variantLabel: variant?.variantLabel, quantity: normalizeQty(qty ?? buyQuantities[product.id], item), unit: item.unit }]);
      return;
    }
    const quantity = qty ?? normalizeQty(buyQuantities[product.id], item);
    addToCart({ ...item, price: item.netPrice, parentName: variant ? product.name : undefined, variantLabel: variant?.variantLabel }, quantity);
    setIsDetailOpen(false);
    setIsCartOpen(true);
  };

  const toggleFavorite = async (product) => {
    try {
      const res = product.isFavorite
        ? await api.delete(`/lists/favorites/${product.id}`)
        : await api.post(`/lists/favorites/${product.id}`);
      const update = (p) => (p.id === product.id ? { ...p, isFavorite: res.data.isFavorite } : p);
      setProducts(prev => (favoritesOnly && !res.data.isFavorite ? prev.filter(p => p.id !== product.id) : prev.map(update)));
      setSelectedProduct(prev => (prev ? update(prev) : prev));
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: 'Favori güncellenemedi.' });
    }
  };

  // Yazarken serbest bırak, +/- ve sepete eklerken MOQ / artış katsayısına göre düzelt
  const updateBuyQty = (productId, val, product, normalize = true) => {
    const qty = normalize ? normalizeQty(val, product) : val;
    setBuyQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  const stepDown = (product) => {
    const current = normalizeQty(buyQuantities[product.id], product);
    updateBuyQty(product.id, Math.max(product.moq || 1, current - (product.stepQuantity || 1)), product);
  };
  const stepUp = (product) => {
    const current = normalizeQty(buyQuantities[product.id], product);
    updateBuyQty(product.id, current + (product.stepQuantity || 1), product);
  };

  const toggleStockAlert = async (product, isOn = product.hasStockAlert) => {
    try {
      const res = isOn
        ? await api.delete(`/products/${product.id}/stock-alert`)
        : await api.post(`/products/${product.id}/stock-alert`);
      const update = (p) => (p.id === product.id ? { ...p, hasStockAlert: !isOn } : p);
      setProducts(prev => prev.map(update));
      showAlert({ type: 'success', title: isOn ? 'Bildirim Kaldırıldı' : 'Haber Vereceğiz', message: res.data.message });
    } catch (error) {
      showAlert({ type: 'error', title: 'İşlem Başarısız', message: error.response?.data?.message || 'Stok bildirimi ayarlanamadı.' });
    }
  };

  const openDetail = (product) => {
    setSelectedProduct(product);
    setIsDetailOpen(true);
  };

  const qtyValue = (product) => buyQuantities[product.id] ?? (product.moq || 1);

  const getStockBadge = (stock) => {
    if (stock === '100+') return <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm"><CheckCircle2 className="h-3 w-3 mr-1.5" /> 100+ STOK</span>;
    if (stock === 'Son 5 Ürün') return <span className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm"><AlertCircle className="h-3 w-3 mr-1.5" /> KRİTİK STOK</span>;
    if (stock === 'Tükendi') return <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm"><XCircle className="h-3 w-3 mr-1.5" /> TÜKENDİ</span>;
    return <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm">{stock} ADET</span>;
  };

  return (
    <div className="animate-in fade-in duration-700">
      {alertElement}
      
      {/* Header Area */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-6">
        <div>
          <div className="flex items-center space-x-4 mb-2">
             <div className="bg-indigo-600 w-2 h-8 rounded-full" />
             <h1 className="text-3xl md:text-3xl font-black text-gray-900 tracking-tight">Katalog</h1>
          </div>
          <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest">
            {userProfile?.company?.name} Özel İskonto (%{userProfile?.company?.netDiscount || 0})
          </p>
          {rules?.qtyRate > 0 && (
            <p className="mt-2 inline-flex items-center text-[11px] font-black text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl">
              <Tag className="h-3.5 w-3.5 mr-1.5" /> {rules.qtyThreshold} ve üzeri alımlarda sepette ekstra %{rules.qtyRate} indirim
            </p>
          )}
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); fetchData(); }} className="relative w-full xl:w-[32rem] group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-indigo-600 transition-all" />
          <input 
            type="text" 
            placeholder="Ürün adı, SKU veya barkod..." 
            className="w-full pl-16 pr-6 py-4 md:py-5 bg-white border border-gray-100 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-indigo-100 shadow-sm transition-all outline-none placeholder:text-gray-300"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </form>
      </div>

      {/* Categories Row */}
      <div className="mb-8">
         <div className="flex space-x-4 overflow-x-auto custom-scrollbar pb-4">
            <button 
              onClick={() => setSelectedCategory('')}
              className={`flex items-center space-x-4 px-6 py-4 rounded-2xl border transition-all min-w-max ${
                !selectedCategory 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-500/30' 
                  : 'bg-white text-gray-700 border-gray-100 hover:border-indigo-200 hover:shadow-md'
              }`}
            >
               <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${!selectedCategory ? 'bg-white/20' : 'bg-indigo-50 text-indigo-500'}`}>
                  <Package className="h-6 w-6" />
               </div>
               <div className="text-left">
                 <span className="font-black text-sm block">Tüm Ürünler</span>
                 <span className={`text-[10px] font-bold uppercase tracking-widest ${!selectedCategory ? 'text-indigo-200' : 'text-gray-400'}`}>Tüm Kataloğu Gör</span>
               </div>
            </button>

            {categories.map(cat => (
              <button 
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center space-x-4 px-6 py-4 rounded-2xl border transition-all min-w-max ${
                  selectedCategory === cat.id 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-500/30' 
                    : 'bg-white text-gray-700 border-gray-100 hover:border-indigo-200 hover:shadow-md'
                }`}
              >
                 <div className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 ${selectedCategory === cat.id ? 'bg-white/20' : 'bg-gray-50 text-gray-400'}`}>
                    {cat.image ? (
                      <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-6 w-6 opacity-50" />
                    )}
                 </div>
                 <div className="text-left">
                   <span className="font-black text-sm block">{cat.name}</span>
                   <span className={`text-[10px] font-bold uppercase tracking-widest ${selectedCategory === cat.id ? 'text-indigo-200' : 'text-gray-400'}`}>Kategori</span>
                 </div>
              </button>
            ))}
         </div>
      </div>

      {/* Advanced Filters Bar (Sticky) */}
      <div className="bg-white border border-gray-100 rounded-[2rem] p-4 mb-10 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center md:sticky top-0 z-30 gap-4">
         <div className="flex items-center space-x-3 text-sm font-bold text-gray-500 pl-4">
            <Filter className="h-5 w-5 text-indigo-500" />
            <span className="uppercase tracking-widest text-[11px] font-black">Gelişmiş Filtreler</span>
         </div>

         <div className="flex flex-wrap items-center gap-3 w-full md:w-auto md:justify-end">
            <div className="flex items-center bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
               <SlidersHorizontal className="h-4 w-4 text-gray-400 mr-3" />
               <select 
                 className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none w-40 cursor-pointer"
                 value={selectedBrand}
                 onChange={(e) => setSelectedBrand(e.target.value)}
               >
                 <option value="">Tüm Markalar</option>
                 {filters.brands.map(b => <option key={b} value={b}>{b}</option>)}
               </select>
            </div>

            <div className="flex items-center space-x-3 bg-gray-50 px-5 py-3 rounded-2xl border border-gray-100">
               <input 
                 type="number" placeholder="Min ₺" 
                 className="w-20 bg-transparent text-xs font-bold outline-none text-center"
                 value={priceRange.min} onChange={e => setPriceRange({...priceRange, min: e.target.value})}
               />
               <div className="w-px h-4 bg-gray-300" />
               <input 
                 type="number" placeholder="Max ₺" 
                 className="w-20 bg-transparent text-xs font-bold outline-none text-center"
                 value={priceRange.max} onChange={e => setPriceRange({...priceRange, max: e.target.value})}
               />
            </div>

            {filters.options?.map(o => (
              <div key={o.name} className={`flex items-center px-4 py-3 rounded-2xl border ${optionFilters[o.name] ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100'}`}>
                <Layers className="h-4 w-4 text-gray-400 mr-2" />
                <select className="bg-transparent border-none text-xs font-bold text-gray-700 outline-none max-w-[9rem] cursor-pointer"
                  value={optionFilters[o.name] || ''} onChange={(e) => { setPage(1); setOptionFilters({ ...optionFilters, [o.name]: e.target.value }); }}>
                  <option value="">{o.name}: Tümü</option>
                  {o.values.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            ))}

            <button onClick={() => { setPage(1); setFavoritesOnly(!favoritesOnly); }}
              className={`flex items-center px-4 py-3 rounded-2xl border text-xs font-black ${favoritesOnly ? 'bg-pink-50 border-pink-200 text-pink-600' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
              <Heart className={`h-4 w-4 mr-2 ${favoritesOnly ? 'fill-current' : ''}`} /> Favorilerim
            </button>

            <button 
              onClick={() => { setPage(1); fetchData(); }}
              className="bg-gray-900 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/20"
            >
              Uygula
            </button>
         </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-8">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm animate-pulse h-[28rem]"></div>
          ))
        ) : products.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
            <Package className="h-24 w-24 text-gray-100 mx-auto mb-6" />
            <p className="text-gray-400 font-black text-xl uppercase tracking-widest">Ürün bulunamadı.</p>
          </div>
        ) : products.map((product) => { const summary = variantSummary(product); return (
          <div key={product.id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-[0_20px_60px_-15px_rgba(79,70,229,0.15)] hover:border-indigo-100 hover:-translate-y-2 transition-all duration-500 group relative flex flex-col p-3 overflow-hidden">
            {/* Top Badges & Actions */}
            <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-2">
              {summary ? getStockBadge(summary.inStock ? '100+' : 'Tükendi') : getStockBadge(product.stock)}
              <button onClick={(e) => { e.stopPropagation(); toggleFavorite(product); }} title="Favori"
                className={`bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-gray-100 transition-all hover:scale-110 ${product.isFavorite ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'}`}>
                <Heart className={`h-5 w-5 ${product.isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDetail(product); }}
                className="bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg text-gray-400 hover:text-indigo-600 transition-all border border-gray-100 hover:scale-110 relative z-30"
              >
                 <Eye className="h-5 w-5" />
              </button>
            </div>

            {/* Image Box */}
            <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 rounded-[2rem] flex items-center justify-center p-8 group-hover:from-indigo-50/50 group-hover:to-purple-50/50 transition-colors duration-500 mb-6 overflow-hidden relative">
              <div className="absolute inset-0 bg-white/20 mix-blend-overlay"></div>
              {firstImage(product.images) ? (
                 <img src={firstImage(product.images)} className="w-full h-full object-contain relative z-10 group-hover:scale-110 transition-transform duration-700 drop-shadow-xl" />
              ) : (
                 <Package className="h-20 w-20 text-gray-300 relative z-10 group-hover:scale-110 transition-transform duration-500" />
              )}
            </div>
            
            {/* Content Area */}
            <div className="flex-1 flex flex-col px-4 pb-4">
              <div className="mb-4">
                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded-md tracking-widest">{product.brand || '—'}</span>
                  {summary ? (
                    <span className="text-[10px] font-bold text-indigo-500 uppercase bg-indigo-50/60 px-2.5 py-1 rounded-md tracking-widest">{summary.count} seçenek · {product.options?.map(o => o.name).join(', ') || 'Varyant'}</span>
                  ) : (
                    <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-50 px-2.5 py-1 rounded-md tracking-widest">SKU: {product.sku}</span>
                  )}
                </div>
                <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors text-lg leading-snug line-clamp-2 h-[3.5rem]">{product.name}</h3>
              </div>

              <div className="flex items-end justify-between mb-8">
                {summary ? (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Fiyat <span className="normal-case">(KDV hariç)</span></p>
                    <p className="text-3xl font-black text-gray-900 tracking-tighter">
                      {summary.minPrice !== null ? <>{formatTRY(summary.minPrice)}<span className="text-sm text-gray-400 font-bold">'den</span></> : <span className="text-sm text-gray-500">Teklif isteyin</span>}
                    </p>
                  </div>
                ) : product.priceHidden ? (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Fiyat</p>
                    <p className="text-sm font-black text-gray-500">{product.rateMissing ? 'Kur bilgisi bekleniyor' : 'Teklif için iletişime geçin'}</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Fiyat <span className="normal-case">(KDV hariç)</span></p>
                      <div className="flex items-baseline gap-2">
                         <p className="text-3xl font-black text-gray-900 tracking-tighter">
                           {formatTRY(product.netPrice)}
                         </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Liste</p>
                      {product.listPriceTRY !== product.netPrice && (
                        <p className="text-sm font-bold text-gray-400 line-through">{formatTRY(product.listPriceTRY)}</p>
                      )}
                      {product.currency && !['TRY', 'TL'].includes(product.currency) && (
                        <p className="text-[9px] font-bold text-indigo-400 mt-0.5">{product.price.toLocaleString('tr-TR')} {product.currency} · TCMB kuru</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Action Bar */}
              <div className="mt-auto">
                 {summary ? (
                   <button onClick={() => openDetail(product)} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-2xl py-4 flex items-center justify-center shadow-md hover:-translate-y-0.5 transition-all">
                     <Layers className="h-4 w-4 mr-2 text-white" />
                     <span className="text-[11px] font-black text-white uppercase tracking-widest">Seçenekleri Gör</span>
                   </button>
                 ) : (
                 <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-50 rounded-2xl p-1.5 border border-gray-100 w-2/5 shadow-inner">
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); stepDown(product); }} 
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                      ><Minus className="h-4 w-4" /></button>
                      <input 
                        type="number" 
                        onClick={(e) => { e.stopPropagation(); }}
                        className="w-full bg-transparent text-center text-sm font-black outline-none text-gray-900" 
                        value={qtyValue(product)} 
                        onChange={(e) => updateBuyQty(product.id, e.target.value, product, false)} 
                        onBlur={(e) => updateBuyQty(product.id, e.target.value, product)} 
                      />
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); stepUp(product); }} 
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                      ><Plus className="h-4 w-4" /></button>
                    </div>
                    
                    {!product.inStock ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStockAlert(product); }}
                        className={`w-3/5 rounded-2xl py-4 px-2 flex items-center justify-center transition-all duration-300 border ${product.hasStockAlert ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300 hover:text-indigo-600'}`}
                      >
                        {product.hasStockAlert ? <BellOff className="h-4 w-4 mr-2" /> : <BellRing className="h-4 w-4 mr-2" />}
                        <span className="text-[11px] font-black uppercase tracking-widest">{product.hasStockAlert ? 'Takipte' : 'Gelince Haber Ver'}</span>
                      </button>
                    ) : (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddToCart(product);
                      }}
                      className="w-3/5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-2xl py-4 px-2 flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-indigo-500/30 hover:-translate-y-0.5 group/btn relative"
                    >
                       <ShoppingCart className="h-4 w-4 mr-2 text-white group-hover/btn:-rotate-12 transition-transform duration-300 relative z-10" />
                       <span className="text-[11px] font-black text-white uppercase tracking-widest relative z-10">{product.priceHidden ? 'Teklif İste' : 'Sepete Ekle'}</span>
                    </button>
                    )}
                 </div>
                 )}
                 {/* Minimum Order Hint */}
                 {(product.moq > 1 || product.stepQuantity > 1) && (
                    <p className="text-center text-[9px] font-bold text-gray-400 mt-3 flex items-center justify-center">
                       <AlertCircle className="h-3 w-3 mr-1" />
                       Min {product.moq || 1} {product.unit}{product.stepQuantity > 1 ? ` · ${product.stepQuantity}'in katları` : ''}
                    </p>
                 )}
              </div>
            </div>
          </div>
        ); })}
      </div>

      {/* Detail Modal */}
      {isDetailOpen && selectedProduct && (
        <ProductDetailModal
          key={selectedProduct.id}
          product={selectedProduct}
          rules={rules}
          onClose={() => setIsDetailOpen(false)}
          onAddToCart={handleAddToCart}
          onRequestQuote={(items) => setQuoteItems(items)}
          onToggleFavorite={toggleFavorite}
          onToggleStockAlert={toggleStockAlert}
          onOpenProduct={openDetail}
        />
      )}

      {quoteItems && (
        <QuoteRequestModal
          items={quoteItems}
          onClose={() => setQuoteItems(null)}
          onDone={(message) => { setQuoteItems(null); setIsDetailOpen(false); showAlert({ type: 'success', title: 'Teklif Talebi Gönderildi', message }); }}
        />
      )}
    </div>
  );
};

export default ProductCatalog;
