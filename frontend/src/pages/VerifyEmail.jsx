import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowRight } from 'lucide-react';
import AuthShell from '../components/auth/AuthShell';
import { PrimaryButton } from './root/landing/ui';
import { publicApi, errorMessage } from '../services/api';
import { t } from '../i18n';

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: 'loading', message: '' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode'da iki kez çağrılmasın (token tek kullanımlık)
    started.current = true;
    publicApi.post('/verify-email', { token: params.get('token') })
      .then((res) => setState({ status: 'success', message: res.data.message }))
      .catch((err) => setState({ status: 'error', message: errorMessage(err, t('Doğrulama yapılamadı.')) }));
  }, [params]);

  const Icon = state.status === 'loading' ? Loader2 : state.status === 'success' ? CheckCircle2 : XCircle;

  const title = state.status === 'loading' ? t('Doğrulanıyor...') : state.status === 'success' ? t('Hesabınız hazır!') : t('Doğrulama başarısız');
  const iconClass = state.status === 'success' ? 'bg-emerald-500 text-white' : state.status === 'error' ? 'bg-red-500 text-white' : 'bg-navy-900 text-white [&>svg]:animate-spin';

  return (
    <AuthShell icon={Icon} iconClass={iconClass} title={title} text={state.message}>
      {state.status !== 'loading' && (
        <PrimaryButton to="/login" className="w-full">{t('Giriş Yap')} <ArrowRight className="h-4 w-4" /></PrimaryButton>
      )}
    </AuthShell>
  );
};

export default VerifyEmail;
