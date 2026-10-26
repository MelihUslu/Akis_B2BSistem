import React, { useState } from 'react';
import { ShieldCheck, ChevronRight, AlertCircle } from 'lucide-react';
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
      <div className="flex items-start gap-3 bg-indigo-50 rounded-xl p-4">
        <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          {recovery
            ? 'Kurulumda kaydettiğiniz kurtarma kodlarından birini girin. Her kod yalnızca bir kez kullanılabilir.'
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
        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 px-4 text-center text-2xl tracking-[0.5em] font-black text-slate-900 placeholder:text-slate-300 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/5 outline-none"
      />
      <button type="submit" disabled={loading || code.length < 6}
        className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm">
        {loading ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'} <ChevronRight className="h-4 w-4" />
      </button>
      <div className="flex justify-between text-[12px]">
        <button type="button" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }} className="font-bold text-indigo-600 hover:underline">
          {recovery ? t('Uygulama kodu gir') : t('Kurtarma kodu kullan')}
        </button>
        <button type="button" onClick={() => onCancel()} className="text-slate-400 hover:text-slate-700">Geri dön</button>
      </div>
    </form>
  );
};

export default TwoFactorStep;
