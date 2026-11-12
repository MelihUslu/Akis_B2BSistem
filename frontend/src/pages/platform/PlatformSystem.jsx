import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Database, HardDrive, RefreshCw, Coins, DownloadCloud, ShieldAlert, ShieldCheck, Copy, Check, ExternalLink } from 'lucide-react';
import { platformApi } from '../../services/api';
import { formatDate } from '../../utils/format';

const Dot = ({ ok }) => (ok === null || ok === undefined
  ? <span className="h-2.5 w-2.5 rounded-full bg-gray-300 shrink-0" />
  : <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />);

const size = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

// Kopyalanabilir komut satırı
const Copyable = ({ text }) => {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); };
  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 text-xs bg-gray-900 text-gray-100 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">{text}</code>
      <button onClick={copy} className="shrink-0 h-8 px-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1">{done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{done ? 'Kopyalandı' : 'Kopyala'}</button>
    </div>
  );
};

/**
 * Güncelleme bildirimi: yeni sürüm (GitHub Version.X) + güvenlik açığı (npm audit).
 * Yalnızca BİLDİRİR ve hazır komutu gösterir; güncellemeyi sunucuda SSH'tan siz yaparsınız (güvenli yapı).
 */
const UpdatesCard = () => {
  const [u, setU] = useState(null);
  const [tries, setTries] = useState(0);
  const [checking, setChecking] = useState(false);
  const load = (refresh) => {
    if (refresh) { setChecking(true); setTries(0); }
    platformApi.get('/updates', { params: refresh ? { refresh: 1 } : {} })
      .then((r) => setU(r.data)).catch(() => setU({ failed: true })).finally(() => { if (refresh) setChecking(false); });
  };
  useEffect(() => { load(false); }, []);
  // Arka plan denetimi sürüyorsa (son sürüm / güvenlik henüz null) birkaç kez otomatik yenile
  useEffect(() => {
    if (!u || u.failed) return;
    const pending = u.latest === null || u.security === null;
    if (pending && tries < 4) { const t = setTimeout(() => { setTries((n) => n + 1); load(false); }, 3000); return () => clearTimeout(t); }
  }, [u, tries]);

  if (!u || u.failed) return null;
  const sec = u.security;
  const secCount = sec && !sec.error ? (sec.high || 0) + (sec.critical || 0) : 0;
  const pending = u.latest === null || u.security === null;
  const actionNeeded = u.updateAvailable || u.securityUpdate;

  return (
    <div className={`rounded-2xl p-5 ring-1 ${actionNeeded ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-gray-100'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center font-black text-gray-900"><DownloadCloud className="h-4 w-4 mr-2 text-brand-500" /> Güncellemeler</p>
        <div className="flex items-center gap-2">
          {!pending && !actionNeeded && <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full"><ShieldCheck className="h-3.5 w-3.5" /> Güncel</span>}
          {u.updateAvailable && <span className="text-xs font-black text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">Yeni sürüm: {u.latest}</span>}
          {u.securityUpdate && <span className="inline-flex items-center gap-1 text-xs font-black text-red-700 bg-red-100 px-2.5 py-1 rounded-full"><ShieldAlert className="h-3.5 w-3.5" /> Güvenlik: {secCount} açık</span>}
          <button onClick={() => load(true)} disabled={checking} className="h-8 px-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} /> Denetle</button>
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-700 flex flex-wrap gap-x-6 gap-y-1">
        <span>Çalışan sürüm: <b>{u.current || 'bilinmiyor'}</b></span>
        <span>Son sürüm: <b>{u.latest || (pending ? 'kontrol ediliyor…' : 'alınamadı')}</b></span>
        {sec && sec.error && <span className="text-amber-700">Güvenlik denetimi yapılamadı</span>}
        {sec && !sec.error && secCount === 0 && !pending && <span className="text-emerald-700">Bilinen yüksek/kritik açık yok</span>}
      </div>
      {!u.versionKnown && <p className="mt-1 text-xs text-gray-500">Çalışan sürüm görünmüyor: dağıtımda <code className="bg-gray-100 px-1 rounded">APP_VERSION</code> verilmemiş (docs/canliya-cikis.md §7).</p>}

      {actionNeeded && (
        <div className="mt-4 space-y-3 border-t border-amber-200/70 pt-4">
          <p className="text-xs font-bold text-gray-800">Sunucuda sırayla çalıştırın (SSH). Önce mutlaka yedek alın:</p>
          <div><p className="text-xs font-semibold text-gray-500 mb-1">1) Yedek</p><Copyable text={u.commands.backup} /></div>
          <div><p className="text-xs font-semibold text-gray-500 mb-1">2) Güncelle</p><Copyable text={u.commands.update} /></div>
          <div><p className="text-xs font-semibold text-gray-500 mb-1">Sorun olursa geri al</p><Copyable text={u.commands.rollback} /></div>
          <p className="text-xs text-amber-800 bg-amber-100/60 rounded-lg px-3 py-2">⚠ Güncelleme veritabanı şemasını değiştirdiyse geri alma, yedekten geri yükleme gerektirir (son birkaç dakikanın verisi kaybolabilir). Migration'sız güncellemeler sorunsuz geri alınır.</p>
          <div className="flex flex-wrap gap-4 text-xs">
            <a href={u.releasesUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-600 hover:underline inline-flex items-center gap-1">Sürüm notları <ExternalLink className="h-3 w-3" /></a>
            {u.compareUrl && <a href={u.compareUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-600 hover:underline inline-flex items-center gap-1">Değişiklikler <ExternalLink className="h-3 w-3" /></a>}
          </div>
        </div>
      )}
    </div>
  );
};

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
          <div className="page-icon"><Activity className="h-6 w-6 text-brand-400" /></div>
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

      <UpdatesCard />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><Database className="h-4 w-4 mr-2 text-brand-500" /> Veritabanı ve Redis</p>
          <p className="flex items-center gap-2 text-sm"><Dot ok={s.db.ok} /> Veritabanı {s.db.ok ? `(${s.db.ms} ms)` : 'ulaşılamıyor'}</p>
          <p className="flex items-center gap-2 text-sm"><Dot ok={s.redis.ok} /> Redis {s.redis.ok === null ? '— tanımlı değil' : s.redis.ok ? 'bağlı' : 'bağlı değil'}</p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><HardDrive className="h-4 w-4 mr-2 text-brand-500" /> Son yedek</p>
          {!b.configured ? <p className="text-sm text-gray-500">{b.note}</p> : b.file ? (
            <>
              <p className="flex items-center gap-2 text-sm"><Dot ok={b.ok} /> {formatDate(b.at, true)} ({b.ageHours} saat önce)</p>
              <p className="text-xs text-gray-500">{b.file} · {size(b.size)} · toplam {b.count} yedek</p>
              {!b.ok && <p className="text-xs font-bold text-red-600">Son yedek 26 saatten eski; yedek servisini kontrol edin.</p>}
            </>
          ) : <p className="flex items-center gap-2 text-sm text-red-600"><Dot ok={false} /> {b.note}</p>}
          {b.configured && (
            <p className="flex items-center gap-2 text-sm"><Dot ok={s.drive.configured ? s.drive.ok : (s.nodeEnv === 'production' ? false : null)} /> Google Drive: {!s.drive.configured ? 'kurulmadı' : s.drive.lastOkAt ? `${s.drive.ageHours} saat önce` : 'hiç kopyalanmadı'}{s.drive.configured && !s.drive.ok && s.drive.error ? ' (son deneme hatalı)' : ''}</p>
          )}
          <Link to="/backups" className="inline-block text-xs font-bold text-brand-600 hover:underline">Yedek geçmişi →</Link>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><Coins className="h-4 w-4 mr-2 text-brand-500" /> Döviz kuru</p>
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
