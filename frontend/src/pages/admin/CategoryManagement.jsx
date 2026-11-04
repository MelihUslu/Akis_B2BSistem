import { useState, useEffect } from 'react';
import GroupVisibility from '../../components/admin/GroupVisibility';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { Section, Field, IconInput, Segmented } from '../../components/form/FormKit';
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
  Layers, Plus, Trash2, Edit2, ChevronRight, Eye, EyeOff, Image as ImageIcon, Type, Hash, Save, X, GripVertical, FolderTree, UploadCloud, Search, Package, ChevronsDownUp, ChevronsUpDown
} from 'lucide-react';

const SortableCategoryItem = ({ category, level, zebra, dragDisabled, onEdit, onDelete, onExpand, isExpanded, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 0,
    opacity: isDragging ? 0.6 : 1
  };

  const childCount = category.children?.length || 0;
  const productCount = category._count?.products ?? 0;
  const hasChildren = childCount > 0;

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`relative flex items-center gap-3 pl-4 pr-5 py-3 border-b border-gray-100/70 group transition-colors ${isDragging ? 'bg-brand-50 shadow-lg' : zebra ? 'bg-slate-50/80' : 'bg-white'} hover:bg-brand-50/40 hover:shadow-[inset_3px_0_0_0_var(--color-brand-500)] ${category.isActive ? '' : 'opacity-60'}`}>
        <div {...attributes} {...listeners} title={dragDisabled ? 'Arama yaparken sıralama kapalı' : 'Sürükleyerek sırala'}
          className={`p-1 rounded-md text-gray-300 transition-colors ${dragDisabled ? 'opacity-30 cursor-not-allowed' : 'group-hover:text-gray-500 hover:bg-gray-100 cursor-grab active:cursor-grabbing'}`}>
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Girinti + ağaç çizgisi */}
        {level > 0 && (
          <span aria-hidden className="relative self-stretch shrink-0" style={{ width: `${level * 1.75}rem` }}>
            <span className="absolute right-2 top-0 h-1/2 w-3 border-l-2 border-b-2 border-gray-200 rounded-bl-lg" />
          </span>
        )}

        <button type="button" onClick={() => hasChildren && onExpand(category.id)} disabled={!hasChildren}
          title={hasChildren ? (isExpanded ? 'Daralt' : 'Alt kategorileri göster') : ''}
          className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${hasChildren ? (isExpanded ? 'bg-brand-600 text-white shadow-sm' : 'bg-white ring-1 ring-gray-200 text-gray-500 hover:text-brand-600 hover:ring-brand-200') : 'text-gray-200'}`}>
          {hasChildren ? <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} /> : <span className="h-1.5 w-1.5 rounded-full bg-gray-200" />}
        </button>

        <div className="h-11 w-11 shrink-0 rounded-xl overflow-hidden ring-1 ring-gray-100 bg-gradient-to-br from-brand-50 to-brand-100 flex items-center justify-center">
          {category.imageUrl ? <img src={category.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : (
            <span className="text-sm font-black text-brand-600/70">{category.name.trim().slice(0, 1).toLocaleUpperCase('tr-TR')}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[15px] font-bold text-gray-900 tracking-tight truncate group-hover:text-brand-700 transition-colors">{category.name}</p>
            {!category.isActive && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-bold"><EyeOff className="h-3 w-3" /> Pasif</span>}
          </div>
          {hasChildren && (
            <p className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-gray-400 font-semibold"><FolderTree className="h-3 w-3" /> {childCount} alt kategori</p>
          )}
        </div>

        <span className={`hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-bold tabular-nums shrink-0 ${productCount ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-400'}`} title="Bu kategorideki ürün sayısı (varyantlar hariç)">
          <Package className="h-3.5 w-3.5" /> {productCount} ürün
        </span>

        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white ring-1 ring-gray-100 shadow-sm shrink-0">
          <button onClick={() => onEdit(category)} title="Düzenle" className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors">
            <Edit2 className="h-4 w-4" />
          </button>
          <span className="w-px h-4 bg-gray-100" />
          <button onClick={() => onDelete(category)} title="Sil" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
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
  const [triedSave, setTriedSave] = useState(false); // kaydet'e basılınca eksik ad kırmızı gösterilir
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const { alertElement, showAlert, confirm } = useAlert();

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
    visibleGroups: [],
    imageUrl: ''
  });

  const fetchCategories = () =>
    Promise.all([api.get('/categories?isAdmin=true'), api.get('/categories?isAdmin=true&isFlat=true')])
      .then(([treeRes, flatRes]) => {
        setCategories(treeRes.data);
        setFlatCategories(flatRes.data);
      })
      .catch(() => console.error('Kategoriler yüklenemedi'))
      .finally(() => setIsLoading(false));

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
      showAlert({ type: 'error', title: 'Yükleme Başarısız', message: errorMessage(error, 'Resim yüklenemedi.') });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.name || '').trim()) { setTriedSave(true); return; }
    try {
      if (selectedCategory) {
        await api.patch(`/categories/${selectedCategory.id}`, formData);
      } else {
        await api.post('/categories', formData);
      }
      setIsDrawerOpen(false);
      setSelectedCategory(null);
      fetchCategories();
      setFormData({ name: '', parentId: null, sortOrder: 0, isActive: true, imageUrl: '', visibleGroups: [] });
    } catch (error) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(error, 'İşlem başarısız.') });
    }
  };

  const deleteCategory = async (category) => {
    const products = category._count?.products || 0;
    const ok = await confirm({
      type: 'warning', title: `“${category.name}” silinsin mi?`,
      message: category.children?.length
        ? 'Bu kategorinin alt kategorileri var; önce onları taşıyın veya silin.'
        : products ? `Bu kategoride ${products} ürün var. Ürünler silinmez ama kategorisiz kalır.` : 'Bu işlem geri alınamaz.',
      confirmText: 'Sil'
    });
    if (!ok) return;
    try {
      await api.delete(`/categories/${category.id}`);
      fetchCategories();
    } catch (error) {
      showAlert({ type: 'error', title: 'Silinemedi', message: errorMessage(error, 'Silme işlemi başarısız.') });
    }
  };

  const openNew = (parent = null) => {
    setSelectedCategory(null);
    setFormData({ name: '', parentId: parent ? parent.id : null, sortOrder: parent ? (parent.children?.length || 0) : categories.length, isActive: true, imageUrl: '', visibleGroups: [] });
    setTriedSave(false);
    setIsDrawerOpen(true);
  };

  // Arama: eşleşen kategori veya alt kategorisi eşleşen ana kategori gösterilir
  const term = search.trim().toLocaleLowerCase('tr-TR');
  const matches = (c) => c.name.toLocaleLowerCase('tr-TR').includes(term);
  const visibleTree = !term ? categories : categories
    .map((c) => ({ ...c, children: matches(c) ? c.children : (c.children || []).filter(matches) }))
    .filter((c) => matches(c) || c.children.length > 0);
  const isOpen = (id) => Boolean(term) || Boolean(expanded[id]);

  // Zebra: görünen satırların sırası (iç içe listelerde de kesintisiz)
  const zebraIndex = new Map();
  const walk = (items) => items.forEach((c) => { zebraIndex.set(c.id, zebraIndex.size); if (c.children && isOpen(c.id)) walk(c.children); });
  walk(visibleTree);

  const totalChildren = categories.reduce((n, c) => n + (c.children?.length || 0), 0);
  const totalProducts = categories.reduce((n, c) => n + (c._count?.products || 0) + (c.children || []).reduce((m, ch) => m + (ch._count?.products || 0), 0), 0);
  const allOpen = categories.filter((c) => c.children?.length).every((c) => expanded[c.id]);
  const toggleAll = () => setExpanded(allOpen ? {} : Object.fromEntries(categories.map((c) => [c.id, true])));

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
              zebra={zebraIndex.get(category.id) % 2 === 1}
              dragDisabled={Boolean(term)}
              onEdit={(cat) => {
                setSelectedCategory(cat);
                setFormData({ name: cat.name, parentId: cat.parentId, sortOrder: cat.sortOrder, isActive: cat.isActive, imageUrl: cat.imageUrl || '', visibleGroups: cat.visibleGroups || [] });
                setTriedSave(false);
                setIsDrawerOpen(true);
              }}
              onDelete={deleteCategory}
              onExpand={toggleExpand}
              isExpanded={isOpen(category.id)}
            >
              {category.children?.length > 0 && isOpen(category.id) && renderCategoryList(category.children, level + 1)}
            </SortableCategoryItem>
          ))}
        </SortableContext>
      </DndContext>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-700">
      {alertElement}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon">
            <Layers className="h-6 w-6 text-brand-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight whitespace-nowrap">Kategori Ağacı</h1>
            <p className="text-gray-500 text-sm mt-1">Bayi kataloğundaki menü yapısı · sıralamak için satırları sürükleyin</p>
          </div>
        </div>
        <button onClick={() => openNew()} className="btn-gradient h-12 px-5 py-0 whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" />
          YENİ KATEGORİ
        </button>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Layers, label: 'Ana kategori', value: categories.length, tone: 'bg-brand-50 text-brand-600' },
          { icon: FolderTree, label: 'Alt kategori', value: totalChildren, tone: 'bg-violet-50 text-violet-600' },
          { icon: Package, label: 'Kategorili ürün', value: totalProducts, tone: 'bg-emerald-50 text-emerald-600' },
        ].map((st) => (
          <div key={st.label} className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4 flex items-center gap-3">
            <span className={`p-2.5 rounded-xl ${st.tone}`}><st.icon className="h-5 w-5" /></span>
            <div>
              <p className="text-2xl font-black text-gray-900 tabular-nums leading-none">{st.value}</p>
              <p className="text-[11px] font-semibold text-gray-400 mt-1">{st.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Araç çubuğu */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kategori ara..."
            className="w-full h-10 pl-10 pr-9 rounded-xl bg-white border border-gray-100 shadow-sm text-sm font-semibold outline-none focus:bg-white focus:border-brand-300 focus:ring-4 focus:ring-brand-100 placeholder:text-gray-400 placeholder:font-medium" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>}
        </div>
        {totalChildren > 0 && !term && (
          <button onClick={toggleAll} className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white border border-gray-100 shadow-sm text-xs font-bold text-gray-600 hover:bg-gray-50">
            {allOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />} {allOpen ? 'Tümünü daralt' : 'Tümünü aç'}
          </button>
        )}
      </div>

      <div className="card-premium">
        <div className="list-head pl-4 pr-5 py-3 flex items-center gap-3">
          <p className="flex-1 pl-9 text-[11px] font-black uppercase tracking-[0.15em]">Kategori</p>
          <p className="hidden sm:block w-24 text-[11px] font-black uppercase tracking-[0.15em]">Ürün</p>
          <p className="w-[4.75rem] text-right text-[11px] font-black uppercase tracking-[0.15em]">İşlem</p>
        </div>
        <div>
          {isLoading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className={`flex items-center gap-4 px-5 py-4 ${i % 2 ? 'bg-slate-50/80' : ''}`}>
                <div className="h-11 w-11 rounded-xl bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-2"><div className="h-3.5 w-1/3 bg-gray-100 rounded animate-pulse" /><div className="h-2.5 w-1/6 bg-gray-100 rounded animate-pulse" /></div>
              </div>
            ))
          ) : categories.length === 0 ? (
            <div className="py-20 text-center">
              <Layers className="h-12 w-12 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-500">Henüz kategori yok</p>
              <p className="text-xs text-gray-400 mt-1 mb-4">Ürünlerinizi gruplamak için ilk kategorinizi ekleyin.</p>
              <button onClick={() => openNew()} className="btn-gradient h-10 px-4 py-0 inline-flex"><Plus className="h-4 w-4 mr-1.5" /> Kategori Ekle</button>
            </div>
          ) : visibleTree.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">“{search}” ile eşleşen kategori yok.</div>
          ) : renderCategoryList(visibleTree)}
        </div>
      </div>

      {/* Kategori ekle / düzenle */}
      {isDrawerOpen && (() => {
        const missingName = triedSave && !String(formData.name || '').trim();
        const parentName = flatCategories.find(c => String(c.id) === String(formData.parentId))?.name;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setIsDrawerOpen(false)} />
          <div className="modal-panel w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="modal-header items-center">
              <div className="flex items-center gap-3 min-w-0">
                <div className="modal-icon">
                  {formData.imageUrl ? <img src={formData.imageUrl} alt="" className="h-full w-full object-cover" /> : <Layers className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <h3 className="modal-title">{selectedCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}</h3>
                  <p className="modal-subtitle truncate">{parentName ? `${parentName} › ` : ''}{formData.name || 'Ad, üst kategori ve görsel'}</p>
                </div>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="modal-close" aria-label="Kapat">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar bg-gray-50/40">
              <Section icon={Layers} title="Kategori Bilgileri" description="Bayi kataloğunda menü ve filtre olarak görünür.">
                <Field label="Kategori Adı" required error={missingName && 'Kategori adı zorunlu.'}>
                  <IconInput icon={Type} invalid={missingName} autoFocus={!selectedCategory} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Örn: Elektrikli El Aletleri" />
                </Field>
                <Field label="Üst Kategori" hint="Boş bırakırsanız ana kategori olur.">
                  <IconInput as="select" icon={FolderTree} value={formData.parentId || ''} onChange={e => setFormData({...formData, parentId: e.target.value || null})}>
                    <option value="">Ana kategori</option>
                    {flatCategories.filter(c => c.id !== selectedCategory?.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </IconInput>
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Durum">
                    <Segmented size="sm" value={formData.isActive ? 'on' : 'off'} onChange={(v) => setFormData({...formData, isActive: v === 'on'})}
                      options={[{ value: 'on', label: 'Aktif', icon: Eye }, { value: 'off', label: 'Pasif', icon: EyeOff }]} />
                  </Field>
                  <Field label="Sıra" hint="Listede sürükleyerek de değiştirebilirsiniz.">
                    <IconInput type="number" icon={Hash} value={formData.sortOrder} onChange={e => setFormData({...formData, sortOrder: e.target.value})} />
                  </Field>
                </div>
              </Section>

              <Section icon={Eye} title="Kimler görsün?" description="Kategoriyi (ve alt kategorilerini) yalnızca belirli bayi gruplarına açabilirsiniz." color="violet">
                <GroupVisibility value={formData.visibleGroups || []} onChange={(visibleGroups) => setFormData({ ...formData, visibleGroups })} />
              </Section>

              <Section icon={ImageIcon} title="Kategori Görseli" description="Katalogdaki kategori kartında gösterilir. Kare görsel önerilir." color="rose">
                <div className="flex items-center gap-4">
                  <div className="relative group h-24 w-24 rounded-xl overflow-hidden ring-1 ring-gray-100 bg-gray-50 flex items-center justify-center shrink-0">
                    {formData.imageUrl ? (
                      <>
                        <img src={formData.imageUrl} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setFormData({...formData, imageUrl: ''})} title="Kaldır" className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : <ImageIcon className="h-7 w-7 text-gray-300" />}
                  </div>
                  <label className="flex-1 h-24 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 cursor-pointer text-gray-400 hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-600 transition-all">
                    <UploadCloud className="h-6 w-6" />
                    <span className="text-xs font-bold">{formData.imageUrl ? 'Görseli değiştir' : 'Görsel yükle'}</span>
                    <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                  </label>
                </div>
              </Section>
            </form>

            <div className="modal-footer items-center">
              <button type="button" onClick={() => setIsDrawerOpen(false)} className="btn-secondary px-6">Vazgeç</button>
              <button onClick={handleSubmit} className="btn-gradient h-12 py-0 flex-1">
                <Save className="h-4 w-4 mr-2" /> {selectedCategory ? 'Kaydet' : 'Kategoriyi ekle'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

export default CategoryManagement;
