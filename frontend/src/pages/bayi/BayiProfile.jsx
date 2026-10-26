import React, { useEffect, useState } from 'react';
import { User, Building2, KeyRound, Phone, Mail, MapPin, Award } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import DealerUsersModal from '../../components/admin/DealerUsersModal';
import { Users } from 'lucide-react';
import { formatTRY } from '../../utils/format';

const Field = ({ icon: Icon, label, value }) => (
  <div className="flex items-start space-x-3">
    <div className="p-2 bg-gray-50 rounded-xl text-gray-400"><Icon className="h-4 w-4" /></div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      <p className="text-sm font-bold text-gray-800 mt-0.5">{value || '-'}</p>
    </div>
  </div>
);

const BayiProfile = () => {
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const { alertElement, showAlert, confirm } = useAlert();

  useEffect(() => {
    api.get('/auth/me').then((res) => setMe(res.data)).catch(() => {});
  }, []);

  const changePassword = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) {
      showAlert({ type: 'warning', title: 'Şifreler Eşleşmiyor', message: 'Yeni şifre ve tekrarı aynı olmalıdır.' });
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      showAlert({ type: 'success', title: 'Şifre Güncellendi', message: res.data.message });
    } catch (error) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(error, 'Şifre güncellenemedi.') });
    } finally {
      setSaving(false);
    }
  };

  if (!me) return <div className="p-8 text-center text-gray-400">Yükleniyor...</div>;
  const company = me.company || {};

  return (
    <div className="space-y-6 md:space-y-8 max-w-5xl mx-auto">
      {alertElement}
      <div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 md:p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><User className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Hesap Ayarları</h1>
            <p className="text-gray-500 text-sm mt-1">Firma bilgileriniz ve giriş güvenliğiniz.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-premium p-5 md:p-8 space-y-6">
          <h3 className="font-black text-gray-900 flex items-center"><Building2 className="h-5 w-5 mr-2 text-indigo-500" /> Firma Bilgileri</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Field icon={Building2} label="Unvan" value={company.name} />
            <Field icon={User} label="Yetkili" value={company.authorizedPerson || me.name} />
            <Field icon={Mail} label="E-posta" value={me.email} />
            <Field icon={Phone} label="Telefon" value={company.phone} />
            <Field icon={Award} label="Bayi Grubu" value={company.dealerGroup} />
            <Field icon={Building2} label="Vergi Dairesi / No" value={[company.taxOffice, company.taxNumber].filter(Boolean).join(' / ')} />
          </div>
          <Field icon={MapPin} label="Adres" value={company.address} />
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-50 text-center">
            <div><p className="text-[10px] font-black text-gray-400 uppercase">İskonto</p><p className="font-black text-gray-900">%{company.netDiscount || 0}</p></div>
            <div><p className="text-[10px] font-black text-gray-400 uppercase">Min. Sipariş</p><p className="font-black text-gray-900">{formatTRY(company.minOrderAmount)}</p></div>
            <div><p className="text-[10px] font-black text-gray-400 uppercase">Vade</p><p className="font-black text-gray-900">{company.paymentTermDays} gün</p></div>
          </div>
          {company.plasiyer && (
            <p className="text-xs font-bold text-gray-500 bg-indigo-50/60 p-4 rounded-2xl">
              Müşteri temsilciniz: <span className="text-indigo-700">{company.plasiyer.name}</span> · {company.plasiyer.email}
            </p>
          )}
          <p className="text-[11px] text-gray-400 font-semibold">Firma bilgilerinde değişiklik için müşteri temsilcinizle iletişime geçin.</p>
        </div>

        <form onSubmit={changePassword} className="card-premium p-5 md:p-8 space-y-5">
          <h3 className="font-black text-gray-900 flex items-center"><KeyRound className="h-5 w-5 mr-2 text-indigo-500" /> Şifre Değiştir</h3>
          <div>
            <label className="premium-label">Mevcut Şifre</label>
            <input required type="password" autoComplete="current-password" className="premium-input" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </div>
          <div>
            <label className="premium-label">Yeni Şifre (en az 8 karakter)</label>
            <input required minLength={8} type="password" autoComplete="new-password" className="premium-input" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          </div>
          <div>
            <label className="premium-label">Yeni Şifre (Tekrar)</label>
            <input required minLength={8} type="password" autoComplete="new-password" className="premium-input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </div>
          <button type="submit" disabled={saving} className="w-full btn-gradient disabled:opacity-60">{saving ? 'Kaydediliyor...' : 'Şifreyi Güncelle'}</button>
        </form>
      </div>

      {me.isOwner ? (
        <div className="card-premium p-5 md:p-8 space-y-4">
          <h3 className="font-black text-gray-900 flex items-center"><Users className="h-5 w-5 mr-2 text-indigo-500" /> Firma Kullanıcıları</h3>
          <p className="text-sm text-gray-500">Şubeleriniz veya çalışanlarınız için ayrı giriş hesabı açın. Herkes aynı cari hesabı ve siparişleri görür.</p>
          <DealerUsersModal inline base="/team/my-company" showAlert={showAlert} confirm={confirm} />
        </div>
      ) : (
        <p className="text-xs text-gray-400">Kullanıcı eklemek için firmanızın ana kullanıcısıyla iletişime geçin.</p>
      )}
    </div>
  );
};

export default BayiProfile;
