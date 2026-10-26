import React, { useEffect, useState } from 'react';
import { UserPlus, KeyRound, Crown, X } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSION_LABELS } from '../../utils/permissions';
import { formatDate } from '../../utils/format';

const PermissionChips = ({ value, onChange, disabled }) => (
  <div className="flex flex-wrap gap-2">
    {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
      const on = value.includes(key);
      return (
        <button key={key} type="button" disabled={disabled} onClick={() => onChange(on ? value.filter(v => v !== key) : [...value, key])}
          className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'} disabled:opacity-60`}>
          {label}
        </button>
      );
    })}
  </div>
);

const TeamSettings = ({ showAlert, confirm }) => {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [invite, setInvite] = useState(null);

  const load = () => api.get('/team/admins').then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (u, patch) => {
    try {
      await api.patch(`/team/admins/${u.id}`, patch);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Güncellenemedi.') });
    }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/team/admins', invite);
      setInvite(null);
      showAlert({ type: res.data.message.includes('gönderilemedi') ? 'warning' : 'success', title: 'Kullanıcı Eklendi', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kullanıcı eklenemedi.') });
    }
  };

  const resetPassword = async (u) => {
    if (!(await confirm({ title: 'Şifre sıfırlansın mı?', message: `${u.email} adresine yeni şifre gönderilecek.`, confirmText: 'Sıfırla' }))) return;
    const res = await api.post(`/team/admins/${u.id}/reset-password`);
    showAlert({ type: 'info', title: 'Şifre', message: res.data.message });
  };

  if (!data) return <p className="text-center text-gray-400 py-10">Yükleniyor...</p>;

  return (
    <div className="space-y-6">
      <div className="card-premium p-6 space-y-2">
        <h3 className="font-black text-gray-900">Yetkiler</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {Object.entries(data.permissions).map(([key, desc]) => (
            <div key={key} className="bg-gray-50 rounded-xl p-3"><p className="text-xs font-black text-gray-800">{PERMISSION_LABELS[key]}</p><p className="text-[11px] text-gray-500 mt-1">{desc}</p></div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 font-semibold">Firma sahibi tüm yetkilere sahiptir. Ana sayfa (özet) tüm yöneticilere açıktır.</p>
      </div>

      <div className="card-premium divide-y divide-gray-50">
        <div className="p-6 flex justify-between items-center">
          <h3 className="font-black text-gray-900">Ekip ({data.users.length})</h3>
          <button onClick={() => setInvite({ name: '', email: '', permissions: ['ORDERS'] })} className="btn-gradient"><UserPlus className="h-4 w-4 mr-2" /> Kullanıcı Ekle</button>
        </div>

        {invite && (
          <form onSubmit={sendInvite} className="p-6 bg-indigo-50/40 space-y-4">
            <div className="flex justify-between"><p className="text-sm font-black text-gray-900">Yeni ekip üyesi</p><button type="button" onClick={() => setInvite(null)} className="text-gray-400"><X className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input required className="premium-input !bg-white" placeholder="Ad Soyad" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <input required type="email" className="premium-input !bg-white" placeholder="E-posta" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            <PermissionChips value={invite.permissions} onChange={(permissions) => setInvite({ ...invite, permissions })} />
            <p className="text-[11px] text-gray-500">Güçlü bir şifre üretilip e-posta ile gönderilir.</p>
            <button type="submit" className="btn-gradient">Ekle ve Davet Gönder</button>
          </form>
        )}

        {data.users.map((u) => (
          <div key={u.id} className={`p-6 flex flex-col lg:flex-row lg:items-center gap-4 ${u.isActive ? '' : 'opacity-50'}`}>
            <div className="lg:w-64">
              <p className="font-bold text-gray-900 flex items-center">{u.name}{u.isOwner && <Crown className="h-4 w-4 ml-1.5 text-amber-500" title="Firma sahibi" />}{u.id === me?.id && <span className="ml-2 text-[10px] text-indigo-500 font-black">SİZ</span>}</p>
              <p className="text-xs text-gray-400">{u.email}</p>
              <p className="text-[10px] text-gray-400">Son giriş: {u.lastLoginAt ? formatDate(u.lastLoginAt, true) : '—'}</p>
            </div>
            <div className="flex-1">
              {u.isOwner ? <p className="text-xs font-black text-amber-600">Firma sahibi · tüm yetkiler</p>
                : <PermissionChips value={u.permissions || []} onChange={(permissions) => save(u, { permissions })} />}
            </div>
            {!u.isOwner && (
              <div className="flex items-center gap-2">
                <button onClick={() => resetPassword(u)} className="p-2.5 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50" title="Şifre sıfırla"><KeyRound className="h-4 w-4" /></button>
                {u.id !== me?.id && (
                  <button onClick={() => save(u, { isActive: !u.isActive })} className={`px-3 py-2 rounded-xl text-[11px] font-black ${u.isActive ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {u.isActive ? 'Erişimi Kapat' : 'Erişimi Aç'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamSettings;
