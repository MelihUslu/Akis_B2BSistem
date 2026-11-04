import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, LogIn, Loader2 } from 'lucide-react';
import TwoFactorStep from '../components/TwoFactorStep';
import AuthShell, { AuthNotice, AuthBelow } from '../components/auth/AuthShell';
import { t } from '../i18n';
import { PrimaryButton, IconField, iconInput } from './root/landing/ui';

/**
 * Firma portalının girişi (firma.alanadi.com/login ya da firmanın kendi alan adı).
 * Görünüm ortak girişle (/giris) aynıdır; tanıtım menüsü yerine firmanın logosu / adı görünür (bayi platformu değil firmayı görür).
 */
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
  const { login, verifyTwoFactor } = useAuth();
  // Ortak girişten (/giris-aktar) iki aşamalı doğrulama adımıyla gelinebilir
  const [challenge, setChallenge] = useState(useLocation().state?.challenge || null);
  const navigate = useNavigate();

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
      if (result.success) goHome();
      else if (result.twoFactorRequired) setChallenge(result.challenge);
      else setError(result.message);
    } catch {
      setError(t('Sistem bağlantısı kurulamadı.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell icon={LogIn} title={t('Giriş yapın')}
      text={tenant?.name ? <><b className="font-semibold text-slate-700">{tenant.name}</b> {t('B2B portalına giriş yapın.')}</> : t('Giriş yaparak devam edin.')}
      below={(
        <AuthBelow>
          <p className="flex-1 text-sm text-slate-600">{t('Bayimiz değil misiniz?')}</p>
          <Link to="/basvuru" className="text-sm font-semibold text-brand-600 hover:underline whitespace-nowrap">{t('Bayilik başvurusu yapın')}</Link>
        </AuthBelow>
      )}>
      {challenge ? (
        <TwoFactorStep
          onVerify={async (code) => { const r = await verifyTwoFactor(challenge, code); if (r.success) goHome(); return r; }}
          onCancel={(msg) => { setChallenge(null); setPassword(''); if (msg) setError(msg); }}
        />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <IconField icon={Mail} label={t('E-posta')}>
            <input required type="email" autoComplete="email" autoFocus className={iconInput} value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('ornek@sirket.com')} />
          </IconField>
          <IconField icon={Lock} label={t('Şifre')}>
            <input required type="password" autoComplete="current-password" className={iconInput} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </IconField>
          <div className="flex justify-end -mt-1">
            <Link to="/forgot-password" className="text-xs font-semibold text-brand-600 hover:underline">{t('Şifremi unuttum')}</Link>
          </div>
          {error && <AuthNotice>{error}</AuthNotice>}
          <PrimaryButton type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t('Giriş Yapılıyor...')} /> : <>{t('Giriş Yap')} <ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
};

export default Login;
