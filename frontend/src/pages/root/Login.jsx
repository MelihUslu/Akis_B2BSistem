import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Building2, ChevronRight, Clock, Loader2, Lock, LogIn, Mail, MailCheck, Store } from 'lucide-react';
import { publicApi, errorMessage } from '../../services/api';
import { tenantUrl, ROOT_DOMAIN_LABEL } from '../../utils/tenant';
import { PrimaryButton, Frame, IconField as Field, iconInput } from './landing/ui';
import { SiteHeader, PageFooter } from './landing/layout';
import GoogleButton from '../../components/auth/GoogleButton';
import useGoogleReturn, { isGoogleReturn } from '../../hooks/useGoogleReturn';

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B';
const LAST_KEY = 'akis_last_portal';
const EMAIL_KEY = 'akis_last_email';
const read = (k, json) => { try { const v = localStorage.getItem(k); return json ? JSON.parse(v || 'null') : v || ''; } catch { return json ? null : ''; } };
const save = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* gizli sekme */ } };

// Portala geçiş: tek kullanımlık kod adresin # kısmında taşınır (sunucu loglarına düşmez)
const enter = (portal) => {
  save(LAST_KEY, { slug: portal.slug, name: portal.name });
  window.location.href = `${portal.url}/giris-aktar#code=${encodeURIComponent(portal.code)}`;
};

/**
 * Ortak giriş (/giris): e-posta + şifre doğrulanır, kullanıcı firmasının portalına oturumu açık olarak geçer.
 * Aynı e-posta birden fazla portalda kayıtlıysa hangisine girileceği sorulur. Yedek yollar:
 * portal adresiyle giriş (?portal=adres ile dolu gelir), şifre sıfırlama (portalın kendi sayfası) ve
 * "portal adresimi unuttum" (adresler e-postaya gönderilir).
 */
const Login = ({ site }) => {
  const brand = site?.company?.brand || PLATFORM_NAME;
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('portal') ? 'portal' : 'login'); // login | choose | portal | reset | forgot
  const [email, setEmail] = useState(() => read(EMAIL_KEY));
  const [password, setPassword] = useState('');
  const [portals, setPortals] = useState([]);
  const [slug, setSlug] = useState(params.get('portal') || '');
  const [last] = useState(() => read(LAST_KEY, true));
  const [busy, setBusy] = useState(isGoogleReturn);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(null);

  useEffect(() => { document.title = `Giriş yap · ${brand}`; }, [brand]);
  const to = (m) => { setMode(m); setError(null); setSent(null); };

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(errorMessage(err, 'İşlem yapılamadı.')); } finally { setBusy(false); }
  };

  // Tek portal varsa doğrudan geçilir, birden fazlaysa seçtirilir
  const open = (data) => {
    if (data.portals.length === 1) enter(data.portals[0]);
    else { setPortals(data.portals); setMode('choose'); }
  };

  const login = (e) => {
    e.preventDefault();
    run(async () => {
      const r = await publicApi.post('/login', { email, password });
      save(EMAIL_KEY, email.trim().toLowerCase());
      open(r.data);
    });
  };

  // Google'dan dönüş: bilet, e-postanın kayıtlı olduğu portallara çevrilir
  useGoogleReturn((ticket) => run(async () => {
    const r = await publicApi.post('/google/portals', { ticket });
    save(EMAIL_KEY, r.data.email);
    setEmail(r.data.email);
    open(r.data);
  }), setError);

  // Portal adresiyle: adres kontrol edilir, portalın giriş (ya da şifre sıfırlama) ekranına gidilir
  const goPortal = (value, page = mode === 'reset' ? 'forgot-password' : 'login') => run(async () => {
    const wanted = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').split('.')[0];
    if (!wanted) return;
    const r = await publicApi.get('/portal', { params: { slug: wanted } });
    if (!r.data.exists) { setError(`"${r.data.slug || wanted}.${ROOT_DOMAIN_LABEL}" adresinde bir portal bulunamadı. Adresi kontrol edin.`); return; }
    save(LAST_KEY, { slug: r.data.slug, name: r.data.name });
    window.location.href = `${tenantUrl(r.data.slug)}/${page}`;
  });

  const sendList = (e) => {
    e.preventDefault();
    run(async () => setSent((await publicApi.post('/find-portal', { email })).data.message));
  };

  const errorBox = error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>;
  const back = <button type="button" onClick={() => to('login')} className="mt-4 w-full text-center text-sm font-semibold text-slate-600 hover:text-slate-950">← E-posta ile girişe dön</button>;

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900 antialiased">
      <SiteHeader brand={brand} />
      <main className="max-w-md mx-auto px-4 pt-6 md:pt-14">
        <Frame inner="p-7 md:p-10">
          <span className="h-12 w-12 rounded-2xl bg-navy-900 flex items-center justify-center shadow-md"><LogIn className="h-5 w-5 text-white" /></span>

          {mode === 'login' && (
            <>
              <h1 className="mt-6 text-2xl md:text-[1.75rem] font-semibold tracking-[-0.03em]">Giriş yapın</h1>
              <p className="mt-2 text-sm text-slate-500">Firma yöneticisi ya da bayi, portal hesabınızın e-posta ve şifresiyle girin.</p>
              <form onSubmit={login} className="mt-6 space-y-4">
                <Field icon={Mail} label="E-posta">
                  <input required type="email" autoComplete="email" autoFocus={!email} className={iconInput} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@firma.com" />
                </Field>
                <Field icon={Lock} label="Şifre">
                  <input required type="password" autoComplete="current-password" autoFocus={Boolean(email)} className={iconInput} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <div className="flex justify-end -mt-1">
                  <button type="button" onClick={() => to('reset')} className="text-xs font-semibold text-brand-600 hover:underline">Şifremi unuttum</button>
                </div>
                {errorBox}
                <PrimaryButton type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Giriş yap <ArrowRight className="h-4 w-4" /></>}
                </PrimaryButton>
                {site?.googleLogin && <GoogleButton disabled={busy} />}
              </form>
              <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 gap-2 text-[13px]">
                <button type="button" onClick={() => to('portal')} className="h-10 rounded-xl bg-slate-50 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">Portal adresiyle giriş</button>
                <button type="button" onClick={() => to('forgot')} className="h-10 rounded-xl bg-slate-50 font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950">Adresimi unuttum</button>
              </div>
            </>
          )}

          {mode === 'choose' && (
            <>
              <h1 className="mt-6 text-2xl md:text-[1.75rem] font-semibold tracking-[-0.03em]">Hangi portala girmek istersiniz?</h1>
              <p className="mt-2 text-sm text-slate-500">E-posta adresiniz birden fazla portalda kayıtlı.</p>
              <div className="mt-6 space-y-2">
                {portals.map((p) => (
                  <button key={p.slug} type="button" onClick={() => enter(p)}
                    className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-brand-300 hover:bg-brand-50/50 transition-colors">
                    <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 text-brand-600 text-xs font-black flex items-center justify-center">{p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{p.name}</span>
                      <span className="block text-xs text-slate-500 truncate">{p.role} · {p.url.replace(/^https?:\/\//, '')}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-center text-slate-400">Güvenlik için seçim 2 dakika içinde yapılmalıdır.</p>
              {back}
            </>
          )}

          {(mode === 'portal' || mode === 'reset') && (
            <>
              <h1 className="mt-6 text-2xl md:text-[1.75rem] font-semibold tracking-[-0.03em]">{mode === 'reset' ? 'Şifrenizi sıfırlayın' : 'Portal adresiyle giriş'}</h1>
              <p className="mt-2 text-sm text-slate-500">{mode === 'reset' ? 'Şifre, hesabınızın bulunduğu portalda sıfırlanır. Portal adresinizi yazın.' : 'Firmanızın portal adresini yazın. Bayiyseniz, tedarikçinizin size verdiği adresi kullanın.'}</p>
              {last?.slug && (
                <>
                  <p className="mt-6 text-[11px] font-bold uppercase tracking-wider text-slate-400">Son kullandığınız</p>
                  <button type="button" onClick={() => goPortal(last.slug)} disabled={busy}
                    className="mt-2 w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-brand-300 hover:bg-brand-50/50 transition-colors">
                    <span className="h-9 w-9 shrink-0 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center"><Clock className="h-4 w-4 text-slate-500" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-900 truncate">{last.name || last.slug}</span>
                      <span className="block text-xs text-slate-500 truncate">{last.slug}.{ROOT_DOMAIN_LABEL}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </button>
                </>
              )}
              <form onSubmit={(e) => { e.preventDefault(); goPortal(slug); }} className="mt-6 space-y-4">
                <Field icon={Building2} label="Portal adresi">
                  <input required autoFocus={!last?.slug} autoCapitalize="none" autoCorrect="off" spellCheck={false} className={iconInput} value={slug}
                    onChange={(e) => { setSlug(e.target.value); setError(null); }} placeholder="firmaniz" />
                  <span className="text-sm font-bold text-slate-400 whitespace-nowrap">.{ROOT_DOMAIN_LABEL}</span>
                </Field>
                {errorBox}
                <PrimaryButton type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Devam et <ArrowRight className="h-4 w-4" /></>}
                </PrimaryButton>
              </form>
              {back}
            </>
          )}

          {mode === 'forgot' && (
            <>
              <h1 className="mt-6 text-2xl md:text-[1.75rem] font-semibold tracking-[-0.03em]">Portal adresinizi bulalım</h1>
              <p className="mt-2 text-sm text-slate-500">Hesabınızdaki e-posta adresini yazın; kayıtlı olduğunuz portalların adreslerini gönderelim.</p>
              {sent ? (
                <div className="mt-6 flex gap-3 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 p-4 text-sm text-emerald-800"><MailCheck className="h-5 w-5 shrink-0" /> {sent}</div>
              ) : (
                <form onSubmit={sendList} className="mt-6 space-y-4">
                  <Field icon={Mail} label="E-posta">
                    <input required autoFocus type="email" autoComplete="email" className={iconInput} value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  {errorBox}
                  <PrimaryButton type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Adreslerimi gönder'}
                  </PrimaryButton>
                </form>
              )}
              {back}
            </>
          )}
        </Frame>
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-5 py-4 flex items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-brand-50 flex items-center justify-center"><Store className="h-4 w-4 text-brand-600" /></span>
          <p className="flex-1 text-sm text-slate-600">Henüz portalınız yok mu?</p>
          <Link to="/kayit" className="text-sm font-semibold text-brand-600 hover:underline whitespace-nowrap">Ücretsiz başlayın</Link>
        </div>
      </main>
      <PageFooter company={site?.company} brand={brand} />
    </div>
  );
};

export default Login;
