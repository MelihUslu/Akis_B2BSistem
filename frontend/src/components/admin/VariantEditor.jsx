import { useState } from 'react';
import { Plus, Trash2, X, Wand2, Layers, AlertCircle } from 'lucide-react';
import { newKey, generateCombinations } from './variantForm';

/**
 * Admin varyant düzenleyici: özel özellikler (Gramaj, Ambalaj Türü, Uzunluk...) ve seçenekleri,
 * ardından her kombinasyon için SKU / barkod / fiyat / stok.
 */
const VariantEditor = ({ options, variants, onChange, masterSku, masterPrice, currency }) => {
  const [draftValues, setDraftValues] = useState({}); // optionKey -> yazılmakta olan seçenek

  const setOptions = (next) => {
    // Silinen seçeneklere bağlı varyant seçimleri temizlenir
    const valid = new Map(next.map(o => [o.key, new Set(o.values.map(v => v.key))]));
    const cleaned = variants.map(v => ({
      ...v,
      selections: Object.fromEntries(Object.entries(v.selections || {}).filter(([ok, vk]) => valid.get(ok)?.has(vk)))
    }));
    onChange(next, cleaned);
  };
  const setVariants = (next) => onChange(options, next);

  const addOption = () => setOptions([...options, { key: newKey('opt'), name: '', values: [] }]);
  const updateOption = (key, patch) => setOptions(options.map(o => (o.key === key ? { ...o, ...patch } : o)));
  const removeOption = (key) => setOptions(options.filter(o => o.key !== key));

  const addValues = (option) => {
    const raw = (draftValues[option.key] || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!raw.length) return;
    const existing = new Set(option.values.map(v => v.value.toLocaleLowerCase('tr-TR')));
    const fresh = raw.filter(v => !existing.has(v.toLocaleLowerCase('tr-TR'))).map(value => ({ key: newKey('val'), value }));
    updateOption(option.key, { values: [...option.values, ...fresh] });
    setDraftValues({ ...draftValues, [option.key]: '' });
  };
  const renameValue = (option, valueKey, value) =>
    updateOption(option.key, { values: option.values.map(v => (v.key === valueKey ? { ...v, value } : v)) });
  const removeValue = (option, valueKey) =>
    updateOption(option.key, { values: option.values.filter(v => v.key !== valueKey) });

  const updateVariant = (key, patch) => setVariants(variants.map(v => (v.key === key ? { ...v, ...patch } : v)));
  const setSelection = (variant, optionKey, valueKey) => updateVariant(variant.key, { selections: { ...variant.selections, [optionKey]: valueKey } });
  const addVariantRow = () => setVariants([...variants, { key: newKey('var'), selections: {}, variantName: '', sku: '', barcode: '', price: '', stock: 0, isActive: true }]);

  const hasOptions = options.length > 0;
  const comboCount = options.reduce((n, o) => n * Math.max(1, o.values.filter(v => v.value.trim()).length), hasOptions ? 1 : 0);

  return (
    <div className="space-y-8 animate-in fade-in">
      {/* 1. Özellikler */}
      <div className="space-y-4">
        <div className="flex justify-between items-end">
          <div>
            <h4 className="text-sm font-black text-gray-900 flex items-center"><Layers className="h-4 w-4 mr-2 text-brand-600" /> 1. Varyant Özellikleri</h4>
            <p className="text-[11px] font-semibold text-gray-400 mt-1">Ürüne özel özellik tanımlayın: Gramaj, Ambalaj Türü, Uzunluk, Renk... Seçenekleri virgülle ayırarak ekleyebilirsiniz.</p>
          </div>
          <button type="button" onClick={addOption} className="flex items-center px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 text-xs font-black hover:bg-brand-100">
            <Plus className="h-4 w-4 mr-1.5" /> Özellik Ekle
          </button>
        </div>

        {options.length === 0 && (
          <p className="text-center text-xs font-bold text-gray-300 uppercase tracking-widest py-6 border-2 border-dashed border-gray-100 rounded-3xl">
            Özellik tanımlanmadı — ürün tek tip satılır
          </p>
        )}

        {options.map((option) => (
          <div key={option.key} className="bg-gray-50/70 rounded-2xl p-5 space-y-3">
            <div className="flex gap-3 items-center">
              <input className="premium-input !bg-white font-bold" placeholder="Özellik adı (örn. Gramaj)" value={option.name}
                onChange={(e) => updateOption(option.key, { name: e.target.value })} />
              <button type="button" onClick={() => removeOption(option.key)} title="Özelliği sil" className="p-3 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {option.values.map((v) => (
                <span key={v.key} className="flex items-center bg-white border border-gray-200 rounded-xl pl-3 pr-1 py-1">
                  <input className="bg-transparent text-xs font-bold text-gray-800 outline-none" style={{ width: `${Math.max(3, v.value.length + 1)}ch` }}
                    value={v.value} onChange={(e) => renameValue(option, v.key, e.target.value)} />
                  <button type="button" onClick={() => removeValue(option, v.key)} className="p-1 text-gray-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              <div className="flex items-center">
                <input className="bg-white border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs font-semibold outline-none focus:border-brand-400 w-56"
                  placeholder="Seçenek ekle: 500 g, 1 kg, 5 kg"
                  value={draftValues[option.key] || ''}
                  onChange={(e) => setDraftValues({ ...draftValues, [option.key]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValues(option); } }}
                  onBlur={() => addValues(option)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 2. Varyantlar */}
      <div className="space-y-4">
        <div className="flex justify-between items-end gap-4">
          <div>
            <h4 className="text-sm font-black text-gray-900">2. Varyantlar ({variants.length})</h4>
            <p className="text-[11px] font-semibold text-gray-400 mt-1">
              Her varyantın kendi SKU, barkod ve stoğu vardır. Fiyat boşsa ana ürün fiyatı ({masterPrice || 0} {currency === 'TL' ? 'TRY' : currency}) kullanılır.
              MOQ, koli katsayısı, birim ve KDV ana üründen alınır.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {hasOptions && (
              <button type="button" onClick={() => setVariants(generateCombinations(options, variants, masterSku))}
                className="flex items-center px-4 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-black hover:bg-gray-800">
                <Wand2 className="h-4 w-4 mr-1.5" /> Kombinasyonları Oluştur ({comboCount})
              </button>
            )}
            <button type="button" onClick={addVariantRow} className="flex items-center px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 text-xs font-black hover:bg-brand-100">
              <Plus className="h-4 w-4 mr-1.5" /> Satır
            </button>
          </div>
        </div>

        {variants.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-gray-100">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] font-black text-gray-400 uppercase tracking-widest">
                <tr>
                  {hasOptions ? options.map(o => <th key={o.key} className="px-3 py-3 text-left">{o.name || 'Özellik'}</th>) : <th className="px-3 py-3 text-left">Varyant</th>}
                  <th className="px-3 py-3 text-left">SKU</th>
                  <th className="px-3 py-3 text-left">Barkod</th>
                  <th className="px-3 py-3 text-left">Fiyat</th>
                  <th className="px-3 py-3 text-left">Stok</th>
                  <th className="px-3 py-3 text-center">Aktif</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {variants.map((v) => {
                  const incomplete = hasOptions && options.some(o => !o.values.some(x => x.key === v.selections[o.key]));
                  return (
                    <tr key={v.key} className={v.isActive === false ? 'opacity-50' : ''}>
                      {hasOptions ? options.map(o => (
                        <td key={o.key} className="px-2 py-2">
                          <select className={`premium-input !py-2 !text-xs min-w-[7rem] ${incomplete && !v.selections[o.key] ? '!ring-2 !ring-red-200' : ''}`}
                            value={v.selections[o.key] || ''} onChange={(e) => setSelection(v, o.key, e.target.value)}>
                            <option value="">Seçin</option>
                            {o.values.filter(x => x.value.trim()).map(x => <option key={x.key} value={x.key}>{x.value}</option>)}
                          </select>
                        </td>
                      )) : (
                        <td className="px-2 py-2"><input className="premium-input !py-2 !text-xs" placeholder="Mavi / XL" value={v.variantName || ''} onChange={(e) => updateVariant(v.key, { variantName: e.target.value })} /></td>
                      )}
                      <td className="px-2 py-2"><input className="premium-input !py-2 !text-xs font-mono min-w-[9rem]" value={v.sku} onChange={(e) => updateVariant(v.key, { sku: e.target.value })} /></td>
                      <td className="px-2 py-2"><input className="premium-input !py-2 !text-xs font-mono min-w-[8rem]" value={v.barcode} onChange={(e) => updateVariant(v.key, { barcode: e.target.value })} /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" className="premium-input !py-2 !text-xs w-24" placeholder={String(masterPrice || '')} value={v.price} onChange={(e) => updateVariant(v.key, { price: e.target.value })} /></td>
                      <td className="px-2 py-2"><input type="number" className="premium-input !py-2 !text-xs w-20" value={v.stock} onChange={(e) => updateVariant(v.key, { stock: e.target.value })} /></td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" className="h-4 w-4" checked={v.isActive !== false} onChange={(e) => updateVariant(v.key, { isActive: e.target.checked })} />
                      </td>
                      <td className="px-2 py-2">
                        <button type="button" onClick={() => setVariants(variants.filter(x => x.key !== v.key))} title={v.id ? 'Sipariş geçmişi varsa pasife alınır' : 'Kaldır'} className="p-2 text-gray-300 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {variants.some(v => v.id) && (
          <p className="text-[11px] font-semibold text-gray-400 flex items-center"><AlertCircle className="h-3 w-3 mr-1" /> Kayıtlı bir varyantı silerseniz, sipariş geçmişi varsa silinmez; pasife alınır.</p>
        )}
      </div>
    </div>
  );
};

export default VariantEditor;
