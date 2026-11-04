import { useEffect, useState } from 'react';
import { Warehouse, Plus, Star, Trash2, Pencil, Save, X, Hash, MapPin, Info } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Section, Field, IconInput } from '../form/FormKit';
import { PROVINCES } from '../../utils/turkey';

const EMPTY = { name: '', code: '', city: '' };

// Depolar: stok depo bazında tutulur; sipariş hangi depodan karşılanırsa stok oradan düşer
const WarehouseSettings = ({ showAlert, confirm }) => {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(null); // null | { ...EMPTY, id? }

  const load = () => api.get('/warehouses').then((r) => setList(r.data)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const run = async (fn, okTitle) => {
    try {
      const res = await fn();
      showAlert({ type: 'success', title: okTitle, message: res.data.message });
      load();
      return true;
    } catch (err) {
      showAlert({ type: 'error', title: 'Olmadı', message: errorMessage(err, 'İşlem başarısız.') });
      return false;
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const ok = await run(() => (form.id ? api.patch(`/warehouses/${form.id}`, form) : api.post('/warehouses', form)), form.id ? 'Güncellendi' : 'Depo eklendi');
    if (ok) setForm(null);
  };

  const remove = async (w) => {
    const ok = await confirm({
      type: 'warning', title: `“${w.name}” silinsin mi?`,
      message: list.length > 1 ? `Depodaki ${w.totalQuantity.toLocaleString('tr-TR')} adet stok varsayılan depoya taşınır.` : 'Son depo silinirse stok ürünlerde toplam olarak kalır ve depo takibi kapanır.',
      confirmText: 'Sil'
    });
    if (ok) run(() => api.delete(`/warehouses/${w.id}`), 'Silindi');
  };

  if (!list) return null;

  return (
    <div className="space-y-5 max-w-4xl">
      <Section icon={Warehouse} title="Depolar" description="Birden fazla deponuz varsa stok depo bazında tutulur. Bayi tüm depoların toplamını görür; sipariş onaylanırken hangi depodan karşılanacağı seçilir.">
        {list.length === 0 && (
          <p className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3"><Info className="h-4 w-4 shrink-0" /> Henüz depo yok; stok tek toplam olarak tutuluyor. İlk depoyu eklediğinizde mevcut tüm stoklar bu depoya aktarılır.</p>
        )}
        <div className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100 overflow-hidden">
          {list.map((w, i) => (
            <div key={w.id} className={`flex items-center gap-3 px-4 py-3 ${i % 2 ? 'bg-slate-50/70' : 'bg-white'}`}>
              <span className="font-mono text-xs font-black text-brand-700 bg-brand-50 px-2 py-1 rounded-lg w-14 text-center">{w.code}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">{w.name}{w.isDefault && <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-bold">Varsayılan</span>}</p>
                <p className="text-[11px] text-gray-400">{[w.city, `${w.productCount} ürün`, `${w.totalQuantity.toLocaleString('tr-TR')} adet`].filter(Boolean).join(' · ')}</p>
              </div>
              {!w.isDefault && <button onClick={() => run(() => api.patch(`/warehouses/${w.id}`, { isDefault: true }), 'Varsayılan depo değişti')} title="Varsayılan yap" className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50"><Star className="h-4 w-4" /></button>}
              <button onClick={() => setForm({ id: w.id, name: w.name, code: w.code, city: w.city || '' })} title="Düzenle" className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => remove(w)} title="Sil" className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {form ? (
          <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_8rem_12rem_auto] gap-3 items-end">
            <Field label="Depo adı" required><IconInput icon={Warehouse} required maxLength={60} autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Merkez depo" /></Field>
            <Field label="Kod" required><IconInput icon={Hash} required maxLength={12} className="font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="IST" /></Field>
            <Field label="İl">
              <IconInput as="select" icon={MapPin} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                <option value="">—</option>{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </IconInput>
            </Field>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="h-11 px-3 rounded-xl text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              <button className="h-11 px-4 rounded-xl bg-brand-600 text-white text-xs font-bold inline-flex items-center gap-1.5"><Save className="h-4 w-4" /> Kaydet</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setForm(EMPTY)} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-500 hover:border-brand-300 hover:text-brand-600">
            <Plus className="h-4 w-4" /> Depo ekle
          </button>
        )}
        <p className="text-[11px] text-gray-400">Excel ile toplu stok yüklerken “Depo” sütununa depo kodunu yazabilirsiniz; ERP de <code className="font-mono">{'{ sku, stock, warehouse: "IST" }'}</code> gönderebilir.</p>
      </Section>
    </div>
  );
};

export default WarehouseSettings;
