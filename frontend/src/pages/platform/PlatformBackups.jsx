import { useEffect, useMemo, useState } from 'react';
import { DatabaseBackup, HardDrive, Cloud, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink, FolderOpen, CalendarClock } from 'lucide-react';
import { platformApi } from '../../services/api';
import { formatDate } from '../../utils/format';

const size = (n) => (!n ? '—' : n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const duration = (a, b) => {
  const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000));
  return s < 60 ? `${s} sn` : `${Math.floor(s / 60)} dk ${s % 60} sn`;
};
const TRIGGER = { zamanli: 'Zamanlanmış', acilis: 'Servis açılışı', elle: 'Elle' };
const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5;
const Dot = ({ ok }) => <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />;
const Code = ({ children }) => <code className="block whitespace-pre-wrap break-all text-xs bg-gray-900 text-gray-100 rounded-lg px-3 py-2 my-1.5">{children}</code>;
const Td = ({ children, className = '' }) => <td className={`py-3 pr-4 align-top ${className}`}>{children}</td>;

// Drive sütunu: bağlantı (saklama süresi dolduysa silindi), aylık kopya, gönderilen dosya sayısı ya da hata
const DriveCell = ({ run }) => {
  const d = run.drive || {};
  if (d.status === 'kapali' || !d.status) return <span className="text-gray-400" title="Google Drive kopyası kurulmadı">—</span>;
  if (d.status === 'atlandi') return <span className="text-gray-500">Atlandı (yerel yedek alınamadı)</span>;
  if (d.status === 'hata') return <span className="text-red-600 text-xs font-semibold break-words">{d.error || 'Kopyalanamadı'}</span>;
  const age = daysSince(run.end);
  const dailyGone = age > (run.keep?.drive ?? 30);
  const monthlyGone = age > (run.keep?.months ?? 12) * 31;
  return (
    <div className="space-y-1">
      {dailyGone
        ? <span className="text-xs text-gray-400">Günlük kopya silindi ({run.keep?.drive ?? 30} gün doldu)</span>
        : d.link
          ? <a href={d.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 font-bold hover:underline"><ExternalLink className="h-3.5 w-3.5" /> Drive'da aç</a>
          : <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="h-3.5 w-3.5" /> Kopyalandı</span>}
      {d.monthlyLink && !monthlyGone && (
        <a href={d.monthlyLink} target="_blank" rel="noreferrer" className="block text-xs text-brand-600 hover:underline">Aylık kopya ({run.keep?.months ?? 12} ay saklanır)</a>
      )}
      <p className="text-xs text-gray-500">{d.synced ? `${d.synced} yeni / değişen dosya gönderildi` : 'Dosyalarda değişiklik yok'}</p>
    </div>
  );
};

// Durum: başarılı · sunucuda alındı ama Drive'a gitmedi (ayrıntı Drive sütununda) · hata
const Status = ({ run }) => {
  if (run.ok) return <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="h-4 w-4" /> Başarılı</span>;
  if (run.drive?.status === 'hata' && run.db?.file) {
    return <div><span className="inline-flex items-center gap-1 text-amber-700 font-bold"><AlertTriangle className="h-4 w-4" /> Drive'a gitmedi</span><p className="text-xs text-gray-500 mt-0.5">Sunucudaki yedek alındı</p></div>;
  }
  return <div><span className="inline-flex items-center gap-1 text-red-600 font-bold"><XCircle className="h-4 w-4" /> Hata</span><p className="text-xs text-red-600 break-words mt-0.5">{run.error}</p></div>;
};
const When = ({ run }) => (
  <div>
    <p className="font-semibold text-gray-900 whitespace-nowrap">{formatDate(run.start, true)}</p>
    <p className="text-xs text-gray-500 whitespace-nowrap">{TRIGGER[run.trigger] || run.trigger} · {duration(run.start, run.end)}</p>
  </div>
);

/**
 * Yedekler: yedek servisinin (scripts/backup.sh) her çalışması — ne zaman, ne alındı, Google Drive kopyası ve hata.
 * Veri sunucudaki backups/.yedek-gecmisi.jsonl'dan gelir (son 500 çalışma).
 */
const PlatformBackups = () => {
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState({ from: '', to: '', errorsOnly: false });
  useEffect(() => { platformApi.get('/backups').then((r) => setData(r.data)).catch(() => setData({ failed: true })); }, [version]);

  const runs = useMemo(() => (data?.runs || []).filter((r) => {
    const day = r.start.slice(0, 10); // sunucu saatiyle (İstanbul) gün
    return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to) && (!filter.errorsOnly || !r.ok);
  }), [data, filter]);

  if (!data) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  if (data.failed) return <p className="p-10 text-center text-gray-500">Yedek bilgisi alınamadı.</p>;
  const { backup: b, drive } = data;
  const latest = data.runs[0];
  const keep = latest?.keep || { local: 14, drive: 30, months: 12 };
  const failedCount = data.runs.filter((r) => !r.ok).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><DatabaseBackup className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Yedekler</h1>
            <p className="text-gray-500 text-sm mt-1">Veritabanı ve yüklenen dosyalar her gün {latest?.time || '03:00'}'da yedeklenir{drive.configured ? '; şifreli kopyası Google Drive\'a gider' : ''}.</p>
          </div>
        </div>
        <button onClick={() => setVersion((v) => v + 1)} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><RefreshCw className="h-4 w-4 mr-1.5" /> Yenile</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><HardDrive className="h-4 w-4 mr-2 text-brand-500" /> Sunucudaki son yedek</p>
          {!b.configured ? <p className="text-sm text-gray-500">{b.note}</p> : b.file ? (
            <>
              <p className="flex items-center gap-2 text-sm"><Dot ok={b.ok} /> {formatDate(b.at, true)} ({b.ageHours} saat önce)</p>
              <p className="text-xs text-gray-500">{b.file} · {size(b.size)} · sunucuda {b.count} yedek</p>
              {!b.ok && <p className="text-xs font-bold text-red-600">Son yedek 26 saatten eski; yedek servisini kontrol edin.</p>}
            </>
          ) : <p className="flex items-center gap-2 text-sm text-red-600"><Dot ok={false} /> {b.note}</p>}
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><Cloud className="h-4 w-4 mr-2 text-brand-500" /> Google Drive kopyası</p>
          {!drive.configured ? <p className="flex items-center gap-2 text-sm text-amber-700"><Dot ok={false} /> Kurulmadı: sunucu dışı yedek yok</p> : (
            <>
              <p className="flex items-center gap-2 text-sm"><Dot ok={drive.ok} /> {drive.lastOkAt ? `Son başarılı: ${formatDate(drive.lastOkAt, true)} (${drive.ageHours} saat önce)` : 'Hiç başarılı kopya yok'}</p>
              {drive.error && <p className="text-xs font-semibold text-red-600 break-words">Son deneme: {drive.error}</p>}
              {drive.folderLink && <a href={drive.folderLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:underline"><FolderOpen className="h-4 w-4" /> Drive klasörünü aç</a>}
            </>
          )}
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-2">
          <p className="flex items-center font-black text-gray-900"><CalendarClock className="h-4 w-4 mr-2 text-brand-500" /> Plan ve saklama</p>
          <p className="text-sm text-gray-700">Her gün {latest?.time || '03:00'} (bayilerin çalışmadığı saat)</p>
          <p className="text-xs text-gray-500">Sunucuda {keep.local} gün · Drive'da günlükler {keep.drive} gün, her ayın ilk yedeği {keep.months} ay. Değişen / silinen dosyaların eski hâli Drive'da {keep.drive} gün durur.</p>
        </div>
      </div>

      {!drive.configured && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-100 p-5 text-sm text-amber-900">
          <p className="font-black mb-1">Google Drive kopyasını kurun (bir kez, ~5 dk)</p>
          <p>1) Tarayıcısı olan bir bilgisayarda rclone kurun (Mac: <code>brew install rclone</code>) ve yedeklerin gideceği Google hesabıyla giriş yapın; ekrana yazılan <code>{'{"access_token":…}'}</code> satırını kopyalayın:</p>
          <Code>rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"</Code>
          <p>2) Sunucuda, proje klasöründe:</p>
          <Code>{"docker compose -f docker-compose.prod.yml exec backup /scripts/drive-setup.sh '<kopyalanan satır>'"}</Code>
          <p className="text-xs mt-1">Yedekler şifrelenir; kurulumun sonunda gösterilen şifreyi parola yöneticisine kaydedin. rclone Drive'da yalnızca kendi oluşturduğu dosyaları görebilir.</p>
        </div>
      )}

      <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <p className="font-black text-gray-900">Yedek geçmişi</p>
            <p className="text-xs text-gray-500">{data.runs.length} çalışma{failedCount ? ` · ${failedCount} hatalı` : ''} · gösterilen {runs.length}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} aria-label="Başlangıç tarihi" className="premium-input !py-2 !w-auto text-sm" />
            <span className="text-gray-400">–</span>
            <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} aria-label="Bitiş tarihi" className="premium-input !py-2 !w-auto text-sm" />
            <label className="flex items-center gap-2 px-2 font-semibold text-gray-700">
              <input type="checkbox" checked={filter.errorsOnly} onChange={(e) => setFilter({ ...filter, errorsOnly: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Yalnızca hatalılar
            </label>
          </div>
        </div>
        {runs.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">{data.runs.length ? 'Bu süzgeçte yedek yok.' : 'Henüz kayıt yok: yedek servisi ilk çalışmasında buraya yazar.'}</p> : (
          <>
          {/* Telefonda kart, geniş ekranda tablo */}
          <ul className="md:hidden divide-y divide-gray-100 text-sm">
            {runs.map((r) => (
              <li key={r.start} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-3"><When run={r} /><div className="text-right"><Status run={r} /></div></div>
                <p className="text-xs text-gray-600">
                  Veritabanı {r.db?.file ? `${size(r.db.size)} · ${r.db.tables} tablo` : 'alınamadı'}{r.uploads?.file ? ` · Dosyalar ${size(r.uploads.size)} (${r.uploads.count})` : ''}
                </p>
                <DriveCell run={r} />
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-black text-gray-400 uppercase tracking-wider">
                  {['Tarih', 'Durum', 'Veritabanı', 'Dosyalar', 'Google Drive'].map((h) => <th key={h} className="py-2 pr-4 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map((r) => (
                  <tr key={r.start}>
                    <Td><When run={r} /></Td>
                    <Td className="max-w-xs"><Status run={r} /></Td>
                    <Td className="whitespace-nowrap">{r.db?.file ? <><p className="text-gray-900">{size(r.db.size)}</p><p className="text-xs text-gray-500">{r.db.tables} tablo</p></> : <span className="text-gray-400">Alınamadı</span>}</Td>
                    <Td className="whitespace-nowrap">{r.uploads?.file ? <><p className="text-gray-900">{size(r.uploads.size)}</p><p className="text-xs text-gray-500">{r.uploads.count} dosya</p></> : <span className="text-gray-400">—</span>}</Td>
                    <Td className="min-w-[12rem]"><DriveCell run={r} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <details className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 text-sm text-gray-700">
        <summary className="font-black text-gray-900 cursor-pointer">Geri yükleme ve elle yedek</summary>
        <div className="mt-3 space-y-2">
          <p>Drive'daki dosyalar şifrelidir (adları dahil); "Drive'da aç" ile görülür ama rclone ve yedek şifresiyle açılır. Sunucuda (proje klasöründe):</p>
          <p className="font-semibold">Hemen yedek al</p>
          <Code>docker compose -f docker-compose.prod.yml exec backup /scripts/backup.sh</Code>
          <p className="font-semibold">Drive'daki yedekleri listele ve birini sunucuya indir</p>
          <Code>{'docker compose -f docker-compose.prod.yml exec backup rclone lsl yedek:gunluk\ndocker compose -f docker-compose.prod.yml exec backup rclone copy yedek:gunluk/db-YYYYMMDD-HHMMSS.dump /backups/'}</Code>
          <p>İndirilen dosyayı önce ayrı bir veritabanına yükleyip kontrol edin, sonra asıl veritabanına: <code>docs/canliya-cikis.md</code> → 6. Yedekleme ve geri yükleme. Sunucu tamamen kaybolduysa yeni sunucuda <code>YEDEK_SIFRESI</code> ile kurulum yapılır (aynı belgede).</p>
        </div>
      </details>
    </div>
  );
};

export default PlatformBackups;
