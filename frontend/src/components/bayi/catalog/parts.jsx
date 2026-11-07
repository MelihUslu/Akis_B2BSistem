import { Minus, Plus, Package, ShoppingCart, BellRing, BellOff, FileText, Heart } from 'lucide-react';
import { formatTRY, firstImage } from '../../../utils/format';
import { canSelect } from '../../../utils/catalog';
import { t } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import { dealerCan } from '../../../utils/permissions';

// Katalog tablosu ve kartlarının ortak parçaları (stok, fiyat, miktar, işlem düğmesi…)
// row: { qtyOf, setQty, step, isSelected, toggle, add, open, favorite, stockAlert, inCart, quote, quoteOutOfStock }

export const Stock = ({ item }) => {
  const s = item.stock;
  const tone = !item.inStock ? ['bg-red-500', 'text-red-600 dark:text-red-400', t('Tükendi')]
    : s === 'Son 5 Ürün' ? ['bg-orange-500', 'text-orange-600 dark:text-orange-400', t('Son ürünler')]
    : ['bg-emerald-500', 'text-emerald-700 dark:text-emerald-400', s === '100+' || s === undefined ? t('Stokta') : t('{n} adet', { n: s })];
  return <span className={`inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap ${tone[1]}`}><span className={`h-2 w-2 rounded-full ${tone[0]}`} />{tone[2]}</span>;
};

export const Price = ({ item, summary, large }) => {
  const size = large ? 'text-lg' : 'text-[15px]';
  const { user } = useAuth();
  if (!dealerCan(user, 'PRICES')) return <p className="text-xs font-bold text-gray-500">{t('Fiyat gizli')}</p>; // bayi kullanıcı yetkisi
  if (summary) {
    return summary.minPrice !== null
      ? <p className={`${size} font-black text-gray-900 tabular-nums`}>{formatTRY(summary.minPrice)}<span className="text-xs font-semibold text-gray-400">{t("'den")}</span></p>
      : <p className="text-xs font-bold text-gray-500">{t('Teklif ile')}</p>;
  }
  if (item.priceHidden) return <p className="text-xs font-bold text-gray-500">{item.rateMissing ? t('Kur bekleniyor') : t('Teklif ile')}</p>;
  return (
    <div className="tabular-nums">
      <p className={`${size} font-black text-gray-900`}>{formatTRY(item.netPrice)}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {item.listPriceTRY > item.netPrice && <span className="text-[11px] text-gray-400 line-through">{formatTRY(item.listPriceTRY)}</span>}
        {item.hasSpecialPrice && <span className="text-[11px] font-black text-violet-600 dark:text-violet-400">{t('Özel fiyat')}</span>}
        {item.priceTiers?.length > 0 && (
          <span title={item.priceTiers.map((p) => `${p.minQty}+ ${item.unit}: ${formatTRY(p.price)}`).join('\n')} className="text-[11px] font-black text-brand-600 dark:text-brand-300 cursor-help underline decoration-dotted">{t('Kademeli')}</span>
        )}
      </div>
    </div>
  );
};

export const Thumb = ({ item, onClick, small }) => {
  const img = firstImage(item.images);
  return (
    <button type="button" onClick={onClick} className={`${small ? 'h-9 w-9' : 'h-12 w-12'} shrink-0 rounded-lg border border-gray-100 bg-white flex items-center justify-center overflow-hidden`} aria-label={item.name}>
      {img ? (
        <>
          <img src={img} alt="" loading="lazy" onError={(e) => e.currentTarget.classList.add('broken', 'hidden')} className="peer w-full h-full object-contain" />
          <Package className="hidden peer-[.broken]:block h-5 w-5 text-gray-300" />
        </>
      ) : <Package className="h-5 w-5 text-gray-300" />}
    </button>
  );
};

export const Qty = ({ item, row, wide }) => (
  <div className={`flex items-center h-9 w-full ${wide ? '' : 'max-w-[8.5rem]'} rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100`}>
    <button type="button" onClick={() => row.step(item, -1)} className="h-full px-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50" aria-label={t('Azalt')}><Minus className="h-3.5 w-3.5" /></button>
    <input type="number" inputMode="numeric" value={row.qtyOf(item)} aria-label={t('Miktar')}
      onFocus={(e) => e.currentTarget.select()} /* yazılan değer eskisinin yerine geçsin (1 → 12 olmasın) */
      onChange={(e) => row.setQty(item, e.target.value, false)} onBlur={(e) => row.setQty(item, e.target.value, true)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); row.add(item); } }}
      className="flex-1 min-w-0 h-full bg-transparent text-center text-sm font-bold text-gray-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
    <button type="button" onClick={() => row.step(item, 1)} className="h-full px-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50" aria-label={t('Artır')}><Plus className="h-3.5 w-3.5" /></button>
  </div>
);

export const Action = ({ item, row }) => {
  const base = 'h-9 w-full px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors';
  const { user } = useAuth();
  const noPrice = !dealerCan(user, 'PRICES'); // fiyat yetkisi yoksa sepet ve teklif de yok
  if (!item.inStock) {
    // Ayar açıksa stokta olmayan ürün için teklif istenir; "haber ver" yanında simge olarak kalır
    if (row.quoteOutOfStock && !noPrice) {
      return (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => row.quote(item)} className={`${base} flex-1 min-w-0 !px-2 !gap-1 bg-amber-500 text-white hover:bg-amber-600`}><FileText className="h-4 w-4" /> {t('Teklif iste')}</button>
          <button type="button" onClick={() => row.stockAlert(item)} title={item.hasStockAlert ? t('Takibi bırak') : t('Gelince haber ver')} aria-label={item.hasStockAlert ? t('Takibi bırak') : t('Gelince haber ver')}
            className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${item.hasStockAlert ? 'bg-emerald-50 text-emerald-700 dark:text-emerald-400' : 'border border-gray-200 text-gray-500 hover:text-brand-600'}`}>
            {item.hasStockAlert ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
          </button>
        </div>
      );
    }
    return item.hasStockAlert
      ? <button type="button" onClick={() => row.stockAlert(item)} className={`${base} bg-emerald-50 text-emerald-700 dark:text-emerald-400`}><BellOff className="h-4 w-4" /> {t('Takipte')}</button>
      : <button type="button" onClick={() => row.stockAlert(item)} className={`${base} border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-600`}><BellRing className="h-4 w-4" /> {t('Haber ver')}</button>;
  }
  if (noPrice) return <span className={`${base} text-gray-400 font-bold`}>{t('Fiyat yetkiniz yok')}</span>;
  if (item.priceHidden) return <button type="button" onClick={() => row.add(item)} className={`${base} bg-gray-900 text-white hover:bg-navy-950`}><FileText className="h-4 w-4" /> {t('Teklif iste')}</button>;
  return <button type="button" onClick={() => row.add(item)} className={`${base} bg-brand-600 text-white hover:bg-brand-700`}><ShoppingCart className="h-4 w-4" /> {t('Ekle')}</button>;
};

export const Check = ({ item, row }) => (
  canSelect(item)
    ? <input type="checkbox" checked={row.isSelected(item)} onChange={() => row.toggle(item)} aria-label={t('Seç')} className="h-4 w-4 rounded border-gray-300 accent-brand-600 cursor-pointer" />
    : <span />
);

export const InCart = ({ qty, unit }) => (qty > 0 ? <span className="shrink-0 px-1.5 py-0.5 rounded bg-brand-600 text-white text-[11px] font-black">{t('Sepette {n} {unit}', { n: qty, unit })}</span> : null);

export const Fav = ({ item, row }) => (
  <button type="button" onClick={() => row.favorite(item)} title={item.isFavorite ? t('Favorilerden çıkar') : t('Favorilere ekle')}
    className={`shrink-0 p-1 rounded ${item.isFavorite ? 'text-pink-500' : 'text-gray-300 hover:text-pink-500'}`}>
    <Heart className={`h-4 w-4 ${item.isFavorite ? 'fill-current' : ''}`} />
  </button>
);
