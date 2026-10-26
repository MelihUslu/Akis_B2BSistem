import React, { useEffect, useState } from 'react';
import { Plus, Save, RefreshCw, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';

const EMPTY = { code: '', name: '', description: '', priceMonthly: '', priceYearly: '', maxDealers: '', maxProducts: '', maxAdmins: '', trialDays: 14, sortOrder: 0, isActive: true, isPublic: true, allowCustomDomain: false };
const NUM_FIELDS = [
  ['priceMonthly', 'Aylık Fiyat (₺)'], ['priceYearly', 'Yıllık Fiyat (₺)'], ['maxDealers', 'Maks. Bayi (-1 sınırsız)'],
  ['maxProducts', 'Maks. Ürün'], ['maxAdmins', 'Maks. Yönetici'], ['trialDays', 'Deneme (gün)'], ['sortOrder', 'Sıra']
];

const PlanCard = ({ plan, iyzicoEnabled, onSaved, showAlert }) => {
  const [form, setForm] = useState(plan);
  const isNew = !plan.id;

  const save = async () => {
    try {
      if (isNew) await platformApi.post('/plans', form);
      else await platformApi.patch(`/plans/${plan.id}`, form);
      showAlert({ type: 'success', title: 'Kaydedildi', message: `${form.name} paketi kaydedildi.${!isNew && (form.priceMonthly != plan.priceMonthly || form.priceYearly != plan.priceYearly) ? ' Fiyat değiştiği için iyzico ile tekrar senkronize edin.' : ''}` });
      onSaved();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Paket kaydedilemedi.') });
    }
  };

  const sync = async () => {
    try {
      const res = await platformApi.post(`/plans/${plan.id}/sync-iyzico`);
      showAlert({ type: 'success', title: 'Senkronize Edildi', message: res.data.message });
      onSaved();
    } catch (err) {
      showAlert({ type: 'error', title: 'iyzico', message: errorMessage(err, 'Senkronizasyon başarısız.') });
    }
  };

  const synced = plan.iyzicoMonthlyPlanRef && plan.iyzicoYearlyPlanRef;

  return (
    <div className="card-premium p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{isNew ? 'Yeni Paket' : `${plan.code} · ${plan._count?.tenants || 0} müşteri`}</p>
          <h3 className="modal-title">{form.name || '—'}</h3>
        </div>
        {!isNew && (
          <span className={`flex items-center text-[10px] font-black uppercase ${synced ? 'text-emerald-600' : 'text-amber-600'}`}>
            {synced ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : <AlertCircle className="h-3.5 w-3.5 mr-1" />} {synced ? 'iyzico hazır' : 'iyzico yok'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {isNew && <div><label className="premium-label">Kod</label><input className="premium-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="PRO" /></div>}
        <div className={isNew ? '' : 'col-span-2'}><label className="premium-label">Ad</label><input className="premium-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="col-span-2"><label className="premium-label">Açıklama</label><input className="premium-input" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        {NUM_FIELDS.map(([k, label]) => (
          <div key={k}><label className="premium-label">{label}</label><input type="number" step="any" className="premium-input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="flex gap-4 text-sm font-bold text-gray-600">
        <label className="flex items-center cursor-pointer"><input type="checkbox" className="mr-2" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Aktif</label>
        <label className="flex items-center cursor-pointer"><input type="checkbox" className="mr-2" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> Kayıt sayfasında göster</label>
        <label className="flex items-center cursor-pointer"><input type="checkbox" className="mr-2" checked={Boolean(form.allowCustomDomain)} onChange={(e) => setForm({ ...form, allowCustomDomain: e.target.checked })} /> Özel alan adı (b2b.firmasi.com)</label>
      </div>
      <div className="flex gap-3">
        <button onClick={save} className="flex-1 btn-gradient"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
        {!isNew && iyzicoEnabled && !synced && (
          <button onClick={sync} className="flex items-center px-4 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest"><RefreshCw className="h-4 w-4 mr-2" /> iyzico</button>
        )}
      </div>
    </div>
  );
};

const PlatformPlans = () => {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const { alertElement, showAlert } = useAlert();

  const load = () => platformApi.get('/plans').then((res) => setData(res.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!data) return <div className="text-center text-gray-400 py-20">Yükleniyor...</div>;

  return (
    <div className="space-y-8">
      {alertElement}
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-violet-500 to-violet-700 p-3.5 rounded-2xl shadow-lg shadow-violet-500/25 shrink-0"><Layers className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Paketler</h1>
          <p className="text-gray-500 text-sm mt-1">
            Fiyatlar KDV dahil. {data.iyzicoEnabled ? 'iyzico bağlı: online satış için her paketi senkronize edin.' : 'iyzico anahtarları tanımlı değil; ödemeler manuel işlenir.'}
          </p>
        </div>
      </div>
        <button onClick={() => setAdding(true)} className="btn-gradient"><Plus className="h-4 w-4 mr-2" /> Paket Ekle</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {adding && <PlanCard plan={EMPTY} iyzicoEnabled={data.iyzicoEnabled} onSaved={() => { setAdding(false); load(); }} showAlert={showAlert} />}
        {data.plans.map((p) => <PlanCard key={`${p.id}-${p.updatedAt}`} plan={p} iyzicoEnabled={data.iyzicoEnabled} onSaved={load} showAlert={showAlert} />)}
      </div>
    </div>
  );
};

export default PlatformPlans;
