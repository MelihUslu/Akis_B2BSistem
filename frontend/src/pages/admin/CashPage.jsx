import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Wallet, Plus, Minus, ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Trash2, Info, ArrowDownLeft, ArrowUpRight, IdCard,
  Repeat, Target, Paperclip, Search, AlertTriangle, TrendingUp, TrendingDown, CalendarClock, Receipt, Landmark, Banknote, CreditCard, Telescope
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, Area, AreaChart, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate, localDate } from '../../utils/format';
import { EntryModal, RecurringModal, BudgetModal } from '../../components/cash/CashModals';
import { METHOD_TR, vatOf } from '../../utils/cash';

// Gelir ve gider: doğrulanmış kategorik paletin ilk iki rengi (mavi / turuncu); net çizgisi nötr koyu
const INCOME = '#2a78d6';
const EXPENSE = '#eb6834';
const NET = '#374151';
const OVER = '#dc2626'; // bütçe aşımı (her zaman yazı + simgeyle birlikte)
const SUPPLIER = 'Tedarikçi ödemeleri';
const METHOD_ICON = { CASH: Banknote, BANK: Landmark, CARD: CreditCard };

const thisMonth = () => localDate().slice(0, 7);
const monthName = (key, opts = { month: 'long', year: 'numeric' }) => new Date(`${key}-01T12:00:00`).toLocaleDateString('tr-TR', opts);
const shiftMonth = (m, n) => { const d = new Date(`${m}-01T12:00:00`); d.setMonth(d.getMonth() + n); return localDate(d).slice(0, 7); };
const short = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn` : a >= 1e3 ? `${(a / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} B` : `${a}`; // 1.300 → "1,3 B" (yuvarlanıp "1 B" olmasın)
  return v < 0 ? `−${s}` : s;
};
const change = (now, prev) => (prev ? ((now - prev) / Math.abs(prev)) * 100 : null);

// Önceki döneme göre değişim: yön oku + yazı (renk tek başına anlam taşımaz). good: artış iyi mi?
const Delta = ({ now, prev, good = true, dark = false, label }) => {
  const pct = change(now, prev);
  if (pct == null || !Number.isFinite(pct)) return <span className={`text-[11px] ${dark ? 'text-white/60' : 'text-gray-400'}`}>{label}: veri yok</span>;
  const up = pct >= 0;
  const positive = up === good;
  const tone = dark ? (positive ? 'bg-emerald-400/15 text-emerald-200' : 'bg-red-400/15 text-red-200') : (positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700');
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black ${tone}`}>
      <Icon className="h-3 w-3" /> %{Math.abs(Math.round(pct))} {up ? 'arttı' : 'azaldı'}
      <span className="font-semibold opacity-70">· {label}</span>
    </span>
  );
};

// İki parçalı oran çubuğu (ör. cari tahsilat / diğer gelir)
const Split = ({ parts, color }) => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="mt-4 space-y-2">
      <div className="flex h-2 gap-0.5 rounded-full overflow-hidden bg-gray-100">
        {total > 0 && parts.map((p, i) => p.value > 0 && <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: color, opacity: i ? 0.45 : 1 }} />)}
      </div>
      {parts.map((p, i) => (
        <div key={p.label} className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-gray-600"><span className="h-2 w-2 rounded-full" style={{ background: color, opacity: i ? 0.45 : 1 }} /> {p.label}</span>
          <span className="font-bold text-gray-900 tabular-nums">{formatTRY(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const FlowTip = ({ active, payload, period, view }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.income == null) return null;
  const title = view === 'trend' || period === 'year' ? monthName(p.key) : formatDate(`${p.key}T12:00:00`);
  return (
    <div className="rounded-xl bg-white shadow-lg ring-1 ring-black/5 px-3 py-2 text-xs space-y-0.5 min-w-44">
      <p className="font-bold text-gray-500 capitalize">{title}</p>
      <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: INCOME }} /> Gelir <b className="ml-auto pl-3 tabular-nums">{formatTRY(p.income)}</b></p>
      <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: EXPENSE }} /> Gider <b className="ml-auto pl-3 tabular-nums">{formatTRY(p.expense)}</b></p>
      <p className="pt-1 mt-1 border-t border-gray-100 flex"><span className="text-gray-500">{view === 'trend' ? 'Net' : 'Dönem başından net'}</span><b className="ml-auto pl-3 tabular-nums text-gray-900">{formatTRY(view === 'trend' ? p.net : p.cumulative)}</b></p>
    </div>
  );
};

const SOURCE = { RECEIVABLE: 'Alacak vadesi', PAYABLE: 'Tedarikçi borcu', CHECK: 'Çek', NOTE: 'Senet', RECURRING: 'Düzenli' };

const ForecastTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-white shadow-lg ring-1 ring-black/5 px-3 py-2 text-xs space-y-0.5 min-w-44">
      <p className="font-bold text-gray-500">{formatDate(`${p.key}T12:00:00`)}</p>
      {p.income > 0 && <p className="flex"><span className="text-gray-600">Beklenen giriş</span><b className="ml-auto pl-3 tabular-nums">{formatTRY(p.income)}</b></p>}
      {p.expense > 0 && <p className="flex"><span className="text-gray-600">Beklenen çıkış</span><b className="ml-auto pl-3 tabular-nums">{formatTRY(p.expense)}</b></p>}
      <p className="pt-1 mt-1 border-t border-gray-100 flex"><span className="text-gray-500">Bugünden itibaren net</span><b className="ml-auto pl-3 tabular-nums text-gray-900">{formatTRY(p.cumulative)}</b></p>
    </div>
  );
};

// Önümüzdeki 30 gün: vadesi gelen alacaklar, tedarikçi borçları, çek / senet ve düzenli kayıtlar (cari yalnızca okunur)
const Forecast = ({ f }) => {
  const t = f.totals;
  const rows = [
    ['Bayi / müşteri alacakları', t.receivables, 'IN'], ['Çek / senet tahsilatı', t.checksIn, 'IN'], ['Düzenli gelirler', t.recurringIn, 'IN'],
    ['Tedarikçi borçları', t.payables, 'OUT'], ['Verilen çek / senet', t.checksOut, 'OUT'], ['Düzenli giderler', t.recurringOut, 'OUT']
  ].filter(([, v]) => v > 0);
  return (
    <div className="card-premium p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-gray-900 flex items-center gap-2"><Telescope className="h-4 w-4 text-brand-500" /> Önümüzdeki {f.days} gün</p>
          <p className="text-xs text-gray-500 mt-0.5">Vadesi gelen alacaklar ve borçlar, çek / senetler ve düzenli kayıtlardan tahmin</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold text-gray-500">Tahmini net</p>
          <p className={`text-2xl font-black tabular-nums ${f.totals.net >= 0 ? 'text-gray-900' : 'text-red-700'}`}>{f.totals.net > 0 ? '+' : ''}{formatTRY(f.totals.net)}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-50/60 p-3"><p className="text-[11px] font-bold text-blue-800 flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5" /> Beklenen giriş</p><p className="mt-1 text-lg font-black tabular-nums text-gray-900">{formatTRY(t.income)}</p></div>
            <div className="rounded-2xl bg-orange-50/60 p-3"><p className="text-[11px] font-bold text-orange-800 flex items-center gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> Beklenen çıkış</p><p className="mt-1 text-lg font-black tabular-nums text-gray-900">{formatTRY(t.expense)}</p></div>
          </div>
          {rows.length > 0 && (
            <dl className="space-y-1.5 text-xs">
              {rows.map(([label, v, type]) => (
                <div key={label} className="flex justify-between"><dt className="text-gray-600 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: type === 'IN' ? INCOME : EXPENSE }} /> {label}</dt><dd className="font-bold tabular-nums">{type === 'IN' ? '+' : '−'}{formatTRY(v)}</dd></div>
              ))}
            </dl>
          )}
          {(f.overdue.receivable > 0 || f.overdue.payable > 0) && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Tahmine dahil değil: {f.overdue.receivable > 0 && <>vadesi geçmiş <b>{formatTRY(f.overdue.receivable)}</b> alacak</>}{f.overdue.receivable > 0 && f.overdue.payable > 0 && ', '}{f.overdue.payable > 0 && <>vadesi geçmiş <b>{formatTRY(f.overdue.payable)}</b> tedarikçi borcu</>}. <Link to="/admin/partners" className="font-bold underline">Carilere git</Link></span>
            </p>
          )}
        </div>
        <div className="lg:col-span-3">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={f.daily} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs><linearGradient id="fcFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NET} stopOpacity={0.18} /><stop offset="100%" stopColor={NET} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="#eef0f3" />
                <XAxis dataKey="key" tickLine={false} axisLine={false} interval={6} tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(k) => new Date(`${k}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} />
                <YAxis tickFormatter={short} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} width={52} />
                <ReferenceLine y={0} stroke="#d1d5db" />
                <Tooltip cursor={{ stroke: '#9ca3af', strokeDasharray: '3 3' }} content={<ForecastTip />} />
                <Area type="stepAfter" dataKey="cumulative" stroke={NET} strokeWidth={2} fill="url(#fcFill)" dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {f.items.length === 0 ? <p className="text-xs text-gray-500 mt-3">Önümüzdeki {f.days} günde vadesi gelen kalem yok.</p> : (
            <ul className="mt-3 divide-y divide-gray-50 max-h-56 overflow-y-auto">
              {f.items.slice(0, 12).map((x, i) => (
                <li key={`${x.source}-${x.label}-${x.date}-${i}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-14 shrink-0 text-[11px] font-bold text-gray-500">{new Date(x.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-800">{x.label}</span>
                  <span className="hidden sm:inline shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-bold text-gray-600">{SOURCE[x.source]}</span>
                  <span className={`shrink-0 font-black tabular-nums ${x.type === 'IN' ? 'text-blue-700' : 'text-gray-900'}`}>{x.type === 'IN' ? '+' : '−'}{formatTRY(x.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const daysLeft = (d) => {
  const n = Math.round((new Date(d).setHours(12, 0, 0, 0) - new Date().setHours(12, 0, 0, 0)) / 864e5);
  return n <= 0 ? 'bugün' : n === 1 ? 'yarın' : `${n} gün sonra`;
};

/**
 * Gelir-gider: aylık / yıllık nakit görünümü. Cari tahsilatları ve tedarikçi ödemeleri otomatik (yalnızca okunur);
 * burada cariye bağlı olmayan giderler ve satış dışı gelirler girilir. Bütçe, düzenli kayıt, fiş / fatura, KDV.
 */
const CashPage = () => {
  const [period, setPeriod] = useState('month');
  const [month, setMonth] = useState(thisMonth);
  const year = month.slice(0, 4);
  const [data, setData] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [view, setView] = useState('trend');
  const [filter, setFilter] = useState({ type: '', category: '', q: '' });
  const [modal, setModal] = useState(null); // { kind: 'entry' | 'recurring' | 'budget', ... }
  const { alertElement, showAlert, confirm } = useAlert();

  const load = useCallback(() => api.get('/cash', { params: period === 'year' ? { period, year } : { month } }).then((r) => setData(r.data))
    .catch((err) => showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kayıtlar yüklenemedi.') })), [period, month, year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const loadForecast = useCallback(() => api.get('/cash/forecast').then((r) => setForecast(r.data)).catch(() => setForecast(null)), []);
  useEffect(() => { loadForecast(); }, [loadForecast]);

  const isCurrent = period === 'year' ? year === thisMonth().slice(0, 4) : month === thisMonth();
  const step = (n) => setMonth((m) => (period === 'year' ? `${Number(m.slice(0, 4)) + n}${m.slice(4)}` : shiftMonth(m, n)));
  const title = period === 'year' ? year : monthName(month);
  const prevLabel = `${period === 'year' ? 'geçen yılın' : 'geçen ayın'} ${data?.previous?.partial ? 'aynı dönemine' : 'tamamına'} göre`;

  const openEntry = (type) => setModal({ kind: 'entry', initial: { type, amount: '', vatRate: 0, category: '', date: isCurrent || period === 'year' ? localDate() : `${month}-01`, method: null, description: '' } });
  const editEntry = (e) => setModal({ kind: 'entry', initial: { ...e, amount: String(e.amount).replace('.', ','), date: localDate(e.date) } });
  const removeEntry = async (e) => {
    if (!(await confirm({ type: 'warning', title: 'Kayıt silinsin mi?', message: `${e.category} · ${formatTRY(e.amount)}${e.hasFile ? ' (ekli belge de silinir)' : ''}`, confirmText: 'Sil' }))) return;
    try {
      await api.delete(`/cash/${e.id}`);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Silinemedi.') });
    }
  };
  const saved = (message) => { setModal(null); showAlert({ type: 'success', title: 'Kaydedildi', message }); load(); loadForecast(); };

  const s = data?.summary;
  const p = data?.previous;

  // Liste: arama, tür, kategori; gün (yıllıkta ay) başlıklarıyla gruplu
  const groups = useMemo(() => {
    const q = filter.q.trim().toLocaleLowerCase('tr-TR');
    const list = (data?.entries || []).filter((e) => (!filter.type || e.type === filter.type) && (!filter.category || e.category === filter.category)
      && (!q || `${e.category} ${e.description || ''}`.toLocaleLowerCase('tr-TR').includes(q)));
    const map = new Map();
    for (const e of list) {
      const key = period === 'year' ? localDate(e.date).slice(0, 7) : localDate(e.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map].map(([key, items]) => ({ key, items, net: items.reduce((t, e) => t + (e.type === 'IN' ? e.amount : -e.amount), 0) }));
  }, [data, filter, period]);
  const listCategories = useMemo(() => [...new Set((data?.entries || []).map((e) => e.category))].sort((a, b) => a.localeCompare(b, 'tr')), [data]);
  const byMethod = useMemo(() => {
    const out = (data?.entries || []).filter((e) => e.type === 'OUT');
    return ['CASH', 'BANK', 'CARD', null].map((m) => ({ m, total: out.filter((e) => (e.method || null) === m).reduce((t, e) => t + e.amount, 0) })).filter((x) => x.total > 0);
  }, [data]);
  const upcoming = (data?.recurring || []).filter((r) => r.isActive).sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate)).slice(0, 5);
  const overBudget = (data?.categories || []).filter((c) => c.budget && c.amount > c.budget);
  const spent = Object.fromEntries((data?.categories || []).map((c) => [c.category, c.amount]));
  const chartData = view === 'trend' || period === 'year' ? (period === 'year' ? data?.flow : data?.trend) : data?.flow;
  const chartView = period === 'year' ? 'flow' : view;

  return (
    <div className="space-y-6">
      {alertElement}

      {/* Başlık + hızlı ekleme */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><Wallet className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Gelir-Gider</h1>
            <p className="text-gray-500 text-sm mt-1">Kasaya giren ve çıkan para.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openEntry('IN')} className="flex-1 sm:flex-none justify-center h-11 px-4 rounded-xl bg-white border border-gray-200 text-sm font-black text-gray-800 flex items-center gap-1.5 hover:border-gray-300"><Plus className="h-4 w-4" /> Gelir</button>
          <button onClick={() => openEntry('OUT')} className="flex-1 sm:flex-none justify-center h-11 px-5 rounded-xl bg-gray-900 text-white text-sm font-black flex items-center gap-1.5 hover:bg-navy-950 shadow-lg shadow-gray-900/15"><Minus className="h-4 w-4" /> Gider</button>
        </div>
      </div>

      {/* Dönem ve araçlar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 p-1 rounded-xl bg-gray-100">
          {[['month', 'Aylık'], ['year', 'Yıllık']].map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} className={`px-3 rounded-lg text-xs font-black ${period === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
        <div className="flex flex-1 sm:flex-none justify-between items-center h-10 rounded-xl bg-white border border-gray-200">
          <button onClick={() => step(-1)} className="h-full px-2.5 text-gray-500 hover:text-gray-900" aria-label="Önceki dönem"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-sm font-black text-gray-900 capitalize min-w-28 text-center">{title}</span>
          <button onClick={() => step(1)} disabled={isCurrent} className="h-full px-2.5 text-gray-500 hover:text-gray-900 disabled:opacity-30" aria-label="Sonraki dönem"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-2 sm:ml-auto">
          <button onClick={() => setModal({ kind: 'recurring' })} className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-xs font-black text-gray-700 flex items-center gap-1.5 hover:border-gray-300"><Repeat className="h-4 w-4" /> Düzenli kayıtlar</button>
          <button onClick={() => setModal({ kind: 'budget' })} className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-xs font-black text-gray-700 flex items-center gap-1.5 hover:border-gray-300"><Target className="h-4 w-4" /> Bütçeler</button>
          <button onClick={() => downloadFile('/cash/export', period === 'year' ? { period, year } : { month }, `gelir-gider-${period === 'year' ? year : month}.xlsx`)} className="h-10 px-3 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-emerald-700" title="Excel'e aktar" aria-label="Excel'e aktar"><FileSpreadsheet className="h-4 w-4" /></button>
        </div>
      </div>

      {!data ? <div className="card-premium h-96 animate-pulse" /> : <>
        {overBudget.length > 0 && (
          <div className="flex items-start gap-3 rounded-2xl bg-red-50 ring-1 ring-red-100 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span><b>Bütçe aşıldı:</b> {overBudget.map((c) => `${c.category} (${formatTRY(c.amount - c.budget)} fazla)`).join(', ')}</span>
          </div>
        )}

        {/* Özet: net (koyu kart, dönem içi birikimli eğri) + gelir + gider */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-gray-900 via-gray-900 to-brand-950 p-6 text-white shadow-xl shadow-gray-900/20">
            <p className="text-xs font-bold text-white/60">Net · {title}</p>
            <p className="mt-2 text-3xl sm:text-4xl font-black tabular-nums tracking-tight break-words">{s.net > 0 ? '+' : ''}{formatTRY(s.net)}</p>
            <div className="mt-2"><Delta now={s.net} prev={p.net} dark label={prevLabel} /></div>
            <p className="mt-2 text-xs text-white/60">{s.net >= 0 ? 'Giren para çıkandan fazla.' : 'Çıkan para girenden fazla.'} Alttaki eğri: {period === 'year' ? 'yılın' : 'son 12 ayın'} aylık neti.</p>
            <div className="h-20 -mx-6 -mb-6 mt-4" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="netFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E4BB9B" stopOpacity={0.35} /><stop offset="100%" stopColor="#E4BB9B" stopOpacity={0} /></linearGradient></defs>
                  <Area type="monotone" dataKey="net" stroke="#E4BB9B" strokeWidth={2} fill="url(#netFill)" isAnimationActive={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card-premium p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">Gelir</p>
              <span className="p-2 rounded-xl bg-blue-50 text-blue-600"><ArrowDownLeft className="h-4 w-4" /></span>
            </div>
            <p className="mt-1 text-2xl font-black text-gray-900 tabular-nums break-words">{formatTRY(s.income)}</p>
            <div className="mt-1.5"><Delta now={s.income} prev={p.income} label={prevLabel} /></div>
            <Split color={INCOME} parts={[{ label: 'Carilerden tahsilat', value: s.collections }, { label: 'Diğer gelirler', value: s.otherIncome }]} />
          </div>
          <div className="card-premium p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">Gider</p>
              <span className="p-2 rounded-xl bg-orange-50 text-orange-600"><ArrowUpRight className="h-4 w-4" /></span>
            </div>
            <p className="mt-1 text-2xl font-black text-gray-900 tabular-nums break-words">{formatTRY(s.expense)}</p>
            <div className="mt-1.5"><Delta now={s.expense} prev={p.expense} good={false} label={prevLabel} /></div>
            <Split color={EXPENSE} parts={[{ label: 'Giderler', value: s.expenses }, { label: SUPPLIER, value: s.supplierPayments }]} />
          </div>
        </div>

        {/* Nakit akışı + kategoriler / bütçe */}
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="card-premium p-4 md:p-6 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-gray-900">{chartView === 'trend' ? 'Son 12 ay' : 'Nakit akışı'}</p>
                <p className="text-xs text-gray-500">{chartView === 'trend' ? 'Aylık gelir, gider ve net' : period === 'year' ? 'Ay ay gelir ve gider; çizgi yıl başından birikimli net' : 'Gün gün gelir ve gider; çizgi ay başından birikimli net'}</p>
              </div>
              {period === 'month' && (
                <div className="flex p-1 rounded-lg bg-gray-100">
                  {[['flow', 'Bu ay'], ['trend', '12 ay']].map(([v, l]) => (
                    <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md text-[11px] font-black ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>{l}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-72 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap={chartView === 'flow' && period === 'month' ? '18%' : '24%'}>
                  <CartesianGrid vertical={false} stroke="#eef0f3" />
                  <XAxis dataKey="key" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} interval={chartView === 'flow' && period === 'month' ? 4 : 0}
                    tickFormatter={(k) => (chartView === 'flow' && period === 'month' ? String(Number(k.slice(8, 10))) : monthName(k, { month: 'short' }))} />
                  <YAxis tickFormatter={short} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} width={52} />
                  <ReferenceLine y={0} stroke="#d1d5db" />
                  <Tooltip cursor={{ fill: 'rgba(183,134,95,0.06)' }} content={<FlowTip period={period} view={chartView} />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Bar name="Gelir" dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar name="Gider" dataKey="expense" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line name={chartView === 'trend' ? 'Net' : 'Birikimli net'} type="monotone" dataKey={chartView === 'trend' ? 'net' : 'cumulative'} stroke={NET} strokeWidth={2}
                    dot={chartView === 'trend' ? { r: 3, fill: NET, stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-premium p-4 md:p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-gray-900">Giderler ve bütçe</p>
              <button onClick={() => setModal({ kind: 'budget' })} className="text-xs font-black text-brand-600 hover:underline">Bütçe belirle</button>
            </div>
            {data.categories.length === 0 ? <p className="text-sm text-gray-400 mt-10 text-center">Bu dönem gider yok.</p> : (
              <ul className="mt-4 space-y-3.5">
                {data.categories.slice(0, 8).map((c) => {
                  const max = Math.max(c.budget || 0, ...data.categories.map((x) => x.amount), 1);
                  const over = c.budget && c.amount > c.budget;
                  const pct = c.budget ? Math.round((c.amount / c.budget) * 100) : null;
                  return (
                    <li key={c.category}>
                      <div className="flex justify-between gap-2 text-xs">
                        <span className="font-bold text-gray-700 truncate">{c.category}</span>
                        <span className="font-black text-gray-900 tabular-nums whitespace-nowrap">{formatTRY(c.amount)}</span>
                      </div>
                      <div className="relative mt-1 h-2 rounded-full bg-gray-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.amount / max) * 100)}%`, background: over ? OVER : EXPENSE }} />
                        {c.budget && <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-gray-900" style={{ left: `${Math.min(100, (c.budget / max) * 100)}%` }} title={`Bütçe ${formatTRY(c.budget)}`} />}
                      </div>
                      {c.budget && (
                        <p className={`mt-1 text-[11px] font-semibold flex items-center gap-1 ${over ? 'text-red-700' : 'text-gray-500'}`}>
                          {over && <AlertTriangle className="h-3 w-3" />}
                          Bütçe {formatTRY(c.budget)} · %{pct} {over ? `· ${formatTRY(c.amount - c.budget)} aşıldı` : `· ${formatTRY(c.budget - c.amount)} kaldı`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {forecast && <Forecast f={forecast} />}

        {/* Yaklaşan düzenli ödemeler · KDV · ödeme şekli */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card-premium p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-gray-900 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-brand-500" /> Yaklaşan düzenli kayıtlar</p>
              <button onClick={() => setModal({ kind: 'recurring' })} className="text-xs font-black text-brand-600 hover:underline">Yönet</button>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-xs text-gray-500 mt-4">Kira, maaş gibi her ay tekrar eden kalemleri ekleyin; günü gelince otomatik kaydedilir.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 text-sm">
                    <span className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${r.type === 'IN' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>{r.type === 'IN' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 truncate">{r.category}</p>
                      <p className="text-[11px] text-gray-500">{formatDate(r.nextDate)} · {daysLeft(r.nextDate)}</p>
                    </div>
                    <span className="font-black tabular-nums text-gray-900">{formatTRY(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card-premium p-5">
            <p className="text-sm font-black text-gray-900 flex items-center gap-2"><Receipt className="h-4 w-4 text-brand-500" /> KDV özeti</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-600">Giderlerdeki KDV <span className="text-gray-400">(indirilecek)</span></dt><dd className="font-black tabular-nums">{formatTRY(s.vat.input)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-600">Diğer gelirlerdeki KDV <span className="text-gray-400">(hesaplanan)</span></dt><dd className="font-black tabular-nums">{formatTRY(s.vat.output)}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] text-gray-400">Yalnızca bu sayfaya girilen kayıtlar. Satış faturalarının KDV'si e-fatura ve raporlarda.</p>
          </div>
          <div className="card-premium p-5">
            <p className="text-sm font-black text-gray-900 flex items-center gap-2"><Wallet className="h-4 w-4 text-brand-500" /> Giderler nasıl ödendi?</p>
            {byMethod.length === 0 ? <p className="text-xs text-gray-500 mt-4">Bu dönem gider kaydı yok.</p> : (
              <ul className="mt-3 space-y-2.5">
                {byMethod.map(({ m, total }) => {
                  const Icon = METHOD_ICON[m] || Wallet;
                  const all = byMethod.reduce((t, x) => t + x.total, 0);
                  return (
                    <li key={m || 'none'} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-gray-700"><Icon className="h-4 w-4 text-gray-400" /> {METHOD_TR[m] || 'Belirtilmemiş'}</span>
                        <span className="font-black tabular-nums">{formatTRY(total)} <span className="text-[11px] font-semibold text-gray-400">%{Math.round((total / all) * 100)}</span></span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Kayıtlar */}
        <div className="card-premium">
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
              {[['', 'Tümü'], ['OUT', 'Giderler'], ['IN', 'Gelirler']].map(([v, l]) => (
                <button key={v} onClick={() => setFilter({ ...filter, type: v })} className={`px-3 py-1.5 rounded-lg text-xs font-black ${filter.type === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>{l}</button>
              ))}
            </div>
            <select className="h-9 rounded-xl bg-gray-50 border-0 px-3 text-xs font-bold text-gray-700" value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} aria-label="Kategori">
              <option value="">Tüm kategoriler</option>
              {listCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input className="w-full h-9 rounded-xl bg-gray-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-100" placeholder="Kategori ya da açıklamada ara" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
            </div>
          </div>
          <p className="px-4 pt-3 text-[11px] text-gray-500 flex items-center gap-1.5"><Info className="h-3.5 w-3.5 shrink-0" /> Cari tahsilatları ve tedarikçi ödemeleri özete otomatik girer; buraya ayrıca girmeyin.</p>
          {groups.length === 0 ? (
            <div className="py-14 text-center">
              <Wallet className="h-10 w-10 mx-auto text-gray-200" />
              <p className="mt-2 text-sm font-bold text-gray-500">{data.entries.length ? 'Filtreye uyan kayıt yok' : 'Bu dönem kayıt yok'}</p>
              {!data.entries.length && <p className="text-xs text-gray-400 mt-1">Kira, maaş, fatura gibi giderleri "Gider" ile ekleyin.</p>}
            </div>
          ) : (
            <div className="pb-2">
              {groups.map((g) => (
                <section key={g.key}>
                  <div className="flex items-center justify-between px-4 pt-4 pb-1.5">
                    <h3 className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                      {period === 'year' ? monthName(g.key) : new Date(`${g.key}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
                    </h3>
                    <span className="text-[11px] font-bold text-gray-400 tabular-nums">{g.net >= 0 ? '+' : '−'}{formatTRY(Math.abs(g.net))}</span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {g.items.map((e) => (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3 group hover:bg-gray-50/60">
                        <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${e.type === 'IN' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                          {e.type === 'IN' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{e.category}{e.description && <span className="font-normal text-gray-500"> · {e.description}</span>}</p>
                          <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-1.5">
                            {period === 'year' && <span>{formatDate(e.date)}</span>}
                            {e.method && <span>{METHOD_TR[e.method]}</span>}
                            {e.vatRate > 0 && <span>KDV %{e.vatRate} ({formatTRY(vatOf(e.amount, e.vatRate))})</span>}
                            {e.recurringId && <span className="inline-flex items-center gap-0.5 text-brand-600 font-bold"><Repeat className="h-3 w-3" /> Düzenli</span>}
                            {e.sourceRef && <span className="inline-flex items-center gap-0.5 text-brand-600 font-bold" title="Personel Yönetimi'nden ödendi; değişiklik oradan (ödemeyi geri al) yapılır"><IdCard className="h-3 w-3" /> Personel ödemesi</span>}
                            {e.createdByName && <span>{e.createdByName}</span>}
                          </p>
                        </div>
                        {e.hasFile && (
                          <button onClick={() => downloadFile(`/cash/${e.id}/file`, null, e.fileName)} className="p-2 text-gray-400 hover:text-brand-600 shrink-0" title={e.fileName || 'Belge'} aria-label="Belgeyi indir"><Paperclip className="h-4 w-4" /></button>
                        )}
                        <p className={`text-sm font-black tabular-nums whitespace-nowrap ${e.type === 'IN' ? 'text-blue-700' : 'text-gray-900'}`}>{e.type === 'IN' ? '+' : '−'}{formatTRY(e.amount)}</p>
                        {e.sourceRef ? <span className="w-[4.5rem] shrink-0" aria-hidden="true" /> : (
                          <div className="flex shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                            <button onClick={() => editEntry(e)} className="p-2 text-gray-400 hover:text-brand-600" aria-label="Düzenle"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => removeEntry(e)} className="p-2 text-gray-400 hover:text-red-600" aria-label="Sil"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {data.truncated && <p className="px-4 py-3 text-xs text-gray-500">İlk 3.000 kayıt gösteriliyor; tamamı için Excel'e aktarın.</p>}
            </div>
          )}
        </div>
      </>}

      {modal?.kind === 'entry' && <EntryModal initial={modal.initial} suggestions={data?.suggestions || { IN: [], OUT: [] }} showAlert={showAlert} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.kind === 'recurring' && <RecurringModal rules={data?.recurring || []} suggestions={data?.suggestions || { IN: [], OUT: [] }} showAlert={showAlert} confirm={confirm} onClose={() => setModal(null)} onChanged={() => { load(); loadForecast(); }} />}
      {modal?.kind === 'budget' && <BudgetModal budgets={data?.budgets || {}} categories={(data?.suggestions?.OUT || []).filter((c) => c !== 'Diğer')} spent={spent} showAlert={showAlert} onClose={() => setModal(null)} onSaved={saved} />}
    </div>
  );
};

export default CashPage;
