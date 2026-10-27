import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, KeyRound, ArrowLeft, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { errorMessage } from '../../services/api';
import { t } from '../../i18n';

const Shell = ({ icon: Icon, title, text, children }) => (
  <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0b1220] flex items-center justify-center p-6">
    <div className="w-full max-w-md bg-white rounded-[2rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.12)] ring-1 ring-slate-100 p-8 sm:p-10">
      <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25 mb-5">
        <Icon className="h-6 w-6" />
      </div>
      <h1 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">{text}</p>
      {children}
    </div>
  </div>
);

const Notice = ({ ok, children }) => (
  <div className={`flex items-start gap-2 rounded-xl p-3.5 text-xs font-semibold mb-4 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
    {ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />} <span>{children}</span>
  </div>
);

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 outline-none text-sm';
const submitCls = 'w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-60';

/** "Şifremi unuttum": e-posta girilir, sıfırlama bağlantısı gönderilir. client: api veya platformApi */
export const ForgotPasswordForm = ({ client, path = '/auth/forgot-password', loginPath = '/login', brand }) => {
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
    <Shell icon={KeyRound} title={t('Şifremi unuttum')} text={brand ? t('{brand} hesabınızın e-posta adresini girin; şifre sıfırlama bağlantısı gönderelim.', { brand }) : t('Hesabınızın e-posta adresini girin; şifre sıfırlama bağlantısı gönderelim.')}>
      {state.message && <Notice ok={state.ok}>{state.message}</Notice>}
      {!state.ok && (
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="email" required autoFocus placeholder={t('ornek@sirket.com')} className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button disabled={state.loading} className={submitCls}>{state.loading ? t('Gönderiliyor…') : t('Sıfırlama bağlantısı gönder')}</button>
        </form>
      )}
      <Link to={loginPath} className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {t('Girişe dön')}</Link>
    </Shell>
  );
};

/** E-postadaki bağlantıdan gelinir (?token=…): yeni şifre belirlenir */
export const ResetPasswordForm = ({ client, path = '/auth/reset-password', loginPath = '/login' }) => {
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
      <Shell icon={KeyRound} title={t('Bağlantı eksik')} text={t('Şifre sıfırlama bağlantısı geçersiz. E-postadaki bağlantıya tıkladığınızdan emin olun.')}>
        <Link to={loginPath} className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {t('Girişe dön')}</Link>
      </Shell>
    );
  }

  const strength = Math.min(4, [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(form.password)).length);
  return (
    <Shell icon={Lock} title={t('Yeni şifre belirleyin')} text={t('En az 8 karakter; büyük harf, rakam ve sembol kullanmanız önerilir. Şifre değişince tüm cihazlardaki oturumlarınız kapanır.')}>
      {state.message && <Notice ok={state.ok}>{state.message}</Notice>}
      {state.ok ? (
        <Link to={loginPath} className={`${submitCls} block text-center`}>{t('Giriş yap')}</Link>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type={show ? 'text' : 'password'} required minLength={8} autoFocus autoComplete="new-password" placeholder={t('Yeni şifre')} className={`${inputCls} pr-11`} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={t('Şifreyi göster')}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          {form.password && (
            <div className="flex gap-1" title={t('Şifre gücü')}>
              {[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? ['bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-emerald-500'][strength - 1] : 'bg-slate-100'}`} />)}
            </div>
          )}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type={show ? 'text' : 'password'} required minLength={8} autoComplete="new-password" placeholder={t('Yeni şifre (tekrar)')} className={inputCls} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
          <button disabled={state.loading} className={submitCls}>{state.loading ? t('Kaydediliyor…') : t('Şifremi değiştir')}</button>
        </form>
      )}
    </Shell>
  );
};
