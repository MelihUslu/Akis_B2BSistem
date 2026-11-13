import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Ban, Trash2, RefreshCw, ShieldX } from 'lucide-react';
import { platformApi } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import TwoFactorSettings from '../../components/settings/TwoFactorSettings';
import { formatDate } from '../../utils/format';

const remaining = (expiresAt) => {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'doldu';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`;
};

const EVENT_LABEL = {
  BLOCK: { text: 'Bloke edildi', cls: 'text-red-700 bg-red-50' },
  BLOCKED_HIT: { text: 'Bloke IP denedi', cls: 'text-amber-700 bg-amber-50' },
  UNBLOCK: { text: 'Bloke kaldırıldı', cls: 'text-emerald-700 bg-emerald-50' }
};

const AttackBlocks = ({ showAlert }) => {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const load = () => platformApi.get('/security').then((r) => setData(r.data)).catch(() => setData({ blocks: [], events: [], failed: true }));
  useEffect(() => { load(); }, []);

  const unblock = async (ip) => {
    setBusy(ip);
    try { await platformApi.delete(`/security/blocks/${encodeURIComponent(ip)}`); showAlert('Bloke kaldırıldı.'); load(); }
    catch { showAlert('Bloke kaldırılamadı.', 'error'); }
    finally { setBusy(''); }
  };

  if (!data) return <p className="text-sm text-gray-400">Yükleniyor…</p>;
  const blocks = data.blocks || [];
  const events = data.events || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black text-gray-900"><ShieldAlert className="h-5 w-5 text-brand-500" /> Saldırılar ve blokeler</h2>
        <button onClick={load} className="flex items-center px-3 h-9 rounded-lg text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><RefreshCw className="h-4 w-4 mr-1.5" /> Yenile</button>
      </div>
      <p className="text-sm text-gray-500 -mt-2">Arka arkaya başarısız girişte IP otomatik, süreli olarak bloke edilir. Bir kullanıcı haklı yere engellendiyse (iletişime geçince) aşağıdan kaldırabilirsiniz. CAPTCHA (platform girişi): <b>{data.captcha ? 'kurulu' : 'kurulu değil'}</b>.</p>

      <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
        <p className="flex items-center font-black text-gray-900 mb-3"><Ban className="h-4 w-4 mr-2 text-red-500" /> Aktif blokeler ({blocks.length})</p>
        {blocks.length === 0 ? <p className="text-sm text-gray-500">Şu an bloke edilmiş IP yok.</p> : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div key={b.ip} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{b.ip} <span className="text-xs font-semibold text-gray-400">· seviye {b.level + 1}</span></p>
                  <p className="text-xs text-gray-500">{b.reason} · {b.count} deneme · {formatDate(b.createdAt, true)} · kalan {remaining(b.expiresAt)}{b.email ? ` · ${b.email}` : ''}</p>
                </div>
                <button onClick={() => unblock(b.ip)} disabled={busy === b.ip} className="flex items-center px-3 h-9 rounded-lg text-xs font-black text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"><Trash2 className="h-4 w-4 mr-1.5" /> Kaldır</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
        <p className="flex items-center font-black text-gray-900 mb-3"><ShieldX className="h-4 w-4 mr-2 text-brand-500" /> Son olaylar</p>
        {events.length === 0 ? <p className="text-sm text-gray-500">Kayıtlı olay yok.</p> : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {events.map((e, i) => {
              const l = EVENT_LABEL[e.type] || { text: e.type, cls: 'text-gray-600 bg-gray-50' };
              return (
                <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-full shrink-0 ${l.cls}`}>{l.text}</span>
                  <span className="font-mono text-xs text-gray-700">{e.ip}</span>
                  <span className="text-xs text-gray-400 truncate flex-1">{e.detail}{e.endpoint ? ` · ${e.endpoint}` : ''}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatDate(e.at, true)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const PlatformSecurity = () => {
  const { alertElement, showAlert } = useAlert();
  return (
    <div className="space-y-6 max-w-4xl">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="page-icon"><ShieldCheck className="h-6 w-6 text-brand-400" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Güvenlik</h1>
          <p className="text-gray-500 text-sm mt-1">Platform hesabı tüm müşterilere erişebildiği için iki aşamalı doğrulamayı açmanız önerilir.</p>
        </div>
      </div>
      <TwoFactorSettings client={platformApi} base="/me/2fa" showAlert={showAlert} />
      <AttackBlocks showAlert={showAlert} />
    </div>
  );
};

export default PlatformSecurity;
