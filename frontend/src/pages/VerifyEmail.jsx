import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 max-w-md w-full text-center space-y-6">
        <Icon className={`h-14 w-14 mx-auto ${state.status === 'loading' ? 'animate-spin text-indigo-500' : state.status === 'success' ? 'text-emerald-500' : 'text-red-500'}`} />
        <h1 className="text-2xl font-black text-slate-900">
          {state.status === 'loading' ? t('Doğrulanıyor...') : state.status === 'success' ? t('Hesabınız hazır!') : t('Doğrulama başarısız')}
        </h1>
        <p className="text-sm text-slate-500 font-medium">{state.message}</p>
        {state.status !== 'loading' && (
          <Link to="/login" className="inline-block w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-xl text-sm">{t('Giriş Yap')}</Link>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
