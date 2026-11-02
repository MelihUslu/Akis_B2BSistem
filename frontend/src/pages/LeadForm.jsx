import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import { useTenant } from '../context/TenantContext';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/**
 * Talep formu (/talep): Instagram / WhatsApp reklamından gelen kişi adını, telefonunu ve ne istediğini bırakır.
 * Bağlantıdaki ?k= kanalı, ?kampanya= reklam adını belirler; kayıt firmanın "Müşteri Adayları" listesine düşer.
 */
const LeadForm = () => {
  const { tenant } = useTenant();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', phone: '', city: '', request: '', kvkkConsent: false, website: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, params.get(k)]).filter(([, v]) => v));
      const res = await api.post('/lead-form', { ...form, k: params.get('k') || '', campaign: params.get('kampanya') || '', utm });
      setDone(res.data.message);
    } catch (err) {
      setError(errorMessage(err, 'Talebiniz gönderilemedi. Lütfen tekrar deneyin.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 md:p-6">
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 w-full max-w-md p-6 md:p-9">
        <div className="flex items-center gap-3">
          {tenant?.logoUrl
            ? <img src={tenant.logoUrl} alt={tenant.name} className="h-11 max-w-[9rem] object-contain" />
            : <div className="p-3 rounded-2xl bg-indigo-50 text-indigo-600"><Building2 className="h-6 w-6" /></div>}
          {!tenant?.logoUrl && <p className="font-black text-slate-900">{tenant?.name}</p>}
        </div>
        {done ? (
          <div className="text-center space-y-3 py-10">
            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
            <h1 className="text-2xl font-black text-slate-900">Teşekkürler!</h1>
            <p className="text-sm text-slate-500">{done}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900">Bilgilerinizi bırakın, sizi arayalım</h1>
              <p className="mt-1.5 text-sm text-slate-500">Fiyat, stok ve sipariş için ekibimiz en kısa sürede size dönecek.</p>
            </div>
            <div><label className="premium-label">Ad Soyad</label><input required autoComplete="name" className="premium-input" value={form.name} onChange={set('name')} /></div>
            <div><label className="premium-label">Telefon</label><input required type="tel" inputMode="tel" autoComplete="tel" className="premium-input" value={form.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" /></div>
            <div><label className="premium-label">Şehir (isteğe bağlı)</label><input autoComplete="address-level1" className="premium-input" value={form.city} onChange={set('city')} /></div>
            <div><label className="premium-label">Ne istiyorsunuz? (isteğe bağlı)</label><textarea className="premium-input h-24 resize-none" value={form.request} onChange={set('request')} placeholder="Ürün, adet, sorunuz…" /></div>
            {/* Botlar için görünmez alan */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set('website')} />
            <label className="flex items-start gap-3 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.kvkkConsent} onChange={set('kvkkConsent')} />
              <span>Talebime dönüş yapılması için paylaştığım bilgilerin {tenant?.name || 'firma'} tarafından 6698 sayılı KVKK kapsamında işlenmesini kabul ediyorum.</span>
            </label>
            {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
            <button type="submit" disabled={sending || !form.kvkkConsent} className="w-full btn-gradient py-4 disabled:opacity-50">{sending ? 'Gönderiliyor…' : 'Beni arayın'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LeadForm;
