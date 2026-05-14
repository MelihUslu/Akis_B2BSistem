import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ChevronRight, AlertCircle } from 'lucide-react';
import loginIllustration from '../assets/akis_login.png';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        const userStr = localStorage.getItem('akis_user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.role === 'ADMIN') {
            navigate('/admin');
          } else {
            navigate('/bayi');
          }
        }
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
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Dekoratif Arka Plan */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_rgba(79,70,229,0.05)_0%,_transparent_50%)]"></div>

      {/* Kompakt Ana Konteyner */}
      <div 
        className={`max-w-4xl w-full bg-white rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row shadow-[0_40px_80px_-20px_rgba(0,0,0,0.08)] border border-slate-100 transition-all duration-1000 transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
      >
        
        {/* Sol Taraf: Giriş Formu (Daha Kompakt) */}
        <div className="w-full md:w-1/2 p-8 sm:p-10 lg:p-12 flex flex-col justify-center relative">
          <div className="mb-10">
            <div className="h-1 w-10 bg-indigo-600 rounded-full mb-5"></div>
            <h1 className="text-slate-900 text-3xl font-extrabold tracking-tight mb-2">
              Hoş Geldiniz
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              Giriş yaparak devam edin.
            </p>
          </div>

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
              <button type="button" className="text-[12px] font-bold text-indigo-600 hover:text-indigo-700">
                Şifremi Unuttum
              </button>
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

          <div className="mt-12 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-200">
              AKİS B2B YAZILIM
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
              Akis B2B Çözümleri
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
