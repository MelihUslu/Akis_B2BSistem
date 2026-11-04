import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Heart, PackageCheck, Search, FolderTree, Tag, Banknote, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { CATALOG_SORTS, findCategory } from '../../../utils/catalog';
import { CategoryMenu, CategoryIcon } from './CategoryParts';
import { t } from '../../../i18n';

// Açılır menü: dışarı tıklayınca / Esc ile kapanır
// primary: ana filtre (Kategori) seçili değilken de renkli görünür
const Dropdown = ({ label, icon, active, primary, children, width = 'w-64', align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className={`h-10 flex items-center gap-2 px-3.5 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors ${active ? 'bg-brand-600 border-brand-600 text-white' : primary ? 'bg-brand-50 border-brand-200 text-brand-700 dark:text-brand-300 hover:border-brand-300' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
        {icon}{label} <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''} ${active ? 'text-brand-200' : primary ? 'text-brand-400' : 'text-gray-400'}`} />
      </button>
      {open && (
        <div className={`absolute z-30 mt-2 ${align === 'right' ? 'right-0' : 'left-0'} ${width} max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-2xl shadow-xl p-2`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
};

const Item = ({ selected, onClick, children, count, indent }) => (
  <button type="button" onClick={onClick}
    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left ${indent ? 'pl-7' : ''} ${selected ? 'bg-brand-50 text-brand-700 dark:text-brand-300 font-bold' : 'text-gray-700 hover:bg-gray-50'}`}>
    <Check className={`h-4 w-4 shrink-0 ${selected ? '' : 'invisible'}`} />
    <span className="flex-1 truncate">{children}</span>
    {count !== undefined && <span className="text-xs text-gray-400 tabular-nums">{count}</span>}
  </button>
);

const Pill = ({ on, onClick, icon: Icon, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on}
    className={`h-10 flex items-center gap-1.5 px-3.5 rounded-xl border text-sm font-semibold whitespace-nowrap transition-colors ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}>
    <Icon className={`h-4 w-4 ${on ? '' : 'text-gray-400'}`} /> {children}
  </button>
);

const ico = (Icon, active) => <Icon className={`h-4 w-4 ${active ? '' : 'text-gray-400'}`} />;

const BrandList = ({ brands, value, onPick }) => {
  const [q, setQ] = useState('');
  const list = brands.filter((b) => b.toLocaleLowerCase('tr-TR').includes(q.toLocaleLowerCase('tr-TR')));
  return (
    <>
      {brands.length > 8 && (
        <div className="relative mb-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Marka ara')} className="w-full pl-9 pr-3 h-9 rounded-lg bg-gray-50 border border-gray-100 text-sm outline-none focus:border-brand-300" />
        </div>
      )}
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        <Item selected={!value} onClick={() => onPick('')}>{t('Tüm markalar')}</Item>
        {list.map((b) => <Item key={b} selected={value === b} onClick={() => onPick(b)}>{b}</Item>)}
      </div>
    </>
  );
};

const PriceForm = ({ min, max, onApply }) => {
  const [v, setV] = useState({ min, max });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(v); }} className="p-2 space-y-3">
      <p className="text-xs font-bold text-gray-500">{t('Net birim fiyat (₺, KDV hariç)')}</p>
      <div className="flex items-center gap-2">
        <input autoFocus type="number" min="0" inputMode="decimal" placeholder={t('En az')} value={v.min} onChange={(e) => setV({ ...v, min: e.target.value })}
          className="w-full min-w-0 h-10 px-3 rounded-lg bg-gray-50 border border-gray-100 text-sm outline-none focus:border-brand-300" />
        <span className="text-gray-300">–</span>
        <input type="number" min="0" inputMode="decimal" placeholder={t('En çok')} value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })}
          className="w-full min-w-0 h-10 px-3 rounded-lg bg-gray-50 border border-gray-100 text-sm outline-none focus:border-brand-300" />
      </div>
      <div className="flex gap-2">
        {(min || max) && <button type="button" onClick={() => onApply({ min: '', max: '' })} className="h-9 px-3 rounded-lg bg-gray-100 text-xs font-bold text-gray-600">{t('Temizle')}</button>}
        <button type="submit" className="flex-1 h-9 rounded-lg bg-brand-600 text-white text-xs font-black">{t('Uygula')}</button>
      </div>
    </form>
  );
};

/**
 * Katalog filtre çubuğu: tek satırda kategori, marka, fiyat, özellikler, stok / favori ve sıralama.
 * Her seçim anında uygulanır.
 */
const FilterBar = ({ value, onChange, categories, facets }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const cat = value.category && findCategory(categories, value.category);
  const optionCount = Object.values(value.options).filter(Boolean).length;
  const priceLabel = value.min || value.max ? `${value.min || 0} – ${value.max || '∞'} ₺` : t('Fiyat');

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.length > 0 && (
        <Dropdown primary label={cat ? cat.name : t('Kategoriler')} active={Boolean(cat)} width="w-80"
          icon={cat ? <CategoryIcon category={cat} size="h-5 w-5" /> : <FolderTree className="h-4 w-4" />}>
          {(close) => <CategoryMenu categories={categories} value={value.category} onPick={(id) => { set({ category: id }); close(); }} />}
        </Dropdown>
      )}

      {facets.brands?.length > 0 && (
        <Dropdown label={value.brand || t('Marka')} active={Boolean(value.brand)} icon={ico(Tag, value.brand)}>
          {(close) => <BrandList brands={facets.brands} value={value.brand} onPick={(b) => { set({ brand: b }); close(); }} />}
        </Dropdown>
      )}

      <Dropdown label={priceLabel} active={Boolean(value.min || value.max)} width="w-72" icon={ico(Banknote, value.min || value.max)}>
        {(close) => <PriceForm min={value.min} max={value.max} onApply={(p) => { set(p); close(); }} />}
      </Dropdown>

      {facets.options?.length > 0 && (
        <Dropdown label={optionCount ? t('Özellikler ({n})', { n: optionCount }) : t('Özellikler')} active={optionCount > 0} width="w-80" icon={ico(SlidersHorizontal, optionCount)}>
          {() => (
            <div className="max-h-96 overflow-y-auto custom-scrollbar p-2 space-y-4">
              {facets.options.map((o) => (
                <div key={o.name}>
                  <p className="text-xs font-bold text-gray-500 mb-2">{o.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {o.values.map((v) => {
                      const on = value.options[o.name] === v;
                      return (
                        <button key={v} type="button" onClick={() => set({ options: { ...value.options, [o.name]: on ? '' : v } })}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>{v}</button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Dropdown>
      )}

      <Pill on={value.inStock} onClick={() => set({ inStock: !value.inStock })} icon={PackageCheck}>{t('Stoktakiler')}</Pill>
      <Pill on={value.favorites} onClick={() => set({ favorites: !value.favorites })} icon={Heart}>{t('Favorilerim')}</Pill>

      <div className="relative ml-auto">
        <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <select value={value.sort} onChange={(e) => set({ sort: e.target.value })} aria-label={t('Sıralama')}
          className="h-10 pl-9 pr-8 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700 outline-none cursor-pointer">
          {CATALOG_SORTS.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
        </select>
      </div>
    </div>
  );
};

export default FilterBar;
