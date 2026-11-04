import { useState } from 'react';
import { ChevronRight, Folder, LayoutGrid, Search, X } from 'lucide-react';
import { categoryColor, categoryTotal, parentCategory } from '../../../utils/catalog';
import { t } from '../../../i18n';

// Kategori ikonu: görseli varsa görsel, yoksa kategoriye sabit renkli kutu
export const CategoryIcon = ({ category, size = 'h-8 w-8' }) => (
  category?.imageUrl
    ? <img src={category.imageUrl} alt="" className={`${size} shrink-0 rounded-lg object-cover border border-gray-100`} />
    : <span className={`${size} shrink-0 rounded-lg flex items-center justify-center ${categoryColor(category?.id).tile}`}><Folder className="h-1/2 w-1/2" /></span>
);

const norm = (s) => s.toLocaleLowerCase('tr-TR');

/**
 * Kategori menüsü: arama, renkli ikonlar, ürün sayıları, açılır alt kategoriler.
 * Arama yazılınca eşleşen alt kategorilerin üst kategorisi de gösterilir.
 */
export const CategoryMenu = ({ categories, value, onPick }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set(value ? [parentCategory(categories, value)?.id ?? value] : []));
  const query = norm(q.trim());
  const visible = categories
    .map((c) => {
      const kids = (c.children || []).filter((ch) => !query || norm(ch.name).includes(query));
      const self = !query || norm(c.name).includes(query);
      return self || kids.length ? { ...c, kids: self && !query ? c.children || [] : kids } : null;
    })
    .filter(Boolean);
  const toggle = (id) => setOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const row = (c, child = false) => {
    const on = value === c.id;
    return (
      <button type="button" onClick={() => onPick(c.id)}
        className={`flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm ${on ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
        {child ? <span className={`h-1.5 w-1.5 rounded-full ml-2 mr-1 shrink-0 ${on ? 'bg-white' : 'bg-gray-300'}`} /> : <CategoryIcon category={c} />}
        <span className={`flex-1 truncate ${child ? '' : 'font-semibold'}`}>{c.name}</span>
        <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${on ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>{child ? c._count?.products || 0 : categoryTotal(c)}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between px-2 pt-1 pb-2">
        <p className="text-xs font-black text-gray-500 uppercase tracking-wider">{t('Kategoriler')}</p>
        {value && <button type="button" onClick={() => onPick('')} className="text-xs font-bold text-brand-600 hover:underline">{t('Seçimi kaldır')}</button>}
      </div>
      {categories.length > 6 && (
        <div className="relative mb-2 px-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Kategori ara')} className="w-full pl-9 pr-3 h-9 rounded-lg bg-gray-50 border border-gray-100 text-sm outline-none focus:border-brand-300" />
        </div>
      )}
      <div className="max-h-[22rem] overflow-y-auto custom-scrollbar space-y-0.5">
        {!query && (
          <button type="button" onClick={() => onPick('')}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm font-semibold ${!value ? 'bg-brand-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${!value ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}><LayoutGrid className="h-4 w-4" /></span>
            {t('Tüm kategoriler')}
          </button>
        )}
        {visible.map((c) => {
          const expanded = Boolean(query) || open.has(c.id);
          return (
            <div key={c.id}>
              <div className="flex items-center gap-1">
                {row(c)}
                {c.kids.length > 0 && (
                  <button type="button" onClick={() => toggle(c.id)} aria-label={expanded ? t('Daralt') : t('Alt kategoriler')} aria-expanded={expanded}
                    className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                    <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </button>
                )}
              </div>
              {expanded && c.kids.length > 0 && <div className="ml-6 pl-2 border-l border-gray-100 space-y-0.5 my-0.5">{c.kids.map((ch) => <div key={ch.id} className="flex">{row(ch, true)}</div>)}</div>}
            </div>
          );
        })}
        {visible.length === 0 && <p className="px-3 py-4 text-sm text-gray-400 text-center">{t('Eşleşen kategori yok.')}</p>}
      </div>
    </div>
  );
};

/**
 * Seçili kategori şeridi: kategoriye özel renk, ikon, üst kategori yolu ve alt kategorilere hızlı geçiş.
 */
export const CategoryBanner = ({ categories, value, onPick }) => {
  const parent = parentCategory(categories, value);
  const cat = parent ? parent.children.find((c) => c.id === value) : categories.find((c) => c.id === value);
  if (!cat) return null;
  const root = parent || cat;
  const color = categoryColor(root.id);
  return (
    <div className={`relative rounded-2xl border bg-gradient-to-r to-transparent ${color.bar} pl-4 pr-12 py-3 flex flex-wrap items-center gap-x-4 gap-y-3`}>
      <div className="flex items-center gap-3 min-w-0">
        <CategoryIcon category={root} size="h-11 w-11" />
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-gray-500 flex items-center gap-1">
            <button type="button" onClick={() => onPick('')} className="hover:underline">{t('Tüm kategoriler')}</button>
            {parent && <><ChevronRight className="h-3 w-3" /><button type="button" onClick={() => onPick(parent.id)} className="hover:underline">{parent.name}</button></>}
          </p>
          <p className={`text-lg font-black leading-tight truncate ${color.accent}`}>{cat.name}</p>
        </div>
      </div>
      {root.children?.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onPick(root.id)}
            className={`h-8 px-3 rounded-lg text-xs font-bold border ${value === root.id ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>{t('Tümü')}</button>
          {root.children.map((ch) => (
            <button key={ch.id} type="button" onClick={() => onPick(ch.id)}
              className={`h-8 px-3 rounded-lg text-xs font-bold border ${value === ch.id ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {ch.name} <span className="opacity-60">{ch._count?.products || 0}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={() => onPick('')} className="absolute top-3 right-3 h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:text-gray-700" aria-label={t('Kategori seçimini kaldır')}><X className="h-4 w-4" /></button>
    </div>
  );
};
