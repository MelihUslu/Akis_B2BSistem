import { useEffect, useState } from 'react';
import { Settings, Percent, Coins, Users, Bell, Save, UserPlus, RefreshCw, Building2, ImagePlus } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { useTenant } from '../../context/TenantContext';
import TeamSettings from '../../components/settings/TeamSettings';
import IntegrationSettings from '../../components/settings/IntegrationSettings';
import PosSettings from '../../components/settings/PosSettings';
import DomainSettings from '../../components/settings/DomainSettings';
import InvoiceSettings from '../../components/settings/InvoiceSettings';
import CargoSettings from '../../components/settings/CargoSettings';
import WarehouseSettings from '../../components/settings/WarehouseSettings';
import DataSettings from '../../components/settings/DataSettings';
import AuditLogTable from '../../components/shared/AuditLogTable';

const TABS = [['general', 'Genel'], ['team', 'Ekip ve Yetkiler'], ['integration', 'Entegrasyon (ERP)'], ['pos', 'Sanal POS'], ['invoice', 'E-Fatura'], ['cargo', 'Kargo'], ['warehouses', 'Depolar'], ['domain', 'Alan Adı'], ['audit', 'İşlem Kaydı'], ['data', 'Veri & Hesap']];

// Firma adı, logo ve iletişim bilgileri: giriş ekranında ve panellerde görünür
const BrandingCard = ({ showAlert }) => {
  const { refresh } = useTenant();
  const [form, setForm] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/billing'), api.get('/tenant/public')]).then(([billing, pub]) => {
      const t = billing.data.tenant;
      setForm({ name: t.name, contactEmail: t.contactEmail || '', phone: t.phone || '', address: t.address || '', taxNumber: t.taxNumber || '', logoUrl: pub.data.logoUrl || '' });
    }).catch(() => {});
  }, []);

  if (!form) return null;

  const uploadLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/products/upload-image', data);
      setForm((f) => ({ ...f, logoUrl: res.data.imageUrl }));
    } catch (err) {
      showAlert({ type: 'error', title: 'Logo Yüklenemedi', message: errorMessage(err, 'Logo yüklenemedi.') });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const save = async () => {
    try {
      const res = await api.patch('/tenant', form);
      refresh();
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kaydedilemedi.') });
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card-premium p-6 space-y-5">
      <div className="flex justify-between items-start">
        <h3 className="font-black text-gray-900 flex items-center"><Building2 className="h-5 w-5 mr-2 text-indigo-500" /> Firma & Marka</h3>
        <span className="text-xs font-bold text-gray-400">Portal adresiniz: <span className="text-indigo-600">{window.location.origin}</span></span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-6">
        <label className="h-32 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-indigo-300 overflow-hidden bg-gray-50">
          {form.logoUrl ? <img src={form.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-3" /> : (
            <span className="text-center text-gray-400 text-[11px] font-bold"><ImagePlus className="h-6 w-6 mx-auto mb-1" />{uploading ? 'Yükleniyor...' : 'Logo yükle'}</span>
          )}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={uploadLogo} />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label className="premium-label">Firma Adı</label><input className="premium-input" value={form.name} onChange={set('name')} /></div>
          <div><label className="premium-label">İletişim E-postası</label><input type="email" className="premium-input" value={form.contactEmail} onChange={set('contactEmail')} /></div>
          <div><label className="premium-label">Telefon</label><input className="premium-input" value={form.phone} onChange={set('phone')} /></div>
          <div><label className="premium-label">Vergi No</label><input className="premium-input" value={form.taxNumber} onChange={set('taxNumber')} /></div>
          <div className="md:col-span-2"><label className="premium-label">Adres</label><input className="premium-input" value={form.address} onChange={set('address')} /></div>
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={save} className="btn-gradient"><Save className="h-4 w-4 mr-2" /> Firma Bilgilerini Kaydet</button>
        {form.logoUrl && <button onClick={() => setForm({ ...form, logoUrl: '' })} className="text-xs font-black text-red-500 hover:underline">Logoyu kaldır</button>}
      </div>
    </div>
  );
};

const FIELDS = [
  { section: 'Fiyatlandırma', icon: Percent, items: [
    { key: 'qty_discount_threshold', label: 'Miktar indirimi eşiği (adet)', hint: 'Bir kalemde bu miktar ve üzeri alındığında' },
    { key: 'qty_discount_rate', label: 'Miktar indirimi (%)', hint: 'Sepette otomatik uygulanan ekstra indirim' },
    { key: 'group_discount_STANDART', label: 'STANDART grup iskontosu (%)' },
    { key: 'group_discount_GOLD', label: 'GOLD grup iskontosu (%)' },
    { key: 'group_discount_VIP', label: 'VIP grup iskontosu (%)', hint: 'Bayiye özel net iskontonun üzerine uygulanır' },
  ] },
  { section: 'Döviz', icon: Coins, items: [
    { key: 'usd_try', label: 'Manuel USD/TRY', hint: 'Sadece TCMB\'ye ulaşılamazsa kullanılır' },
    { key: 'eur_try', label: 'Manuel EUR/TRY' },
  ] },
  { section: 'Prim & Bildirim', icon: Bell, items: [
    { key: 'plasiyer_rate', label: 'Plasiyer prim oranı (%)', hint: 'Onaylanan siparişin KDV hariç tutarı üzerinden' },
    { key: 'due_reminder_days', label: 'Vade hatırlatma (gün önce)' },
  ] },
];

const SettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState({});
  const [rates, setRates] = useState(null);
  const [plasiyers, setPlasiyers] = useState([]);
  const [newPlasiyer, setNewPlasiyer] = useState({ name: '', email: '', password: '' });
  const { alertElement, showAlert, confirm } = useAlert();
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'general');

  const load = () =>
    Promise.all([api.get('/settings'), api.get('/auth/users', { params: { role: 'PLASIYER' } })]).then(([s, p]) => {
      setSettings(s.data);
      setDraft(s.data);
      setPlasiyers(p.data);
    });

  const loadRates = () => api.get('/settings/exchange-rates').then((res) => setRates(res.data)).catch(() => setRates(null));

  useEffect(() => { load(); loadRates(); }, []);

  const save = async () => {
    const changed = Object.keys(draft).filter((k) => draft[k] !== settings[k]);
    try {
      await Promise.all(changed.map((key) => api.post('/settings', { key, value: draft[key] })));
      setSettings(draft);
      showAlert({ type: 'success', title: 'Kaydedildi', message: changed.length ? `${changed.length} ayar güncellendi.` : 'Değişiklik yok.' });
      if (changed.some((k) => k.endsWith('_try'))) loadRates();
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Ayarlar kaydedilemedi.') });
    }
  };

  const addPlasiyer = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/register', { ...newPlasiyer, role: 'PLASIYER' });
      setNewPlasiyer({ name: '', email: '', password: '' });
      showAlert({ type: 'success', title: 'Plasiyer Eklendi', message: 'Bayi Yönetimi ekranından bayilere atayabilirsiniz.' });
      load();
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Plasiyer eklenemedi.') });
    }
  };

  if (!settings) return <div className="p-8 text-center text-gray-400">Yükleniyor...</div>;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {alertElement}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><Settings className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Sistem Ayarları</h1>
            <p className="text-gray-500 text-sm mt-1">Fiyatlandırma kuralları, döviz, prim ve bildirim ayarları.</p>
          </div>
        </div>
        </div>
        {tab === 'general' && <button onClick={save} className="btn-gradient"><Save className="h-4 w-4 mr-2" /> Kaydet</button>}
      </div>

      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100 w-full md:w-fit overflow-x-auto">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-xs font-black rounded-lg whitespace-nowrap ${tab === id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>{label}</button>
        ))}
      </div>

      {tab === 'team' && <TeamSettings showAlert={showAlert} confirm={confirm} />}
      {tab === 'integration' && <IntegrationSettings showAlert={showAlert} confirm={confirm} />}
      {tab === 'pos' && <PosSettings showAlert={showAlert} confirm={confirm} />}
      {tab === 'invoice' && <InvoiceSettings showAlert={showAlert} confirm={confirm} />}
      {tab === 'cargo' && <CargoSettings showAlert={showAlert} />}
      {tab === 'warehouses' && <WarehouseSettings showAlert={showAlert} confirm={confirm} />}
      {tab === 'domain' && <DomainSettings showAlert={showAlert} confirm={confirm} />}
      {tab === 'data' && <DataSettings showAlert={showAlert} />}
      {tab === 'audit' && (
        <div className="card-premium p-6 space-y-4">
          <p className="text-xs text-gray-500">Ekibinizin girişleri ve yaptığı değişiklikler (ürün, fiyat, sipariş onayı, ayarlar…). Satıra tıklayınca ayrıntı açılır.</p>
          <AuditLogTable fetchPage={({ page, q }) => api.get('/account/audit-logs', { params: { page, q } }).then((r) => r.data)} />
        </div>
      )}

      {tab === 'general' && <>
      <BrandingCard showAlert={showAlert} />

      <div className="card-premium p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 rounded-2xl text-amber-500"><Coins className="h-5 w-5" /></div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Güncel Kur ({rates?.source === 'TCMB' ? 'TCMB' : rates?.source === 'MANUAL' ? 'Manuel' : 'Alınamadı'})</p>
            <p className="text-sm font-black text-gray-900">
              {rates?.rates?.USD ? `USD ${rates.rates.USD.toLocaleString('tr-TR')} · EUR ${rates.rates.EUR.toLocaleString('tr-TR')}` : 'Döviz kuru alınamadı — dövizli ürünlerin fiyatı bayilere gizlenir.'}
              {rates?.date && <span className="text-gray-400 font-semibold"> · {rates.date}</span>}
            </p>
          </div>
        </div>
        <button onClick={loadRates} className="flex items-center text-xs font-black text-indigo-600 hover:underline"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Yenile</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {FIELDS.map(({ section, icon: Icon, items }) => (
          <div key={section} className="card-premium p-6 space-y-5">
            <h3 className="font-black text-gray-900 flex items-center"><Icon className="h-5 w-5 mr-2 text-indigo-500" /> {section}</h3>
            {items.map((f) => (
              <div key={f.key}>
                <label className="premium-label">{f.label}</label>
                <input type="number" step="0.01" min="0" className="premium-input" value={draft[f.key] ?? ''} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                {f.hint && <p className="text-[10px] font-semibold text-gray-400 mt-1 ml-1">{f.hint}</p>}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card-premium p-6 space-y-5">
        <h3 className="font-black text-gray-900 flex items-center"><Users className="h-5 w-5 mr-2 text-indigo-500" /> Plasiyerler</h3>
        <div className="flex flex-wrap gap-3">
          {plasiyers.length === 0 ? <p className="text-sm text-gray-400 font-semibold">Henüz plasiyer yok.</p> : plasiyers.map((p) => (
            <span key={p.id} className="px-4 py-2 bg-gray-50 rounded-xl text-xs font-bold text-gray-700 border border-gray-100">{p.name} · {p.email}</span>
          ))}
        </div>
        <form onSubmit={addPlasiyer} className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-4 border-t border-gray-50">
          <input required className="premium-input" placeholder="Ad Soyad" value={newPlasiyer.name} onChange={(e) => setNewPlasiyer({ ...newPlasiyer, name: e.target.value })} />
          <input required type="email" className="premium-input" placeholder="E-posta" value={newPlasiyer.email} onChange={(e) => setNewPlasiyer({ ...newPlasiyer, email: e.target.value })} />
          <input required minLength={8} type="password" autoComplete="new-password" className="premium-input" placeholder="Şifre (en az 8)" value={newPlasiyer.password} onChange={(e) => setNewPlasiyer({ ...newPlasiyer, password: e.target.value })} />
          <button type="submit" className="btn-gradient"><UserPlus className="h-4 w-4 mr-2" /> Plasiyer Ekle</button>
        </form>
      </div>
      </>}
    </div>
  );
};

export default SettingsPage;
