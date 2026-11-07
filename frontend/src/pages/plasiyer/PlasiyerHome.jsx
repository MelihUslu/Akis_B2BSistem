import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, History, FileText, Store, TrendingUp, Award, AlertTriangle, Phone, UserRound, ChevronRight, MapPin, CalendarPlus, CalendarCheck, X } from 'lucide-react';
import api from '../../services/api';
import { startActing } from '../../utils/acting';
import { formatMoney, formatTRY, formatDate } from '../../utils/format';
import PlasiyerHeader from '../../components/plasiyer/PlasiyerHeader';
import { useTenant } from '../../context/TenantContext';
import useAlert from '../../hooks/useAlert';
import { VisitRecordModal, VisitPlanModal } from '../../components/plasiyer/VisitModals';

const daysSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
const dayOf = (d) => new Date(d).toLocaleDateString('sv-SE');

/**
 * Plasiyer (saha satış) ana sayfası: sorumlu olduğu bayiler, bakiyeleri ve prim özeti.
 * "Sipariş ver" bayinin portalını o bayi adına açar (bayinin fiyatları, limiti ve adresleriyle).
 */
const Stat = ({ icon: Icon, label, value, sub }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
    <div className="flex items-center gap-2 text-xs font-bold text-gray-500"><Icon className="h-4 w-4 text-brand-500" /> {label}</div>
    <p className="mt-2 text-xl md:text-2xl font-black text-gray-900 tabular-nums">{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const PlasiyerHome = () => {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [dealers, setDealers] = useState(null);
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);
  const [visits, setVisits] = useState(null);
  const [modal, setModal] = useState(null); // { type: 'record' | 'plan', dealer, planned? }
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => Promise.all([api.get('/plasiyer/dealers'), api.get('/plasiyer/summary'), api.get('/plasiyer/visits')])
    .then(([d, s, v]) => { setDealers(d.data); setSummary(s.data); setVisits(v.data); })
    .catch(() => setError('Bilgiler yüklenemedi. Sayfayı yenileyin.'));
  useEffect(() => { load(); }, []);

  const saved = (message) => { setModal(null); showAlert({ type: 'success', title: 'Kaydedildi', message }); load(); };
  const cancelPlan = async (v) => {
    if (!(await confirm({ type: 'warning', title: 'Planlı ziyaret iptal edilsin mi?', message: `${v.company.name} · ${new Date(v.plannedFor).toLocaleDateString('tr-TR')}`, confirmText: 'İptal et' }))) return;
    try { await api.post(`/plasiyer/visits/${v.id}/cancel`); load(); } catch { showAlert({ type: 'error', title: 'Hata', message: 'Ziyaret iptal edilemedi.' }); }
  };
  const todayKey = visits?.today;
  const todayPlans = (visits?.visits || []).filter((v) => v.status === 'PLANNED' && dayOf(v.plannedFor) <= todayKey);
  const upcoming = (visits?.visits || []).filter((v) => v.status === 'PLANNED' && dayOf(v.plannedFor) > todayKey).slice(0, 5);
  const doneToday = (visits?.visits || []).filter((v) => v.status === 'DONE' && dayOf(v.doneAt) === todayKey).length;

  const list = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr');
    return (dealers || []).filter((d) => !term || d.name.toLocaleLowerCase('tr').includes(term) || (d.authorizedPerson || '').toLocaleLowerCase('tr').includes(term));
  }, [dealers, q]);

  const open = (d, path) => {
    startActing({ companyId: d.id, name: d.name, by: 'PLASIYER', back: '/plasiyer' });
    navigate(path);
  };

  return (
    <div className="min-h-screen bg-navy-50 text-gray-900 pb-16">
      {alertElement}
      {modal?.type === 'record' && <VisitRecordModal dealer={modal.dealer} planned={modal.planned} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.type === 'plan' && <VisitPlanModal dealer={modal.dealer} onClose={() => setModal(null)} onSaved={saved} />}
      <PlasiyerHeader />

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Bayilerim</h1>
          <p className="text-sm text-gray-500 mt-1">Bir bayi seçip onun adına sipariş verin; sipariş bayinin fiyatları ve limitiyle oluşur, bayiye bildirim gider.</p>
        </div>

        {tenant?.modules?.hr && (
          <Link to="/plasiyer/personel" className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-4 hover:border-brand-200 hover:bg-brand-50/40 transition-colors">
            <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 flex items-center justify-center"><UserRound className="h-5 w-5 text-brand-600" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-black text-gray-900">Personel Alanım</span>
              <span className="block text-xs text-gray-500 truncate">İzin, masraf ve avans talepleri, hedef ve prim, şirket duyuruları</span>
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
        )}

        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat icon={TrendingUp} label="Bu ay onaylanan satış" value={formatTRY(summary.monthSales)} sub={`${summary.monthOrders} sipariş · KDV hariç`} />
            <Stat icon={Award} label="Bu ay prim" value={`${summary.monthPoints.toLocaleString('tr-TR')} puan`} />
            <Stat icon={Award} label="Toplam prim" value={`${summary.totalPoints.toLocaleString('tr-TR')} puan`} />
          </div>
        )}

        {visits && (
          <section className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-black text-gray-900 flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-brand-500" /> Bugünkü ziyaretler</h2>
              <span className="text-xs font-bold text-gray-500">{doneToday} ziyaret yapıldı</span>
            </div>
            {todayPlans.length === 0 ? (
              <p className="text-sm text-gray-500">Bugün için planlı ziyaret yok. Bayi kartındaki "Planla" ile ekleyebilirsiniz.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {todayPlans.map((v) => (
                  <li key={v.id} className="py-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-gray-900 truncate">{v.company.name}</span>
                      <span className={`block text-xs ${dayOf(v.plannedFor) < todayKey ? 'text-red-600 font-bold' : 'text-gray-500'}`}>{dayOf(v.plannedFor) < todayKey ? `Gecikti · ${new Date(v.plannedFor).toLocaleDateString('tr-TR')}` : 'Bugün'}{v.note && ` · ${v.note}`}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <button type="button" onClick={() => setModal({ type: 'record', dealer: v.company, planned: v })} className="h-9 px-3 rounded-xl bg-navy-900 text-white text-xs font-bold inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Ziyaret et</button>
                      <button type="button" onClick={() => cancelPlan(v)} aria-label="Planı iptal et" className="h-9 w-9 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 inline-flex items-center justify-center"><X className="h-4 w-4" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 && (
              <p className="text-xs text-gray-500">Yaklaşan: {upcoming.map((v) => `${v.company.name} (${new Date(v.plannedFor).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })})`).join(' · ')}</p>
            )}
          </section>
        )}

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bayi adı veya yetkili ara" aria-label="Bayi ara"
            className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-gray-200 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100" />
        </div>

        {error && <p className="text-sm font-bold text-red-600 bg-red-50 rounded-xl p-3">{error}</p>}
        {dealers && list.length === 0 && (
          <div className="text-center py-14 bg-white rounded-2xl border border-gray-100">
            <Store className="h-10 w-10 mx-auto text-gray-300" />
            <p className="mt-3 text-sm font-bold text-gray-600">{dealers.length ? 'Aramaya uyan bayi yok.' : 'Size atanmış bayi yok.'}</p>
            {!dealers.length && <p className="text-xs text-gray-400 mt-1">Firma yöneticiniz bayi kartında sizi sorumlu plasiyer olarak seçince burada görünür.</p>}
          </div>
        )}

        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((d) => {
            const debt = d.currentBalance < 0;
            return (
              <li key={d.id} className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-gray-900 truncate">{d.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {d.dealerGroup} · vade {d.paymentTermDays} gün
                      {d.phone && <> · <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1 text-brand-600 font-bold"><Phone className="h-3 w-3" />{d.phone}</a></>}
                    </p>
                  </div>
                  {d.pendingOrders > 0 && <span className="shrink-0 px-2 py-1 rounded-lg bg-orange-50 text-orange-700 text-[11px] font-bold">{d.pendingOrders} onay bekliyor</span>}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-gray-400 font-bold">Bakiye</dt><dd className={`mt-0.5 font-black tabular-nums ${debt ? 'text-red-600' : 'text-emerald-600'}`}>{formatMoney(Math.abs(d.currentBalance), d.currency)}<span className="block text-[11px] font-semibold">{debt ? 'borç' : 'alacak'}</span></dd></div>
                  <div><dt className="text-gray-400 font-bold">Kullanılabilir limit</dt><dd className="mt-0.5 font-black tabular-nums text-gray-900">{d.available === null ? '—' : formatMoney(Math.max(0, d.available), d.currency)}</dd></div>
                  <div><dt className="text-gray-400 font-bold">Son sipariş</dt><dd className="mt-0.5 font-bold text-gray-700">{d.lastOrderAt ? formatDate(d.lastOrderAt) : 'Yok'}</dd></div>
                </dl>
                {d.overdue > 0 && <p className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 rounded-lg px-3 py-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Vadesi geçen: {formatTRY(d.overdue)}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className={!d.lastVisitAt || daysSince(d.lastVisitAt) > 30 ? 'font-bold text-amber-700' : 'text-gray-500'}>
                    <MapPin className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                    {d.lastVisitAt ? `Son ziyaret ${daysSince(d.lastVisitAt) === 0 ? 'bugün' : `${daysSince(d.lastVisitAt)} gün önce`}` : 'Hiç ziyaret edilmedi'}
                    {d.nextVisitOn && <span className="font-normal text-gray-500"> · planlı {new Date(d.nextVisitOn).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>}
                  </span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => setModal({ type: 'record', dealer: d })} className="h-8 px-2.5 rounded-lg bg-brand-50 text-brand-700 font-bold inline-flex items-center gap-1 hover:bg-brand-100"><MapPin className="h-3.5 w-3.5" /> Ziyaret kaydet</button>
                    <button type="button" onClick={() => setModal({ type: 'plan', dealer: d })} className="h-8 px-2.5 rounded-lg bg-gray-100 text-gray-700 font-bold inline-flex items-center gap-1 hover:bg-gray-200"><CalendarPlus className="h-3.5 w-3.5" /> Planla</button>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button onClick={() => open(d, '/bayi')} className="col-span-2 sm:col-span-1 h-11 rounded-xl bg-navy-900 text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-navy-950"><ShoppingCart className="h-4 w-4" /> Sipariş ver</button>
                  <button onClick={() => open(d, '/bayi/orders')} className="h-11 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-gray-200"><History className="h-4 w-4" /> Siparişleri</button>
                  <button onClick={() => open(d, '/bayi/finance')} className="h-11 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-gray-200"><FileText className="h-4 w-4" /> Ekstre</button>
                </div>
              </li>
            );
          })}
        </ul>

        {summary?.recent?.length > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <h2 className="px-5 py-4 font-black text-gray-900 border-b border-gray-100">Son primlerim</h2>
            <ul className="divide-y divide-gray-50">
              {summary.recent.map((p) => (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0"><b className="font-mono">#AK-{p.order?.id}</b> <span className="text-gray-500 truncate">· {p.order?.company?.name}</span></span>
                  <span className="font-black tabular-nums text-emerald-600 shrink-0">+{p.points.toLocaleString('tr-TR')} puan</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
};

export default PlasiyerHome;
