import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  ShoppingCart, Search, Filter, Package, ChevronRight, 
  Tag, Info, CheckCircle2, AlertCircle, XCircle 
} from 'lucide-react';

const ProductCatalog = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ brands: [] });
  const [isLoading, setIsLoading] = useState(true);
  
  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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

      const [pRes, cRes, fRes] = await Promise.all([
        axios.get(`http://localhost:5001/api/products?${query}`),
        axios.get('http://localhost:5001/api/categories'),
        axios.get('http://localhost:5001/api/products/filters')
      ]);

      setProducts(pRes.data.data);
      setTotalPages(pRes.data.pagination.pages);
      setCategories(cRes.data);
      setFilters(fRes.data);
    } catch (error) {
      console.error('Katalog yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, selectedBrand, selectedCategory]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const getStockBadge = (stock) => {
    if (stock === '100+') return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center"><CheckCircle2 className="h-3 w-3 mr-1" /> 100+ STOK</span>;
    if (stock === 'Son 5 Ürün') return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center"><AlertCircle className="h-3 w-3 mr-1" /> KRİTİK STOK</span>;
    if (stock === 'Tükendi') return <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center"><XCircle className="h-3 w-3 mr-1" /> TÜKENDİ</span>;
    return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-lg text-[10px] font-black flex items-center">{stock} ADET</span>;
  };

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      {/* Faceted Search Sidebar */}
      <aside className="w-72 bg-white border-r border-gray-100 p-8 hidden lg:block sticky top-0 h-screen overflow-y-auto custom-scrollbar">
        <div className="space-y-8">
          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Kategoriler</h3>
            <div className="space-y-2">
              <button 
                onClick={() => setSelectedCategory('')}
                className={`w-full text-left px-4 py-2 rounded-xl text-sm font-bold transition-all ${!selectedCategory ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                Tüm Ürünler
              </button>
              {categories.map(cat => (
                <div key={cat.id}>
                  <button 
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full text-left px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-between ${selectedCategory === cat.id ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {cat.name}
                    <ChevronRight className="h-3 w-3 opacity-50" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Markalar</h3>
            <div className="space-y-1">
              {filters.brands.map(brand => (
                <label key={brand} className="flex items-center space-x-3 p-2 rounded-xl hover:bg-gray-50 cursor-pointer transition-all">
                  <input 
                    type="checkbox" 
                    checked={selectedBrand === brand}
                    onChange={() => setSelectedBrand(selectedBrand === brand ? '' : brand)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-bold text-gray-600">{brand}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Fiyat Aralığı</h3>
            <div className="flex items-center space-x-2">
              <input 
                type="number" 
                placeholder="Min" 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                value={priceRange.min}
                onChange={e => setPriceRange({...priceRange, min: e.target.value})}
              />
              <span className="text-gray-300">-</span>
              <input 
                type="number" 
                placeholder="Max" 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none"
                value={priceRange.max}
                onChange={e => setPriceRange({...priceRange, max: e.target.value})}
              />
            </div>
            <button 
              onClick={() => { setPage(1); fetchData(); }}
              className="w-full mt-3 bg-gray-900 text-white py-2 rounded-xl text-xs font-black hover:bg-gray-800 transition-all shadow-lg"
            >
              FİLTRELE
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Akis B2B Katalog</h1>
            <p className="text-gray-500 text-sm font-medium mt-1">Binlerce ürün arasından hızlıca siparişinizi oluşturun.</p>
          </div>
          
          <form onSubmit={handleSearch} className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
            <input 
              type="text" 
              placeholder="Ürün adı, SKU veya barkod ile ara..." 
              className="w-full pl-12 pr-4 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-blue-100 shadow-sm transition-all outline-none"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </form>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
          {isLoading ? (
            [1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm animate-pulse h-96"></div>
            ))
          ) : products.length === 0 ? (
            <div className="col-span-full py-24 text-center bg-white rounded-[2rem] border border-dashed border-gray-200">
              <Package className="h-20 w-20 text-gray-100 mx-auto mb-4" />
              <p className="text-gray-400 font-bold text-lg uppercase tracking-widest">Aranan kriterlerde ürün bulunamadı.</p>
            </div>
          ) : products.map((product) => (
            <div key={product.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden flex flex-col">
              {/* Product Badge */}
              <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
                {getStockBadge(product.stock)}
                {product.brand && (
                  <span className="bg-white/80 backdrop-blur-md border border-gray-100 text-gray-600 px-2 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm">
                    {product.brand}
                  </span>
                )}
              </div>

              {/* Image Section */}
              <div className="aspect-square bg-gray-50 flex items-center justify-center p-12 group-hover:bg-blue-50/30 transition-colors duration-500">
                <Package className="h-24 w-24 text-gray-200 group-hover:scale-110 group-hover:text-blue-200 transition-all duration-500" />
              </div>
              
              {/* Content Section */}
              <div className="p-8 flex-1 flex flex-col space-y-6">
                <div>
                  <h3 className="font-black text-gray-900 group-hover:text-blue-600 transition-colors text-lg leading-tight line-clamp-2 min-h-[3rem]">{product.name}</h3>
                  <div className="flex items-center mt-3 space-x-2">
                    <span className="text-[10px] font-black text-gray-400 uppercase bg-gray-100 px-2 py-1 rounded-md tracking-wider">SKU: {product.sku}</span>
                    <span className="text-[10px] font-black text-blue-500 uppercase bg-blue-50 px-2 py-1 rounded-md tracking-wider">{product.category?.name || 'GENEL'}</span>
                  </div>
                </div>

                <div className="flex items-end justify-between mt-auto">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest">NET B2B FİYATI</p>
                    <p className="text-3xl font-black text-gray-900 tracking-tight">
                      {product.price.toLocaleString('tr-TR')} <span className="text-sm font-black text-blue-600 uppercase tracking-widest">{product.currency}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-6 border-t border-gray-50 flex gap-3">
                  <div className="relative flex-1 group/qty">
                    <input 
                      type="number" 
                      min={product.moq || 1}
                      step={product.stepQuantity || 1}
                      defaultValue={product.moq || 1}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center text-sm font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                    />
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[8px] font-black px-2 py-0.5 rounded-full opacity-0 group-focus-within/qty:opacity-100 transition-opacity whitespace-nowrap">
                      STEP: {product.stepQuantity} {product.unit}
                    </div>
                  </div>
                  <button className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl text-xs font-black flex items-center justify-center hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all active:scale-95 group/btn">
                    <ShoppingCart className="h-4 w-4 mr-2 group-hover/btn:animate-bounce" />
                    SEPETE EKLE
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 pt-12 pb-8">
            <button 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
              className="p-3 bg-white border border-gray-200 rounded-2xl disabled:opacity-30 hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"
            >
              Geri
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i + 1}
                onClick={() => setPage(i + 1)}
                className={`w-12 h-12 rounded-2xl font-black text-sm transition-all shadow-sm ${page === i + 1 ? 'bg-blue-600 text-white shadow-blue-500/30' : 'bg-white text-gray-500 border border-gray-100 hover:bg-gray-50'}`}
              >
                {i + 1}
              </button>
            ))}
            <button 
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-3 bg-white border border-gray-200 rounded-2xl disabled:opacity-30 hover:bg-gray-50 transition-all font-bold text-sm shadow-sm"
            >
              İleri
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProductCatalog;
