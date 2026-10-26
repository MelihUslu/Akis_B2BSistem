import React, { useState, useEffect } from 'react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import VariantEditor from '../../components/admin/VariantEditor';
import { Section, Field, IconInput, TextArea, Segmented, Toggle, StepNav } from '../../components/form/FormKit';
import SpecialPriceEditor from '../../components/admin/SpecialPriceEditor';
import { fromProduct, toPayload, validate as validateVariants } from '../../components/admin/variantForm';
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
  Package, Plus, Search, Filter, MoreVertical, ChevronRight, LayoutGrid, List, FileDown, FileUp, Edit3, Trash2, Eye, EyeOff, Save, X, ImageIcon, DollarSign, Hash, Layers, Tag, Info, ListTree, BoxSelect, Settings, Lock, Unlock, EyeClosed, GripVertical, FileText, ChevronLeft, Type, Barcode, AlignLeft, ShoppingBasket, Shuffle, Banknote, Wallet, Warehouse, Boxes, Star, UploadCloud, Paperclip, PlayCircle, Percent
} from 'lucide-react';

const BULK_TYPES = [
  { id: 'price', label: 'Toplu Fiyat Güncelleme', columns: 'SKU, Fiyat (veya Price)' },
  { id: 'stock', label: 'Toplu Stok Güncelleme', columns: 'SKU, Stok (veya Stock)' },
  { id: 'products', label: 'Toplu Ürün Yükleme', columns: 'SKU, Ad, Fiyat, Döviz (TRY/USD/EUR), KDV, Stok, Birim, Marka, Barkod — SKU varsa güncellenir, yoksa oluşturulur' },
];

const BulkUploadModal = ({ onClose, onDone }) => {
  const [type, setType] = useState('price');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const submit = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post(`/products/bulk-update/${type}`, data);
      setResult(res.data);
      onDone();
    } catch (err) {
      setError(errorMessage(err, 'Dosya işlenemedi.'));
    } finally {
      setUploading(false);
    }
  };

  const active = BULK_TYPES.find(t => t.id === type);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg">
        <div className="modal-header items-center">
          <h3 className="modal-title flex items-center"><FileUp className="h-5 w-5 mr-2 text-blue-600" /> Excel / CSV ile Toplu İşlem</h3>
          <button onClick={onClose} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            {BULK_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => { setType(t.id); setResult(null); }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${type === t.id ? 'border-blue-600 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200'}`}>
                <p className="text-sm font-black text-gray-900">{t.label}</p>
              </button>
            ))}
          </div>
          <p className="text-[11px] font-semibold text-gray-500 bg-gray-50 p-3 rounded-xl">İlk satır başlık olmalı. Sütunlar: <b>{active.columns}</b></p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files[0]); setResult(null); }}
            className="block w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
          {result && (
            <div className="text-xs font-bold bg-emerald-50 text-emerald-800 p-4 rounded-xl space-y-1">
              <p>{result.message} Güncellenen: {result.updated} · Oluşturulan: {result.created}</p>
              {result.notFound?.length > 0 && <p className="text-amber-700">Bulunamayan SKU: {result.notFound.join(', ')}</p>}
              {result.errors?.map(e => <p key={e} className="text-red-600">{e}</p>)}
            </div>
          )}
        </div>
        <div className="p-6 pt-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Kapat</button>
          <button onClick={submit} disabled={!file || uploading} className="flex-1 btn-gradient disabled:opacity-50">{uploading ? 'İşleniyor...' : 'Yükle ve Uygula'}</button>
        </div>
      </div>
    </div>
  );
};

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

  const hidden = product.hidePrice || settings.global_hide_price === 'true';
  const image = (() => { try { return JSON.parse(product.images || '[]')[0]; } catch { return null; } })();
  const variantCount = product.variants?.length || 0;
  const stock = Number(product.stock) || 0;
  const stockTone = stock <= 0
    ? { pill: 'bg-red-50 text-red-600 ring-red-100', dot: 'bg-red-500', label: 'Tükendi' }
    : stock <= 10
      ? { pill: 'bg-amber-50 text-amber-700 ring-amber-100', dot: 'bg-amber-500', label: 'Az kaldı' }
      : { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100', dot: 'bg-emerald-500', label: 'Stokta' };

  return (
    <tr ref={setNodeRef} style={style} className={`group transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6] ${product.isActive === false ? 'opacity-60' : ''}`}>
      <td className="px-10 py-6">
        <div className="flex items-center space-x-5">
          <div {...attributes} {...listeners} title="Sürükleyerek sırala" className="p-1.5 -ml-1.5 rounded-lg text-gray-200 group-hover:text-gray-400 hover:text-gray-600! hover:bg-gray-100 cursor-grab active:cursor-grabbing transition-colors">
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="w-14 h-14 shrink-0 rounded-2xl overflow-hidden ring-1 ring-gray-100 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center shadow-sm transition-transform duration-300 group-hover:scale-105">
            {image ? <img src={image} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Package className="h-6 w-6 text-gray-300" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-[15px] leading-snug tracking-tight group-hover:text-blue-700 transition-colors">{product.name}</span>
              {product.isActive === false && <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[9px] font-black uppercase tracking-wider">Pasif</span>}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-semibold text-gray-500 bg-gray-100/80 px-1.5 py-0.5 rounded-md">{product.sku}</span>
              {product.brand && <span className="text-[11px] font-semibold text-gray-400">{product.brand}</span>}
              {variantCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-md">
                  <Layers className="h-3 w-3" /> {variantCount} varyant
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-10 py-6">
        {product.category?.name ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/70 text-blue-700 text-xs font-semibold">
            <Tag className="h-3 w-3 opacity-60" /> {product.category.name}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>
      <td className="px-10 py-6">
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="text-[15px] font-black text-gray-900">{product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className="text-[10px] font-bold text-gray-400">{product.currency}</span>
        </div>
        <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold ${hidden ? 'text-red-500' : 'text-emerald-600'}`}>
          {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {product.hidePrice ? 'Ürüne özel gizli' : settings.global_hide_price === 'true' ? 'Genel ayarla gizli' : 'Bayiye açık'}
        </span>
      </td>
      <td className="px-10 py-6">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 text-xs font-bold tabular-nums ${stockTone.pill}`} title={stockTone.label}>
          <span className={`h-1.5 w-1.5 rounded-full ${stockTone.dot}`} />
          {stock.toLocaleString('tr-TR')} {product.unit}
        </span>
      </td>
      <td className="px-10 py-6 text-right">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white ring-1 ring-gray-100 shadow-sm">
          <button onClick={() => onView(product)} title="Görüntüle" className="p-2 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
            <Eye className="h-4 w-4" />
          </button>
          <button onClick={() => onEdit(product)} title="Düzenle" className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Edit3 className="h-4 w-4" />
          </button>
          <span className="w-px h-5 bg-gray-100" />
          <button onClick={() => onDelete(product.id)} title="Sil" className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const ProductManagement = () => {
  const [products, setProducts] = useState([]);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const { alertElement, showAlert, confirm } = useAlert();
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  const [activeTab, setActiveTab] = useState('general'); // general, price, variants, special, description, media
  const [viewImage, setViewImage] = useState(0); // görüntüleme penceresinde seçili görsel
  const [triedSave, setTriedSave] = useState(false); // kaydet'e basılınca eksik alanlar kırmızı gösterilir

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
    options: [], variants: [], hidePrice: false
  });

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [prodRes, catRes, setRes] = await Promise.allSettled([
        api.get('/products', { params: { search, isAdmin: true, limit: 200 } }),
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
      showAlert({ type: 'error', title: 'Hata', message: 'Ayar güncellenemedi.' });
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
      showAlert({ type: 'error', title: 'Yükleme Başarısız', message: errorMessage(error, 'Resim yüklenemedi.') });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.sku || !formData.categoryId || !(Number(formData.price) > 0)) {
      setTriedSave(true);
      setActiveTab(!formData.name || !formData.sku || !formData.categoryId ? 'general' : 'price');
      return;
    }

    const variantError = validateVariants(formData.options, formData.variants);
    if (variantError) {
      setActiveTab('variants');
      showAlert({ type: 'warning', title: 'Varyant Bilgisi Eksik', message: variantError });
      return;
    }

    // Varyant seçimleri API'nin beklediği biçime (özellik adı → seçenek) çevrilir
    const payload = { ...formData, ...toPayload(formData.options, formData.variants) };
    try {
      if (selectedProduct) {
        await api.patch(`/products/${selectedProduct.id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setIsDrawerOpen(false);
      setFormData({
        name: '', sku: '', barcode: '', brand: '',
        price: 0, costPrice: 0, currency: 'TL', vatRate: 20,
        stock: 0, unit: 'Adet', moq: 1, stepQuantity: 1,
        shortDesc: '', longDesc: '', categoryId: '',
        images: [], pdfUrl: '', videoUrl: '',
        options: [], variants: [], hidePrice: false
      });
      await fetchInitialData();
    } catch (error) {
      showAlert({ type: 'error', title: 'İşlem Başarısız', message: errorMessage(error, 'İşlem başarısız') });
    }
  };

  const deleteProduct = async (id) => {
    const ok = await confirm({ type: 'warning', title: 'Ürün Silinsin mi?', message: 'Sipariş geçmişi olan ürünler silinmez, pasife alınır. Diğerleri kalıcı olarak silinir.', confirmText: 'Sil' });
    if (!ok) return;
    try {
      const res = await api.delete(`/products/${id}`);
      showAlert({ type: res.data.archived ? 'info' : 'success', title: res.data.archived ? 'Pasife Alındı' : 'Silindi', message: res.data.message });
      await fetchInitialData();
    } catch (error) {
      showAlert({ type: 'error', title: 'Silinemedi', message: errorMessage(error, 'Silme işlemi başarısız') });
    }
  };

  // Listeden gelen ürünü düzenleme formunun beklediği şekle çevirir
  const productToForm = (p) => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
    hidePrice: p.hidePrice || false,
    costPrice: p.costPrice ?? '',
    barcode: p.barcode || '', brand: p.brand || '', shortDesc: p.shortDesc || '',
    pdfUrl: p.pdfUrl || '', videoUrl: p.videoUrl || '',
    alternativeToId: p.alternativeToId || '',
    ...fromProduct(p)
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-700">
      {alertElement}
      {isBulkOpen && <BulkUploadModal onClose={() => setIsBulkOpen(false)} onDone={fetchInitialData} />}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div className="flex items-center gap-4 shrink-0">
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-3.5 rounded-2xl shadow-lg shadow-blue-500/25">
            <Package className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight whitespace-nowrap">Katalog Yönetimi</h1>
            <p className="text-gray-500 text-sm mt-1 whitespace-nowrap">{products.length} ürün · sıralamak için satırları sürükleyin</p>
          </div>
        </div>

        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 w-full xl:w-auto">
          {/* Global Setting Toggle */}
          <div className="bg-white h-12 pl-2 pr-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 shrink-0">
             <div className={`p-2 rounded-xl ${settings.global_hide_price === 'true' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                {settings.global_hide_price === 'true' ? <EyeOff className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
             </div>
             <div className="whitespace-nowrap">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Fiyatlar</p>
                <p className="text-xs font-bold text-gray-700 leading-none">{settings.global_hide_price === 'true' ? 'Bayiye gizli' : 'Bayiye açık'}</p>
             </div>
             <button 
                onClick={() => handleGlobalSetting('global_hide_price', settings.global_hide_price === 'true' ? 'false' : 'true')}
                title="Tüm ürünlerde fiyatı bayiden gizle / göster"
                className={`ml-1 w-10 h-[22px] rounded-full relative transition-all ${settings.global_hide_price === 'true' ? 'bg-red-500' : 'bg-gray-200'}`}
             >
                <div className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow transition-all ${settings.global_hide_price === 'true' ? 'left-[21px]' : 'left-[3px]'}`}></div>
             </button>
          </div>

          <div className="relative flex-1 min-w-[12rem] xl:w-64 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-blue-600 transition-all" />
            <input 
              type="text" 
              placeholder="Ürün adı veya SKU ara..." 
              className="w-full h-12 pl-11 pr-4 bg-white border border-gray-100 rounded-2xl text-sm font-semibold focus:ring-4 focus:ring-blue-100 focus:border-blue-200 shadow-sm outline-none transition-all placeholder:text-gray-400 placeholder:font-medium"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setIsBulkOpen(true)}
            title="Excel / CSV ile toplu fiyat, stok veya ürün yükle"
            className="flex items-center h-12 px-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-600 shadow-sm hover:border-blue-200 hover:text-blue-600 transition-all whitespace-nowrap shrink-0"
          >
            <FileUp className="mr-2 h-4 w-4" /> Excel ile Toplu
          </button>
          <button 
            onClick={() => { setSelectedProduct(null); setFormData({
              name: '', sku: '', barcode: '', brand: '',
              price: 0, costPrice: 0, currency: 'TL', vatRate: 20,
              stock: 0, unit: 'Adet', moq: 1, stepQuantity: 1,
              shortDesc: '', longDesc: '', categoryId: '',
              images: [], pdfUrl: '', videoUrl: '',
              options: [], variants: [], hidePrice: false
            }); setActiveTab('general'); setTriedSave(false); setIsDrawerOpen(true); }}
            className="btn-gradient h-12 px-5 py-0 whitespace-nowrap shrink-0"
          >
            <Plus className="mr-1.5 h-4 w-4" /> YENİ ÜRÜN
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
            <thead className="list-head">
              <tr>
                <th className="px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Ürün Detayı</th>
                <th className="px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Kategori</th>
                <th className="px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Fiyat Durumu</th>
                <th className="px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">Stok</th>
                <th className="px-10 py-4 text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/70">
              {isLoading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td className="px-10 py-6" colSpan="5">
                      <div className="flex items-center gap-5 animate-pulse">
                        <div className="w-14 h-14 rounded-2xl bg-gray-100" />
                        <div className="space-y-2 flex-1"><div className="h-3.5 w-1/3 bg-gray-100 rounded" /><div className="h-2.5 w-1/5 bg-gray-100 rounded" /></div>
                      </div>
                    </td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr><td colSpan="5" className="text-center py-24">
                  <Package className="h-12 w-12 mx-auto text-gray-200 mb-3" />
                  <p className="text-sm font-bold text-gray-500">Ürün bulunamadı</p>
                  <p className="text-xs text-gray-400 mt-1">{search ? 'Arama ifadesini değiştirmeyi deneyin.' : 'İlk ürününüzü “Yeni Ürün” ile ekleyin.'}</p>
                </td></tr>
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
                      onView={(p) => { setSelectedProduct(p); setViewImage(0); setIsViewOpen(true); }}
                      onDelete={deleteProduct}
                      onEdit={(p) => {
                        setSelectedProduct(p); 
                        setFormData(productToForm(p)); 
                        setActiveTab('general');
                        setTriedSave(false);
                        setIsDrawerOpen(true);
                      }}
                    />
                  ))}
                </SortableContext>
              )}
            </tbody>
          </table>
        </DndContext>
        <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-100 flex justify-between items-center">
          <div className="flex items-center space-x-3 text-gray-400">
            <Package className="h-4 w-4" />
            <span className="text-[11px] font-black uppercase tracking-widest">Katalog Özeti</span>
          </div>
          <div className="text-[11px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-4 py-2 rounded-xl">
            Toplam Ürün: {products.length}
          </div>
        </div>
      </div>

      {/* Ürün görüntüleme */}
      {isViewOpen && selectedProduct && (() => {
        const p = selectedProduct;
        const images = (() => { try { return JSON.parse(p.images || '[]'); } catch { return []; } })();
        const mainImage = images[viewImage] || images[0];
        const symbol = { TL: '₺', USD: '$', EUR: '€' }[p.currency] || p.currency;
        const fmt = (n) => (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const hidden = p.hidePrice || settings.global_hide_price === 'true';
        const stock = Number(p.stock) || 0;
        const margin = p.costPrice && p.price ? ((p.price - p.costPrice) / p.price) * 100 : null;
        const valueNames = new Map((p.options || []).flatMap((o) => (o.values || []).map((v) => [v.id, v.value])));
        const variantLabel = (v) => (v.variantValues || []).map((vv) => valueNames.get(vv.optionValueId)).filter(Boolean).join(' · ') || v.name;
        const tiles = [
          { icon: Boxes, label: 'Stok', value: `${stock.toLocaleString('tr-TR')} ${p.unit}`, tone: stock <= 0 ? 'text-red-600' : stock <= 10 ? 'text-amber-600' : 'text-emerald-600' },
          { icon: ShoppingBasket, label: 'Min. sipariş', value: `${p.moq || 1} ${p.unit}` },
          { icon: Plus, label: 'Artış', value: `${p.stepQuantity || 1} ${p.unit}` },
          { icon: Percent, label: 'KDV', value: `%${p.vatRate}` }
        ];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIsViewOpen(false)} />
          <div className="modal-panel w-full max-w-5xl max-h-[90vh] flex flex-col md:flex-row">
            {/* Galeri */}
            <div className="md:w-[42%] shrink-0 bg-gradient-to-br from-slate-50 to-blue-50/60 p-6 flex flex-col gap-3">
              <div className="relative aspect-square rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm overflow-hidden flex items-center justify-center">
                {mainImage ? <img src={mainImage} alt={p.name} className="w-full h-full object-contain" /> : <Package className="h-20 w-20 text-gray-200" />}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  {p.isActive === false && <span className="px-2 py-1 rounded-lg bg-gray-900/80 text-white text-[10px] font-bold backdrop-blur">Pasif</span>}
                  {hidden && <span className="px-2 py-1 rounded-lg bg-red-500/90 text-white text-[10px] font-bold backdrop-blur flex items-center gap-1"><EyeOff className="h-3 w-3" /> Fiyat gizli</span>}
                </div>
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <button key={i} onClick={() => setViewImage(i)}
                      className={`h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-white transition-all ${i === viewImage ? 'ring-2 ring-blue-500' : 'ring-1 ring-gray-100 opacity-70 hover:opacity-100'}`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {(p.pdfUrl || p.videoUrl) && (
                <div className="flex flex-wrap gap-2 mt-auto">
                  {p.pdfUrl && <a href={p.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white ring-1 ring-gray-100 text-xs font-bold text-gray-700 hover:text-red-600"><FileText className="h-4 w-4" /> Teknik katalog</a>}
                  {p.videoUrl && <a href={p.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-white ring-1 ring-gray-100 text-xs font-bold text-gray-700 hover:text-red-600"><PlayCircle className="h-4 w-4" /> Video</a>}
                </div>
              )}
            </div>

            {/* Bilgiler */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-7 space-y-6">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 flex-wrap">
                      <ListTree className="h-3.5 w-3.5" /> {p.category?.name || 'Kategorisiz'}
                      {p.brand && <><ChevronRight className="h-3 w-3" /> <span className="text-gray-600">{p.brand}</span></>}
                    </div>
                    <button onClick={() => setIsViewOpen(false)} className="modal-close -mt-2" aria-label="Kapat"><X className="h-5 w-5" /></button>
                  </div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-tight mt-1">{p.name}</h3>
                  {p.shortDesc && <p className="text-sm text-gray-500 mt-1">{p.shortDesc}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg"><Hash className="h-3 w-3" /> {p.sku}</span>
                    {p.barcode && <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg"><Barcode className="h-3 w-3" /> {p.barcode}</span>}
                    {p.variants?.length > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 bg-violet-50 px-2 py-1 rounded-lg"><Layers className="h-3 w-3" /> {p.variants.length} varyant</span>}
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-lg shadow-blue-500/20">
                  <p className="text-[11px] font-bold text-blue-100">Liste fiyatı (KDV hariç)</p>
                  <p className="text-3xl font-black tracking-tight tabular-nums mt-0.5">{fmt(p.price)} <span className="text-lg text-blue-200">{symbol}</span></p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-blue-100">
                    <span>KDV dahil <b className="text-white tabular-nums">{fmt(p.price * (1 + p.vatRate / 100))} {symbol}</b></span>
                    {margin !== null && <span>Kâr marjı <b className={margin >= 0 ? 'text-emerald-200' : 'text-red-200'}>%{margin.toFixed(1)}</b></span>}
                    <span className="flex items-center gap-1">{hidden ? <><EyeOff className="h-3.5 w-3.5" /> Bayiye gizli</> : <><Eye className="h-3.5 w-3.5" /> Bayiye açık</>}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {tiles.map((t) => (
                    <div key={t.label} className="rounded-xl ring-1 ring-gray-100 p-3">
                      <p className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider"><t.icon className="h-3 w-3" /> {t.label}</p>
                      <p className={`text-sm font-black mt-1 tabular-nums ${t.tone || 'text-gray-900'}`}>{t.value}</p>
                    </div>
                  ))}
                </div>

                {p.variants?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-black text-gray-900 mb-2">Varyantlar</h4>
                    <div className="rounded-xl ring-1 ring-gray-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-wider">
                          <tr><th className="text-left px-3 py-2">Seçenek</th><th className="text-left px-3 py-2">SKU</th><th className="text-right px-3 py-2">Fiyat</th><th className="text-right px-3 py-2">Stok</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {p.variants.map((v) => (
                            <tr key={v.id} className={v.isActive === false ? 'opacity-50' : ''}>
                              <td className="px-3 py-2 font-semibold text-gray-800">{variantLabel(v)}</td>
                              <td className="px-3 py-2 font-mono text-[11px] text-gray-500">{v.sku}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-bold">{fmt(v.price)} {symbol}</td>
                              <td className={`px-3 py-2 text-right tabular-nums font-bold ${v.stock <= 0 ? 'text-red-500' : 'text-gray-700'}`}>{v.stock}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-sm font-black text-gray-900 mb-2">Açıklama</h4>
                  <p className={`text-sm leading-relaxed whitespace-pre-line ${p.longDesc ? 'text-gray-600' : 'text-gray-400 italic'}`}>{p.longDesc || 'Bu ürün için detaylı açıklama girilmemiş.'}</p>
                </div>
              </div>

              <div className="modal-footer items-center">
                <button onClick={() => setIsViewOpen(false)} className="btn-secondary px-6">KAPAT</button>
                <button onClick={() => { setIsViewOpen(false); setFormData(productToForm(p)); setActiveTab('general'); setTriedSave(false); setIsDrawerOpen(true); }} className="btn-gradient h-12 py-0 flex-1">
                  <Edit3 className="h-4 w-4 mr-2" /> DÜZENLE
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Ürün ekle / düzenle */}
      {isDrawerOpen && (() => {
        const missing = {
          name: !String(formData.name || '').trim(),
          sku: !String(formData.sku || '').trim(),
          categoryId: !formData.categoryId,
          price: !(Number(formData.price) > 0)
        };
        const showErr = (k) => triedSave && missing[k];
        const set = (k) => (e) => setFormData({ ...formData, [k]: e.target.value });
        const price = Number(formData.price) || 0;
        const cost = Number(formData.costPrice) || 0;
        const symbol = { TL: '₺', USD: '$', EUR: '€' }[formData.currency] || formData.currency;
        const fmt = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const steps = [
          { id: 'general', title: 'Temel Bilgiler', desc: 'Ad, kategori, SKU', icon: Info, error: triedSave && (missing.name || missing.sku || missing.categoryId), done: !missing.name && !missing.sku && !missing.categoryId },
          { id: 'price', title: 'Fiyat & Stok', desc: 'Fiyat, KDV, stok', icon: DollarSign, error: triedSave && missing.price, done: !missing.price },
          { id: 'variants', title: 'Varyantlar', desc: formData.variants?.length ? `${formData.variants.length} varyant` : 'Renk, gramaj, beden…', icon: Layers, done: formData.variants?.length > 0 },
          ...(selectedProduct ? [{ id: 'special', title: 'Özel Fiyatlar', desc: 'Bayi / grup fiyatları', icon: Tag }] : []),
          { id: 'description', title: 'Açıklama', desc: 'Detaylı ürün metni', icon: FileText, done: Boolean(formData.longDesc) },
          { id: 'media', title: 'Görseller', desc: formData.images?.length ? `${formData.images.length} görsel` : 'Fotoğraf, PDF, video', icon: ImageIcon, done: formData.images?.length > 0 }
        ];
        const stepIndex = steps.findIndex((st) => st.id === activeTab);
        const cover = formData.images?.[0];

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIsDrawerOpen(false)} />
          <div className="modal-panel w-full max-w-5xl h-[min(90vh,46rem)] flex flex-col">
            <div className="modal-header items-center">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-11 w-11 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/25 flex items-center justify-center">
                  {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-white" />}
                </div>
                <div className="min-w-0">
                  <h3 className="modal-title text-xl truncate">{selectedProduct ? 'Ürünü Düzenle' : 'Yeni Ürün'}</h3>
                  <p className="modal-subtitle truncate">{formData.name || 'Ürün adı girilmedi'}{formData.sku ? ` · ${formData.sku}` : ''}</p>
                </div>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="modal-close" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col md:flex-row">
              <aside className="md:w-60 shrink-0 bg-gray-50/70 border-b md:border-b-0 md:border-r border-gray-100 p-3 overflow-x-auto md:overflow-y-auto">
                <StepNav steps={steps} active={activeTab} onSelect={setActiveTab} />
              </aside>

              <form onSubmit={handleSubmit} className="flex-1 min-w-0 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                {activeTab === 'general' && (<>
                  <Section icon={Package} title="Ürün Kimliği" description="Bayilerin katalogda gördüğü ad ve sizin stok kodunuz.">
                    <Field label="Ürün Adı" required error={showErr('name') && 'Ürün adı zorunlu.'}>
                      <IconInput icon={Type} invalid={showErr('name')} value={formData.name} onChange={set('name')} placeholder="Örn: Akis 18V Akülü Matkap" autoFocus={!selectedProduct} />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Stok Kodu (SKU)" required error={showErr('sku') && 'SKU zorunlu.'}>
                        <IconInput icon={Hash} invalid={showErr('sku')} className="font-mono" value={formData.sku} onChange={set('sku')} placeholder="AKS-1001" />
                      </Field>
                      <Field label="Kategori" required error={showErr('categoryId') && 'Kategori seçin.'}>
                        <IconInput as="select" icon={ListTree} invalid={showErr('categoryId')} value={formData.categoryId || ''} onChange={set('categoryId')}>
                          <option value="">Kategori seçin</option>
                          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </IconInput>
                      </Field>
                      <Field label="Marka">
                        <IconInput icon={Tag} value={formData.brand || ''} onChange={set('brand')} placeholder="Marka" />
                      </Field>
                      <Field label="Barkod">
                        <IconInput icon={Barcode} className="font-mono" value={formData.barcode || ''} onChange={set('barcode')} placeholder="8690000000000" />
                      </Field>
                    </div>
                    <Field label="Kısa Açıklama" hint="Katalog kartında ürün adının altında görünür.">
                      <IconInput icon={AlignLeft} value={formData.shortDesc || ''} onChange={set('shortDesc')} placeholder="Tek satırlık özet" />
                    </Field>
                  </Section>

                  <Section icon={BoxSelect} title="Satış Kuralları" description="Bayinin hangi birimle ve kaçar kaçar sipariş verebileceği." color="violet">
                    <Field label="Satış Birimi">
                      <Segmented size="sm" value={formData.unit} onChange={(v) => setFormData({ ...formData, unit: v })}
                        options={['Adet', 'Kutu', 'Koli', 'Metre', 'Kg', 'Çift', 'Takım'].map(u => ({ value: u, label: u }))} />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Minimum Sipariş" hint="Bayi bundan az sipariş veremez.">
                        <IconInput type="number" min="1" icon={ShoppingBasket} suffix={formData.unit} value={formData.moq} onChange={set('moq')} />
                      </Field>
                      <Field label="Artış Miktarı" hint="Ör. 6 ise 6, 12, 18… şeklinde artar.">
                        <IconInput type="number" min="1" icon={Plus} suffix={formData.unit} value={formData.stepQuantity} onChange={set('stepQuantity')} />
                      </Field>
                    </div>
                    <Field label="Muadil Ürün" hint="Bu ürün stokta yokken bayiye seçilen ürün önerilir.">
                      <IconInput as="select" icon={Shuffle} value={formData.alternativeToId || ''} onChange={set('alternativeToId')}>
                        <option value="">Yok</option>
                        {products.filter(p => p.id !== selectedProduct?.id).map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </IconInput>
                    </Field>
                  </Section>
                </>)}

                {activeTab === 'price' && (<>
                  <Section icon={DollarSign} title="Satış Fiyatı" description="Bayiye gösterilen liste fiyatı (KDV hariç). Özel iskontolar ayrıca uygulanır." color="emerald">
                    <Field label="Para Birimi">
                      <Segmented value={formData.currency} onChange={(v) => setFormData({ ...formData, currency: v })}
                        options={[{ value: 'TL', label: '₺ TRY' }, { value: 'USD', label: '$ USD' }, { value: 'EUR', label: '€ EUR' }]} />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="Liste Fiyatı (KDV hariç)" required error={showErr('price') && 'Fiyat 0’dan büyük olmalı.'}>
                        <IconInput type="number" step="0.01" min="0" icon={Banknote} suffix={symbol} invalid={showErr('price')} className="text-base font-black" value={formData.price} onChange={set('price')} />
                      </Field>
                      <Field label="KDV Oranı">
                        <Segmented value={formData.vatRate} onChange={(v) => setFormData({ ...formData, vatRate: v })}
                          options={[1, 10, 20].map(v => ({ value: v, label: `%${v}` }))} />
                      </Field>
                      <Field label="Maliyet" icon={Lock} hint="Yalnızca yönetici görür; kâr marjı için.">
                        <IconInput type="number" step="0.01" min="0" icon={Wallet} suffix={symbol} value={formData.costPrice ?? ''} onChange={set('costPrice')} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-gray-50 p-3.5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">KDV dahil</p>
                        <p className="text-lg font-black text-gray-900 tabular-nums">{fmt(price * (1 + Number(formData.vatRate || 0) / 100))} {symbol}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3.5">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Kâr marjı</p>
                        <p className={`text-lg font-black tabular-nums ${cost && price ? (price > cost ? 'text-emerald-600' : 'text-red-500') : 'text-gray-300'}`}>
                          {cost && price ? `%${(((price - cost) / price) * 100).toFixed(1)} · ${fmt(price - cost)} ${symbol}` : '—'}
                        </p>
                      </div>
                    </div>
                  </Section>

                  <Section icon={formData.hidePrice ? EyeOff : Eye} title="Fiyatı Bayilere Gizle" description="Açıksa bayi panelinde fiyat yerine “Fiyat sorun” yazar; bayi teklif isteyebilir." color="amber"
                    aside={<Toggle checked={formData.hidePrice} color="orange" onChange={(v) => setFormData({ ...formData, hidePrice: v })} />} />

                  <Section icon={Warehouse} title="Stok" description="Stok 0 olunca bayiye “Tükendi” gösterilir; gelince haber verilir." color="blue">
                    <Field label="Mevcut Stok" className="max-w-xs">
                      <IconInput type="number" icon={Boxes} suffix={formData.unit} value={formData.stock} onChange={set('stock')} />
                    </Field>
                  </Section>
                </>)}

                {activeTab === 'variants' && (
                  <VariantEditor
                    options={formData.options}
                    variants={formData.variants}
                    masterSku={formData.sku}
                    masterPrice={formData.price}
                    currency={formData.currency}
                    onChange={(options, variants) => setFormData(prev => ({ ...prev, options, variants }))}
                  />
                )}

                {activeTab === 'special' && selectedProduct && (
                  <SpecialPriceEditor productId={selectedProduct.id} currency={formData.currency} showAlert={showAlert} />
                )}

                {activeTab === 'description' && (
                  <Section icon={FileText} title="Detaylı Açıklama" description="Ürün detay penceresinde gösterilir: özellikler, kullanım alanları, teknik bilgiler." color="indigo">
                    <TextArea className="h-72" placeholder={'• Motor gücü: 18V\n• Batarya: 2 x 2.0Ah\n• Kullanım alanı: ...'} value={formData.longDesc || ''} onChange={set('longDesc')} />
                    <p className="text-[11px] text-gray-400 text-right">{(formData.longDesc || '').length} karakter</p>
                  </Section>
                )}

                {activeTab === 'media' && (<>
                  <Section icon={ImageIcon} title="Ürün Görselleri" description="İlk görsel kapak olarak kullanılır. Kare (1:1) ve beyaz zeminli görseller en iyi sonucu verir." color="rose">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {formData.images.map((img, i) => (
                        <div key={i} className="relative group aspect-square rounded-xl overflow-hidden ring-1 ring-gray-100 bg-gray-50">
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          {i === 0 && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold shadow">Kapak</span>}
                          <div className="absolute inset-x-0 bottom-0 p-2 flex justify-end gap-1 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                            {i > 0 && (
                              <button type="button" title="Kapak yap" onClick={() => setFormData({ ...formData, images: [img, ...formData.images.filter((_, idx) => idx !== i)] })}
                                className="p-1.5 rounded-lg bg-white/90 text-gray-700 hover:bg-white"><Star className="h-3.5 w-3.5" /></button>
                            )}
                            <button type="button" title="Kaldır" onClick={() => setFormData({ ...formData, images: formData.images.filter((_, idx) => idx !== i) })}
                              className="p-1.5 rounded-lg bg-white/90 text-red-600 hover:bg-white"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      ))}
                      <label className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-gray-400 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600 transition-all">
                        <UploadCloud className="h-7 w-7" />
                        <span className="text-xs font-bold">Görsel yükle</span>
                        <span className="text-[10px]">PNG, JPG, WEBP</span>
                        <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                      </label>
                    </div>
                  </Section>
                  <Section icon={Paperclip} title="Ek Dosyalar" description="Bayinin ürün detayında açabileceği katalog ve video bağlantıları." color="slate">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="PDF Teknik Katalog">
                        <IconInput type="url" icon={FileText} placeholder="https://.../katalog.pdf" value={formData.pdfUrl || ''} onChange={set('pdfUrl')} />
                      </Field>
                      <Field label="Tanıtım Videosu (YouTube)">
                        <IconInput type="url" icon={PlayCircle} placeholder="https://youtube.com/watch?v=..." value={formData.videoUrl || ''} onChange={set('videoUrl')} />
                      </Field>
                    </div>
                  </Section>
                </>)}
              </form>
            </div>

            <div className="modal-footer items-center">
              <p className="hidden md:block text-[11px] text-gray-400 mr-auto"><span className="text-red-500">*</span> zorunlu alanlar</p>
              <button type="button" onClick={() => (stepIndex > 0 ? setActiveTab(steps[stepIndex - 1].id) : setIsDrawerOpen(false))} className="btn-secondary px-5">
                {stepIndex > 0 ? <><ChevronLeft className="h-4 w-4 mr-1" /> GERİ</> : 'VAZGEÇ'}
              </button>
              {!selectedProduct && stepIndex < steps.length - 1 && (
                <button type="button" onClick={() => setActiveTab(steps[stepIndex + 1].id)} className="btn-secondary px-5">
                  İLERİ <ChevronRight className="h-4 w-4 ml-1" />
                </button>
              )}
              <button onClick={handleSubmit} className="btn-gradient h-12 py-0 px-8">
                <Save className="h-4 w-4 mr-2" /> {selectedProduct ? 'KAYDET' : 'ÜRÜNÜ OLUŞTUR'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default ProductManagement;
