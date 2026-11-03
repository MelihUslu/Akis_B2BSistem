import { useEffect, useState } from 'react';
import { TicketPercent, Plus, Trash2, Save } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatTRY, formatDate } from '../../utils/format';
import ModalHeader from '../../components/shared/ModalHeader';

const EMPTY = { code: '', description: '', type: 'PERCENT', value: '', minSubtotal: '', startsAt: '', endsAt: '', maxUses: '', scope: 'ALL', companyId: '', dealerGroup: 'GOLD', isActive: true };

const toForm = (c) => ({
  ...EMPTY, ...c,
  startsAt: c.startsAt?.slice(0, 10) || '', endsAt: c.endsAt?.slice(0, 10) || '',
  maxUses: c.maxUses ?? '', minSubtotal: c.minSubtotal || '',
  scope: c.companyId ? 'COMPANY' : c.dealerGroup ? 'GROUP' : 'ALL',
  companyId: c.companyId || '', dealerGroup: c.dealerGroup || 'GOLD'
});

const CouponManagement = () => {
  const [coupons, setCoupons] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [editing, setEditing] = useState(null); // form | null
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => api.get('/coupons').then((res) => setCoupons(res.data)).catch(() => {});
  useEffect(() => { load(); api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {}); }, []);

  const save = async (e) => {
    e.preventDefault();
    const body = {
      ...editing,
      companyId: editing.scope === 'COMPANY' ? editing.companyId : null,
      dealerGroup: editing.scope === 'GROUP' ? editing.dealerGroup : null
    };
    try {
      const res = editing.id ? await api.patch(`/coupons/${editing.id}`, body) : await api.post('/coupons', body);
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
      setEditing(null);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kupon kaydedilemedi.') });
    }
  };

  const remove = async (c) => {
    const ok = await confirm({ title: `${c.code} silinsin mi?`, message: 'Siparişlerde kullanılmışsa silinmez, pasife alınır.', confirmText: 'Sil' });
    if (!ok) return;
    const res = await api.delete(`/coupons/${c.id}`);
    showAlert({ type: 'info', title: 'Kupon', message: res.data.message });
    load();
  };

  const set = (k) => (e) => setEditing({ ...editing, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const scopeText = (c) => (c.company ? c.company.name : c.dealerGroup ? `${c.dealerGroup} grubu` : 'Tüm bayiler');

  return (
    <div className="space-y-6">
      {alertElement}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setEditing(null)} />
          <form onSubmit={save} className="modal-panel w-full max-w-lg max-h-[92vh] flex flex-col">
            <ModalHeader icon={TicketPercent} title={editing.id ? 'Kuponu Düzenle' : 'Yeni Kupon'} onClose={() => setEditing(null)} />
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="premium-label">Kod</label><input required className="premium-input font-mono uppercase" value={editing.code} onChange={set('code')} placeholder="BAHAR10" /></div>
                <div><label className="premium-label">Tür</label>
                  <select className="premium-input" value={editing.type} onChange={set('type')}><option value="PERCENT">Yüzde (%)</option><option value="AMOUNT">Tutar (₺)</option></select>
                </div>
                <div><label className="premium-label">{editing.type === 'PERCENT' ? 'İndirim (%)' : 'İndirim (₺)'}</label><input required type="number" step="0.01" min="0" className="premium-input" value={editing.value} onChange={set('value')} /></div>
                <div><label className="premium-label">Min. Sepet (₺, KDV hariç)</label><input type="number" step="0.01" min="0" className="premium-input" value={editing.minSubtotal} onChange={set('minSubtotal')} /></div>
                <div><label className="premium-label">Başlangıç</label><input type="date" className="premium-input" value={editing.startsAt} onChange={set('startsAt')} /></div>
                <div><label className="premium-label">Bitiş</label><input type="date" className="premium-input" value={editing.endsAt} onChange={set('endsAt')} /></div>
                <div><label className="premium-label">Toplam Kullanım Sınırı</label><input type="number" min="1" className="premium-input" value={editing.maxUses} onChange={set('maxUses')} placeholder="Sınırsız" /></div>
                <div><label className="premium-label">Kimler Kullanabilir</label>
                  <select className="premium-input" value={editing.scope} onChange={set('scope')}><option value="ALL">Tüm bayiler</option><option value="GROUP">Bayi grubu</option><option value="COMPANY">Belirli bayi</option></select>
                </div>
                {editing.scope === 'GROUP' && (
                  <div className="col-span-2"><label className="premium-label">Grup</label>
                    <select className="premium-input" value={editing.dealerGroup} onChange={set('dealerGroup')}>{['STANDART', 'GOLD', 'VIP'].map(g => <option key={g}>{g}</option>)}</select>
                  </div>
                )}
                {editing.scope === 'COMPANY' && (
                  <div className="col-span-2"><label className="premium-label">Bayi</label>
                    <select required className="premium-input" value={editing.companyId} onChange={set('companyId')}><option value="">Seçin</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </div>
                )}
                <div className="col-span-2"><label className="premium-label">Açıklama</label><input className="premium-input" value={editing.description || ''} onChange={set('description')} placeholder="Bayiye gösterilir: Bahar kampanyası" /></div>
              </div>
              <label className="flex items-center text-sm font-bold text-gray-700"><input type="checkbox" className="mr-2 h-4 w-4" checked={editing.isActive} onChange={set('isActive')} /> Aktif</label>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="btn-secondary flex-1">Vazgeç</button>
              <button type="submit" className="flex-1 btn-gradient"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-4">
          <div className="page-icon"><TicketPercent className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Kampanyalar & Kuponlar</h1>
            <p className="text-gray-500 text-sm mt-1">Bayilerin sipariş özetinde gireceği indirim kodları. Ürüne özel fiyatlar için ürün düzenleme ekranındaki "Özel Fiyatlar" sekmesini kullanın.</p>
          </div>
        </div>
        </div>
        <button onClick={() => setEditing({ ...EMPTY })} className="btn-gradient"><Plus className="h-4 w-4 mr-2" /> Yeni Kupon</button>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="list-head">
            <tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
              <th className="px-6 py-4">Kod</th><th className="px-6 py-4">İndirim</th><th className="px-6 py-4">Kapsam</th>
              <th className="px-6 py-4">Geçerlilik</th><th className="px-6 py-4">Kullanım</th><th className="px-6 py-4">Durum</th><th />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/70">
            {coupons.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6] cursor-pointer" onClick={() => setEditing(toForm(c))}>
                <td className="px-6 py-4"><span className="font-mono font-black text-gray-900">{c.code}</span>{c.description && <p className="text-[11px] text-gray-400">{c.description}</p>}</td>
                <td className="px-6 py-4 font-bold">{c.type === 'PERCENT' ? `%${c.value}` : formatTRY(c.value)}{c.minSubtotal > 0 && <span className="block text-[11px] text-gray-400 font-semibold">min. {formatTRY(c.minSubtotal)}</span>}</td>
                <td className="px-6 py-4 text-gray-600">{scopeText(c)}</td>
                <td className="px-6 py-4 text-gray-600">{c.startsAt || c.endsAt ? `${c.startsAt ? formatDate(c.startsAt) : '…'} – ${c.endsAt ? formatDate(c.endsAt) : '…'}` : 'Süresiz'}</td>
                <td className="px-6 py-4 font-bold">{c.usedCount}{c.maxUses !== null && ` / ${c.maxUses}`}</td>
                <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>{c.isActive ? 'Aktif' : 'Pasif'}</span></td>
                <td className="px-6 py-4 text-right"><button onClick={(e) => { e.stopPropagation(); remove(c); }} className="p-2 text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {coupons.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400 font-bold">Henüz kupon yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CouponManagement;
