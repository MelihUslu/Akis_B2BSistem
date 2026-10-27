import { useState } from 'react';
import { Package } from 'lucide-react';
import { firstImage, formatTRY } from '../../../utils/format';
import { variantSummary, canSelect, itemMeta } from '../../../utils/catalog';
import { Stock, Price, Qty, Action, Check, InCart, Fav } from './parts';
import { t } from '../../../i18n';

/**
 * Katalog kartları (geniş ekranda 4'lü). Tablo ile aynı işlevler: miktar + Enter ile ekleme, toplu seçim, favori, stok bildirimi.
 * Varyantlı üründe seçenek kartın içindeki listeden seçilir; seçilen varyant eklenir.
 */
const Image = ({ product, onClick }) => {
  const img = firstImage(product.images);
  return (
    <button type="button" onClick={onClick} className="block w-full aspect-[4/3] bg-gray-50 p-4" aria-label={product.name}>
      {img ? (
        <>
          <img src={img} alt="" loading="lazy" onError={(e) => e.currentTarget.classList.add('broken', 'hidden')} className="peer w-full h-full object-contain" />
          <Package className="hidden peer-[.broken]:block h-12 w-12 mx-auto text-gray-300" />
        </>
      ) : <Package className="h-12 w-12 mx-auto text-gray-300" />}
    </button>
  );
};

const Card = ({ product, row }) => {
  const summary = variantSummary(product);
  const variants = product.variants || [];
  // Varyantlı üründe varsayılan seçim: stoktaki ilk seçenek
  const [variantId, setVariantId] = useState(() => (summary ? (variants.find((v) => v.inStock) || variants[0])?.id : null));
  const item = summary ? variants.find((v) => v.id === variantId) || product : product;
  const selected = row.isSelected(item);

  return (
    <div className={`@container bg-white rounded-2xl border overflow-hidden flex flex-col transition-all ${selected ? 'border-indigo-500 ring-2 ring-indigo-500/30' : 'border-gray-200 hover:border-indigo-200 hover:shadow-lg hover:shadow-gray-200/60'}`}>
      <div className="relative">
        <Image product={product} onClick={() => row.open(product)} />
        {canSelect(item) && <div className="absolute top-3 left-3 h-6 w-6 rounded-md bg-white/90 shadow-sm flex items-center justify-center"><Check item={item} row={row} /></div>}
        <div className="absolute top-2 right-2 rounded-lg bg-white/90 shadow-sm"><Fav item={product} row={row} /></div>
        <div className="absolute bottom-2 left-3"><InCart qty={row.inCart(product)} unit={product.unit} /></div>
      </div>

      <div className="flex-1 flex flex-col p-4 gap-2">
        <p className="text-[11px] text-gray-400 truncate">
          {product.brand && <span className="font-bold text-indigo-600 dark:text-indigo-300">{product.brand}</span>}
          {product.brand && ' · '}{summary ? t('{n} seçenek', { n: summary.count }) : product.sku}
        </p>
        <button type="button" onClick={() => row.open(product)} className="text-left text-sm font-bold text-gray-900 leading-snug line-clamp-2 min-h-[2.5rem] hover:text-indigo-600">{product.name}</button>

        {summary && (
          <select value={variantId ?? ''} onChange={(e) => setVariantId(Number(e.target.value))} aria-label={t('Seçenek')}
            className="h-9 w-full px-2.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 outline-none focus:border-indigo-400 cursor-pointer">
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.variantLabel || v.sku}{v.priceHidden ? '' : ` — ${formatTRY(v.netPrice)}`}{v.inStock ? '' : ` (${t('Tükendi')})`}
              </option>
            ))}
          </select>
        )}

        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1 mt-auto pt-1">
          <Price item={item} large />
          <Stock item={item} />
        </div>
        {!summary && itemMeta(product, false) !== product.sku && (
          <p className="text-[11px] text-gray-500 truncate">{itemMeta(product, false).split(' · ').slice(1).join(' · ')}</p>
        )}

        {/* Kart yeterince genişse (≥ 15.5rem) miktar ve düğme yan yana, darsa alt alta */}
        <div className="flex flex-col @[15.5rem]:flex-row @[15.5rem]:items-center gap-2 pt-1">
          {canSelect(item) && <div className="flex-1 min-w-0"><Qty item={item} row={row} wide /></div>}
          <div className={canSelect(item) ? '@[15.5rem]:w-24 shrink-0' : 'flex-1'}><Action item={item} row={row} /></div>
        </div>
      </div>
    </div>
  );
};

const ProductGrid = ({ items, row }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
    {items.map((p) => <Card key={p.id} product={p} row={row} />)}
  </div>
);

export default ProductGrid;
