import React, { Suspense, lazy, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, Layers, Receipt, LogOut, Lock, Mail, Megaphone, LifeBuoy, ScrollText, ShieldCheck } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import TwoFactorStep from '../../components/TwoFactorStep';
import ThemeToggle from '../../components/ThemeToggle';
import PageLoader from '../../components/PageLoader';

const PlatformDashboard = lazy(() => import('./PlatformDashboard'));
const PlatformTenants = lazy(() => import('./PlatformTenants'));
const PlatformTenantDetail = lazy(() => import('./PlatformTenantDetail'));
const PlatformPlans = lazy(() => import('./PlatformPlans'));
const PlatformPayments = lazy(() => import('./PlatformPayments'));
const PlatformAnnouncements = lazy(() => import('./PlatformAnnouncements'));
const PlatformSupport = lazy(() => import('./PlatformSupport'));
const PlatformAudit = lazy(() => import('./PlatformAudit'));
const PlatformSecurity = lazy(() => import('./PlatformSecurity'));

const readUser = () => {
  try { return JSON.parse(localStorage.getItem('akis_platform_user')); } catch { return null; }
};

const PlatformLogin = ({ onLogin }) => {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);

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
      const res = await platformApi.post('/auth/login', form);
      if (res.data.twoFactorRequired) setChallenge(res.data.challenge);
      else startSession(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Giriş başarısız.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
      {challenge ? (
        <div className="bg-white rounded-[2rem] p-10 w-full max-w-sm space-y-5 shadow-2xl">
          <h1 className="text-2xl font-black text-slate-900">Doğrulama Kodu</h1>
          <TwoFactorStep onVerify={verify} onCancel={(msg) => { setChallenge(null); setForm({ ...form, password: '' }); if (msg) setError(msg); }} />
        </div>
      ) : (
      <form onSubmit={submit} className="bg-white rounded-[2rem] p-10 w-full max-w-sm space-y-5 shadow-2xl">
        <div>
          <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Platform</p>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Yönetim Girişi</h1>
        </div>
        {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input required type="email" placeholder="E-posta" className="premium-input pl-11" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input required type="password" placeholder="Şifre" className="premium-input pl-11" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <button disabled={loading} className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-60">{loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}</button>
      </form>
      )}
    </div>
  );
};

const MENU = [
  { name: 'Genel Bakış', path: '/', icon: LayoutDashboard, end: true },
  { name: 'Müşteriler', path: '/tenants', icon: Building2 },
  { name: 'Paketler', path: '/plans', icon: Layers },
  { name: 'Ödemeler', path: '/payments', icon: Receipt },
  { name: 'Destek', path: '/support', icon: LifeBuoy },
  { name: 'Duyurular', path: '/announcements', icon: Megaphone },
  { name: 'İşlem Kaydı', path: '/audit', icon: ScrollText },
  { name: 'Güvenlik', path: '/security', icon: ShieldCheck },
];

const PlatformLayout = ({ user, onLogout }) => (
  <div className="flex min-h-screen bg-[#0f172a]">
    <aside className="w-64 flex flex-col h-screen sticky top-0 py-8">
      <div className="px-8 mb-10">
        <span className="text-2xl font-black text-white tracking-tighter uppercase">{import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B'}</span>
        <span className="block text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] mt-0.5">PLATFORM YÖNETİMİ</span>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        {MENU.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.end}
            className={({ isActive }) => `flex items-center px-5 py-4 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
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
    <main className="flex-1 min-h-screen bg-white rounded-l-[2.5rem] overflow-y-auto custom-scrollbar px-10 py-10 relative">
      <ThemeToggle className="absolute top-6 right-8" />
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route index element={<PlatformDashboard />} />
        <Route path="tenants" element={<PlatformTenants />} />
        <Route path="tenants/:id" element={<PlatformTenantDetail />} />
        <Route path="plans" element={<PlatformPlans />} />
        <Route path="payments" element={<PlatformPayments />} />
        <Route path="support" element={<PlatformSupport />} />
        <Route path="announcements" element={<PlatformAnnouncements />} />
        <Route path="audit" element={<PlatformAudit />} />
        <Route path="security" element={<PlatformSecurity />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </main>
  </div>
);

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
