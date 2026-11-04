import { useState } from 'react';
import { Trash2, Check, Replace, AlertTriangle, Info, XCircle, Lock, RotateCcw, Package } from 'lucide-react';
import ProductPicker from './ProductPicker';
import { formatTRY } from '../../utils/format';
import { MATCH_STATUS } from '../../utils/quote';

// Seçilen ürünle kalemi günceller: önceki ürün alternatiflere eklenir ki geri dönülebilsin
const withProduct = (line, productId) => ({
  ...line,
  productId,
  matchStatus: line.requestText ? 'MATCHED' : 'MANUAL',
  matchReason: line.requestText ? 'Kullanıcı seçti.' : null,
  warnings: [],
  manualPrice: false,
  unitPrice: null,
  alternatives: [...new Set([line.productId, ...(line.alternatives || [])].filter((id) => id && id !== productId))]
});

const num = (v) => (v === '' ? '' : Number(v));

/**
 * Teklif kalemleri. Hesaplanan değerler (calc) her değişiklikten sonra backend'den gelir;
 * burada yalnızca kullanıcının girdikleri (ürün, miktar, iskonto, elle fiyat) tutulur.
 */
const QuoteLines = ({ lines, calc, canPrice, companyId, onChange, disabled }) => {
  const [picking, setPicking] = useState(null); // satır anahtarı

  const update = (key, patch) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key) => onChange(lines.filter((l) => l.key !== key));

  if (!lines.length) {
    return <div className="text-center py-10 rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400">Henüz kalem yok. Yapay zekâ ile taslak hazırlayın veya aşağıdan ürün ekleyin.</div>;
  }

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => {
        const c = calc?.[idx] || {};
        const status = MATCH_STATUS[line.productId ? line.matchStatus : 'UNMATCHED'] || MATCH_STATUS.MANUAL;
        const alternatives = c.alternativeProducts || [];
        const showPicker = !line.productId || picking === line.key;
        return (
          <div key={line.key} className={`rounded-2xl bg-white p-4 space-y-3 ring-1 ${!line.productId ? 'ring-red-200' : line.matchStatus === 'REVIEW' ? 'ring-amber-200' : 'ring-gray-100'}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xs font-black text-gray-300 w-5 shrink-0">{idx + 1}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-black uppercase ring-1 ${status.className}`}>{status.label}</span>
                  {line.productId ? (
                    <span className="font-bold text-gray-900 break-words">{c.name || '…'}</span>
                  ) : (
                    <span className="font-bold text-red-600">Katalogda eşleşmedi</span>
                  )}
                </div>
                {line.productId && <p className="text-[11px] text-gray-500 break-words">{[c.variantLabel, c.sku, c.packInfo && `Paket: ${c.packInfo}`].filter(Boolean).join(' · ')}</p>}
                {line.requestText && <p className="text-[11px] text-gray-500"><span className="font-bold text-gray-400">Talep:</span> “{line.requestText}”</p>}
                {line.matchReason && <p className="text-[11px] text-gray-500"><span className="font-bold text-gray-400">Gerekçe:</span> {line.matchReason}</p>}
                {(line.warnings || []).map((w, i) => <p key={`w${i}`} className="flex items-start text-[11px] font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5 mr-1 shrink-0" />{w}</p>)}
                {(c.notices || []).map((w, i) => <p key={`n${i}`} className="flex items-start text-[11px] font-semibold text-sky-700"><Info className="h-3.5 w-3.5 mr-1 shrink-0" />{w}</p>)}
                {(c.errors || []).map((w, i) => <p key={`e${i}`} className="flex items-start text-[11px] font-semibold text-red-600"><XCircle className="h-3.5 w-3.5 mr-1 shrink-0" />{w}</p>)}
              </div>
              {!disabled && (
                <div className="flex items-center gap-1 shrink-0">
                  {line.productId && line.matchStatus === 'REVIEW' && (
                    <button type="button" title="Öneriyi onayla" onClick={() => update(line.key, { matchStatus: 'MATCHED', warnings: [] })}
                      className="flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><Check className="h-3.5 w-3.5 mr-1" /> Onayla</button>
                  )}
                  {line.productId && <button type="button" title="Başka ürün seç" onClick={() => setPicking(picking === line.key ? null : line.key)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Replace className="h-4 w-4" /></button>}
                  <button type="button" title="Kalemi çıkar" onClick={() => remove(line.key)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>

            {!disabled && (showPicker || alternatives.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pl-8">
                {showPicker && <ProductPicker companyId={companyId} autoFocus={Boolean(line.productId)} placeholder={line.productId ? 'Yerine konacak ürünü ara' : 'Bu talep için ürün ara ve seç'} onPick={(p) => { update(line.key, withProduct(line, p.id)); setPicking(null); }} />}
                {alternatives.length > 0 && (
                  <select className="premium-input !bg-white" value="" onChange={(e) => e.target.value && update(line.key, withProduct(line, parseInt(e.target.value)))}>
                    <option value="">{line.productId ? `Alternatif seç (${alternatives.length})` : `Önerilen adaylar (${alternatives.length})`}</option>
                    {alternatives.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}{a.variantLabel ? ` · ${a.variantLabel}` : ''} ({a.sku}) — {a.unitPrice !== null ? formatTRY(a.unitPrice) : 'fiyat yok'} · stok {a.stock}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {line.productId && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 pl-8 items-end">
                <div>
                  <label className="premium-label">Miktar</label>
                  <div className="relative">
                    <input type="number" min="0" step="1" disabled={disabled} className="premium-input !py-2 !pr-14" value={line.quantity}
                      onChange={(e) => update(line.key, { quantity: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">{c.unit}</span>
                  </div>
                </div>
                <div>
                  <p className="premium-label">Müşteri fiyatı</p>
                  <p className="h-10 flex items-center text-sm font-bold text-gray-700">{c.basePrice !== null && c.basePrice !== undefined ? formatTRY(c.basePrice) : '—'}</p>
                </div>
                <div>
                  <label className="premium-label flex items-center">İskonto {!canPrice && <Lock className="h-3 w-3 ml-1 text-gray-300" />}</label>
                  <div className="relative">
                    <input type="number" min="0" max="100" step="0.5" className="premium-input !py-2 !pr-8" disabled={disabled || !canPrice || line.manualPrice}
                      title={!canPrice ? 'Teklifte iskonto yetkiniz yok' : undefined}
                      value={line.manualPrice ? (c.discountRate ?? 0) : line.discountRate} onChange={(e) => update(line.key, { discountRate: num(e.target.value) })} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">%</span>
                  </div>
                </div>
                <div>
                  <label className="premium-label flex items-center justify-between">
                    <span className="flex items-center">Net birim {!canPrice && <Lock className="h-3 w-3 ml-1 text-gray-300" />}</span>
                    {line.manualPrice && !disabled && <button type="button" title="Sistem fiyatına dön" onClick={() => update(line.key, { manualPrice: false, unitPrice: null })} className="text-brand-500"><RotateCcw className="h-3 w-3" /></button>}
                  </label>
                  {line.manualPrice ? (
                    <input type="number" min="0" step="0.01" className="premium-input !py-2 ring-2 ring-amber-200" disabled={disabled || !canPrice} value={line.unitPrice ?? ''}
                      onChange={(e) => update(line.key, { unitPrice: num(e.target.value) })} />
                  ) : (
                    <button type="button" disabled={disabled || !canPrice} title={canPrice ? 'Fiyatı elle girmek için tıklayın' : 'Elle fiyat yetkiniz yok'}
                      onClick={() => update(line.key, { manualPrice: true, unitPrice: c.unitPrice ?? c.basePrice ?? 0 })}
                      className="h-10 w-full text-left px-3 rounded-xl text-sm font-black text-gray-900 hover:bg-gray-50 disabled:hover:bg-transparent">
                      {c.unitPrice !== null && c.unitPrice !== undefined ? formatTRY(c.unitPrice) : '—'}
                    </button>
                  )}
                </div>
                <div>
                  <p className="premium-label">KDV</p>
                  <p className="h-10 flex items-center text-sm text-gray-600">{c.vatRate !== null && c.vatRate !== undefined ? `%${c.vatRate}` : '—'}</p>
                </div>
                <div>
                  <p className="premium-label">Stok</p>
                  <p className={`h-10 flex items-center text-sm font-bold ${c.stock >= (Number(line.quantity) || 0) ? 'text-emerald-600' : 'text-red-500'}`}><Package className="h-3.5 w-3.5 mr-1" />{c.stock ?? '—'}</p>
                </div>
                <div className="text-right col-span-2 sm:col-span-1">
                  <p className="premium-label">Tutar</p>
                  <p className="h-10 flex items-center justify-end text-base font-black text-gray-900">{formatTRY(c.lineTotal)}</p>
                  {c.belowCost && <p className="text-[11px] font-black text-red-500 -mt-1">Maliyetin altında</p>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QuoteLines;
