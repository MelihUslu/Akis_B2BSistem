import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Wallet, TrendingUp, Clock, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { platformApi } from '../../services/api';
import { formatTRY, formatDate } from '../../utils/format';
import { StatusPill } from './shared';

const PlatformDashboard = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    platformApi.get('/dashboard').then((res) => setData(res.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-center text-gray-400 py-20">Yükleniyor...</div>;

  const cards = [
    { title: 'Aylık Tekrarlayan Gelir (MRR)', value: formatTRY(data.mrr), icon: TrendingUp, color: 'bg-navy-900' },
    { title: 'Bu Ay Tahsilat', value: formatTRY(data.monthRevenue), icon: Wallet, color: 'bg-brand-600' },
    { title: 'Aktif Müşteri', value: data.totals.ACTIVE, icon: Building2, color: 'bg-navy-700' },
    { title: 'Denemedeki Müşteri', value: data.totals.TRIAL, icon: Clock, color: 'bg-brand-700' },
  ];

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <div className="page-icon"><LayoutDashboard className="h-6 w-6 text-brand-400" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Genel Bakış</h1>
          <p className="text-gray-500 text-sm mt-1">Toplam {data.totals.tenants} müşteri · {data.totals.PAST_DUE} ödeme gecikmesi · {data.totals.SUSPENDED} askıda</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c) => (
          <div key={c.title} className={`${c.color} p-6 rounded-[2rem] text-white min-h-[150px] flex flex-col justify-between shadow-lg`}>
            <c.icon className="h-5 w-5 opacity-80" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{c.title}</p>
              <p className="text-2xl font-black tracking-tighter mt-1">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-premium p-6">
          <h3 className="font-black text-gray-900 mb-4 flex items-center"><AlertTriangle className="h-4 w-4 mr-2 text-amber-500" /> Yakında Bitecekler (7 gün)</h3>
          {[...data.trialsEnding.map((t) => ({ ...t, date: t.trialEndsAt, kind: 'Deneme' })), ...data.expiring.map((t) => ({ ...t, date: t.currentPeriodEnd, kind: 'Abonelik' }))].length === 0 ? (
            <p className="text-sm text-gray-400 font-semibold py-6 text-center">Yakında biten abonelik yok.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {[...data.trialsEnding.map((t) => ({ ...t, date: t.trialEndsAt, kind: 'Deneme' })), ...data.expiring.map((t) => ({ ...t, date: t.currentPeriodEnd, kind: 'Abonelik' }))].map((t) => (
                <Link key={`${t.kind}-${t.id}`} to={`/tenants/${t.id}`} className="flex justify-between py-3 hover:bg-gray-50 px-2 rounded-xl">
                  <span className="text-sm font-bold text-gray-800">{t.name} <span className="text-gray-400 font-semibold">· {t.kind}</span></span>
                  <span className="text-xs font-black text-amber-600">{formatDate(t.date)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card-premium p-6">
          <h3 className="font-black text-gray-900 mb-4">Son Kayıtlar</h3>
          <div className="divide-y divide-gray-50">
            {data.recentSignups.map((t) => (
              <Link key={t.id} to={`/tenants/${t.id}`} className="flex justify-between items-center py-3 hover:bg-gray-50 px-2 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-gray-800">{t.name}</p>
                  <p className="text-[11px] text-gray-400 font-semibold">{t.slug} · {t.plan} · {t.signupSource === 'SELF' ? 'Kendi kayıt oldu' : 'Sen açtın'} · {formatDate(t.createdAt)}</p>
                </div>
                <StatusPill status={t.status} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card-premium p-6">
        <h3 className="font-black text-gray-900 mb-4">Son Ödemeler</h3>
        {data.recentPayments.length === 0 ? <p className="text-sm text-gray-400 font-semibold py-6 text-center">Henüz ödeme yok.</p> : (
          <div className="divide-y divide-gray-50">
            {data.recentPayments.map((p) => (
              <div key={p.id} className="flex justify-between py-3 px-2">
                <span className="text-sm font-bold text-gray-800">{p.tenant.name} <span className="text-gray-400 font-semibold">· {p.planCode} · {p.method === 'IYZICO' ? 'iyzico' : 'Manuel'}</span></span>
                <span className={`text-sm font-black ${p.status === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'}`}>{p.status === 'SUCCESS' ? formatTRY(p.amount) : 'Başarısız'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformDashboard;
