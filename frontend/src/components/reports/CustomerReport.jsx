import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileSpreadsheet, Users, TrendingUp, UserPlus, UserX, Wallet, AlertTriangle, Phone, MessageCircle, Settings2, CalendarClock, Search, Save, ChevronDown, Info
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate } from '../../utils/format';

const STATUS = {
  AT_RISK: { label: 'Risk altında', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  DECLINING: { label: 'Düşüşte', cls: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  LOST: { label: 'Kaybedildi', cls: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  NEVER: { label: 'Hiç sipariş vermedi', cls: 'bg-gray-200 text-gray-600', dot: 'bg-gray-400' },
  NEW: { label: 'Yeni', cls: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  ACTIVE: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};
const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const PERIOD = { WEEKLY: 'Haftalık', MONTHLY: 'Aylık', CUSTOM: 'Anlık' };

const iso = (d) => d.toLocaleDateString('sv-SE');
const LIVE = [
  { id: 'week', label: 'Bu hafta', range: () => { const t = new Date(); const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return [iso(m), iso(t)]; } },
  { id: 'lastWeek', label: 'Geçen hafta', range: () => { const t = new Date(); const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7) - 7); const e = new Date(m); e.setDate(m.getDate() + 6); return [iso(m), iso(e)]; } },
  { id: 'month', label: 'Bu ay', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)]; } },
  { id: 'lastMonth', label: 'Geçen ay', range: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))]; } },
];

const intl = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 && d.startsWith('0') ? `90${d.slice(1)}` : d.length === 10 && d.startsWith('5') ? `90${d}` : d; };
const pct = (now, prev) => (prev ? Math.round(((now - prev) / prev) * 100) : null);
const Pill = ({ s }) => <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-black whitespace-nowrap ${STATUS[s]?.cls}`}>{STATUS[s]?.label}</span>;

const Kpi = ({ icon: Icon, label, value, delta, sub, tone }) => (
  <div className="card-premium p-4">
    <div className="flex items-center justify-between gap-2">
      <span className={`p-2 rounded-xl ${tone}`}><Icon className="h-4 w-4" /></span>
      {delta != null && <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-md ${delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{delta >= 0 ? '+' : ''}{delta}%</span>}
    </div>
    <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mt-3">{label}</p>
    <p className="text-2xl font-black text-gray-900 mt-0.5 tabular-nums truncate">{value}</p>
    {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
  </div>
);

// Otomatik rapor zamanlaması
const ScheduleSettings = ({ canEdit, showAlert }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/reports/periodic/settings').then((r) => setForm(r.data.settings)).catch(() => {}); }, []);
  if (!form) return null;
  const setPart = (part, k, v) => setForm({ ...form, [part]: { ...form[part], [k]: v } });
  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/reports/periodic/settings', form);
      setForm(res.data.settings);
      showAlert({ type: 'success', title: 'Rapor ayarları', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kaydedilemedi.') });
    } finally {
      setSaving(false);
    }
  };
  const hours = [...Array(24).keys()];
  const summary = [form.weekly.enabled && `her ${WEEKDAYS[form.weekly.weekday - 1]} ${String(form.weekly.hour).padStart(2, '0')}:00`, form.monthly.enabled && `her ayın ${form.monthly.day}'i ${String(form.monthly.hour).padStart(2, '0')}:00`].filter(Boolean).join(' ve ');

  return (
    <div className="card-premium">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4 md:px-5 text-left">
        <span className="p-2 rounded-xl bg-violet-50 text-violet-600"><CalendarClock className="h-4 w-4" /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-black text-gray-900">Otomatik rapor</span>
          <span className="block text-xs text-gray-500 truncate">{summary ? `Rapor ${summary} hazırlanır; yöneticilere bildirim ve e-posta gider.` : 'Kapalı. Haftalık ya da aylık raporu açabilirsiniz.'}</span>
        </span>
        <Settings2 className="h-4 w-4 text-gray-400" />
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-5 grid gap-4 md:grid-cols-3 border-t border-gray-100 pt-4">
          {[
            ['weekly', 'Haftalık rapor', 'Önceki 7 günü kapsar.', (
              <select className="premium-input" value={form.weekly.weekday} disabled={!canEdit} onChange={(e) => setPart('weekly', 'weekday', Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </select>
            )],
            ['monthly', 'Aylık rapor', 'Önceki takvim ayını kapsar.', (
              <select className="premium-input" value={form.monthly.day} disabled={!canEdit} onChange={(e) => setPart('monthly', 'day', Number(e.target.value))}>
                {[...Array(28).keys()].map((d) => <option key={d} value={d + 1}>Ayın {d + 1}'i</option>)}
              </select>
            )],
          ].map(([part, title, hint, daySelect]) => (
            <div key={part} className={`rounded-2xl border p-4 space-y-3 ${form[part].enabled ? 'border-violet-200 bg-violet-50/30' : 'border-gray-200'}`}>
              <label className="flex items-center justify-between gap-3">
                <span><span className="block text-sm font-black text-gray-900">{title}</span><span className="block text-xs text-gray-500">{hint}</span></span>
                <input type="checkbox" className="h-5 w-5" checked={form[part].enabled} disabled={!canEdit} onChange={(e) => setPart(part, 'enabled', e.target.checked)} />
              </label>
              {form[part].enabled && (
                <div className="grid grid-cols-2 gap-2">
                  {daySelect}
                  <select className="premium-input" value={form[part].hour} disabled={!canEdit} onChange={(e) => setPart(part, 'hour', Number(e.target.value))}>
                    {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
          <div className="rounded-2xl border border-gray-200 p-4 space-y-3">
            <div>
              <p className="text-sm font-black text-gray-900">Kayıp eşiği</p>
              <p className="text-xs text-gray-500">Bu kadar gündür sipariş vermeyen müşteri "kaybedildi" sayılır (sık alan müşterilerde daha erken uyarı verilir).</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={14} max={365} className="premium-input w-28" value={form.lostDays} disabled={!canEdit} onChange={(e) => setForm({ ...form, lostDays: e.target.value })} />
              <span className="text-sm font-bold text-gray-500">gün</span>
            </div>
          </div>
          {canEdit
            ? <div className="md:col-span-3 flex justify-end"><button type="button" onClick={save} disabled={saving} className="btn-gradient disabled:opacity-60"><Save className="h-4 w-4 mr-2" /> Kaydet</button></div>
            : <p className="md:col-span-3 text-xs text-gray-400">Zamanlamayı "Ayarlar" yetkisi olan yöneticiler değiştirebilir.</p>}
        </div>
      )}
    </div>
  );
};

/**
 * Müşteri takip raporu: kayıtlı (haftalık / aylık) raporlar ya da seçilen dönem için anlık rapor.
 * Özet, öncelikli aranacaklar listesi, cari durumu, en çok alanlar ve tüm müşterilerin durumu; Excel'e indirilir.
 */
const CustomerReport = () => {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const savedId = parseInt(params.get('rapor')) || null;
  const [saved, setSaved] = useState([]);
  const [live, setLive] = useState(savedId ? null : 'lastWeek');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const { alertElement, showAlert } = useAlert();

  useEffect(() => { api.get('/reports/periodic').then((r) => setSaved(r.data)).catch(() => {}); }, []);

  const liveRange = live ? LIVE.find((x) => x.id === live).range() : null;
  const key = savedId ? `s${savedId}` : `l${liveRange?.join('_')}`;
  useEffect(() => {
    let cancelled = false;
    const req = savedId ? api.get(`/reports/periodic/${savedId}`) : api.get('/reports/periodic/live', { params: { from: liveRange[0], to: liveRange[1] } });
    req.then((r) => { if (!cancelled) setReport(r.data); })
      .catch((err) => showAlert({ type: 'error', title: 'Rapor alınamadı', message: errorMessage(err, 'Rapor oluşturulamadı.') }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLive = (id) => { setLoading(true); setLive(id); setParams({}); };
  const chooseSaved = (id) => { if (!id) return chooseLive('lastWeek'); setLoading(true); setLive(null); setParams({ rapor: String(id) }); };
  const exportExcel = () => (savedId
    ? downloadFile(`/reports/periodic/${savedId}/export`, {}, 'musteri-raporu.xlsx')
    : downloadFile('/reports/periodic/live/export', { from: liveRange[0], to: liveRange[1] }, 'musteri-raporu.xlsx'))
    .catch(() => showAlert({ type: 'error', title: 'Hata', message: 'Excel oluşturulamadı.' }));

  const customers = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR');
    return (report?.customers || []).filter((c) => (!filter || c.status === filter) && (!term || c.name.toLocaleLowerCase('tr-TR').includes(term)));
  }, [report, filter, q]);

  const s = report?.summary;
  const c = report?.cari;
  const risky = report ? (report.statusCounts.AT_RISK || 0) + (report.statusCounts.DECLINING || 0) : 0;

  return (
    <div className="space-y-6">
      {alertElement}
      <ScheduleSettings canEdit={can(user, 'SETTINGS')} showAlert={showAlert} />

      {/* Rapor seçimi */}
      <div className="flex flex-wrap items-center gap-2">
        {LIVE.map((p) => (
          <button key={p.id} onClick={() => chooseLive(p.id)} className={`h-10 px-3.5 rounded-xl text-xs font-bold ${live === p.id ? 'bg-slate-800 text-white shadow-md' : 'bg-white ring-1 ring-gray-100 text-gray-600 hover:bg-gray-50'}`}>{p.label}</button>
        ))}
        <select value={savedId || ''} onChange={(e) => chooseSaved(parseInt(e.target.value) || null)}
          className={`h-10 px-3 rounded-xl text-xs font-bold outline-none ${savedId ? 'bg-slate-800 text-white' : 'bg-white ring-1 ring-gray-100 text-gray-600'}`}>
          <option value="">{saved.length ? `Geçmiş raporlar (${saved.length})` : 'Henüz otomatik rapor yok'}</option>
          {saved.map((r) => <option key={r.id} value={r.id}>{PERIOD[r.period]} · {formatDate(r.from)} – {formatDate(r.to)}</option>)}
        </select>
        <button onClick={exportExcel} disabled={!report} className="md:ml-auto flex items-center h-10 px-4 rounded-xl bg-white ring-1 ring-gray-100 text-xs font-bold text-gray-600 hover:text-emerald-700 hover:ring-emerald-200 disabled:opacity-50">
          <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel'e Aktar
        </button>
      </div>

      {!report ? <div className="card-premium h-72 animate-pulse" /> : (
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <b className="text-gray-900">{PERIOD[report.range.period]} rapor · {formatDate(report.range.from)} – {formatDate(report.range.to)}</b>
            <span className="text-gray-300">|</span> Tutarlar TL, KDV hariç. Karşılaştırma bir önceki eş dönemle.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
            <Kpi icon={Users} label="Sipariş veren" value={s.customers} delta={pct(s.customers, s.customersPrev)} sub={`önceki dönem ${s.customersPrev}`} tone="bg-violet-50 text-violet-600" />
            <Kpi icon={TrendingUp} label="Ciro" value={formatTRY(s.revenue)} delta={pct(s.revenue, s.revenuePrev)} sub={`${s.orders} sipariş`} tone="bg-blue-50 text-blue-600" />
            <Kpi icon={UserPlus} label="Yeni müşteri" value={s.newCustomers} sub="ilk siparişini verdi" tone="bg-sky-50 text-sky-600" />
            <Kpi icon={UserX} label="Kayba düşen" value={s.lostThisPeriod} sub={`${s.silent} müşteri bu dönem almadı`} tone="bg-rose-50 text-rose-600" />
            <Kpi icon={Wallet} label="Tahsilat" value={formatTRY(c.collected)} sub={c.collectionRate != null ? `yazılan borcun %${c.collectionRate}'i` : 'bu dönem borç yazılmadı'} tone="bg-emerald-50 text-emerald-600" />
            <Kpi icon={AlertTriangle} label="Açık alacak" value={formatTRY(c.receivable)} sub={c.overLimit ? `${c.overLimit} müşteri limit aşımında` : 'limit aşımı yok'} tone="bg-amber-50 text-amber-600" />
          </div>

          {/* Durum dağılımı */}
          <div className="card-premium p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm font-black text-gray-900">Müşteri durumu <span className="font-medium text-gray-400">· {s.activeAccounts} aktif hesap</span></p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> Her müşterinin kendi sipariş sıklığına göre değerlendirilir · kayıp eşiği {report.lostDays} gün</p>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
              {Object.keys(STATUS).map((k) => (report.statusCounts[k] ? <span key={k} className={STATUS[k].dot} style={{ width: `${(report.statusCounts[k] / Math.max(1, s.activeAccounts)) * 100}%` }} title={`${STATUS[k].label}: ${report.statusCounts[k]}`} /> : null))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(STATUS).map(([k, st]) => (
                <button key={k} type="button" onClick={() => setFilter(filter === k ? '' : k)} className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-2 ${filter === k ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}`}>
                  <span className={`h-2 w-2 rounded-full ${st.dot}`} /> {st.label} <b>{report.statusCounts[k] || 0}</b>
                </button>
              ))}
            </div>
          </div>

          {/* Aranacaklar */}
          <div className="card-premium overflow-hidden">
            <div className="p-4 md:px-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-gray-900">Öncelikli aranacaklar <span className="ml-1 px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px]">{report.callList.length}</span></p>
                <p className="text-xs text-gray-500">Alışkanlığından en çok sapan ve size en çok kazandıran müşteri en üstte. {risky} müşteri risk altında ya da düşüşte.</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="list-head"><tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em]"><th className="px-5 py-3">#</th><th className="px-5 py-3">Müşteri</th><th className="px-5 py-3">Neden</th><th className="px-5 py-3">Son sipariş</th><th className="px-5 py-3 text-right">Son 12 ay</th><th className="px-5 py-3" /></tr></thead>
                <tbody className="divide-y divide-gray-100/70">
                  {report.callList.map((x, i) => (
                    <tr key={x.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-black text-gray-400">{i + 1}</td>
                      <td className="px-5 py-3 min-w-[12rem]"><p className="font-black text-gray-900">{x.name}</p><p className="text-xs text-gray-500">{[x.contact, x.owner && `Sorumlu: ${x.owner}`].filter(Boolean).join(' · ')}</p></td>
                      <td className="px-5 py-3"><Pill s={x.status} /><p className="mt-1 text-xs text-gray-600 max-w-md">{x.reason}</p></td>
                      <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-600">{x.lastOrderAt ? formatDate(x.lastOrderAt) : '—'}{x.daysSince != null && <span className="block font-black text-gray-900">{x.daysSince} gün önce</span>}</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums whitespace-nowrap">{formatTRY(x.revenue12m)}{x.receivableTRY > 0 && <span className="block text-[11px] font-semibold text-amber-700">açık: {formatTRY(x.receivableTRY)}</span>}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-right">
                        {x.phone && <>
                          <a href={`tel:+${intl(x.phone)}`} className="inline-flex p-2 rounded-lg text-indigo-600 hover:bg-indigo-50" title={`Ara: ${x.phone}`}><Phone className="h-4 w-4" /></a>
                          <a href={`https://wa.me/${intl(x.phone)}`} target="_blank" rel="noreferrer" className="inline-flex p-2 rounded-lg text-emerald-600 hover:bg-emerald-50" title="WhatsApp'tan yaz"><MessageCircle className="h-4 w-4" /></a>
                        </>}
                      </td>
                    </tr>
                  ))}
                  {report.callList.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400 font-bold">Aranması gereken müşteri yok; herkes alışkanlığına uygun sipariş veriyor.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Cari */}
            <div className="card-premium p-4 md:p-5 space-y-4">
              <p className="text-sm font-black text-gray-900">Cari hareketler (dönem)</p>
              {[['Cariye yazılan borç', c.debt, 'bg-slate-700'], ['Tahsilat', c.collected, 'bg-emerald-500'], ['İade alacağı', c.returns, 'bg-sky-500'], ['Diğer alacak kayıtları', c.otherCredit, 'bg-gray-400']].map(([l, v, tone]) => (
                <div key={l}>
                  <div className="flex justify-between text-xs font-bold text-gray-600"><span>{l}</span><span className="tabular-nums text-gray-900">{formatTRY(v)}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-gray-100"><div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, (v / Math.max(1, c.debt, c.collected)) * 100)}%` }} /></div>
                </div>
              ))}
              <p className={`text-xs font-bold rounded-xl px-3 py-2 ${c.net > 0 ? 'bg-amber-50 text-amber-800' : c.net < 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-600'}`}>
                {c.net > 0 ? `Bu dönem alacağınız ${formatTRY(c.net)} arttı.` : c.net < 0 ? `Bu dönem alacağınız ${formatTRY(-c.net)} azaldı.` : 'Bu dönem cari hareket yok.'}
              </p>
              {report.topDebtors.length > 0 && (
                <div>
                  <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2">En yüksek açık alacak</p>
                  <ul className="divide-y divide-gray-50 text-sm">
                    {report.topDebtors.slice(0, 6).map((d) => (
                      <li key={d.id} className="flex justify-between gap-3 py-1.5"><span className="truncate font-semibold text-gray-700">{d.name}{d.overLimit && <span className="ml-1.5 text-[10px] font-black text-rose-600">LİMİT AŞIMI</span>}</span><span className="tabular-nums font-bold">{formatTRY(d.receivableTRY)}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {/* En çok alanlar */}
            <div className="card-premium p-4 md:p-5">
              <p className="text-sm font-black text-gray-900 mb-3">En çok alanlar (dönem)</p>
              {report.topCustomers.length === 0 ? <p className="text-sm text-gray-400">Bu dönemde sipariş yok.</p> : (
                <ul className="space-y-3">
                  {report.topCustomers.map((t, i) => (
                    <li key={t.id}>
                      <div className="flex justify-between gap-3 text-sm"><span className="truncate font-semibold text-gray-700"><span className="text-gray-400 mr-1.5">{i + 1}.</span>{t.name}</span><span className="tabular-nums font-bold">{formatTRY(t.revenue)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${t.share}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Tüm müşteriler */}
          <div className="card-premium overflow-hidden">
            <div className="p-4 md:px-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-black text-gray-900">Tüm müşteriler {filter && <span className="ml-1"><Pill s={filter} /></span>} <span className="font-medium text-gray-400">· {customers.length}</span></p>
              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input className="premium-input !h-10 !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Müşteri ara…" />
              </div>
            </div>
            <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
              <table className="w-full min-w-[56rem] text-sm">
                <thead className="list-head sticky top-0 z-10"><tr className="text-left text-[10px] font-black text-gray-500 uppercase tracking-[0.15em]"><th className="px-5 py-3">Müşteri</th><th className="px-5 py-3">Durum</th><th className="px-5 py-3">Son sipariş</th><th className="px-5 py-3">Olağan aralık</th><th className="px-5 py-3 text-right">Dönem</th><th className="px-5 py-3 text-right">Son 90 gün</th><th className="px-5 py-3 text-right">Önceki 90 gün</th></tr></thead>
                <tbody className="divide-y divide-gray-100/70">
                  {customers.slice(0, 500).map((x) => (
                    <tr key={x.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-2.5"><p className="font-bold text-gray-900">{x.name}</p><p className="text-[11px] text-gray-400 max-w-xs truncate" title={x.reason}>{x.reason}</p></td>
                      <td className="px-5 py-2.5"><Pill s={x.status} /></td>
                      <td className="px-5 py-2.5 whitespace-nowrap text-xs text-gray-600">{x.lastOrderAt ? <>{formatDate(x.lastOrderAt)} <b className="text-gray-900">· {x.daysSince >= 60 ? `${Math.floor(x.daysSince / 30)} ay` : `${x.daysSince} gün`}</b></> : '—'}</td>
                      <td className="px-5 py-2.5 text-xs text-gray-600">{x.typicalDays ? `~${x.typicalDays} gün` : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{x.periodRevenue ? formatTRY(x.periodRevenue) : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{formatTRY(x.rev90)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-gray-500">{formatTRY(x.prev90)}</td>
                    </tr>
                  ))}
                  {customers.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400 font-bold">Müşteri bulunamadı.</td></tr>}
                </tbody>
              </table>
            </div>
            {customers.length > 500 && <p className="p-3 text-center text-xs text-gray-500">İlk 500 müşteri gösteriliyor; tamamı Excel'de.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerReport;
