import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import { useTenant } from '../context/TenantContext';
import LeadFormBody from '../components/leads/LeadFormBody';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/**
 * Talep formu (/talep): Instagram / WhatsApp reklamından gelen kişi bilgilerini bırakır.
 * Başlık ve alanlar firmanın panelden yaptığı ayardan gelir. Bağlantıdaki ?k= kanalı, ?kampanya= reklam adını
 * belirler; kayıt firmanın "Müşteri Adayları" listesine düşer.
 */
const LeadForm = () => {
  const { tenant } = useTenant();
  const [params] = useSearchParams();
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({ kvkkConsent: false, website: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    api.get('/lead-form').then((r) => setForm(r.data)).catch(() => setError('Form yüklenemedi. Sayfayı yenileyin.'));
  }, []);

  const set = (k) => (e) => setValues({ ...values, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, params.get(k)]).filter(([, v]) => v));
      const res = await api.post('/lead-form', { ...values, k: params.get('k') || '', campaign: params.get('kampanya') || '', utm });
      setDone(res.data.message);
    } catch (err) {
      setError(errorMessage(err, 'Talebiniz gönderilemedi. Lütfen tekrar deneyin.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-50 flex items-center justify-center p-4 md:p-6">
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 w-full max-w-md p-6 md:p-9">
        <div className="flex items-center gap-3">
          {tenant?.logoUrl
            ? <img src={tenant.logoUrl} alt={tenant.name} className="h-11 max-w-[9rem] object-contain" />
            : <div className="p-3 rounded-2xl bg-brand-50 text-brand-600"><Building2 className="h-6 w-6" /></div>}
          {!tenant?.logoUrl && <p className="font-black text-slate-900">{tenant?.name}</p>}
        </div>
        {done ? (
          <div className="text-center space-y-3 py-10">
            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
            <h1 className="text-2xl font-black text-slate-900">Teşekkürler!</h1>
            <p className="text-sm text-slate-500 whitespace-pre-line">{done}</p>
          </div>
        ) : !form ? (
          error ? <p className="mt-6 text-sm font-bold text-red-600">{error}</p> : <div className="mt-6 space-y-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <LeadFormBody form={form} values={values} set={set} companyName={tenant?.name} sending={sending} />
            {/* Botlar için görünmez alan */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={values.website} onChange={set('website')} />
            {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
};

export default LeadForm;
