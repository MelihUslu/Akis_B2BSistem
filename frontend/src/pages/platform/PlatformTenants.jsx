import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, X, ExternalLink, Building2 } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate } from '../../utils/format';
import { ROOT_DOMAIN_LABEL } from '../../utils/tenant';
import { StatusPill, TENANT_STATUS } from './shared';

const CreateTenantModal = ({ plans, onClose, onCreated }) => {
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', phone: '', taxNumber: '', planCode: plans[0]?.code || '', mode: 'TRIAL', trialDays: '', periodMonths: 12 });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await platformApi.post('/tenants', form);
      onCreated(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Müşteri oluşturulamadı.'));
    } finally {
      setSaving(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <form onSubmit={submit} className="modal-panel w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="modal-header items-center">
          <h3 className="modal-title">Yeni Müşteri</h3>
          <button type="button" onClick={onClose} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="premium-label">Firma Adı</label><input required className="premium-input" value={form.name} onChange={set('name')} /></div>
            <div className="col-span-2">
              <label className="premium-label">Portal Adresi (boşsa firma adından)</label>
              <div className="flex items-center bg-gray-50 rounded-2xl pr-4">
                <input className="premium-input !bg-transparent" value={form.slug} onChange={set('slug')} placeholder="firma" />
                <span className="text-sm font-bold text-gray-400">.{ROOT_DOMAIN_LABEL}</span>
              </div>
            </div>
            <div><label className="premium-label">Yönetici Ad Soyad</label><input required className="premium-input" value={form.adminName} onChange={set('adminName')} /></div>
            <div><label className="premium-label">Yönetici E-posta</label><input required type="email" className="premium-input" value={form.adminEmail} onChange={set('adminEmail')} /></div>
            <div><label className="premium-label">Telefon</label><input className="premium-input" value={form.phone} onChange={set('phone')} /></div>
            <div><label className="premium-label">Vergi No</label><input className="premium-input" value={form.taxNumber} onChange={set('taxNumber')} /></div>
            <div className="col-span-2">
              <label className="premium-label">Paket</label>
              <select className="premium-input" value={form.planCode} onChange={set('planCode')}>
                {plans.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="premium-label">Başlangıç</label>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                {[['TRIAL', 'Deneme ile başlat'], ['ACTIVE', 'Ödemesi alındı, aktif başlat']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, mode: v })} className={`flex-1 py-2 text-xs font-black rounded-lg ${form.mode === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>{l}</button>
                ))}
              </div>
            </div>
            {form.mode === 'TRIAL' ? (
              <div><label className="premium-label">Deneme süresi (gün, boşsa paketin)</label><input type="number" min="1" className="premium-input" value={form.trialDays} onChange={set('trialDays')} /></div>
            ) : (
              <div><label className="premium-label">Dönem</label>
                <select className="premium-input" value={form.periodMonths} onChange={set('periodMonths')}><option value={1}>1 ay</option><option value={12}>1 yıl</option></select>
              </div>
            )}
          </div>
          <p className="text-[11px] text-gray-400 font-semibold">Yönetici için güçlü bir şifre üretilip e-posta ile gönderilir.</p>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Vazgeç</button>
          <button type="submit" disabled={saving} className="flex-1 btn-gradient disabled:opacity-60">{saving ? 'Oluşturuluyor...' : 'Müşteriyi Oluştur'}</button>
        </div>
      </form>
    </div>
  );
};

const PlatformTenants = () => {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const { alertElement, showAlert } = useAlert();

  const load = () =>
    platformApi.get('/tenants', { params: { search: search || undefined, status: status || undefined } })
      .then((res) => setTenants(res.data)).catch(() => {});

  useEffect(() => { platformApi.get('/plans').then((res) => setPlans(res.data.plans)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search, status]);

  return (
    <div className="space-y-8">
      {alertElement}
      {creating && (
        <CreateTenantModal
          plans={plans.filter((p) => p.isActive)}
          onClose={() => setCreating(false)}
          onCreated={(data) => { setCreating(false); load(); showAlert({ type: data.message.includes('gönderilemedi') ? 'warning' : 'success', title: 'Müşteri Oluşturuldu', message: `${data.message} Adres: ${data.url}` }); }}
        />
      )}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div className="flex items-center gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-3.5 rounded-2xl shadow-lg shadow-blue-500/25 shrink-0"><Building2 className="h-6 w-6 text-white" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Müşteriler</h1>
          <p className="text-gray-500 text-sm mt-1">{tenants.length} müşteri</p>
        </div>
      </div>
        <div className="flex gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
            <input className="premium-input pl-11 w-64" placeholder="Firma, adres veya e-posta" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="premium-input w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tüm durumlar</option>
            {Object.entries(TENANT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={() => setCreating(true)} className="btn-gradient"><Plus className="h-4 w-4 mr-2" /> Yeni Müşteri</button>
        </div>
      </div>

      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="list-head">
            <tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
              <th className="px-6 py-4">Firma</th><th className="px-6 py-4">Paket</th><th className="px-6 py-4">Durum</th>
              <th className="px-6 py-4">Bitiş</th><th className="px-6 py-4 text-right">Bayi / Ürün / Sipariş</th><th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/70">
            {tenants.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_#3b82f6]">
                <td className="px-6 py-4">
                  <Link to={`/tenants/${t.id}`} className="font-bold text-gray-900 hover:text-indigo-600">{t.name}</Link>
                  <p className="text-[11px] text-gray-400 font-semibold">{t.slug} · {t.contactEmail}</p>
                </td>
                <td className="px-6 py-4 font-semibold text-gray-700">{t.plan.name} <span className="text-gray-400 text-xs">{t.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</span></td>
                <td className="px-6 py-4"><StatusPill status={t.status} access={t.access} /></td>
                <td className="px-6 py-4 text-gray-600 font-semibold">{formatDate(t.status === 'TRIAL' ? t.trialEndsAt : t.currentPeriodEnd)}</td>
                <td className="px-6 py-4 text-right font-bold text-gray-700">{t._count.companies} / {t._count.products} / {t._count.orders}</td>
                <td className="px-6 py-4 text-right">
                  <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-xs font-black text-indigo-600 hover:underline">Portal <ExternalLink className="h-3 w-3 ml-1" /></a>
                </td>
              </tr>
            ))}
            {tenants.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-400 font-bold">Müşteri bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlatformTenants;
