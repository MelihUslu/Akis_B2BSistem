import { useState } from 'react';
import { ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';
import { PrimaryButton } from '../pages/root/landing/ui';
import { t } from '../i18n';

/**
 * Şifreden sonra istenen ikinci adım: doğrulama uygulamasındaki 6 haneli kod
 * ya da kurulumda verilen tek kullanımlık kurtarma kodu.
 */
const TwoFactorStep = ({ onVerify, onCancel }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await onVerify(code.trim());
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      if (result.expired) onCancel(result.message);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="flex items-start gap-3 bg-brand-50 rounded-xl p-4">
        <ShieldCheck className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          {recovery
            ? t('Kurulumda kaydettiğiniz kurtarma kodlarından birini girin. Her kod yalnızca bir kez kullanılabilir.')
            : t('Hesabınızda iki aşamalı doğrulama açık. Doğrulama uygulamanızdaki (Google Authenticator, Microsoft Authenticator…) 6 haneli kodu girin.')}
        </p>
      </div>
      {error && (
        <div className="bg-red-50 text-red-600 text-xs p-3.5 rounded-xl flex items-center gap-2 border border-red-100">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <input
        autoFocus
        required
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        maxLength={recovery ? 20 : 6}
        placeholder={recovery ? 'xxxx-xxxx' : '000000'}
        value={code}
        onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/\D/g, ''))}
        className="w-full bg-gray-50 rounded-2xl py-3.5 px-4 text-center text-2xl tracking-[0.5em] font-black text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-brand-100 outline-none"
      />
      <PrimaryButton type="submit" className="w-full" disabled={loading || code.length < 6}>
        {loading ? t('Doğrulanıyor...') : t('Doğrula ve Giriş Yap')} <ArrowRight className="h-4 w-4" />
      </PrimaryButton>
      <div className="flex justify-between text-[12px]">
        <button type="button" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }} className="font-bold text-brand-600 hover:underline">
          {recovery ? t('Uygulama kodu gir') : t('Kurtarma kodu kullan')}
        </button>
        <button type="button" onClick={() => onCancel()} className="text-slate-400 hover:text-slate-700">{t('Geri dön')}</button>
      </div>
    </form>
  );
};

export default TwoFactorStep;
