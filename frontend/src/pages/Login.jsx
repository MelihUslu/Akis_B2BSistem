import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ChevronRight, AlertCircle } from 'lucide-react';
import loginIllustration from '../assets/akis_login.png';
import TwoFactorStep from '../components/TwoFactorStep';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(() => {
    // Abonelik kapandığı için oturumu sonlandırılan kullanıcıya sebebini göster
    const notice = sessionStorage.getItem('akis_login_notice');
    sessionStorage.removeItem('akis_login_notice');
    return notice || '';
  });
  const { tenant } = useTenant();
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { login, verifyTwoFactor } = useAuth();
  const [challenge, setChallenge] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const goHome = () => {
    const user = JSON.parse(localStorage.getItem('akis_user') || '{}');
    navigate(user.role === 'ADMIN' ? '/admin' : '/bayi');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        goHome();
      } else if (result.twoFactorRequired) {
        setChallenge(result.challenge);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('Sistem bağlantısı kurulamadı.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0b1220] flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Dekoratif Arka Plan */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_rgba(79,70,229,0.05)_0%,_transparent_50%)]"></div>

      {/* Kompakt Ana Konteyner */}
      <div 
        className={`max-w-4xl w-full bg-white rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row shadow-[0_40px_80px_-20px_rgba(0,0,0,0.08)] border border-slate-100 transition-all duration-1000 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
      >
        
        {/* Sol Taraf: Giriş Formu (Daha Kompakt) */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 lg:p-12 flex flex-col justify-center relative">
          <div className="mb-10">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-12 max-w-[12rem] object-contain mb-5" />
            ) : (
              <div className="h-1 w-10 bg-indigo-600 rounded-full mb-5"></div>
            )}
            <h1 className="text-slate-900 text-3xl font-extrabold tracking-tight mb-2">
              Hoş Geldiniz
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              {tenant?.name ? <><b className="text-slate-700">{tenant.name}</b> B2B portalına giriş yapın.</> : 'Giriş yaparak devam edin.'}
            </p>
          </div>

          {challenge ? (
            <TwoFactorStep
              onVerify={async (code) => { const r = await verifyTwoFactor(challenge, code); if (r.success) goHome(); return r; }}
              onCancel={(msg) => { setChallenge(null); setPassword(''); if (msg) setError(msg); }}
            />
          ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 text-red-600 text-xs p-3.5 rounded-xl flex items-center gap-2 border border-red-100 animate-shake">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">E-posta</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="ornek@sirket.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 transition-all outline-none text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Şifre</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                  </div>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 transition-all outline-none text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600/20" />
                <span className="text-[12px] text-slate-500 group-hover:text-slate-900 transition-colors">Beni Hatırla</span>
              </label>
              <span className="text-[12px] text-slate-400" title={tenant?.contactEmail || ''}>
                Şifrenizi mi unuttunuz? Yöneticinize başvurun.
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] text-sm"
            >
              {isLoading ? "Giriş Yapılıyor..." : "Giriş Yap"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </form>
          )}

          <p className="mt-8 text-center text-sm text-slate-500">
            Bayimiz değil misiniz? <Link to="/basvuru" className="font-bold text-indigo-600 hover:underline">Bayilik başvurusu yapın</Link>
          </p>

          <div className="mt-8 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-200">
              {tenant?.name || 'B2B PORTAL'}
            </p>
          </div>
        </div>

        {/* Sağ Taraf: Minimal Görsel */}
        <div className="hidden md:block w-1/2 relative bg-slate-50">
          <img 
            src={loginIllustration} 
            alt="Branding" 
            className="h-full w-full object-cover grayscale-[0.1] contrast-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent"></div>
          
          <div className="absolute bottom-8 left-8 right-8 p-6 rounded-2xl bg-white/80 backdrop-blur-md border border-white/20 shadow-lg">
            <h3 className="text-slate-900 text-sm font-bold">
              {tenant?.name || 'B2B Portal'}
            </h3>
            <p className="text-slate-500 text-[11px] mt-1 leading-relaxed">
              İşletmeniz için modern ve hızlı ticaret altyapısı.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
