import { useEffect, useState } from 'react';
import { UserPlus, KeyRound, Crown, X, ChevronDown } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSION_LABELS } from '../../utils/permissions';
import { formatDate } from '../../utils/format';

// Ad Soyad → baş harfler (avatar için)
const initials = (name = '') => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

// Yumuşak geçişli aç/kapa anahtarı
const Toggle = ({ on }) => (
  <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ease-out ${on ? 'bg-brand-600' : 'bg-gray-200'}`}>
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </span>
);

// Her yetki için etiketli aç/kapa; açıklama fareyle üzerine gelince ipucu olarak görünür
const PermissionToggles = ({ value, onChange, disabled, descriptions }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
    {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
      const on = value.includes(key);
      return (
        <button key={key} type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
          title={descriptions?.[key] || ''}
          onClick={() => onChange(on ? value.filter(v => v !== key) : [...value, key])}
          className="group flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg text-left transition-colors hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent">
          <Toggle on={on} />
          <span className={`text-xs font-bold transition-colors duration-200 ${on ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`}>{label}</span>
        </button>
      );
    })}
  </div>
);

const TeamSettings = ({ showAlert, confirm }) => {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [invite, setInvite] = useState(null);
  const [showPerms, setShowPerms] = useState(false); // yetki açıklamaları altta, varsayılan kapalı

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
      <div className="card-premium divide-y divide-gray-50">
        <div className="p-6 flex justify-between items-center">
          <h3 className="font-black text-gray-900">Ekip ({data.users.length})</h3>
          <button onClick={() => setInvite({ name: '', email: '', permissions: ['ORDERS'] })} className="btn-gradient"><UserPlus className="h-4 w-4 mr-2" /> Kullanıcı Ekle</button>
        </div>

        {invite && (
          <form onSubmit={sendInvite} className="p-6 bg-brand-50/40 space-y-4">
            <div className="flex justify-between"><p className="text-sm font-black text-gray-900">Yeni ekip üyesi</p><button type="button" onClick={() => setInvite(null)} className="text-gray-400"><X className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input required className="premium-input !bg-white" placeholder="Ad Soyad" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
              <input required type="email" className="premium-input !bg-white" placeholder="E-posta" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            <PermissionToggles value={invite.permissions} descriptions={data.permissions} onChange={(permissions) => setInvite({ ...invite, permissions })} />
            <p className="text-[11px] text-gray-500">Güçlü bir şifre üretilip e-posta ile gönderilir.</p>
            <button type="submit" className="btn-gradient">Ekle ve Davet Gönder</button>
          </form>
        )}

        {data.users.map((u) => (
          <div key={u.id} className={`p-5 flex flex-col lg:flex-row lg:items-center gap-4 transition-colors ${u.isActive ? 'hover:bg-gray-50/60' : 'opacity-60'}`}>
            {/* Kişi */}
            <div className="flex items-center gap-3 lg:w-72 shrink-0">
              <div className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${u.isOwner ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'}`}>{initials(u.name)}</div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 flex items-center gap-1.5 truncate">
                  {u.name}
                  {u.isOwner && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" title="Firma sahibi" />}
                  {u.id === me?.id && <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded font-black shrink-0">SİZ</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{u.email}</p>
                <p className="text-[11px] text-gray-400">Son giriş: {u.lastLoginAt ? formatDate(u.lastLoginAt, true) : '—'}</p>
              </div>
            </div>
            {/* Yetkiler */}
            <div className="flex-1 min-w-0">
              {u.isOwner
                ? <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl"><Crown className="h-3.5 w-3.5" />Tüm yetkiler</span>
                : <>
                    <p className="text-[11px] font-bold text-gray-400 mb-1.5">{(u.permissions || []).length} / {Object.keys(PERMISSION_LABELS).length} yetki açık</p>
                    <PermissionToggles value={u.permissions || []} descriptions={data.permissions} onChange={(permissions) => save(u, { permissions })} />
                  </>}
            </div>
            {/* Durum + işlemler */}
            <div className="flex items-center gap-2 shrink-0 lg:self-start">
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${u.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{u.isActive ? 'Aktif' : 'Pasif'}</span>
              {!u.isOwner && (
                <>
                  <button onClick={() => resetPassword(u)} className="p-2.5 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50" title="Şifre sıfırla"><KeyRound className="h-4 w-4" /></button>
                  {u.id !== me?.id && (
                    <button onClick={() => save(u, { isActive: !u.isActive })} className={`px-3 py-2 rounded-xl text-[11px] font-black transition-colors ${u.isActive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                      {u.isActive ? 'Erişimi Kapat' : 'Erişimi Aç'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Yetki açıklamaları: ilk girişte dikkat dağıtmasın diye altta ve varsayılan kapalı; açılır */}
      <div className="card-premium overflow-hidden">
        <button type="button" onClick={() => setShowPerms((v) => !v)} aria-expanded={showPerms}
          className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50/60 transition-colors">
          <div>
            <h3 className="font-black text-gray-900">Yetki açıklamaları</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Her yetkinin ne işe yaradığını görmek için açın · firma sahibi tüm yetkilere sahiptir</p>
          </div>
          <ChevronDown className={`h-5 w-5 shrink-0 text-gray-400 transition-transform duration-300 ${showPerms ? 'rotate-180' : ''}`} />
        </button>
        {showPerms && (
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(data.permissions).map(([key, desc]) => (
              <div key={key} className="bg-gray-50 rounded-xl p-3"><p className="text-xs font-black text-gray-800">{PERMISSION_LABELS[key]}</p><p className="text-[11px] text-gray-500 mt-1">{desc}</p></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamSettings;
