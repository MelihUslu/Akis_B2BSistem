import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Package, Plus, Search, Filter, MoreVertical, 
  ChevronRight, LayoutGrid, List, FileDown, FileUp, 
  Edit3, Trash2, Eye, EyeOff, Save, X, ImageIcon, 
  DollarSign, Hash, Layers, Tag, Info, ListTree, BoxSelect,
  Settings, Lock, Unlock, EyeClosed, GripVertical, FileText
} from 'lucide-react';

const SortableProductRow = ({ product, settings, onEdit, onView, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-blue-50/30 transition-all group">
      <td className="px-10 py-8">
        <div className="flex items-center space-x-5">
          <div {...attributes} {...listeners} className="p-2 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5" />
          </div>
          <div className="w-14 h-14 bg-white border border-gray-100 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm group-hover:scale-110 transition-transform">
            {product.images ? <img src={JSON.parse(product.images)[0]} className="w-full h-full object-cover" /> : <Package className="h-6 w-6 text-gray-200" />}
          </div>
          <div>
            <div className="font-black text-gray-900 text-base tracking-tight">{product.name}</div>
            <div className="text-[10px] font-black text-gray-300 mt-1 uppercase tracking-widest">SKU: {product.sku}</div>
          </div>
        </div>
      </td>
      <td className="px-10 py-8">
        <div className="font-bold text-gray-700 text-xs">{product.category?.name || '-'}</div>
      </td>
      <td className="px-10 py-8">
         <div className="flex items-center space-x-3">
            <div className="text-sm font-black text-gray-900">{product.price.toLocaleString('tr-TR')} {product.currency}</div>
            {(product.hidePrice || settings.global_hide_price === 'true') && (
               <div className="bg-red-50 text-red-500 p-1.5 rounded-lg" title="Bayiye Gizli">
                  <EyeOff className="h-3 w-3" />
               </div>
            )}
         </div>
         <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">
            {product.hidePrice ? 'Ürün Özel Gizli' : settings.global_hide_price === 'true' ? 'Global Gizli' : 'Fiyat Açık'}
         </div>
      </td>
      <td className="px-10 py-8">
        <span className={`pill-badge ${product.stock > 10 ? 'pill-green' : 'pill-orange'}`}>
          {product.stock} {product.unit}
        </span>
      </td>
      <td className="px-10 py-8 text-right">
        <div className="flex justify-end space-x-2">
          <button 
            onClick={() => onView(product)}
            className="p-3 text-emerald-500 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm"
          >
            <Eye className="h-5 w-5" />
          </button>
          <button 
            onClick={() => onEdit(product)}
            className="p-3 text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm"
          >
            <Edit3 className="h-5 w-5" />
          </button>
          <button 
            onClick={() => onDelete(product.id)}
            className="p-3 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const ProductManagement = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('general'); // general, price, description, media

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [formData, setFormData] = useState({
    name: '', sku: '', barcode: '', brand: '',
    price: 0, costPrice: 0, currency: 'TL', vatRate: 20,
    stock: 0, unit: 'Adet', moq: 1, stepQuantity: 1,
    shortDesc: '', longDesc: '', categoryId: '',
    images: [], pdfUrl: '', videoUrl: '',
    variants: [], hidePrice: false
  });

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [prodRes, catRes, setRes] = await Promise.allSettled([
        api.get(`/products?search=${search}&isAdmin=true`),
        api.get('/categories?isAdmin=true&isFlat=true'),
        api.get('/settings')
      ]);

      if (prodRes.status === 'fulfilled') setProducts(prodRes.value.data.data);
      if (catRes.status === 'fulfilled') setCategories(catRes.value.data);
      if (setRes.status === 'fulfilled') setSettings(setRes.value.data);

    } catch (error) {
      console.error('Yükleme hatası:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, [search]);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = products.findIndex(p => p.id === active.id);
    const newIndex = products.findIndex(p => p.id === over.id);

    const newProducts = arrayMove(products, oldIndex, newIndex);
    setProducts(newProducts);

    const reorderedProducts = newProducts.map((p, index) => ({
      id: p.id,
      sortOrder: index
    }));

    try {
      await api.post('/products/reorder', { products: reorderedProducts });
    } catch (error) {
      console.error('Reorder error:', error);
      fetchInitialData();
    }
  };

  const handleGlobalSetting = async (key, value) => {
    try {
      await api.post('/settings', { key, value });
      setSettings(prev => ({ ...prev, [key]: String(value) }));
    } catch (error) {
      alert('Ayar güncellenemedi');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await api.post('/products/upload-image', data);
      setFormData(prev => ({ 
        ...prev, 
        images: [...(prev.images || []), res.data.imageUrl] 
      }));
    } catch (error) {
      alert('Resim yüklenemedi');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.sku || !formData.price || !formData.categoryId) {
      alert('Lütfen zorunlu alanları (Ad, SKU, Fiyat, Kategori) doldurunuz.');
      return;
    }

    try {
      if (selectedProduct) {
        await api.patch(`/products/${selectedProduct.id}`, formData);
      } else {
        await api.post('/products', formData);
      }
      setIsDrawerOpen(false);
      setFormData({
        name: '', sku: '', barcode: '', brand: '',
        price: 0, costPrice: 0, currency: 'TL', vatRate: 20,
        stock: 0, unit: 'Adet', moq: 1, stepQuantity: 1,
        shortDesc: '', longDesc: '', categoryId: '',
        images: [], pdfUrl: '', videoUrl: '',
        variants: [], hidePrice: false
      });
      await fetchInitialData();
    } catch (error) {
      alert(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm('Bu ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
    try {
      await api.delete(`/products/${id}`);
      await fetchInitialData();
    } catch (error) {
      alert(error.response?.data?.message || 'Silme işlemi başarısız');
    }
  };

  const addVariant = () => {
    setFormData(prev => ({
      ...prev,
      variants: [...prev.variants, { variantName: '', sku: '', barcode: '', price: '', stock: '' }]
    }));
  };

  return (
    <div className="p-10 space-y-12 max-w-7xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8">
        <div>
          <div className="flex items-center space-x-5 mb-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-5 rounded-[2rem] shadow-2xl shadow-blue-500/30">
              <Package className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Katalog Yönetimi</h1>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-[0.3em] mt-1">Sürükle-Bırak Sıralama Aktif</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 w-full lg:w-auto">
          {/* Global Setting Toggle */}
          <div className="bg-white px-6 py-4 rounded-[1.5rem] border border-gray-100 shadow-sm flex items-center space-x-4">
             <div className={`p-2 rounded-xl ${settings.global_hide_price === 'true' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                {settings.global_hide_price === 'true' ? <EyeOff className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
             </div>
             <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Global Fiyat</p>
                <p className="text-xs font-bold text-gray-700">{settings.global_hide_price === 'true' ? 'Gizli' : 'Açık'}</p>
             </div>
             <button 
                onClick={() => handleGlobalSetting('global_hide_price', settings.global_hide_price === 'true' ? 'false' : 'true')}
                className={`ml-2 w-12 h-6 rounded-full relative transition-all ${settings.global_hide_price === 'true' ? 'bg-red-500' : 'bg-gray-200'}`}
             >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.global_hide_price === 'true' ? 'left-7' : 'left-1'}`}></div>
             </button>
          </div>

          <div className="relative flex-1 md:w-80 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-blue-600 transition-all" />
            <input 
              type="text" 
              placeholder="Ürün adı veya SKU..." 
              className="w-full pl-14 pr-6 py-5 bg-white border border-gray-100 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-blue-100 shadow-xl shadow-gray-200/40 outline-none transition-all placeholder:text-gray-300"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => { setSelectedProduct(null); setFormData({
              name: '', sku: '', barcode: '', brand: '',
              price: 0, costPrice: 0, currency: 'TL', vatRate: 20,
              stock: 0, unit: 'Adet', moq: 1, stepQuantity: 1,
              shortDesc: '', longDesc: '', categoryId: '',
              images: [], pdfUrl: '', videoUrl: '',
              variants: [], hidePrice: false
            }); setIsDrawerOpen(true); }}
            className="btn-gradient px-8 py-5"
          >
            <Plus className="mr-2 h-5 w-5" /> YENİ ÜRÜN
          </button>
        </div>
      </div>

      <div className="card-premium">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Ürün Detayı</th>
                <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Kategori</th>
                <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Fiyat Durumu</th>
                <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Stok</th>
                <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr><td colSpan="5" className="text-center py-32 text-gray-400 font-bold uppercase text-xs tracking-widest">Yükleniyor...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-32 text-gray-400 font-bold uppercase text-xs tracking-widest">Ürün bulunamadı.</td></tr>
              ) : (
                <SortableContext 
                  items={products.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {products.map((product) => (
                    <SortableProductRow 
                      key={product.id}
                      product={product}
                      settings={settings}
                      onView={(p) => { setSelectedProduct(p); setIsViewOpen(true); }}
                      onDelete={deleteProduct}
                      onEdit={(p) => {
                        setSelectedProduct(p); 
                        setFormData({
                          ...p, 
                          images: JSON.parse(p.images || '[]'),
                          hidePrice: p.hidePrice || false
                        }); 
                        setIsDrawerOpen(true);
                      }}
                    />
                  ))}
                </SortableContext>
              )}
            </tbody>
          </table>
        </DndContext>
        <div className="p-8 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
          <div className="flex items-center space-x-3 text-gray-400">
            <Package className="h-4 w-4" />
            <span className="text-[11px] font-black uppercase tracking-widest">Katalog Özeti</span>
          </div>
          <div className="text-[11px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-xl">
            Toplam Ürün: {products.length}
          </div>
        </div>
      </div>

      {/* View Modal */}
      {isViewOpen && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setIsViewOpen(false)} />
          <div className="relative bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="grid grid-cols-2">
              <div className="bg-gray-50 p-12 flex items-center justify-center relative">
                <button onClick={() => setIsViewOpen(false)} className="absolute top-8 left-8 p-3 hover:bg-white text-gray-400 hover:text-red-500 rounded-2xl transition-all z-10">
                  <X className="h-8 w-8" />
                </button>
                <div className="w-full aspect-square bg-white rounded-[3rem] shadow-xl overflow-hidden border border-gray-100">
                  {selectedProduct.images ? (
                    <img src={JSON.parse(selectedProduct.images)[0]} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-50">
                      <Package className="h-20 w-20 text-gray-200" />
                    </div>
                  )}
                </div>
              </div>

              <div className="p-16 flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <span className="pill-badge pill-blue uppercase tracking-[0.2em]">{selectedProduct.category?.name || 'GENEL'}</span>
                    <span className="pill-badge pill-orange uppercase tracking-[0.2em]">{selectedProduct.brand || 'Bilinmiyor'}</span>
                  </div>
                  <h3 className="text-4xl font-black text-gray-900 tracking-tighter mb-4 leading-tight">{selectedProduct.name}</h3>
                  <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest mb-10">Stok Kodu: {selectedProduct.sku}</p>

                  <div className="grid grid-cols-2 gap-12 mb-12">
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Liste Fiyatı</p>
                      <p className="text-4xl font-black text-blue-600 tracking-tighter">{selectedProduct.price?.toLocaleString('tr-TR')} {selectedProduct.currency}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Stok Durumu</p>
                      <p className="text-2xl font-black text-gray-900 tracking-tighter">{selectedProduct.stock} {selectedProduct.unit}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Ürün Açıklaması</p>
                    <div className="text-gray-600 font-bold leading-relaxed max-h-48 overflow-y-auto custom-scrollbar pr-4 text-sm">
                      {selectedProduct.longDesc || 'Bu ürün için detaylı açıklama girilmemiş.'}
                    </div>
                  </div>
                </div>

                <div className="pt-10 flex items-center justify-between border-t border-gray-100">
                  <div className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${selectedProduct.stock > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                      {selectedProduct.stock > 0 ? 'SATIŞA HAZIR' : 'STOK TÜKENDİ'}
                    </span>
                  </div>
                  <button onClick={() => { setIsViewOpen(false); setFormData({...selectedProduct, images: JSON.parse(selectedProduct.images || '[]')}); setIsDrawerOpen(true); }} className="flex items-center text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest transition-all">
                    DÜZENLEME PANELİNE GİT <ChevronRight className="h-4 w-4 ml-2" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Centered Modal (Edit/Create) */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
              <div className="flex items-center space-x-5">
                <div className="bg-blue-600 p-4 rounded-3xl shadow-xl shadow-blue-500/20">
                  <Package className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">{selectedProduct ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3>
                </div>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-3 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-2xl transition-all">
                <X className="h-8 w-8" />
              </button>
            </div>

            <div className="flex px-10 bg-white border-b border-gray-100">
               {[
                 { id: 'general', name: 'Genel', icon: Info },
                 { id: 'price', name: 'Fiyat & Gizlilik', icon: DollarSign },
                 { id: 'description', name: 'Açıklama', icon: FileText },
                 { id: 'media', name: 'Medya', icon: ImageIcon }
               ].map(tab => (
                 <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center px-6 py-5 text-[10px] font-black uppercase tracking-widest transition-all border-b-4 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                 >
                   <tab.icon className="h-4 w-4 mr-2" /> {tab.name}
                 </button>
               ))}
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-12 custom-scrollbar">
              {activeTab === 'general' && (
                <div className="space-y-10 animate-in fade-in">
                  <div className="space-y-2">
                    <label className="premium-label flex items-center">Ürün Adı <span className="text-red-500 ml-1">*</span></label>
                    <input required className={`premium-input ${!formData.name ? 'border-orange-100' : ''}`} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Örn: Akis 18V Matkap" />
                  </div>
                  <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-2">
                      <label className="premium-label flex items-center">Kategori <span className="text-red-500 ml-1">*</span></label>
                      <select 
                        className={`premium-input appearance-none cursor-pointer ${!formData.categoryId ? 'border-orange-100' : ''}`}
                        value={formData.categoryId || ''} 
                        onChange={e => setFormData({...formData, categoryId: e.target.value})}
                      >
                        <option value="">Seçiniz</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="premium-label flex items-center">SKU <span className="text-red-500 ml-1">*</span></label>
                      <input required className={`premium-input ${!formData.sku ? 'border-orange-100' : ''}`} value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'price' && (
                <div className="space-y-10 animate-in fade-in">
                  <div className="bg-orange-50/50 p-8 rounded-[2rem] border border-orange-100 flex items-center justify-between">
                     <div className="flex items-center space-x-5">
                        <div className={`p-4 rounded-2xl ${formData.hidePrice ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-white text-gray-400 border border-gray-100'}`}>
                           {formData.hidePrice ? <EyeOff className="h-6 w-6" /> : <DollarSign className="h-6 w-6" />}
                        </div>
                        <div>
                           <h4 className="text-sm font-black text-gray-900 leading-none mb-1">Fiyatı Bayilere Gizle</h4>
                           <p className="text-[10px] font-bold text-gray-400">Bu ürünün fiyatı bayi panelinde "Fiyat Sorun" olarak görünür.</p>
                        </div>
                     </div>
                     <button 
                        type="button"
                        onClick={() => setFormData({ ...formData, hidePrice: !formData.hidePrice })}
                        className={`w-14 h-7 rounded-full relative transition-all ${formData.hidePrice ? 'bg-orange-500' : 'bg-gray-200'}`}
                     >
                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${formData.hidePrice ? 'left-8' : 'left-1'}`}></div>
                     </button>
                  </div>

                  <div className="grid grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="premium-label flex items-center">Liste Fiyatı <span className="text-red-500 ml-1">*</span></label>
                      <input type="number" required className={`premium-input ${!formData.price ? 'border-orange-100' : ''}`} value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="premium-label">Para Birimi</label>
                      <select className="premium-input" value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}>
                        <option value="TL">TRY (₺)</option>
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="premium-label">Stok</label>
                      <input type="number" className="premium-input" value={formData.stock} onChange={e => setFormData({...formData, stock: e.target.value})} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'description' && (
                <div className="space-y-10 animate-in fade-in">
                  <div className="space-y-2">
                    <label className="premium-label">Ürün Detaylı Açıklaması</label>
                    <textarea 
                      className="premium-input h-64 resize-none p-6" 
                      placeholder="Ürün özelliklerini, kullanım alanlarını ve teknik detaylarını buraya yazabilirsiniz..."
                      value={formData.longDesc || ''}
                      onChange={e => setFormData({...formData, longDesc: e.target.value})}
                    ></textarea>
                  </div>
                </div>
              )}

              {activeTab === 'media' && (
                <div className="space-y-10 animate-in fade-in">
                   <div className="grid grid-cols-4 gap-6">
                      {formData.images.map((img, i) => (
                        <div key={i} className="relative group aspect-square rounded-3xl overflow-hidden border border-gray-100">
                           <img src={img} className="w-full h-full object-cover" />
                           <button type="button" onClick={() => setFormData({...formData, images: formData.images.filter((_, idx) => idx !== i)})} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="h-6 w-6" />
                           </button>
                        </div>
                      ))}
                      <label className="aspect-square bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all text-gray-300">
                         <Plus className="h-8 w-8 mb-2" />
                         <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                      </label>
                   </div>
                </div>
              )}
            </form>

            <div className="p-10 bg-gray-50/50 border-t border-gray-100 flex space-x-6">
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="flex-1 py-6 border border-gray-200 rounded-2xl font-black text-gray-400 hover:bg-white transition-all uppercase tracking-widest text-[10px]">VAZGEÇ</button>
              <button onClick={handleSubmit} className="btn-gradient flex-[2] py-6 shadow-xl shadow-blue-500/20">
                <Save className="h-5 w-5 mr-3" /> KAYDET
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagement;
