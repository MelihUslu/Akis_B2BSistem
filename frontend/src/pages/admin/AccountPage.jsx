import { useState } from 'react';
import { KeyRound, UserCircle2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import TwoFactorSettings from '../../components/settings/TwoFactorSettings';
import NotificationPrefs from '../../components/settings/NotificationPrefs';

// Yöneticinin kendi hesabı: şifre ve iki aşamalı doğrulama
const AccountPage = () => {
  const { user } = useAuth();
  const { alertElement, showAlert } = useAlert();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', repeat: '' });

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.newPassword !== pw.repeat) return showAlert({ type: 'error', title: 'Hata', message: 'Yeni şifreler eşleşmiyor.' });
    try {
      const res = await api.post('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      if (res.data.token) localStorage.setItem('akis_token', res.data.token);
      setPw({ currentPassword: '', newPassword: '', repeat: '' });
      showAlert({ type: 'success', title: 'Şifre Değişti', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Şifre değiştirilemedi.') });
    }
  };

  const set = (k) => (e) => setPw({ ...pw, [k]: e.target.value });

  return (
    <div className="space-y-8 max-w-4xl">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="page-icon"><UserCircle2 className="h-6 w-6 text-brand-400" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Hesabım</h1>
          <p className="text-gray-500 text-sm mt-1"><UserCircle2 className="h-4 w-4 mr-1" /> {user?.name} · {user?.email}</p>
        </div>
      </div>

      <NotificationPrefs showAlert={showAlert} />

      {user?.impersonatedBy ? (
        <div className="card-premium p-6 text-sm text-gray-500">Destek oturumunda şifre ve iki aşamalı doğrulama ayarları değiştirilemez.</div>
      ) : (
        <>
          <TwoFactorSettings client={api} base="/auth/2fa" showAlert={showAlert} />

          <form onSubmit={changePassword} className="card-premium p-6 space-y-4">
            <h3 className="font-black text-gray-900 flex items-center"><KeyRound className="h-5 w-5 mr-2 text-brand-500" /> Şifre Değiştir</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="premium-label">Mevcut Şifre</label><input type="password" required className="premium-input" value={pw.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" /></div>
              <div><label className="premium-label">Yeni Şifre</label><input type="password" required minLength={8} className="premium-input" value={pw.newPassword} onChange={set('newPassword')} autoComplete="new-password" /></div>
              <div><label className="premium-label">Yeni Şifre (Tekrar)</label><input type="password" required minLength={8} className="premium-input" value={pw.repeat} onChange={set('repeat')} autoComplete="new-password" /></div>
            </div>
            <button className="btn-gradient">Şifreyi Güncelle</button>
          </form>
        </>
      )}
    </div>
  );
};

export default AccountPage;
