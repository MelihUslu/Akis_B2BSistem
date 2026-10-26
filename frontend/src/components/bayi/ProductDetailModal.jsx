import React, { useMemo, useState } from 'react';
import {
  ShoppingCart, Package, FileText, PlayCircle, Minus, Plus, X, BellRing, BellOff, Heart, FileSignature, Check, Layers
} from 'lucide-react';
import { formatTRY, normalizeQty } from '../../utils/format';
import { t } from '../../i18n';

const parseImages = (images) => {
  try { return JSON.parse(images || '[]'); } catch { return []; }
};

const youtubeEmbed = (url) => {
  const id = url?.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : null;
};

const STOCK_TEXT = { '100+': t('100+ stokta'), 'Son 5 Ürün': t('Son 5 ürün'), 'Tükendi': t('Tükendi') };

// Varsayılan seçim: stoktaki ilk varyant (yoksa ilk varyant)
const initialSelection = (product) => {
  const options = product.options || [];
  const first = (product.variants || []).find(v => v.inStock) || product.variants?.[0];
  if (!first || options.length === 0) return {};
  return Object.fromEntries(options.map(o => [o.id, o.values.find(v => first.optionValueIds?.includes(v.id))?.id]));
};

/**
 * Ürün detayı ve varyant seçimi. Admin'in tanımladığı her özellik (Gramaj, Ambalaj...) için seçenekler
 * gösterilir; seçim tamamlanınca o kombinasyonun fiyatı, stoğu ve SKU'su gelir.
 */
const ProductDetailModal = ({ product, rules, onClose, onAddToCart, onRequestQuote, onToggleFavorite, onToggleStockAlert, onOpenProduct }) => {
  const options = product.options || [];
  const variants = product.variants || [];
  const hasVariants = product.requiresVariant && variants.length > 0;
  const legacyVariants = hasVariants && options.length === 0; // Özellik tanımı olmayan eski tip varyantlar

  const [selections, setSelections] = useState(() => initialSelection(product));
  const [legacyId, setLegacyId] = useState(() => (legacyVariants ? (variants.find(v => v.inStock) || variants[0])?.id : null));
  const [qty, setQty] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [alerted, setAlerted] = useState({});

  const resolved = useMemo(() => {
    if (!hasVariants) return product;
    if (legacyVariants) return variants.find(v => v.id === legacyId) || null;
    if (options.some(o => !selections[o.id])) return null;
    return variants.find(v => options.every(o => v.optionValueIds?.includes(selections[o.id]))) || null;
  }, [hasVariants, legacyVariants, legacyId, selections, product]);

  // Bu seçenek, diğer seçimlerle birlikte var olan bir varyanta karşılık geliyor mu?
  const valueState = (optionId, valueId) => {
    const matches = variants.filter(v => v.optionValueIds?.includes(valueId) &&
      options.every(o => o.id === optionId || !selections[o.id] || v.optionValueIds.includes(selections[o.id])));
    return { exists: matches.length > 0, inStock: matches.some(v => v.inStock) };
  };

  const compatible = (sel) => variants.some(v => Object.values(sel).filter(Boolean).every(id => v.optionValueIds?.includes(id)));

  const select = (optionId, valueId) => {
    const value = selections[optionId] === valueId ? undefined : valueId;
    let next = { ...selections, [optionId]: value };
    // Yeni seçim diğerleriyle var olan bir varyant oluşturmuyorsa diğer seçimler sıfırlanır
    if (!compatible(next)) next = { [optionId]: value };
    setSelections(next);
    setQty(null);
  };

  const active = resolved || product;
  const images = parseImages(active.images).length ? parseImages(active.images) : parseImages(product.images);
  const quantity = qty ?? (active.moq || 1);
  const step = active.stepQuantity || 1;
  const canBuy = resolved && !resolved.priceHidden && resolved.inStock;
  const stockAlertOn = alerted[active.id] ?? active.hasStockAlert;

  const minPrice = hasVariants ? Math.min(...variants.filter(v => !v.priceHidden).map(v => v.netPrice)) : null;

  const toggleAlert = async () => {
    await onToggleStockAlert(active, stockAlertOn);
    setAlerted({ ...alerted, [active.id]: !stockAlertOn });
  };

  const quoteItem = () => ({
    productId: active.id, name: product.name, sku: active.sku, variantLabel: resolved?.variantLabel,
    quantity: normalizeQty(quantity, active), unit: active.unit
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel rounded-none md:rounded-[1.75rem] w-full max-w-5xl h-full md:h-auto md:max-h-[90vh] overflow-y-auto! md: flex flex-col md:flex-row">
        <div className="w-full md:w-1/2 bg-gray-50 p-6 md:p-10 flex flex-col relative md:border-r border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <span className="bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">{product.category?.name || t('Katalog Ürünü')}</span>
            <div className="flex gap-2">
              <button onClick={() => onToggleFavorite(product)} title={t('Favori')} className={`p-3 rounded-2xl transition-all shadow-sm ${product.isFavorite ? 'bg-pink-50 text-pink-500' : 'hover:bg-white text-gray-400 hover:text-pink-500'}`}>
                <Heart className={`h-5 w-5 ${product.isFavorite ? 'fill-current' : ''}`} />
              </button>
              <button onClick={onClose} className="p-3 hover:bg-white text-gray-400 hover:text-red-500 rounded-2xl transition-all shadow-sm"><X className="h-6 w-6" /></button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full aspect-square max-h-80 md:max-h-none bg-white rounded-[2rem] shadow-sm overflow-hidden border border-gray-100 p-8 flex items-center justify-center">
              {images[activeImage] ? <img src={images[activeImage]} className="w-full h-full object-contain" /> : <Package className="h-24 w-24 text-gray-100 mx-auto" />}
            </div>
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 mt-6 overflow-x-auto custom-scrollbar pb-1">
              {images.map((img, i) => (
                <button key={img + i} onClick={() => setActiveImage(i)} className={`w-16 h-16 rounded-xl overflow-hidden border-2 flex-shrink-0 bg-white ${i === activeImage ? 'border-indigo-500' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                  <img src={img} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-full md:w-1/2 p-6 md:p-10 md:overflow-y-auto custom-scrollbar flex flex-col justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter mb-2">{product.name}</h2>
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">{t('SKU:')} {active.sku}</span>
              {product.brand && <span className="text-gray-400 font-bold uppercase text-[10px] tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">{t('Marka:')} {product.brand}</span>}
              {resolved && hasVariants && <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg ${resolved.inStock ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>{STOCK_TEXT[resolved.stock] || `${resolved.stock} adet stokta`}</span>}
            </div>

            {/* Varyant seçimi */}
            {hasVariants && (
              <div className="space-y-5 mb-6">
                {legacyVariants ? (
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center"><Layers className="h-3.5 w-3.5 mr-1.5" /> {t('Seçenek')}</p>
                    <div className="flex flex-wrap gap-2">
                      {variants.map(v => (
                        <button key={v.id} onClick={() => { setLegacyId(v.id); setQty(null); }}
                          className={`px-4 py-2.5 rounded-xl text-xs font-black border-2 transition-all ${legacyId === v.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-100 text-gray-700 hover:border-indigo-200'} ${!v.inStock ? 'opacity-50 line-through' : ''}`}>
                          {v.name.replace(`${product.name} - `, '')}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : options.map(o => (
                  <div key={o.id}>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                      {o.name}{selections[o.id] && <span className="text-gray-900 normal-case tracking-normal">: {o.values.find(v => v.id === selections[o.id])?.value}</span>}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {o.values.map(v => {
                        const state = valueState(o.id, v.id);
                        const on = selections[o.id] === v.id;
                        return (
                          <button key={v.id} onClick={() => select(o.id, v.id)}
                            title={!state.exists ? t('Bu seçimle birlikte yok — diğer seçimler sıfırlanır') : !state.inStock ? t('Tükendi') : ''}
                            className={`relative px-4 py-2.5 rounded-xl text-xs font-black border-2 transition-all
                              ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-100 text-gray-700 hover:border-indigo-200'}
                              ${!state.exists ? 'opacity-40 border-dashed' : ''} ${state.exists && !state.inStock ? 'text-gray-400 line-through' : ''}`}>
                            {on && <Check className="h-3 w-3 inline mr-1" />}{v.value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!resolved && <p className="text-xs font-bold text-amber-600">{t('Lütfen tüm seçenekleri belirleyin.')}</p>}
              </div>
            )}

            <div className="bg-indigo-50/50 p-6 rounded-3xl mb-6 border border-indigo-50">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">
                {active.hasSpecialPrice ? t('Size Özel Fiyat') : t('Net İskontolu Fiyat')}
              </p>
              {active.priceHidden ? (
                <p className="text-xl font-black text-gray-500">{t('Bu ürün için teklif isteyin.')}</p>
              ) : !resolved && hasVariants ? (
                <p className="text-3xl font-black text-indigo-600 tracking-tighter">{formatTRY(minPrice)}<span className="text-sm text-indigo-400">{t("'den başlayan")}</span></p>
              ) : (
                <>
                  <p className="text-4xl md:text-5xl font-black text-indigo-600 tracking-tighter mb-2">{formatTRY(active.netPrice)}</p>
                  <p className="text-xs font-bold text-gray-500">
                    {active.listPriceTRY !== active.netPrice && <>{t('Liste:')} <span className="line-through text-gray-400">{formatTRY(active.listPriceTRY)}</span> · </>}
                    + KDV (%{active.vatRate})
                    {!['TRY', 'TL'].includes(active.currency) && <> · {active.price.toLocaleString('tr-TR')} {active.currency} TCMB kuruyla</>}
                  </p>
                  {active.priceTiers?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {active.priceTiers.map(tier => (
                        <span key={tier.minQty} className="text-[11px] font-black bg-white border border-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl">{tier.minQty}+ {active.unit}: {formatTRY(tier.price)}</span>
                      ))}
                    </div>
                  )}
                  {!active.hasSpecialPrice && rules?.qtyRate > 0 && (
                    <p className="text-xs font-black text-emerald-600 mt-2">{rules.qtyThreshold} {active.unit} ve üzeri alımda ekstra %{rules.qtyRate} indirim</p>
                  )}
                </>
              )}
            </div>

            {product.shortDesc && <p className="text-sm font-semibold text-gray-700 mb-4">{product.shortDesc}</p>}
            <div className="prose prose-sm text-gray-600 mb-6 whitespace-pre-wrap leading-relaxed">
              {product.longDesc || t('Detaylı açıklama bulunmuyor. Bu ürün hakkında daha fazla bilgi almak için satış temsilciniz ile görüşebilirsiniz.')}
            </div>

            {(product.pdfUrl || product.videoUrl) && (
              <div className="flex flex-wrap gap-3 mb-6">
                {product.pdfUrl && (
                  <a href={product.pdfUrl} target="_blank" rel="noreferrer" className="flex items-center px-5 py-3 bg-red-50 text-red-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-100">
                    <FileText className="h-4 w-4 mr-2" /> {t('PDF Teknik Katalog')}
                  </a>
                )}
                {product.videoUrl && !youtubeEmbed(product.videoUrl) && (
                  <a href={product.videoUrl} target="_blank" rel="noreferrer" className="flex items-center px-5 py-3 bg-gray-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-gray-800">
                    <PlayCircle className="h-4 w-4 mr-2" /> {t('Montaj / Tanıtım Videosu')}
                  </a>
                )}
              </div>
            )}
            {youtubeEmbed(product.videoUrl) && (
              <div className="aspect-video rounded-3xl overflow-hidden mb-6 border border-gray-100">
                <iframe src={youtubeEmbed(product.videoUrl)} title={t('Ürün videosu')} className="w-full h-full" allowFullScreen />
              </div>
            )}

            {!product.inStock && !hasVariants && product.alternatives?.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">{t('Stokta olmayan bu ürün yerine')}</p>
                <div className="space-y-2">
                  {product.alternatives.map(alt => (
                    <button key={alt.id} onClick={() => onOpenProduct(alt)} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-indigo-50 rounded-2xl border border-gray-100">
                      <span className="text-sm font-bold text-gray-800 text-left">{alt.name}</span>
                      <span className="text-sm font-black text-indigo-600">{alt.priceHidden ? '—' : formatTRY(alt.netPrice)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 p-5 md:p-6 rounded-3xl border border-gray-100 space-y-4 sticky bottom-0">
            <div className="flex justify-between items-center text-sm font-bold text-gray-500">
              <span>{t('Sipariş Miktarı')}</span>
              <span className="text-indigo-600 text-xs">{t('Min')} {active.moq || 1} {active.unit}{step > 1 ? ` · ${step}'in katları` : ''}</span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <div className="flex items-center bg-white rounded-2xl p-1.5 border border-gray-200 shadow-sm sm:w-1/3">
                <button onClick={() => setQty(Math.max(active.moq || 1, normalizeQty(quantity, active) - step))} className="p-3 text-gray-400 hover:text-indigo-600 rounded-xl"><Minus className="h-5 w-5" /></button>
                <input type="number" className="w-full bg-transparent text-center text-lg font-black outline-none text-gray-900" value={quantity}
                  onChange={(e) => setQty(e.target.value)} onBlur={(e) => setQty(normalizeQty(e.target.value, active))} />
                <button onClick={() => setQty(normalizeQty(quantity, active) + step)} className="p-3 text-gray-400 hover:text-indigo-600 rounded-xl"><Plus className="h-5 w-5" /></button>
              </div>

              {resolved && !resolved.inStock ? (
                <button onClick={toggleAlert} className="flex-1 bg-white border border-gray-200 text-gray-800 hover:border-indigo-300 hover:text-indigo-600 py-4 rounded-2xl text-sm font-black flex items-center justify-center uppercase tracking-widest">
                  {stockAlertOn ? <BellOff className="h-5 w-5 mr-3" /> : <BellRing className="h-5 w-5 mr-3" />}
                  {stockAlertOn ? t('Takibi Bırak') : t('Gelince Haber Ver')}
                </button>
              ) : (
                <button disabled={!canBuy} onClick={() => onAddToCart(product, resolved, normalizeQty(quantity, active))}
                  className="flex-1 bg-gray-900 text-white hover:bg-indigo-600 py-4 rounded-2xl text-sm font-black flex items-center justify-center shadow-xl shadow-gray-900/20 transition-all uppercase tracking-widest disabled:opacity-40 disabled:hover:bg-gray-900">
                  <ShoppingCart className="h-5 w-5 mr-3" /> {t('Sepete Ekle')}
                </button>
              )}
            </div>
            <button disabled={hasVariants && !resolved} onClick={() => onRequestQuote([quoteItem()])}
              className={`w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center disabled:opacity-40 ${active.priceHidden ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'}`}>
              <FileSignature className="h-4 w-4 mr-2" /> {active.priceHidden ? t('Fiyat Teklifi İste') : t('Toplu Alım İçin Teklif İste')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;
