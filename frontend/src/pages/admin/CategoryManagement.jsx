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
  Layers, Plus, Trash2, Edit2, ChevronRight, ChevronDown, 
  Eye, EyeOff, Image as ImageIcon, Type, Hash, Save, X, ArrowRight,
  GripVertical
} from 'lucide-react';

const SortableCategoryItem = ({ category, level, onEdit, onDelete, onExpand, isExpanded, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.5 : 1
  };

  const hasChildren = category.children && category.children.length > 0;

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center justify-between p-6 bg-white hover:bg-gray-50/50 transition-all group border-b border-gray-50">
        <div className="flex items-center" style={{ marginLeft: `${level * 3}rem` }}>
          <div {...attributes} {...listeners} className="mr-4 p-2 text-gray-300 hover:text-gray-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5" />
          </div>
          <button 
            onClick={() => onExpand(category.id)}
            className={`p-2 mr-4 rounded-xl hover:bg-white shadow-sm transition-all border border-transparent hover:border-gray-100 ${!hasChildren && 'invisible'}`}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4 text-blue-500" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          </button>
          <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mr-5 overflow-hidden border border-gray-100 shadow-inner group-hover:scale-105 transition-transform">
            {category.imageUrl ? <img src={category.imageUrl} className="w-full h-full object-cover" /> : <Layers className="h-6 w-6 text-gray-300" />}
          </div>
          <div>
            <p className="text-base font-black text-gray-900 group-hover:text-blue-600 transition-colors tracking-tight">{category.name}</p>
            <div className="flex items-center mt-1 space-x-3">
              <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">SIRA: {category.sortOrder}</span>
              {category.isActive ? (
                <span className="pill-badge pill-green">AKTİF</span>
              ) : (
                <span className="pill-badge pill-red">PASİF</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0 pr-4">
          <button 
            onClick={() => onEdit(category)}
            className="p-3 text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm hover:shadow-blue-200"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button 
            onClick={() => onDelete(category.id)}
            className="p-3 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm hover:shadow-red-200"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
};

const CategoryManagement = () => {
  const [categories, setCategories] = useState([]);
  const [flatCategories, setFlatCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expanded, setExpanded] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [formData, setFormData] = useState({
    name: '',
    parentId: null,
    sortOrder: 0,
    isActive: true,
    imageUrl: ''
  });

  const fetchCategories = async () => {
    try {
      const [treeRes, flatRes] = await Promise.all([
        api.get('/categories?isAdmin=true'),
        api.get('/categories?isAdmin=true&isFlat=true')
      ]);
      setCategories(treeRes.data);
      setFlatCategories(flatRes.data);
    } catch (error) {
      console.error('Kategoriler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const toggleExpand = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Helper function to find a category and its parent list in the tree
    const findCategoryAndSiblings = (items, id) => {
      for (let i = 0; i < items.length; i++) {
        if (items[i].id === id) return { siblings: items, index: i };
        if (items[i].children) {
          const result = findCategoryAndSiblings(items[i].children, id);
          if (result) return result;
        }
      }
      return null;
    };

    const activeInfo = findCategoryAndSiblings(categories, active.id);
    const overInfo = findCategoryAndSiblings(categories, over.id);

    // Only allow reordering if they have the same parent (same siblings list)
    if (activeInfo && overInfo && activeInfo.siblings === overInfo.siblings) {
      const newSiblings = arrayMove(activeInfo.siblings, activeInfo.index, overInfo.index);
      
      // Update sortOrder for all siblings based on their new index
      const reorderedCategories = newSiblings.map((cat, index) => ({
        id: cat.id,
        sortOrder: index
      }));

      // Pessimistic update UI and then call API
      try {
        await api.post('/categories/reorder', { categories: reorderedCategories });
        fetchCategories();
      } catch (error) {
        console.error('Reorder error:', error);
      }
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await api.post('/categories/upload-image', data);
      setFormData(prev => ({ ...prev, imageUrl: res.data.imageUrl }));
    } catch (error) {
      alert('Resim yüklenemedi');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedCategory) {
        await api.patch(`/categories/${selectedCategory.id}`, formData);
      } else {
        await api.post('/categories', formData);
      }
      setIsDrawerOpen(false);
      setSelectedCategory(null);
      fetchCategories();
      setFormData({ name: '', parentId: null, sortOrder: 0, isActive: true, imageUrl: '' });
    } catch (error) {
      alert('İşlem başarısız');
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) return;
    try {
      await api.delete(`/categories/${id}`);
      fetchCategories();
    } catch (error) {
      alert(error.response?.data?.message || 'Silme işlemi başarısız');
    }
  };

  const renderCategoryList = (items, level = 0) => {
    return (
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={items.map(i => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map(category => (
            <SortableCategoryItem 
              key={category.id}
              category={category}
              level={level}
              onEdit={(cat) => {
                setSelectedCategory(cat);
                setFormData({ ...cat });
                setIsDrawerOpen(true);
              }}
              onDelete={deleteCategory}
              onExpand={toggleExpand}
              isExpanded={expanded[category.id]}
            >
              {category.children && expanded[category.id] && renderCategoryList(category.children, level + 1)}
            </SortableCategoryItem>
          ))}
        </SortableContext>
      </DndContext>
    );
  };

  return (
    <div className="p-10 space-y-12 max-w-7xl mx-auto animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center space-x-4 mb-3">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-4 rounded-3xl shadow-2xl shadow-blue-500/30">
              <Layers className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Kategori Ağacı</h1>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-[0.2em] mt-1">Sürükle-Bırak Sıralama Aktif</p>
            </div>
          </div>
        </div>
        <button 
          onClick={() => { setSelectedCategory(null); setFormData({ name: '', parentId: null, sortOrder: 0, isActive: true, imageUrl: '' }); setIsDrawerOpen(true); }}
          className="btn-gradient px-8 py-5"
        >
          <Plus className="mr-2 h-5 w-5" />
          YENİ KATEGORİ EKLE
        </button>
      </div>

      <div className="card-premium">
        <div className="bg-gray-50/50 p-8 border-b border-gray-100 flex justify-between items-center">
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Hiyerarşik Kategori Yapısı</p>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Kontrol Paneli</p>
        </div>
        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="p-32 text-center">
              <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-6"></div>
              <p className="text-gray-400 font-black uppercase text-xs tracking-widest">Veriler İşleniyor...</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="p-32 text-center">
              <Layers className="h-20 w-20 text-gray-100 mx-auto mb-6" />
              <p className="text-gray-400 font-bold italic text-lg tracking-tight">Henüz bir kategori tanımlanmamış.</p>
            </div>
          ) : renderCategoryList(categories)}
        </div>
      </div>

      {/* Centered Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
            <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                  {selectedCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori Tanımla'}
                </h3>
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1">Stripe-style Form Deneyimi</p>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-3 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-2xl transition-all">
                <X className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar">
              <div className="space-y-2">
                <label className="premium-label">Kategori Adı</label>
                <input required className="premium-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Örn: Elektrikli El Aletleri" />
              </div>

              <div className="space-y-2">
                <label className="premium-label">Üst Kategori</label>
                <select className="premium-input appearance-none cursor-pointer" value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})}>
                  <option value="">Ana Kategori (Root)</option>
                  {flatCategories.filter(c => c.id !== selectedCategory?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="premium-label">Sıralama</label>
                  <input type="number" className="premium-input" value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="premium-label">Hesap Durumu</label>
                  <div className="flex bg-gray-50 p-1.5 rounded-[1.2rem]">
                    <button type="button" onClick={() => setFormData({...formData, isActive: true})} className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${formData.isActive ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400'}`}>AKTİF</button>
                    <button type="button" onClick={() => setFormData({...formData, isActive: false})} className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${!formData.isActive ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>PASİF</button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="premium-label flex items-center"><ImageIcon className="h-3 w-3 mr-2" /> Kategori Görseli</label>
                <div className="flex items-center space-x-6">
                  <div className="w-24 h-24 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden group relative transition-all hover:border-blue-400">
                    {formData.imageUrl ? (
                      <>
                        <img src={formData.imageUrl} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setFormData({...formData, imageUrl: ''})} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-6 w-6" />
                        </button>
                      </>
                    ) : (
                      <ImageIcon className="h-8 w-8 text-gray-200" />
                    )}
                  </div>
                  <label className="flex-1">
                    <div className="bg-gray-50 border border-gray-200 border-dashed rounded-2xl px-6 py-6 text-[10px] font-black text-gray-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-all text-center uppercase tracking-widest">
                      DOSYA SEÇ VEYA SÜRÜKLE
                    </div>
                    <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                  </label>
                </div>
              </div>
            </form>

            <div className="p-10 bg-gray-50/50 border-t border-gray-100 flex space-x-6">
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="flex-1 py-5 border border-gray-200 rounded-2xl font-black text-gray-400 hover:bg-white transition-all uppercase tracking-widest text-[10px]">İPTAL ET</button>
              <button onClick={handleSubmit} className="btn-gradient flex-[2] py-5">
                <Save className="h-5 w-5 mr-3" /> {selectedCategory ? 'DEĞİŞİKLİKLERİ KAYDET' : 'KATEGORİYİ ONAYLA VE EKLE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryManagement;
