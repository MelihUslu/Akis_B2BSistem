import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { variantSummary, itemMeta as meta } from '../../../utils/catalog';
import { Stock, Price, Thumb, Qty, Action, Check, InCart, Fav } from './parts';
import { t } from '../../../i18n';

/**
 * Sipariş tablosu: her satırda stok, net fiyat, miktar ve ekle. Varyantlı ürünün seçenekleri satırın altında açılır.
 * Seçilebilir satırlar (stokta, fiyatı açık) işaretlenip toplu olarak sepete eklenir.
 * row: { qtyOf, setQty, step, isSelected, toggle, add, open, favorite, stockAlert, inCart }
 */
const COLS = 'grid grid-cols-[1.25rem_minmax(0,1fr)] md:grid-cols-[1.25rem_minmax(0,1fr)_7.5rem_9rem_8.5rem_7rem] gap-x-3 md:gap-x-4 items-center';

// Seçilebilir ürün satırı (varyantsız ürün ya da varyant)
const ItemRow = ({ item, parent, row }) => {
  const selected = row.isSelected(item);
  const variant = Boolean(parent);
  return (
    <div className={`${COLS} px-3 md:px-4 py-3 ${variant ? 'bg-gray-50/70' : ''} ${selected ? '!bg-indigo-50/60' : 'hover:bg-gray-50/80'}`}>
      <Check item={item} row={row} />
      <div className="flex items-center gap-3 min-w-0">
        {variant ? <span className="w-12 shrink-0 hidden md:block" /> : <Thumb item={item} onClick={() => row.open(item)} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {variant
              ? <p className="text-sm font-bold text-gray-900 truncate">{item.variantLabel || item.sku}</p>
              : <button type="button" onClick={() => row.open(item)} className="text-sm font-bold text-gray-900 hover:text-indigo-600 truncate text-left">{item.name}</button>}
            <InCart qty={row.inCart(item)} unit={item.unit} />
            {!variant && <Fav item={item} row={row} />}
          </div>
          <p className="text-xs text-gray-500 truncate">{meta(item, !variant)}</p>
          {/* Telefonda stok ve fiyat ürün bilgisinin altında */}
          <div className="md:hidden mt-1.5 flex items-center justify-between gap-3"><Stock item={item} /><Price item={item} /></div>
        </div>
      </div>
      <div className="hidden md:block"><Stock item={item} /></div>
      <div className="hidden md:block"><Price item={item} /></div>
      <div className="col-start-2 md:col-start-auto mt-2 md:mt-0 flex items-center gap-2">
        {item.inStock && !item.priceHidden ? <Qty item={item} row={row} /> : <span className="hidden md:block" />}
        <div className="md:hidden flex-1"><Action item={item} row={row} /></div>
      </div>
      <div className="hidden md:block"><Action item={item} row={row} /></div>
    </div>
  );
};

// Varyantlı ana ürün: satır + açılan seçenekler
const MasterRow = ({ product, row }) => {
  const [open, setOpen] = useState(false);
  const summary = variantSummary(product);
  const inCart = row.inCart(product);
  const toggle = (
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
      className={`h-9 w-full px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 border ${open ? 'bg-gray-900 border-gray-900 text-white' : 'border-indigo-200 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50'}`}>
      {t('{n} seçenek', { n: summary.count })} <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
  return (
    <div>
      <div className={`${COLS} px-3 md:px-4 py-3 hover:bg-gray-50/80`}>
        <span />
        <div className="flex items-center gap-3 min-w-0">
          <Thumb item={product} onClick={() => row.open(product)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <button type="button" onClick={() => row.open(product)} className="text-sm font-bold text-gray-900 hover:text-indigo-600 truncate text-left">{product.name}</button>
              <InCart qty={inCart} unit={product.unit} />
              <Fav item={product} row={row} />
            </div>
            <p className="text-xs text-gray-500 truncate">{[product.brand, product.options?.map((o) => o.name).join(' / ')].filter(Boolean).join(' · ')}</p>
            <div className="md:hidden mt-1.5 flex items-center justify-between gap-3"><Stock item={{ inStock: summary.inStock }} /><Price item={product} summary={summary} /></div>
          </div>
        </div>
        <div className="hidden md:block"><Stock item={{ inStock: summary.inStock }} /></div>
        <div className="hidden md:block"><Price item={product} summary={summary} /></div>
        <div className="col-start-2 md:col-start-auto md:col-span-2 mt-2 md:mt-0">{toggle}</div>
      </div>
      {open && <div className="border-t border-gray-100 divide-y divide-gray-100">{product.variants.map((v) => <ItemRow key={v.id} item={v} parent={product} row={row} />)}</div>}
    </div>
  );
};

const OrderTable = ({ items, row, allSelected, onToggleAll }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div className={`${COLS} list-head px-3 md:px-4 py-3 text-[11px] font-black uppercase tracking-wider`}>
      <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label={t('Tümünü seç')} className="h-4 w-4 rounded cursor-pointer" />
      <p>{t('Ürün')}</p>
      <p className="hidden md:block">{t('Stok')}</p>
      <p className="hidden md:block">{t('Net fiyat')} <span className="normal-case font-semibold tracking-normal opacity-70">{t('(KDV hariç)')}</span></p>
      <p className="hidden md:block">{t('Miktar')}</p>
      <p className="hidden md:block" />
    </div>
    <div className="divide-y divide-gray-100">
      {items.map((p) => (variantSummary(p) ? <MasterRow key={p.id} product={p} row={row} /> : <ItemRow key={p.id} item={p} row={row} />))}
    </div>
  </div>
);

export default OrderTable;
