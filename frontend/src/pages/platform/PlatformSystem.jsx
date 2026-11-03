import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Database, HardDrive, RefreshCw, Coins } from 'lucide-react';
import { platformApi } from '../../services/api';
import { formatDate } from '../../utils/format';

const Dot = ({ ok }) => (ok === null || ok === undefined
  ? <span className="h-2.5 w-2.5 rounded-full bg-gray-300 shrink-0" />
  : <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />);

const size = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/**
 * Sistem durumu: veritabanı, Redis, son yedek, döviz kuru ve ortam ayarları (değerler gösterilmez, yalnızca var / yok).
 * Ayrıntılı kontrol listesi: docs/canliya-cikis.md · komut satırından: npm run check:config
 */
const PlatformSystem = () => {
  const [s, setS] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => { platformApi.get('/system').then((r) => setS(r.data)).catch(() => setS({ failed: true })); }, [version]);

  if (!s) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  if (s.failed) return <p className="p-10 text-center text-gray-500">Sistem durumu alınamadı.</p>;
  const b = s.backup;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><Activity className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Sistem Durumu</h1>
            <p className="text-gray-500 text-sm mt-1">Ortam: <b>{s.nodeEnv === 'production' ? 'Canlı' : 'Geliştirme'}</b> · çalışma süresi {Math.round(s.uptimeSeconds / 60)} dk. Dış izleme adresi: <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">/health/ready</code></p>
          </div>
        </div>
        <button onClick={() => setVersion((v) => v + 1)} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><RefreshCw className="h-4 w-4 mr-1.5" /> Yenile</button>
      </div>

      {s.config.errors.length > 0 && (
        <div className="rounded-2xl bg-red-50 p-5 space-y-1">
          <p className="flex items-center font-black text-red-700"><XCircle className="h-5 w-5 mr-2" /> Canlı ortam için zorunlu ayar eksik</p>
          {s.config.errors.map((e) => <p key={e} className="text-sm text-red-700">• {e}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><Database className="h-4 w-4 mr-2 text-indigo-500" /> Veritabanı ve Redis</p>
          <p className="flex items-center gap-2 text-sm"><Dot ok={s.db.ok} /> Veritabanı {s.db.ok ? `(${s.db.ms} ms)` : 'ulaşılamıyor'}</p>
          <p className="flex items-center gap-2 text-sm"><Dot ok={s.redis.ok} /> Redis {s.redis.ok === null ? '— tanımlı değil' : s.redis.ok ? 'bağlı' : 'bağlı değil'}</p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><HardDrive className="h-4 w-4 mr-2 text-indigo-500" /> Son yedek</p>
          {!b.configured ? <p className="text-sm text-gray-500">{b.note}</p> : b.file ? (
            <>
              <p className="flex items-center gap-2 text-sm"><Dot ok={b.ok} /> {formatDate(b.at, true)} ({b.ageHours} saat önce)</p>
              <p className="text-xs text-gray-500">{b.file} · {size(b.size)} · toplam {b.count} yedek</p>
              {!b.ok && <p className="text-xs font-bold text-red-600">Son yedek 26 saatten eski; yedek servisini kontrol edin.</p>}
            </>
          ) : <p className="flex items-center gap-2 text-sm text-red-600"><Dot ok={false} /> {b.note}</p>}
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><Coins className="h-4 w-4 mr-2 text-indigo-500" /> Döviz kuru</p>
          <p className="flex items-center gap-2 text-sm"><Dot ok={s.exchangeRates.ok && !s.exchangeRates.stale} /> {s.exchangeRates.source === 'TCMB' ? 'TCMB' : s.exchangeRates.source === 'MANUAL' ? 'Manuel kur (Ayarlar)' : s.exchangeRates.source || 'Alınamadı'}{s.exchangeRates.date && ` · ${s.exchangeRates.date}`}</p>
          {s.exchangeRates.stale && <p className="text-xs text-amber-700">TCMB'ye şu an ulaşılamıyor; son alınan kur kullanılıyor.</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
        <p className="font-black text-gray-900 mb-3">Ortam ayarları</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
          {s.config.items.map((i) => (
            <p key={i.key} className="flex items-start gap-2 text-sm">
              {i.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
              <span><span className="font-semibold text-gray-800">{i.label}</span>{i.note && <span className="block text-xs text-gray-500">{i.note}</span>}</span>
            </p>
          ))}
        </div>
        {s.config.warnings.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-1">
            {s.config.warnings.map((w) => <p key={w} className="text-xs text-amber-800">! {w}</p>)}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformSystem;
