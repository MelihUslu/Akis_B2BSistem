import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  ShoppingCart, Search, Package, ChevronRight, 
  CheckCircle2, AlertCircle, XCircle, 
  FileText, PlayCircle, Eye, Minus, Plus, X, ArrowRight,
  Filter, SlidersHorizontal
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';

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
      }).toString();

      const [pRes, cRes, fRes, uRes] = await Promise.all([
        api.get(`/products?${query}`),
        api.get('/categories'),
        api.get('/products/filters'),
        api.get('/auth/me')
      ]);

      setProducts(pRes.data.data);
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
  }, [page, selectedBrand, selectedCategory]);

  const calculateDiscountedPrice = (price) => {
    if (!userProfile?.company?.netDiscount) return price;
    const discount = userProfile.company.netDiscount;
    return price * (1 - discount / 100);
  };

  const handleAddToCart = (product) => {
    const qty = buyQuantities[product.id] || product.moq || 1;
    const discountedPrice = calculateDiscountedPrice(product.price);
    addToCart({ ...product, price: discountedPrice }, qty);
    setIsCartOpen(true);
  };

  const updateBuyQty = (productId, val, product) => {
    const moq = product.moq || 1;
    const step = product.stepQuantity || 1;
    let newQty = parseInt(val);
    
    if (isNaN(newQty)) newQty = moq;
    if (newQty < moq) newQty = moq;
    
    setBuyQuantities(prev => ({ ...prev, [productId]: newQty }));
  };

  const getStockBadge = (stock) => {
    if (stock === '100+') return <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm"><CheckCircle2 className="h-3 w-3 mr-1.5" /> 100+ STOK</span>;
    if (stock === 'Son 5 Ürün') return <span className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm"><AlertCircle className="h-3 w-3 mr-1.5" /> KRİTİK STOK</span>;
    if (stock === 'Tükendi') return <span className="bg-red-100 text-red-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm"><XCircle className="h-3 w-3 mr-1.5" /> TÜKENDİ</span>;
    return <span className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-[10px] font-black flex items-center shadow-sm">{stock} ADET</span>;
  };

  return (
    <div className="animate-in fade-in duration-700">
      
      {/* Header Area */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-8 gap-6">
        <div>
          <div className="flex items-center space-x-4 mb-2">
             <div className="bg-indigo-600 w-2 h-8 rounded-full" />
             <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Katalog</h1>
          </div>
          <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest">
            {userProfile?.company?.name} Özel İskonto (%{userProfile?.company?.netDiscount || 0})
          </p>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); fetchData(); }} className="relative w-full xl:w-[32rem] group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-indigo-600 transition-all" />
          <input 
            type="text" 
            placeholder="Ürün adı, SKU veya barkod..." 
            className="w-full pl-16 pr-6 py-5 bg-white border border-gray-100 rounded-[2rem] text-sm font-bold focus:ring-4 focus:ring-indigo-100 shadow-sm transition-all outline-none placeholder:text-gray-300"
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
      <div className="bg-white border border-gray-100 rounded-[2rem] p-4 mb-10 shadow-sm flex flex-col md:flex-row justify-between items-center sticky top-0 z-30 gap-6">
         <div className="flex items-center space-x-3 text-sm font-bold text-gray-500 pl-4">
            <Filter className="h-5 w-5 text-indigo-500" />
            <span className="uppercase tracking-widest text-[11px] font-black">Gelişmiş Filtreler</span>
         </div>

         <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto overflow-x-auto custom-scrollbar pb-2 md:pb-0 min-w-max">
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

            <button 
              onClick={() => { setPage(1); fetchData(); }}
              className="bg-gray-900 text-white px-8 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors shadow-lg shadow-gray-900/20"
            >
              Uygula
            </button>
         </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {isLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm animate-pulse h-[28rem]"></div>
          ))
        ) : products.length === 0 ? (
          <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border border-dashed border-gray-200">
            <Package className="h-24 w-24 text-gray-100 mx-auto mb-6" />
            <p className="text-gray-400 font-black text-xl uppercase tracking-widest">Ürün bulunamadı.</p>
          </div>
        ) : products.map((product) => (
          <div key={product.id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-[0_20px_60px_-15px_rgba(79,70,229,0.15)] hover:border-indigo-100 hover:-translate-y-2 transition-all duration-500 group relative flex flex-col p-3 overflow-hidden">
            {/* Top Badges & Actions */}
            <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-2">
              {getStockBadge(product.stock)}
              <button 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedProduct(product); setIsDetailOpen(true); }}
                className="bg-white/90 backdrop-blur-md p-3 rounded-xl shadow-lg text-gray-400 hover:text-indigo-600 transition-all border border-gray-100 hover:scale-110 relative z-30"
              >
                 <Eye className="h-5 w-5" />
              </button>
            </div>

            {/* Image Box */}
            <div className="aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 rounded-[2rem] flex items-center justify-center p-8 group-hover:from-indigo-50/50 group-hover:to-purple-50/50 transition-colors duration-500 mb-6 overflow-hidden relative">
              <div className="absolute inset-0 bg-white/20 mix-blend-overlay"></div>
              {product.images ? (
                 <img src={JSON.parse(product.images)[0]} className="w-full h-full object-contain relative z-10 group-hover:scale-110 transition-transform duration-700 drop-shadow-xl" />
              ) : (
                 <Package className="h-20 w-20 text-gray-300 relative z-10 group-hover:scale-110 transition-transform duration-500" />
              )}
            </div>
            
            {/* Content Area */}
            <div className="flex-1 flex flex-col px-4 pb-4">
              <div className="mb-4">
                <div className="flex items-center space-x-2 mb-3">
                  <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded-md tracking-widest">{product.brand || 'AKIS'}</span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-50 px-2.5 py-1 rounded-md tracking-widest">SKU: {product.sku}</span>
                </div>
                <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors text-lg leading-snug line-clamp-2 h-[3.5rem]">{product.name}</h3>
              </div>

              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Net Fiyat</p>
                  <div className="flex items-baseline gap-2">
                     <p className="text-3xl font-black text-gray-900 tracking-tighter">
                       ₺{calculateDiscountedPrice(product.price).toLocaleString('tr-TR')}
                     </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Liste</p>
                  <p className="text-sm font-bold text-gray-400 line-through">
                     ₺{product.price.toLocaleString('tr-TR')}
                  </p>
                </div>
              </div>

              {/* Action Bar */}
              <div className="mt-auto">
                 <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-50 rounded-2xl p-1.5 border border-gray-100 w-2/5 shadow-inner">
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateBuyQty(product.id, (buyQuantities[product.id] || product.moq || 1) - (product.stepQuantity || 1), product); }} 
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                      ><Minus className="h-4 w-4" /></button>
                      <input 
                        type="number" 
                        onClick={(e) => { e.stopPropagation(); }}
                        className="w-full bg-transparent text-center text-sm font-black outline-none text-gray-900" 
                        value={buyQuantities[product.id] || product.moq || 1} 
                        onChange={(e) => updateBuyQty(product.id, e.target.value, product)} 
                      />
                      <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateBuyQty(product.id, (buyQuantities[product.id] || product.moq || 1) + (product.stepQuantity || 1), product); }} 
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white hover:shadow-sm rounded-xl transition-all"
                      ><Plus className="h-4 w-4" /></button>
                    </div>
                    
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddToCart(product);
                      }}
                      className="w-3/5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-2xl py-4 px-2 flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-indigo-500/30 hover:-translate-y-0.5 group/btn relative"
                    >
                       <ShoppingCart className="h-4 w-4 mr-2 text-white group-hover/btn:-rotate-12 transition-transform duration-300 relative z-10" />
                       <span className="text-[11px] font-black text-white uppercase tracking-widest relative z-10">Sepete Ekle</span>
                    </button>
                 </div>
                 {/* Minimum Order Hint */}
                 {(product.moq > 1 || product.stepQuantity > 1) && (
                    <p className="text-center text-[9px] font-bold text-gray-400 mt-3 flex items-center justify-center">
                       <AlertCircle className="h-3 w-3 mr-1" />
                       Min {product.moq || 1} adet sipariş edilebilir.
                    </p>
                 )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {isDetailOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setIsDetailOpen(false)} />
          <div className="relative bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col md:flex-row">
             <div className="w-full md:w-1/2 bg-gray-50 p-10 flex flex-col relative border-r border-gray-100">
                <div className="flex items-center justify-between mb-8">
                   <span className="bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">{selectedProduct.category?.name || 'Katalog Ürünü'}</span>
                   <button onClick={() => setIsDetailOpen(false)} className="p-3 hover:bg-white text-gray-400 hover:text-red-500 rounded-2xl transition-all shadow-sm">
                      <X className="h-6 w-6" />
                   </button>
                </div>
                <div className="flex-1 flex items-center justify-center">
                   <div className="w-full aspect-square bg-white rounded-[2rem] shadow-sm overflow-hidden border border-gray-100 p-8 flex items-center justify-center">
                      {selectedProduct.images ? (
                        <img src={JSON.parse(selectedProduct.images)[0]} className="w-full h-full object-contain hover:scale-110 transition-transform duration-700" />
                      ) : (
                        <Package className="h-24 w-24 text-gray-100 mx-auto" />
                      )}
                   </div>
                </div>
             </div>
             
             <div className="w-full md:w-1/2 p-10 overflow-y-auto custom-scrollbar flex flex-col justify-between">
                <div>
                   <h2 className="text-3xl font-black text-gray-900 tracking-tighter mb-2">{selectedProduct.name}</h2>
                   <div className="flex items-center gap-2 mb-8">
                      <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">SKU: {selectedProduct.sku}</span>
                      <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">Marka: {selectedProduct.brand || 'Akis'}</span>
                   </div>
                   
                   <div className="bg-indigo-50/50 p-6 rounded-3xl mb-8 border border-indigo-50">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center">
                         Net İskontolu Fiyat
                      </p>
                      <p className="text-5xl font-black text-indigo-600 tracking-tighter mb-2">₺{calculateDiscountedPrice(selectedProduct.price).toLocaleString('tr-TR')}</p>
                      <p className="text-xs font-bold text-gray-500">Liste Fiyatı: <span className="line-through text-gray-400">₺{selectedProduct.price.toLocaleString('tr-TR')}</span> + KDV</p>
                   </div>
                   
                   <div className="prose prose-sm text-gray-600 mb-8 whitespace-pre-wrap leading-relaxed">
                      {selectedProduct.longDesc || 'Detaylı açıklama bulunmuyor. Bu ürün hakkında daha fazla bilgi almak için satış temsilciniz ile görüşebilirsiniz.'}
                   </div>
                </div>

                {/* Add to Cart Section within Modal */}
                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4">
                   <div className="flex justify-between items-center text-sm font-bold text-gray-500">
                      <span>Sipariş Miktarı</span>
                      <span className="text-indigo-600">Minimum {selectedProduct.moq || 1} adet</span>
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="flex items-center bg-white rounded-2xl p-1.5 border border-gray-200 shadow-sm w-1/3">
                        <button onClick={() => updateBuyQty(selectedProduct.id, (buyQuantities[selectedProduct.id] || selectedProduct.moq || 1) - (selectedProduct.stepQuantity || 1), selectedProduct)} className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 rounded-xl transition-all"><Minus className="h-5 w-5" /></button>
                        <input type="number" className="w-full bg-transparent text-center text-lg font-black outline-none text-gray-900" value={buyQuantities[selectedProduct.id] || selectedProduct.moq || 1} onChange={(e) => updateBuyQty(selectedProduct.id, e.target.value, selectedProduct)} />
                        <button onClick={() => updateBuyQty(selectedProduct.id, (buyQuantities[selectedProduct.id] || selectedProduct.moq || 1) + (selectedProduct.stepQuantity || 1), selectedProduct)} className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 rounded-xl transition-all"><Plus className="h-5 w-5" /></button>
                      </div>
                      
                      <button 
                        onClick={() => {
                          handleAddToCart(selectedProduct);
                          setIsDetailOpen(false);
                        }}
                        className="flex-1 bg-gray-900 text-white hover:bg-indigo-600 py-5 rounded-2xl text-sm font-black flex items-center justify-center shadow-xl shadow-gray-900/20 hover:shadow-indigo-500/30 transition-all group/btn uppercase tracking-widest"
                      >
                        <ShoppingCart className="h-5 w-5 mr-3 group-hover/btn:scale-110 group-hover/btn:-rotate-12 transition-all" />
                        SEPETE EKLE
                      </button>
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCatalog;
