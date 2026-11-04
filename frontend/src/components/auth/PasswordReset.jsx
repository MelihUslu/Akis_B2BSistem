import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, KeyRound, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { errorMessage } from '../../services/api';
import { t } from '../../i18n';
import AuthShell, { AuthNotice } from './AuthShell';
import { PrimaryButton, IconField, iconInput } from '../../pages/root/landing/ui';

export const PLATFORM_HEADER = `${import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B'} · Platform`;

const Back = ({ to }) => (
  <Link to={to} className="mt-4 w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-950">
    <ArrowLeft className="h-4 w-4" /> {t('Girişe dön')}
  </Link>
);

// platform: platform paneli (başlıkta platform adı, dil seçici yok)
const shellProps = (platform) => (platform ? { brand: PLATFORM_HEADER, languages: false } : {});

/** "Şifremi unuttum": e-posta girilir, sıfırlama bağlantısı gönderilir. client: api veya platformApi */
export const ForgotPasswordForm = ({ client, path = '/auth/forgot-password', loginPath = '/login', brand, platform = false }) => {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ loading: false, ok: null, message: '' });

  const submit = async (e) => {
    e.preventDefault();
    setState({ loading: true, ok: null, message: '' });
    try {
      const res = await client.post(path, { email });
      setState({ loading: false, ok: true, message: res.data.message });
    } catch (err) {
      setState({ loading: false, ok: false, message: errorMessage(err, t('İstek gönderilemedi.')) });
    }
  };

  return (
    <AuthShell {...shellProps(platform)} icon={KeyRound} title={t('Şifremi unuttum')}
      text={brand ? t('{brand} hesabınızın e-posta adresini girin; şifre sıfırlama bağlantısı gönderelim.', { brand }) : t('Hesabınızın e-posta adresini girin; şifre sıfırlama bağlantısı gönderelim.')}>
      {state.ok ? <AuthNotice ok>{state.message}</AuthNotice> : (
        <form onSubmit={submit} className="space-y-4">
          <IconField icon={Mail} label={t('E-posta')}>
            <input type="email" required autoFocus autoComplete="email" placeholder={t('ornek@sirket.com')} className={iconInput} value={email} onChange={(e) => setEmail(e.target.value)} />
          </IconField>
          {state.message && <AuthNotice>{state.message}</AuthNotice>}
          <PrimaryButton type="submit" className="w-full" disabled={state.loading}>
            {state.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('Gönderiliyor…')} /> : <>{t('Sıfırlama bağlantısı gönder')} <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </form>
      )}
      <Back to={loginPath} />
    </AuthShell>
  );
};

/** E-postadaki bağlantıdan gelinir (?token=…): yeni şifre belirlenir */
export const ResetPasswordForm = ({ client, path = '/auth/reset-password', loginPath = '/login', platform = false }) => {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ loading: false, ok: null, message: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setState({ loading: false, ok: false, message: t('Şifreler eşleşmiyor.') });
    setState({ loading: true, ok: null, message: '' });
    try {
      const res = await client.post(path, { token, password: form.password });
      setState({ loading: false, ok: true, message: res.data.message });
    } catch (err) {
      setState({ loading: false, ok: false, message: errorMessage(err, t('Şifre değiştirilemedi.')) });
    }
  };

  if (!token) {
    return (
      <AuthShell {...shellProps(platform)} icon={KeyRound} title={t('Bağlantı eksik')} text={t('Şifre sıfırlama bağlantısı geçersiz. E-postadaki bağlantıya tıkladığınızdan emin olun.')}>
        <Back to={loginPath} />
      </AuthShell>
    );
  }

  const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(form.password)).length);
  return (
    <AuthShell {...shellProps(platform)} icon={Lock} title={t('Yeni şifre belirleyin')} text={t('En az 8 karakter; büyük harf, rakam ve sembol kullanmanız önerilir. Şifre değişince tüm cihazlardaki oturumlarınız kapanır.')}>
      {state.ok ? (
        <div className="space-y-4">
          <AuthNotice ok>{state.message}</AuthNotice>
          <PrimaryButton to={loginPath} className="w-full">{t('Giriş yap')} <ArrowRight className="h-4 w-4" /></PrimaryButton>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <IconField icon={Lock} label={t('Yeni şifre')}>
            <input type={show ? 'text' : 'password'} required minLength={8} autoFocus autoComplete="new-password" className={iconInput} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShow(!show)} className="text-slate-400 hover:text-slate-700" aria-label={t('Şifreyi göster')}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </IconField>
          {form.password && (
            <div className="flex gap-1 -mt-1" title={t('Şifre gücü')}>
              {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? ['bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'][strength - 1] : 'bg-slate-100'}`} />)}
            </div>
          )}
          <IconField icon={Lock} label={t('Yeni şifre (tekrar)')}>
            <input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" className={iconInput} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </IconField>
          {state.message && <AuthNotice>{state.message}</AuthNotice>}
          <PrimaryButton type="submit" className="w-full" disabled={state.loading}>
            {state.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('Kaydediliyor…')} /> : <>{t('Şifremi değiştir')} <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
};
