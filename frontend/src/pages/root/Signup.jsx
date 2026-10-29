import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Loader2, MailCheck } from 'lucide-react';
import { publicApi, errorMessage } from '../../services/api';
import { ROOT_DOMAIN_LABEL } from '../../utils/tenant';
import { formatTRY } from '../../utils/format';
import { getUtm, trackEvent } from '../../utils/site';
import { PrimaryButton, Frame } from './landing/ui';
import { SiteHeader, PageFooter } from './landing/layout';

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B';
const limitText = (n, label) => (n < 0 ? `Sınırsız ${label}` : `${n.toLocaleString('tr-TR')} ${label}`);

/**
 * Ücretsiz deneme kaydı (/kayit). Paket ?paket=KOD ile seçili gelir; reklam kaynağı (UTM) oturumdan eklenir.
 * Kayıt başarılı olunca /kayit/tamam sayfasına geçilir (reklam dönüşümü ayrı adresle de ölçülebilsin).
 */
const Signup = ({ site }) => {
  const brand = site?.company?.brand || PLATFORM_NAME;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState({ companyName: '', slug: '', name: '', email: '', phone: '', password: '', planCode: params.get('paket') || '' });
  const [lastSlugState, setSlugState] = useState(null); // { available, message, slug }
  const slugState = form.slug || form.companyName ? lastSlugState : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { document.title = `Ücretsiz deneyin · ${brand}`; }, [brand]);

  useEffect(() => {
    publicApi.get('/plans').then((res) => {
      setPlans(res.data);
      // Bağlantıdaki paket yoksa / geçersizse önerilen (ikinci) paket seçilir
      setForm((f) => ({ ...f, planCode: res.data.some((p) => p.code === f.planCode) ? f.planCode : res.data[1]?.code || res.data[0]?.code || '' }));
    }).catch(() => {});
  }, []);

  // Firma adından adres önerisi + uygunluk kontrolü (yazmayı bitirince)
  useEffect(() => {
    const value = form.slug || form.companyName;
    if (!value) return undefined;
    const timer = setTimeout(() => {
      publicApi.get('/slug-available', { params: { slug: value } }).then((res) => setSlugState(res.data)).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [form.slug, form.companyName]);

  const choosePlan = (code) => {
    setForm((f) => ({ ...f, planCode: code }));
    setParams((p) => { p.set('paket', code); return p; }, { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await publicApi.post('/signup', { ...form, slug: slugState?.slug || form.slug, utm: getUtm() });
      trackEvent('signup');
      navigate('/kayit/tamam', { state: { ...res.data, email: form.email } });
    } catch (err) {
      setError(errorMessage(err, 'Kayıt yapılamadı.'));
    } finally {
      setSubmitting(false);
    }
  };

  const trialDays = plans.find((p) => p.code === form.planCode)?.trialDays ?? plans[0]?.trialDays ?? 14;

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900 antialiased">
      <SiteHeader brand={brand} />
      <main className="max-w-6xl mx-auto px-3 md:px-5 pt-6 md:pt-10">
        <Frame inner="grid lg:grid-cols-2 gap-2 p-2">
          <div className="relative overflow-hidden order-last lg:order-none rounded-[1.4rem] bg-[#0b1120] text-white p-8 md:p-12 flex flex-col justify-center lg:min-h-[40rem]">
            <div aria-hidden="true" className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
            <div aria-hidden="true" className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(99,102,241,0.55),transparent)]" />
            <div aria-hidden="true" className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[radial-gradient(closest-side,rgba(56,189,248,0.22),transparent)]" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-200">
                <span className="relative flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" /><span className="relative h-2 w-2 rounded-full bg-emerald-400" /></span>
                Hemen başlayın
              </span>
              <h2 className="mt-5 text-3xl md:text-[2.6rem] font-semibold tracking-[-0.04em] leading-[1.1]">Portalınız <span className="bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent">birkaç dakika</span> içinde hazır</h2>
              <div className="mt-7 flex items-end gap-3">
                <span className="text-6xl md:text-7xl font-semibold tracking-[-0.05em] leading-none">{trialDays}</span>
                <span className="pb-1.5 text-slate-300 leading-tight">gün boyunca<br /><b className="text-white">tüm özellikler ücretsiz</b></span>
              </div>
              <ul className="mt-7 grid sm:grid-cols-2 gap-2.5">
                {['Kredi kartı istenmez', 'Kurulum ücreti yok', `firmaniz.${ROOT_DOMAIN_LABEL} adresi`, 'Excel ile hızlı ürün yükleme'].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 rounded-xl bg-white/[0.06] ring-1 ring-white/10 px-3 py-2.5 text-sm text-slate-200">
                    <span className="h-5 w-5 shrink-0 rounded-full bg-indigo-500 flex items-center justify-center"><Check className="h-3 w-3 text-white" /></span>{t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 rounded-2xl bg-white text-slate-900 p-3 shadow-[0_25px_60px_-20px_rgba(0,0,0,0.6)] rotate-[-1.5deg]">
                <div className="flex items-center gap-1.5 px-1">
                  {['bg-red-400', 'bg-amber-400', 'bg-emerald-400'].map((c) => <span key={c} className={`h-2 w-2 rounded-full ${c}`} />)}
                  <span className="ml-2 flex-1 truncate rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">🔒 {(slugState?.slug || 'firmaniz')}.{ROOT_DOMAIN_LABEL}</span>
                </div>
                <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-emerald-50 px-3 py-2.5">
                  <span className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center"><Check className="h-4 w-4 text-white" /></span>
                  <span className="min-w-0"><span className="block text-xs font-bold">Portalınız yayında</span><span className="block text-[11px] text-slate-500">Bayileriniz sipariş vermeye hazır</span></span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 md:p-10 flex flex-col justify-center">
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">Portalınızı oluşturun</h1>
                  <p className="text-sm text-slate-500 mt-1">{trialDays} gün boyunca tüm özellikler ücretsiz.</p>
                </div>
                <div>
                  <label className="premium-label">Firma adı</label>
                  <input required className="premium-input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Örn: Yıldız Hırdavat" />
                </div>
                <div>
                  <label className="premium-label">Portal adresi</label>
                  <div className="flex items-center bg-gray-50 rounded-2xl pr-4">
                    <input className="premium-input !bg-transparent" value={form.slug} placeholder={slugState?.slug || 'firmaniz'} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                    <span className="text-sm font-bold text-slate-400 whitespace-nowrap">.{ROOT_DOMAIN_LABEL}</span>
                  </div>
                  {slugState && (
                    <p className={`text-[11px] font-bold mt-1.5 ml-1 ${slugState.available ? 'text-emerald-600' : 'text-red-500'}`}>
                      {slugState.available ? `${slugState.slug}.${ROOT_DOMAIN_LABEL} kullanılabilir` : slugState.message}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="premium-label">Ad soyad</label>
                    <input required className="premium-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="premium-label">Telefon</label>
                    <input className="premium-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
                  </div>
                </div>
                <div>
                  <label className="premium-label">İş e-postası</label>
                  <input required type="email" autoComplete="email" className="premium-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="premium-label">Şifre (en az 8 karakter)</label>
                  <input required minLength={8} type="password" autoComplete="new-password" className="premium-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                {plans.length > 0 && (
                  <div>
                    <label className="premium-label">Paket <span className="normal-case tracking-normal font-semibold text-slate-400">· deneme süresince ücret alınmaz</span></label>
                    <div className={`grid gap-2 grid-cols-1 ${plans.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                      {plans.map((p) => (
                        <button key={p.code} type="button" onClick={() => choosePlan(p.code)}
                          className={`rounded-2xl border px-3 py-2.5 text-left transition-colors flex sm:block items-center justify-between gap-3 ${form.planCode === p.code ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                          <span className="block text-sm font-semibold text-slate-900 truncate">{p.name}</span>
                          <span className="block text-right sm:text-left">
                            <span className="block text-[11px] text-slate-500 truncate">{formatTRY(p.priceMonthly)}/ay</span>
                            <span className="block text-[11px] text-slate-400 truncate">{limitText(p.maxDealers, 'bayi')}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
                <PrimaryButton type="submit" className="w-full" disabled={submitting || slugState?.available === false}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Ücretsiz denemeyi başlat <ArrowRight className="h-4 w-4" /></>}
                </PrimaryButton>
                {slugState?.available === false && <p className="text-[11px] text-center text-red-500">Başka bir portal adresi seçin.</p>}
                <p className="text-[11px] text-center text-slate-500">Kayıt olarak <a href="/kullanim-kosullari" target="_blank" className="underline">Kullanım Koşulları</a>'nı kabul etmiş olursunuz. Kişisel verileriniz <a href="/kvkk" target="_blank" className="underline">KVKK Aydınlatma Metni</a> kapsamında işlenir.</p>
              </form>
            <p className="mt-6 text-center text-sm text-slate-500">Zaten portalınız var mı? <Link to="/giris" className="font-semibold text-indigo-600 hover:underline">Giriş yapın</Link> · Sorunuz mu var? <button type="button" onClick={() => window.dispatchEvent(new Event('akis:open-chat'))} className="font-semibold text-indigo-600 hover:underline">Ekibimize yazın</button></p>
          </div>
        </Frame>
      </main>
      <PageFooter company={site?.company} brand={brand} />
    </div>
  );
};

// Kayıt sonrası teşekkür sayfası (/kayit/tamam): e-posta doğrulama hatırlatması ve portal adresi
export const SignupDone = ({ site }) => {
  const brand = site?.company?.brand || PLATFORM_NAME;
  const { state } = useLocation();
  useEffect(() => { document.title = `Kaydınız alındı · ${brand}`; }, [brand]);
  if (!state?.portalUrl) return <Navigate to="/kayit" replace />;
  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900 antialiased">
      <SiteHeader brand={brand} />
      <main className="max-w-xl mx-auto px-5 pt-6 md:pt-16">
        <Frame inner="p-8 md:p-12 text-center">
          <span className="mx-auto h-16 w-16 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center"><MailCheck className="h-8 w-8 text-emerald-600" /></span>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">Neredeyse hazır!</h1>
          <p className="mt-3 text-slate-600">{state.message}</p>
          <ol className="mt-8 space-y-3 text-left">
            {[
              <>E-posta kutunuzu açın{state.email ? <> (<b className="text-slate-900">{state.email}</b>)</> : null} ve doğrulama bağlantısına tıklayın.</>,
              <>Portalınıza giriş yapın: <a className="font-semibold text-indigo-600 break-all" href={state.portalUrl}>{state.portalUrl.replace(/^https?:\/\//, '')}</a></>,
              'Ürünlerinizi Excel ile yükleyin ve bayilerinizi davet edin.'
            ].map((t, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="h-6 w-6 shrink-0 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center">{i + 1}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <PrimaryButton href={state.portalUrl} className="mt-8">Portalıma git <ArrowRight className="h-4 w-4" /></PrimaryButton>
          <p className="mt-6 text-xs text-slate-500 flex items-center justify-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> E-posta gelmediyse spam klasörünü kontrol edin.</p>
        </Frame>
      </main>
      <PageFooter company={site?.company} brand={brand} />
    </div>
  );
};

export default Signup;
