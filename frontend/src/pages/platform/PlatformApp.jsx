import { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import ErrorBoundary from '../../components/ErrorBoundary';
import { LayoutDashboard, Building2, Layers, Receipt, LogOut, Lock, Mail, Megaphone, LifeBuoy, ScrollText, ShieldCheck, Menu, X, Bug, BookOpen, Activity, Gauge, MessagesSquare, Globe, LogIn, Loader2, ArrowRight, DatabaseBackup } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import TwoFactorStep from '../../components/TwoFactorStep';
import ThemeToggle from '../../components/ThemeToggle';
import PageLoader from '../../components/PageLoader';
import { ForgotPasswordForm, ResetPasswordForm, PLATFORM_HEADER } from '../../components/auth/PasswordReset';
import AuthShell, { AuthNotice } from '../../components/auth/AuthShell';
import Turnstile from '../../components/auth/Turnstile';
import { PrimaryButton, IconField, iconInput } from '../root/landing/ui';

const TURNSTILE_SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY;

const PlatformDashboard = lazy(() => import('./PlatformDashboard'));
const PlatformTenants = lazy(() => import('./PlatformTenants'));
const PlatformTenantDetail = lazy(() => import('./PlatformTenantDetail'));
const PlatformPlans = lazy(() => import('./PlatformPlans'));
const PlatformPayments = lazy(() => import('./PlatformPayments'));
const PlatformAnnouncements = lazy(() => import('./PlatformAnnouncements'));
const PlatformSupport = lazy(() => import('./PlatformSupport'));
const PlatformAudit = lazy(() => import('./PlatformAudit'));
const PlatformSecurity = lazy(() => import('./PlatformSecurity'));
const PlatformErrors = lazy(() => import('./PlatformErrors'));
const PlatformSystem = lazy(() => import('./PlatformSystem'));
const PlatformMonitoring = lazy(() => import('./PlatformMonitoring'));
const PlatformBackups = lazy(() => import('./PlatformBackups'));
const PlatformLiveChat = lazy(() => import('./PlatformLiveChat'));
const PlatformSite = lazy(() => import('./PlatformSite'));
const PlatformHelp = lazy(() => import('./PlatformHelp'));

const readUser = () => {
  try { return JSON.parse(localStorage.getItem('akis_platform_user')); } catch { return null; }
};

const PlatformLogin = ({ onLogin }) => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0); // hatada widget'ı tazelemek için (token tek kullanımlık)

  const startSession = (data) => {
    localStorage.setItem('akis_platform_token', data.token);
    localStorage.setItem('akis_platform_user', JSON.stringify(data.user));
    onLogin(data.user);
  };

  const verify = async (code) => {
    try {
      const res = await platformApi.post('/auth/2fa/verify', { challenge, code });
      startSession(res.data);
      return { success: true };
    } catch (err) {
      const message = errorMessage(err, 'Doğrulama başarısız.');
      return { success: false, message, expired: /süresi doldu/i.test(message) };
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await platformApi.post('/auth/login', { ...form, captchaToken: captcha });
      if (res.data.twoFactorRequired) setChallenge(res.data.challenge);
      else startSession(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Giriş başarısız.'));
      setCaptcha(''); setCaptchaKey((k) => k + 1); // Turnstile token tek kullanımlık: tazele
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell brand={PLATFORM_HEADER} languages={false} icon={challenge ? ShieldCheck : LogIn}
      title={challenge ? 'Doğrulama kodu' : 'Yönetim girişi'} text={challenge ? null : 'Platform yöneticisi hesabınızla girin.'}>
      {challenge ? (
        <TwoFactorStep onVerify={verify} onCancel={(msg) => { setChallenge(null); setForm({ ...form, password: '' }); if (msg) setError(msg); }} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <IconField icon={Mail} label="E-posta">
            <input required type="email" autoFocus autoComplete="email" className={iconInput} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </IconField>
          <IconField icon={Lock} label="Şifre">
            <input required type="password" autoComplete="current-password" className={iconInput} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </IconField>
          <div className="flex justify-end -mt-1">
            <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline">Şifremi unuttum</Link>
          </div>
          {TURNSTILE_SITEKEY && <Turnstile key={captchaKey} sitekey={TURNSTILE_SITEKEY} onToken={setCaptcha} />}
          {error && <AuthNotice>{error}</AuthNotice>}
          <PrimaryButton type="submit" className="w-full" disabled={loading || (TURNSTILE_SITEKEY && !captcha)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Giriş yapılıyor" /> : <>Giriş yap <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
};

const MENU = [
  { name: 'Genel Bakış', path: '/', icon: LayoutDashboard, end: true },
  { name: 'Müşteriler', path: '/tenants', icon: Building2 },
  { name: 'Paketler', path: '/plans', icon: Layers },
  { name: 'Ödemeler', path: '/payments', icon: Receipt },
  { name: 'Destek', path: '/support', icon: LifeBuoy },
  { name: 'Canlı Destek', path: '/live-chat', icon: MessagesSquare },
  { name: 'Yardım Merkezi', path: '/help', icon: BookOpen },
  { name: 'Duyurular', path: '/announcements', icon: Megaphone },
  { name: 'İşlem Kaydı', path: '/audit', icon: ScrollText },
  { name: 'Güvenlik', path: '/security', icon: ShieldCheck },
  { group: 'Geliştirici' },
  { name: 'Site ve Chatbot', path: '/site', icon: Globe },
  { name: 'İzleme', path: '/monitoring', icon: Gauge },
  { name: 'Hatalar', path: '/errors', icon: Bug },
  { name: 'Sistem Durumu', path: '/system', icon: Activity },
  { name: 'Yedekler', path: '/backups', icon: DatabaseBackup },
];

const PlatformNav = ({ user, onLogout, mobile = false, onNavigate }) => (
  <aside className={`w-64 flex-col py-8 bg-navy-900 ${mobile ? 'flex h-full overflow-y-auto' : 'hidden lg:flex h-screen sticky top-0'}`}>
    <div className="px-8 mb-10 flex justify-between items-start">
      <div>
        <span className="text-2xl font-black text-white tracking-tighter uppercase">{import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B'}</span>
        <span className="block text-[10px] font-black text-brand-400 uppercase tracking-[0.2em] mt-0.5">PLATFORM YÖNETİMİ</span>
      </div>
      {mobile && <button onClick={onNavigate} className="p-2 -mr-4 text-gray-400 hover:text-white" aria-label="Menüyü kapat"><X className="h-5 w-5" /></button>}
    </div>
    <nav className="flex-1 px-4 space-y-1">
      {MENU.map((item) => item.group ? (
        <p key={item.group} className="px-5 pt-5 pb-1 text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">{item.group}</p>
      ) : (
        <NavLink key={item.path} to={item.path} end={item.end} onClick={onNavigate}
          className={({ isActive }) => `flex items-center px-5 py-4 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-black/20' : 'text-white/70 hover:text-white hover:bg-white/5'}`}>
          <item.icon className="h-5 w-5 mr-4" /> {item.name}
        </NavLink>
      ))}
    </nav>
    <div className="px-4 border-t border-white/5 pt-4">
      <p className="px-5 text-xs font-bold text-gray-500 mb-2 truncate">{user?.name}</p>
      <button onClick={onLogout} className="w-full flex items-center px-5 py-4 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10">
        <LogOut className="h-5 w-5 mr-4" /> Çıkış Yap
      </button>
    </div>
  </aside>
);

const PlatformLayout = ({ user, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  return (
  <div className="flex min-h-screen bg-navy-900">
    <PlatformNav user={user} onLogout={onLogout} />
    {menuOpen && (
      <div className="fixed inset-0 z-50 lg:hidden">
        <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
        <div className="relative h-full w-64 max-w-[85vw] animate-slide-in-left"><PlatformNav user={user} onLogout={onLogout} mobile onNavigate={() => setMenuOpen(false)} /></div>
      </div>
    )}
    <main className="flex-1 min-w-0 min-h-screen bg-navy-50 lg:rounded-l-[2.5rem] overflow-y-auto custom-scrollbar px-3 md:px-8 lg:px-10 py-4 lg:py-10 relative">
      <div className="flex items-center justify-between lg:block mb-4 lg:mb-0">
        <button onClick={() => setMenuOpen(true)} className="lg:hidden p-2 -ml-1 rounded-xl text-gray-600 hover:bg-gray-100" aria-label="Menü"><Menu className="h-6 w-6" /></button>
        <ThemeToggle className="lg:absolute lg:top-6 lg:right-8" />
      </div>
      <ErrorBoundary key={pathname}>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route index element={<PlatformDashboard />} />
        <Route path="tenants" element={<PlatformTenants />} />
        <Route path="tenants/:id" element={<PlatformTenantDetail />} />
        <Route path="plans" element={<PlatformPlans />} />
        <Route path="payments" element={<PlatformPayments />} />
        <Route path="support" element={<PlatformSupport />} />
        <Route path="help" element={<PlatformHelp />} />
        <Route path="announcements" element={<PlatformAnnouncements />} />
        <Route path="audit" element={<PlatformAudit />} />
        <Route path="security" element={<PlatformSecurity />} />
        <Route path="errors" element={<PlatformErrors />} />
        <Route path="system" element={<PlatformSystem />} />
        <Route path="monitoring" element={<PlatformMonitoring />} />
        <Route path="backups" element={<PlatformBackups />} />
        <Route path="live-chat" element={<PlatformLiveChat />} />
        <Route path="site" element={<PlatformSite />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </main>
  </div>
  );
};

const PlatformApp = () => {
  const [user, setUser] = useState(readUser);
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('akis_platform_token');
    localStorage.removeItem('akis_platform_user');
    setUser(null);
    navigate('/login');
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordForm client={platformApi} brand="Platform" platform />} />
        <Route path="/reset-password" element={<ResetPasswordForm client={platformApi} platform />} />
        <Route path="*" element={<PlatformLogin onLogin={(u) => { setUser(u); navigate('/'); }} />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/*" element={<PlatformLayout user={user} onLogout={logout} />} />
    </Routes>
  );
};

export default PlatformApp;
