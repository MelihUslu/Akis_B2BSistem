import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, History, FileText, LogOut, Store, TrendingUp, Award, AlertTriangle, Phone } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { startActing } from '../../utils/acting';
import { formatMoney, formatTRY, formatDate } from '../../utils/format';
import TenantBrand from '../../components/TenantBrand';

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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dealers, setDealers] = useState(null);
  const [summary, setSummary] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/plasiyer/dealers'), api.get('/plasiyer/summary')])
      .then(([d, s]) => { setDealers(d.data); setSummary(s.data); })
      .catch(() => setError('Bilgiler yüklenemedi. Sayfayı yenileyin.'));
  }, []);

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
      <header className="sticky top-0 z-30 bg-navy-900 text-white">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="min-w-0 truncate"><TenantBrand textClass="text-white !text-base" onDark /></div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right min-w-0">
              <p className="text-sm font-bold truncate">{user?.name}</p>
              <p className="text-[11px] font-bold text-brand-300 uppercase tracking-wider">Plasiyer</p>
            </div>
            <button onClick={() => { logout(); navigate('/login'); }} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10" aria-label="Çıkış yap" title="Çıkış yap"><LogOut className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Bayilerim</h1>
          <p className="text-sm text-gray-500 mt-1">Bir bayi seçip onun adına sipariş verin; sipariş bayinin fiyatları ve limitiyle oluşur, bayiye bildirim gider.</p>
        </div>

        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat icon={TrendingUp} label="Bu ay onaylanan satış" value={formatTRY(summary.monthSales)} sub={`${summary.monthOrders} sipariş · KDV hariç`} />
            <Stat icon={Award} label="Bu ay prim" value={`${summary.monthPoints.toLocaleString('tr-TR')} puan`} />
            <Stat icon={Award} label="Toplam prim" value={`${summary.totalPoints.toLocaleString('tr-TR')} puan`} />
          </div>
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
