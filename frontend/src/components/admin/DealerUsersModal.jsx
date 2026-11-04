import { useEffect, useState } from 'react';
import { UserPlus, KeyRound, Crown, Users } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';
import { t } from '../../i18n';
import ModalHeader from '../shared/ModalHeader';

/**
 * Bir bayinin kullanıcıları (şube / çalışan hesapları).
 * base: admin için `/companies/:id/users`, bayinin ana kullanıcısı için `/team/my-company`
 */
const DealerUsersModal = ({ title, base, isAdmin, onClose, showAlert, confirm, inline = false }) => {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(null);

  const load = () => api.get(base).then((r) => setUsers(r.data)).catch(() => setUsers([]));
  useEffect(() => { load(); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post(base, form);
      setForm(null);
      showAlert({ type: res.data.message.includes('gönderilemedi') ? 'warning' : 'success', title: t('Kullanıcı Eklendi'), message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('Kullanıcı eklenemedi.')) });
    }
  };

  const patch = async (u, data) => {
    try {
      await api.patch(`${base}/${u.id}`, data);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('Güncellenemedi.')) });
    }
  };

  const reset = async (u) => {
    if (!(await confirm({ title: t('Şifre sıfırlansın mı?'), message: t('{email} adresine yeni şifre gönderilecek.', { email: u.email }), confirmText: t('Sıfırla') }))) return;
    const res = await api.post(`${base}/${u.id}/reset-password`);
    showAlert({ type: 'info', title: t('Şifre'), message: res.data.message });
  };

  const body = (
    <div className="space-y-4">
      {!users ? <p className="text-center text-gray-400 py-6">{t('Yükleniyor...')}</p> : (
        <div className="divide-y divide-gray-50 border border-gray-100 rounded-2xl">
          {users.map(u => (
            <div key={u.id} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${u.isActive ? '' : 'opacity-50'}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 flex items-center">{u.name}{u.isOwner && <span className="ml-2 inline-flex items-center text-[10px] font-black text-amber-600"><Crown className="h-3 w-3 mr-0.5" /> {t('Ana kullanıcı')}</span>}</p>
                <p className="text-xs text-gray-400">{u.email} · Son giriş: {u.lastLoginAt ? formatDate(u.lastLoginAt, true) : '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && !u.isOwner && u.isActive && <button onClick={() => patch(u, { isOwner: true })} className="px-2.5 py-1.5 rounded-lg text-[10px] font-black text-amber-700 bg-amber-50">{t('Ana Kullanıcı Yap')}</button>}
                <button onClick={() => reset(u)} className="p-2 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50" title={t('Şifre sıfırla')}><KeyRound className="h-4 w-4" /></button>
                {!u.isOwner && (
                  <button onClick={() => patch(u, { isActive: !u.isActive })} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black ${u.isActive ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {u.isActive ? t('Erişimi Kapat') : t('Erişimi Aç')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {form ? (
        <form onSubmit={add} className="bg-brand-50/40 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
          <input required className="premium-input !bg-white" placeholder={t('Ad Soyad / Şube')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required type="email" className="premium-input !bg-white" placeholder={t('E-posta')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <button type="submit" className="btn-gradient">{t('Ekle')}</button>
        </form>
      ) : (
        <button onClick={() => setForm({ name: '', email: '' })} className="flex items-center px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 text-xs font-black hover:bg-brand-100">
          <UserPlus className="h-4 w-4 mr-1.5" /> {t('Kullanıcı Ekle')}
        </button>
      )}
      <p className="text-[11px] text-gray-400">{t('Yeni kullanıcıya güçlü bir şifre üretilip e-posta ile gönderilir. Tüm kullanıcılar aynı cari hesabı ve siparişleri görür.')}</p>
    </div>
  );

  if (inline) return body;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl max-h-[90vh] flex flex-col">
        <ModalHeader icon={Users} title={title} onClose={onClose} closeLabel={t('Kapat')} />
        <div className="p-6 overflow-y-auto">{body}</div>
      </div>
    </div>
  );
};

export default DealerUsersModal;
