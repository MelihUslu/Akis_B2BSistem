import { useEffect, useState } from 'react';
import { Gauge, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { platformApi } from '../../services/api';
import { formatDate } from '../../utils/format';

/**
 * İzleme: API istek metrikleri, yavaş istekler, arka plan işleri, dış servis çağrıları ve
 * entegrasyon (ERP) API istekleri. Hata ayrıntıları "Hatalar", altyapı "Sistem Durumu" sayfasındadır.
 */
const TABS = [
  { key: 'overview', label: 'Genel' },
  { key: 'jobs', label: 'Arka plan işleri' },
  { key: 'external', label: 'Dış servisler' },
  { key: 'api', label: 'Entegrasyon API' },
  { key: 'slow', label: 'Yavaş istekler' },
];
const PERIODS = [{ hours: 1, label: '1 saat' }, { hours: 24, label: '24 saat' }, { hours: 168, label: '7 gün' }, { hours: 336, label: '14 gün' }];

const num = (n) => Number(n || 0).toLocaleString('tr-TR');
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)} sn` : `${num(n)} ms`);
const Dot = ({ ok }) => <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${ok === null || ok === undefined ? 'bg-gray-300' : ok ? 'bg-emerald-500' : 'bg-red-500'}`} />;
const Card = ({ title, children, action }) => (
  <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
    <div className="flex items-center justify-between mb-3"><p className="font-black text-gray-900">{title}</p>{action}</div>
    {children}
  </div>
);
const Empty = ({ children = 'Bu dönemde kayıt yok.' }) => <p className="text-sm text-gray-400 py-4 text-center">{children}</p>;
const Stat = ({ label, value, sub, tone = 'text-gray-900' }) => (
  <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-4">
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
    <p className={`text-2xl font-black mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
  </div>
);
const Table = ({ head, children }) => (
  <div className="overflow-x-auto -mx-5 px-5">
    <table className="w-full text-sm">
      <thead><tr className="text-left text-[10px] font-black text-gray-400 uppercase tracking-wider">{head.map((h, i) => <th key={i} className={`py-2 pr-4 whitespace-nowrap ${i > 0 && typeof h === 'string' && h.startsWith('#') ? 'text-right' : ''}`}>{typeof h === 'string' ? h.replace(/^#/, '') : h}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-50">{children}</tbody>
    </table>
  </div>
);
const Td = ({ children, right, mono, className = '' }) => <td className={`py-2 pr-4 align-top ${right ? 'text-right tabular-nums whitespace-nowrap' : ''} ${mono ? 'font-mono text-xs' : ''} ${className}`}>{children}</td>;
const RouteCell = ({ method, route }) => <Td mono><span className="text-gray-400 mr-1.5">{method}</span><span className="inline-block min-w-[14rem] break-all">{route}</span></Td>;
const Status = ({ code }) => <span className={`font-mono text-xs font-bold ${code >= 500 ? 'text-red-600' : code >= 400 ? 'text-amber-600' : 'text-emerald-600'}`}>{code ?? '—'}</span>;

const RouteTable = ({ rows, empty }) => (rows.length === 0 ? <Empty>{empty}</Empty> : (
  <Table head={['Uç', '#İstek', '#5xx', '#4xx', '#Ort.', '#En uzun']}>
    {rows.map((r) => (
      <tr key={`${r.method} ${r.route}`}>
        <RouteCell method={r.method} route={r.route} />
        <Td right>{num(r.count)}</Td>
        <Td right className={r.errors ? 'text-red-600 font-bold' : 'text-gray-400'}>{num(r.errors)}</Td>
        <Td right className="text-gray-500">{num(r.clientErrors)}</Td>
        <Td right className={r.avgMs >= 1000 ? 'text-amber-600 font-bold' : ''}>{ms(r.avgMs)}</Td>
        <Td right className="text-gray-500">{ms(r.maxMs)}</Td>
      </tr>
    ))}
  </Table>
));

const Overview = ({ o, goTab }) => {
  const t = o.totals;
  const axisLabel = (v) => (o.bucket === 'day'
    ? new Date(v).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
    : new Date(v).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  const series = o.series.map((s) => ({ ...s, ok: s.count - s.errors - s.clientErrors }));
  const badJobs = o.jobs.filter((j) => j.failures > 0 || j.last?.ok === false);
  const badServices = o.external.filter((e) => e.failures > 0);
  const apiTotal = o.api.reduce((s, a) => s + a.count, 0);
  const apiErrors = o.api.reduce((s, a) => s + a.errors, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="İstek" value={num(t.requests)} />
        <Stat label="Sunucu hatası (5xx)" value={`%${t.errorRate}`} sub={`${num(t.errors)} istek`} tone={t.errorRate >= 1 ? 'text-red-600' : 'text-gray-900'} />
        <Stat label="Ortalama süre" value={ms(t.avgMs)} sub={`en uzun ${ms(t.maxMs)}`} tone={t.avgMs >= 500 ? 'text-amber-600' : 'text-gray-900'} />
        <Stat label="1 sn üzeri" value={num(t.slow)} tone={t.slow ? 'text-amber-600' : 'text-gray-900'} />
        <Stat label="Yeni hata" value={num(t.newErrors)} sub={`${num(t.openErrors)} açık hata`} tone={t.newErrors ? 'text-red-600' : 'text-gray-900'} />
        <Stat label="Sorunlu iş / servis" value={`${badJobs.length} / ${badServices.length}`} tone={badJobs.length || badServices.length ? 'text-red-600' : 'text-emerald-600'} />
      </div>

      {series.length === 0 ? <Card title="İstekler"><Empty>Bu dönemde istek kaydı yok. Metrikler dakikada bir yazılır.</Empty></Card> : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title="İstekler">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="at" tickFormatter={axisLabel} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => formatDate(v, true)} formatter={(v, name) => [num(v), { ok: 'Başarılı', clientErrors: '4xx', errors: '5xx' }[name] || name]} />
                  <Bar dataKey="ok" stackId="a" fill="#6366f1" />
                  <Bar dataKey="clientErrors" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="errors" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-gray-500 mt-2 flex gap-4"><span><Dot ok /> başarılı</span><span><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" /> 4xx (kullanıcı)</span><span><Dot ok={false} /> 5xx (sunucu)</span></p>
          </Card>
          <Card title="Ortalama yanıt süresi">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="at" tickFormatter={axisLabel} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} unit=" ms" width={70} />
                  <Tooltip labelFormatter={(v) => formatDate(v, true)} formatter={(v) => [ms(v), 'Ortalama']} />
                  <Line type="monotone" dataKey="avgMs" stroke="#10b981" strokeWidth={2.5} dot={series.length < 3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Arka plan işleri" action={<button onClick={() => goTab('jobs')} className="text-xs font-bold text-indigo-600 hover:underline">Ayrıntı</button>}>
          {o.jobs.length === 0 ? <Empty>Henüz çalışma yok.</Empty> : o.jobs.map((j) => (
            <div key={j.name} className="flex items-start gap-2 py-1.5 text-sm">
              <span className="mt-1.5"><Dot ok={j.last ? j.last.ok : null} /></span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{j.name}</p>
                <p className="text-xs text-gray-500">son: {j.last ? formatDate(j.last.startedAt, true) : '—'}{j.runs !== null && ` · ${j.runs} çalışma`}{j.failures > 0 && <b className="text-red-600"> · {j.failures} hata</b>}</p>
                {j.lastError && <p className="text-xs text-red-600 truncate" title={j.lastError}>{j.lastError}</p>}
              </div>
            </div>
          ))}
        </Card>
        <Card title="Dış servisler" action={<button onClick={() => goTab('external')} className="text-xs font-bold text-indigo-600 hover:underline">Ayrıntı</button>}>
          {o.external.length === 0 ? <Empty>Bu dönemde dış servis çağrısı yok.</Empty> : o.external.map((e) => (
            <div key={e.service} className="flex items-start gap-2 py-1.5 text-sm">
              <span className="mt-1.5"><Dot ok={e.failures === 0} /></span>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{e.service}</p>
                <p className="text-xs text-gray-500">{num(e.calls)} çağrı · ort. {ms(e.avgMs)}{e.failures > 0 && <b className="text-red-600"> · {e.failures} hata (%{e.failureRate})</b>}</p>
                {e.lastError && <p className="text-xs text-red-600 truncate" title={e.lastError}>{e.lastError}</p>}
              </div>
            </div>
          ))}
        </Card>
        <Card title="Entegrasyon API (ERP)" action={<button onClick={() => goTab('api')} className="text-xs font-bold text-indigo-600 hover:underline">Ayrıntı</button>}>
          {o.api.length === 0 ? <Empty>Bu dönemde API isteği yok.</Empty> : (
            <>
              <p className="text-xs text-gray-500 mb-2">{num(apiTotal)} istek · <span className={apiErrors ? 'text-red-600 font-bold' : ''}>{num(apiErrors)} hatalı</span></p>
              {o.api.map((a) => (
                <div key={a.tenantId} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="font-semibold text-gray-800 truncate">{a.tenantName}</span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{num(a.count)}{a.errors > 0 && <b className="text-red-600"> · {a.errors} hata</b>} · {ms(a.avgMs)}</span>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Hata veren uçlar (5xx)"><RouteTable rows={o.failing} empty="Sunucu hatası veren uç yok." /></Card>
        <Card title="En yavaş uçlar (ortalama)"><RouteTable rows={o.slowest} empty="Yeterli veri yok." /></Card>
      </div>
      <Card title="En çok çağrılan uçlar"><RouteTable rows={o.busiest} /></Card>
    </div>
  );
};

// ─── Ayrıntı listeleri (sayfalı) ─────────────────────────────────────────────
const Pager = ({ data, page, setPage }) => {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="flex items-center justify-between pt-3 text-xs text-gray-500">
      <span>{num(data.total)} kayıt</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Önceki"><ChevronLeft className="h-4 w-4" /></button>
        <span>{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Sonraki"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

const Select = ({ value, onChange, children }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="premium-input !py-2 !w-auto text-sm">{children}</select>
);
const StatusFilter = ({ value, onChange }) => (
  <Select value={value} onChange={onChange}><option value="">Tümü</option><option value="fail">Yalnızca hatalı</option><option value="ok">Yalnızca başarılı</option></Select>
);
const ErrorText = ({ text }) => (text ? <details className="text-xs text-red-600"><summary className="cursor-pointer truncate max-w-md">{text.split('\n')[0]}</summary><pre className="whitespace-pre-wrap break-all mt-1 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2">{text}</pre></details> : <span className="text-gray-300">—</span>);

const LogList = ({ endpoint, filters, renderFilters, head, renderRow, version }) => {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const key = JSON.stringify(filters);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) { setLastKey(key); setPage(1); }
  useEffect(() => {
    platformApi.get(endpoint, { params: { ...filters, page } }).then((r) => setData(r.data)).catch(() => setData({ rows: [], total: 0, pageSize: 50, failed: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, key, page, version]);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5">
      <div className="flex flex-wrap gap-2 mb-3">{renderFilters}</div>
      {!data ? <p className="text-sm text-gray-400 py-6 text-center">Yükleniyor…</p>
        : data.failed ? <Empty>Kayıtlar alınamadı.</Empty>
        : data.rows.length === 0 ? <Empty>Kayıt yok.</Empty>
        : <><Table head={head}>{data.rows.map(renderRow)}</Table><Pager data={data} page={page} setPage={setPage} /></>}
    </div>
  );
};

const JobsTab = ({ meta, version }) => {
  const [f, setF] = useState({ name: '', status: '' });
  return (
    <LogList endpoint="/monitoring/jobs" filters={f} version={version}
      renderFilters={<>
        <Select value={f.name} onChange={(name) => setF({ ...f, name })}><option value="">Tüm işler</option>{meta.jobs.map((j) => <option key={j}>{j}</option>)}</Select>
        <StatusFilter value={f.status} onChange={(status) => setF({ ...f, status })} />
        <p className="text-xs text-gray-500 self-center">Webhook kuyruğu yalnızca hata verdiğinde kaydedilir (30 sn'de bir çalışır).</p>
      </>}
      head={['', 'İş', 'Başlangıç', '#Süre', 'Hata']}
      renderRow={(r) => (
        <tr key={r.id}>
          <Td><span className="block mt-1.5"><Dot ok={r.ok} /></span></Td>
          <Td className="font-semibold text-gray-800">{r.name}</Td>
          <Td className="whitespace-nowrap text-gray-500">{formatDate(r.startedAt, true)}</Td>
          <Td right>{r.durationMs != null ? ms(r.durationMs) : '—'}</Td>
          <Td><ErrorText text={r.error} /></Td>
        </tr>
      )} />
  );
};

const ExternalTab = ({ meta, version }) => {
  const [f, setF] = useState({ service: '', status: '' });
  return (
    <LogList endpoint="/monitoring/external" filters={f} version={version}
      renderFilters={<>
        <Select value={f.service} onChange={(service) => setF({ ...f, service })}><option value="">Tüm servisler</option>{meta.services.map((s) => <option key={s}>{s}</option>)}</Select>
        <StatusFilter value={f.status} onChange={(status) => setF({ ...f, status })} />
      </>}
      head={['', 'Servis', 'İşlem', 'Firma', 'Zaman', '#Süre', 'Hata']}
      renderRow={(r) => (
        <tr key={r.id}>
          <Td><span className="block mt-1.5"><Dot ok={r.ok} /></span></Td>
          <Td className="font-semibold text-gray-800 whitespace-nowrap">{r.service}</Td>
          <Td mono>{r.operation || '—'}</Td>
          <Td className="text-gray-500">{r.tenantName || 'Platform'}</Td>
          <Td className="whitespace-nowrap text-gray-500">{formatDate(r.createdAt, true)}</Td>
          <Td right className={r.durationMs >= 5000 ? 'text-amber-600 font-bold' : ''}>{ms(r.durationMs)}</Td>
          <Td><ErrorText text={r.error} /></Td>
        </tr>
      )} />
  );
};

const ApiTab = ({ tenants, version }) => {
  const [f, setF] = useState({ tenantId: '', status: '', search: '' });
  return (
    <LogList endpoint="/monitoring/api-requests" filters={f} version={version}
      renderFilters={<>
        <Select value={f.tenantId} onChange={(tenantId) => setF({ ...f, tenantId })}><option value="">Tüm firmalar</option>{tenants.map((t) => <option key={t.tenantId} value={t.tenantId}>{t.tenantName}</option>)}</Select>
        <StatusFilter value={f.status} onChange={(status) => setF({ ...f, status })} />
        <input placeholder="Yol ara (ör. orders)" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} className="premium-input !py-2 !w-48 text-sm" />
      </>}
      head={['Zaman', 'Firma', 'Anahtar', 'İstek', 'Durum', '#Süre', 'Hata']}
      renderRow={(r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap text-gray-500">{formatDate(r.createdAt, true)}</Td>
          <Td className="font-semibold text-gray-800">{r.tenantName}</Td>
          <Td className="text-gray-500">{r.apiKeyName || '—'}{r.isTest && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-black">TEST</span>}</Td>
          <RouteCell method={r.method} route={r.path} />
          <Td><Status code={r.statusCode} /></Td>
          <Td right>{ms(r.durationMs)}</Td>
          <Td><ErrorText text={r.error} /></Td>
        </tr>
      )} />
  );
};

const SlowTab = ({ version }) => (
  <LogList endpoint="/monitoring/slow" filters={{}} version={version}
    renderFilters={<p className="text-xs text-gray-500">1 saniyeden uzun süren istekler (son 7 gün).</p>}
    head={['Zaman', 'İstek', 'Firma', 'Durum', '#Süre']}
    renderRow={(r) => (
      <tr key={r.id}>
        <Td className="whitespace-nowrap text-gray-500">{formatDate(r.createdAt, true)}</Td>
        <RouteCell method={r.method} route={r.path} />
        <Td className="text-gray-500">{r.tenantName || '—'}</Td>
        <Td><Status code={r.statusCode} /></Td>
        <Td right className="text-amber-600 font-bold">{ms(r.ms)}</Td>
      </tr>
    )} />
);

const PlatformMonitoring = () => {
  const [tab, setTab] = useState('overview');
  const [hours, setHours] = useState(24);
  const [version, setVersion] = useState(0);
  const [o, setO] = useState(null);
  const [meta, setMeta] = useState({ jobs: [], services: [] });

  useEffect(() => {
    platformApi.get('/monitoring/overview', { params: { hours } }).then((r) => setO(r.data)).catch(() => setO({ failed: true }));
    platformApi.get('/monitoring/filters').then((r) => setMeta(r.data)).catch(() => {});
  }, [hours, version]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 lg:pr-14">
        <div className="flex items-center gap-4">
          <div className="page-icon"><Gauge className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">İzleme</h1>
            <p className="text-gray-500 text-sm mt-1">İstekler, arka plan işleri, dış servisler ve ERP API'si. Sorunlarda <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">PLATFORM_ALERT_EMAIL</code> adresine uyarı ve her sabah özet gider.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'overview' && (
            <div className="flex bg-gray-100 rounded-xl p-1">
              {PERIODS.map((p) => (
                <button key={p.hours} onClick={() => setHours(p.hours)} className={`px-3 h-8 rounded-lg text-xs font-black ${hours === p.hours ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>{p.label}</button>
              ))}
            </div>
          )}
          <button onClick={() => setVersion((v) => v + 1)} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><RefreshCw className="h-4 w-4 mr-1.5" /> Yenile</button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-100">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (!o ? <p className="p-10 text-center text-gray-400">Yükleniyor…</p>
        : o.failed ? <p className="p-10 text-center text-gray-500">İzleme verisi alınamadı.</p>
        : <Overview o={o} goTab={setTab} />)}
      {tab === 'jobs' && <JobsTab meta={meta} version={version} />}
      {tab === 'external' && <ExternalTab meta={meta} version={version} />}
      {tab === 'api' && <ApiTab tenants={o?.api || []} version={version} />}
      {tab === 'slow' && <SlowTab version={version} />}
    </div>
  );
};

export default PlatformMonitoring;
