import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Copy, Download } from 'lucide-react';
import { errorMessage } from '../../services/api';

/**
 * İki aşamalı doğrulama (TOTP) kurulumu. Firma yöneticisi ve platform yöneticisi aynı bileşeni kullanır:
 * client = axios örneği, base = '/auth/2fa' (firma) veya '/me/2fa' (platform).
 */
const TwoFactorSettings = ({ client, base, showAlert }) => {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, qr }
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [disableForm, setDisableForm] = useState(null);

  const load = () => client.get(base).then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const { data } = await client.post(`${base}/setup`);
      const { default: QRCode } = await import('qrcode');
      const qr = await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 200 });
      setSetup({ ...data, qr });
      setCode('');
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kurulum başlatılamadı.') });
    }
  };

  const enable = async (e) => {
    e.preventDefault();
    try {
      const { data } = await client.post(`${base}/enable`, { code });
      setRecoveryCodes(data.recoveryCodes);
      setSetup(null);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Kod Hatalı', message: errorMessage(err, 'Doğrulanamadı.') });
    }
  };

  const disable = async (e) => {
    e.preventDefault();
    try {
      const { data } = await client.post(`${base}/disable`, disableForm);
      setDisableForm(null);
      showAlert({ type: 'success', title: 'Kapatıldı', message: data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kapatılamadı.') });
    }
  };

  const downloadCodes = () => {
    const blob = new Blob([`${window.location.host} kurtarma kodları\n\n${recoveryCodes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'kurtarma-kodlari.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!status) return null;

  return (
    <div className="card-premium p-6 space-y-5">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h3 className="font-black text-gray-900 flex items-center">
            {status.enabled ? <ShieldCheck className="h-5 w-5 mr-2 text-emerald-500" /> : <ShieldOff className="h-5 w-5 mr-2 text-gray-400" />}
            İki Aşamalı Doğrulama (2FA)
          </h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-xl">
            Girişte şifrenize ek olarak telefonunuzdaki doğrulama uygulamasının (Google Authenticator, Microsoft Authenticator, 1Password…) ürettiği 6 haneli kod istenir.
          </p>
        </div>
        <span className={`pill-badge shrink-0 ${status.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{status.enabled ? 'Açık' : 'Kapalı'}</span>
      </div>

      {recoveryCodes && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <p className="text-sm font-black text-amber-800">Kurtarma kodlarınızı şimdi kaydedin</p>
          <p className="text-xs text-amber-800">Telefonunuza erişemezseniz bu kodlarla giriş yapabilirsiniz. Her kod bir kez kullanılır ve bu ekran bir daha gösterilmez.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-sm font-bold text-gray-800">
            {recoveryCodes.map((c) => <span key={c} className="bg-white rounded-lg px-3 py-2 text-center">{c}</span>)}
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))} className="flex items-center text-xs font-black text-amber-800 hover:underline"><Copy className="h-3.5 w-3.5 mr-1" /> Kopyala</button>
            <button onClick={downloadCodes} className="flex items-center text-xs font-black text-amber-800 hover:underline"><Download className="h-3.5 w-3.5 mr-1" /> İndir (.txt)</button>
            <button onClick={() => setRecoveryCodes(null)} className="ml-auto text-xs font-black text-gray-500 hover:underline">Kaydettim</button>
          </div>
        </div>
      )}

      {!status.enabled && !setup && <button onClick={start} className="btn-gradient">2FA'yı Aç</button>}

      {setup && (
        <form onSubmit={enable} className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start">
          <img src={setup.qr} alt="QR kod" className="w-44 h-44 rounded-xl bg-white p-2 border border-gray-100" />
          <div className="space-y-4">
            <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
              <li>Doğrulama uygulamasında “hesap ekle”ye basıp QR kodu okutun.</li>
              <li>QR okutamıyorsanız anahtarı elle girin: <code className="font-mono font-bold text-gray-900 break-all">{setup.secret}</code></li>
              <li>Uygulamanın gösterdiği 6 haneli kodu girip onaylayın.</li>
            </ol>
            <div className="flex gap-3">
              <input required autoFocus inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="premium-input max-w-[10rem] text-center tracking-[0.4em] font-black" />
              <button disabled={code.length !== 6} className="btn-gradient disabled:opacity-50">Onayla</button>
              <button type="button" onClick={() => setSetup(null)} className="text-xs font-black text-gray-400 hover:text-gray-700">Vazgeç</button>
            </div>
          </div>
        </form>
      )}

      {status.enabled && !disableForm && (
        <div className="flex items-center gap-4">
          <p className="text-xs text-gray-500">Kalan kurtarma kodu: <b>{status.recoveryCodesLeft}</b></p>
          <button onClick={() => setDisableForm({ password: '', code: '' })} className="text-xs font-black text-red-500 hover:underline">2FA'yı kapat</button>
        </div>
      )}
      {disableForm && (
        <form onSubmit={disable} className="flex flex-wrap gap-3 items-end">
          <div><label className="premium-label">Şifre</label><input type="password" required className="premium-input" value={disableForm.password} onChange={(e) => setDisableForm({ ...disableForm, password: e.target.value })} /></div>
          <div><label className="premium-label">Kod / Kurtarma Kodu</label><input required className="premium-input" value={disableForm.code} onChange={(e) => setDisableForm({ ...disableForm, code: e.target.value })} /></div>
          <button className="px-5 py-3 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest">Kapat</button>
          <button type="button" onClick={() => setDisableForm(null)} className="text-xs font-black text-gray-400">Vazgeç</button>
        </form>
      )}
    </div>
  );
};

export default TwoFactorSettings;
