import { useEffect, useState } from 'react';
import { Link2, Plus, Save, X } from 'lucide-react';
import api, { errorMessage } from '../../services/api';

/**
 * Birlikte kullanılan ürünler (örn. bardak ↔ kapak, makine ↔ yedek parça). İlişki iki yönlüdür.
 * Teklif hazırlarken "uyumlu kapak" gibi talepler yalnızca burada tanımlı ilişkiyle doğrulanır;
 * tanım yoksa sistem uyumluluğu garanti etmez ve kullanıcıdan teyit ister.
 */
const CompatibleProductsEditor = ({ productId, products, showAlert }) => {
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState('');

  useEffect(() => {
    api.get(`/products/${productId}/compatible`).then((r) => setRows(r.data)).catch(() => setRows([]));
  }, [productId]);

  // Ürünler ve varyantları (SKU ile)
  const options = products.flatMap((p) => [
    { sku: p.sku, label: `${p.name} (${p.sku})`, id: p.id },
    ...(p.variants || []).map((v) => ({ sku: v.sku, label: `${p.name} · ${v.name !== p.name ? v.name : v.sku} (${v.sku})`, id: v.id }))
  ]).filter((o) => o.id !== productId);

  if (!rows) return <p className="text-sm text-gray-400 py-8 text-center">Yükleniyor...</p>;

  const add = () => {
    const o = options.find((x) => x.sku === pick);
    if (o && !rows.some((r) => r.sku === o.sku)) setRows([...rows, { id: o.id, sku: o.sku, name: o.label.replace(` (${o.sku})`, '') }]);
    setPick('');
  };

  const save = async () => {
    try {
      const res = await api.put(`/products/${productId}/compatible`, { skus: rows.map((r) => r.sku) });
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Uyumlu ürünler kaydedilemedi.') });
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in">
      <div>
        <h4 className="text-sm font-black text-gray-900 flex items-center"><Link2 className="h-4 w-4 mr-2 text-brand-600" /> Uyumlu Ürünler</h4>
        <p className="text-[11px] font-semibold text-gray-400 mt-1">
          Bu ürünle birlikte kullanılabilen ürünleri seçin (örn. bardağa uyan kapak). Ana ürüne eklenen ilişki tüm varyantlarına geçerlidir; yalnızca belirli bir varyant uyumluysa o varyantı seçin.
          Teklif asistanı uyumluluğu yalnızca bu listeye göre doğrular.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {rows.length === 0 && <p className="text-xs text-gray-400">Tanımlı uyumlu ürün yok.</p>}
        {rows.map((r) => (
          <span key={r.sku} className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-xl bg-brand-50 text-xs font-bold text-brand-700">
            {r.name} <span className="font-mono text-[11px] text-brand-400">{r.sku}</span>
            <button type="button" onClick={() => setRows(rows.filter((x) => x.sku !== r.sku))} className="p-0.5 rounded hover:bg-brand-100"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input list="compat-options" className="premium-input" placeholder="Ürün adı veya SKU yazıp seçin" value={pick} onChange={(e) => setPick(e.target.value)} />
        <datalist id="compat-options">
          {options.map((o) => <option key={o.sku} value={o.sku}>{o.label}</option>)}
        </datalist>
        <button type="button" onClick={add} disabled={!options.some((o) => o.sku === pick)} className="flex items-center px-4 rounded-xl text-xs font-black text-brand-700 bg-brand-50 hover:bg-brand-100 disabled:opacity-40 shrink-0"><Plus className="h-4 w-4 mr-1" /> Ekle</button>
      </div>
      <button type="button" onClick={save} className="btn-gradient"><Save className="h-4 w-4 mr-2" /> Uyumlu Ürünleri Kaydet</button>
    </div>
  );
};

export default CompatibleProductsEditor;
