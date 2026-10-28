import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Tag } from 'lucide-react';
import api, { errorMessage } from '../../services/api';

const SCOPES = [
  { id: 'ALL', label: 'Tüm bayiler' },
  { id: 'GROUP', label: 'Bayi grubu' },
  { id: 'COMPANY', label: 'Belirli bayi' },
];

/**
 * Ürüne özel / kademeli fiyatlar. Öncelik: belirli bayi > bayi grubu > tüm bayiler.
 * Aynı kapsamda, sipariş miktarına uyan en yüksek "min. miktar" satırı geçerli olur.
 * Özel fiyat varsa bayinin net iskontosu ve miktar indirimi ayrıca uygulanmaz.
 */
const SpecialPriceEditor = ({ productId, currency, showAlert }) => {
  const [rows, setRows] = useState(null);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    Promise.all([api.get(`/products/${productId}/special-prices`), api.get('/companies', { params: { kind: 'DEALER,CUSTOMER' } })]).then(([p, c]) => {
      setCompanies(c.data);
      setRows(p.data.map(r => ({
        scope: r.companyId ? 'COMPANY' : r.dealerGroup ? 'GROUP' : 'ALL',
        companyId: r.companyId || '', dealerGroup: r.dealerGroup || 'GOLD', minQty: r.minQty, price: r.price
      })));
    }).catch(() => setRows([]));
  }, [productId]);

  if (!rows) return <p className="text-sm text-gray-400 py-8 text-center">Yükleniyor...</p>;

  const update = (i, patch) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (rows.some(r => r.scope === 'COMPANY' && !r.companyId)) {
      showAlert({ type: 'warning', title: 'Eksik Bilgi', message: 'Belirli bayi seçilen satırlarda bayiyi seçin.' });
      return;
    }
    try {
      const prices = rows.map(r => ({
        companyId: r.scope === 'COMPANY' ? r.companyId : null,
        dealerGroup: r.scope === 'GROUP' ? r.dealerGroup : null,
        minQty: r.minQty, price: r.price
      }));
      const res = await api.put(`/products/${productId}/special-prices`, { prices });
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Özel fiyatlar kaydedilemedi.') });
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in">
      <div>
        <h4 className="text-sm font-black text-gray-900 flex items-center"><Tag className="h-4 w-4 mr-2 text-emerald-600" /> Özel ve Kademeli Fiyatlar</h4>
        <p className="text-[11px] font-semibold text-gray-400 mt-1">
          Fiyatlar KDV hariç ve ürünün döviz cinsindendir ({currency === 'TL' ? 'TRY' : currency}). Öncelik: belirli bayi → bayi grubu → tüm bayiler.
          Kademeli fiyat için aynı kapsamda farklı minimum miktarlar girin (örn. 1+ = 100, 50+ = 90). Tüm varyantlara uygulanır.
        </p>
      </div>

      {rows.length === 0 && <p className="text-center text-xs font-bold text-gray-300 uppercase tracking-widest py-6 border-2 border-dashed border-gray-100 rounded-3xl">Özel fiyat yok — iskontolu liste fiyatı geçerli</p>}

      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-[10rem_minmax(0,1fr)_7rem_8rem_auto] gap-3 items-end bg-gray-50/70 p-4 rounded-2xl">
          <div>
            <label className="premium-label">Kapsam</label>
            <select className="premium-input !bg-white" value={r.scope} onChange={(e) => update(i, { scope: e.target.value })}>
              {SCOPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            {r.scope === 'COMPANY' && (<>
              <label className="premium-label">Bayi</label>
              <select className="premium-input !bg-white" value={r.companyId} onChange={(e) => update(i, { companyId: e.target.value })}>
                <option value="">Bayi seçin</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>)}
            {r.scope === 'GROUP' && (<>
              <label className="premium-label">Grup</label>
              <select className="premium-input !bg-white" value={r.dealerGroup} onChange={(e) => update(i, { dealerGroup: e.target.value })}>
                {['STANDART', 'GOLD', 'VIP'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </>)}
          </div>
          <div><label className="premium-label">Min. Miktar</label><input type="number" min="1" className="premium-input !bg-white" value={r.minQty} onChange={(e) => update(i, { minQty: e.target.value })} /></div>
          <div><label className="premium-label">Birim Fiyat</label><input type="number" step="0.01" min="0" className="premium-input !bg-white" value={r.price} onChange={(e) => update(i, { price: e.target.value })} /></div>
          <button type="button" onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="mb-2 p-2 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}

      <div className="flex gap-3">
        <button type="button" onClick={() => setRows([...rows, { scope: 'ALL', companyId: '', dealerGroup: 'GOLD', minQty: 1, price: '' }])}
          className="flex items-center px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest hover:bg-blue-100">
          <Plus className="h-4 w-4 mr-1.5" /> Fiyat Satırı
        </button>
        <button type="button" onClick={save} className="btn-gradient"><Save className="h-4 w-4 mr-2" /> Özel Fiyatları Kaydet</button>
      </div>
    </div>
  );
};

export default SpecialPriceEditor;
