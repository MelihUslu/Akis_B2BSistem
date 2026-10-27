import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, ShoppingCart, TrendingUp, Activity, Award, CreditCard,
  FileText, Plus, Clock, AlertCircle, Wallet, RotateCcw, ShieldAlert, Trophy
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatTRY, formatDate, ORDER_STATUS, formatMoney } from '../../utils/format';

const STATUS_COLORS = {
  PENDING: '#f97316', APPROVED: '#10b981', PARTIAL_APPROVED: '#f59e0b',
  SHIPPED: '#3b82f6', COMPLETED: '#22c55e', CANCELLED: '#ef4444'
};

const tooltipStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' };

const timeAgo = (date) => {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} dk önce`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} saat önce`;
  return formatDate(date);
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
};

const EmptyChart = ({ text }) => (
  <div className="h-full flex items-center justify-center text-xs font-bold text-gray-300 uppercase tracking-widest">{text}</div>
);

const AdminDashboardHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    api.get('/dashboard')
      .then((res) => setData(res.data))
      .catch(() => setError('Panel verileri yüklenemedi.'));
  }, []);

  if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;
  if (!data) return <div className="p-10 text-center text-gray-400">Yükleniyor...</div>;

  const { stats } = data;
  const statCards = [
    {
      title: 'Bu Ayki Satış', value: formatTRY(stats.monthSales),
      desc: stats.salesChange === null ? 'Geçen ay veri yok' : `Geçen aya göre %${stats.salesChange > 0 ? '+' : ''}${stats.salesChange}`,
      icon: TrendingUp, color: 'bg-indigo-500', shadow: 'shadow-indigo-500/30', link: '/admin/orders'
    },
    { title: 'Aktif Bayiler', value: stats.activeDealers, desc: stats.pendingDealers ? `${stats.pendingDealers} başvuru bekliyor` : 'Bekleyen başvuru yok', icon: Users, color: 'bg-emerald-400', shadow: 'shadow-emerald-400/30', link: '/admin/dealers' },
    { title: 'Bekleyen Sipariş', value: stats.pendingOrders, desc: stats.pendingReturns ? `${stats.pendingReturns} iade talebi bekliyor` : 'Onay bekleyen siparişler', icon: ShoppingCart, color: 'bg-pink-500', shadow: 'shadow-pink-500/30', link: '/admin/orders' },
    { title: 'Toplam Prim', value: stats.plasiyerTotal.toLocaleString('tr-TR'), desc: 'Plasiyer prim puanları', icon: CreditCard, color: 'bg-blue-500', shadow: 'shadow-blue-500/30', link: '/admin/finance' },
  ];

  const statusData = data.orderStatus.map((s) => ({ name: ORDER_STATUS[s.status]?.label || s.status, value: s.count, status: s.status }));
  const totalOrders = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 relative">
      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}></div>
          <div className="modal-panel w-full max-w-xl">
            <div className="modal-header items-center">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
                  <ShoppingCart className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">Sipariş Detayı</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">#AK-{selectedOrder.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 bg-white hover:bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5 text-slate-400 rotate-45" />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bayi Bilgisi</span>
                  <p className="text-sm font-bold text-slate-800">{selectedOrder.company?.name}</p>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zaman</span>
                  <p className="text-sm font-bold text-slate-800">{formatDate(selectedOrder.createdAt, true)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sipariş İçeriği</span>
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3 max-h-60 overflow-y-auto custom-scrollbar">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-600 border-b border-slate-200/50 pb-2">
                    <span>Ürün</span>
                    <div className="flex space-x-8">
                      <span>Adet</span>
                      <span>Toplam</span>
                    </div>
                  </div>
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800">{item.product?.name}</span>
                      <div className="flex space-x-10 text-slate-500 font-medium">
                        <span>{item.quantity}</span>
                        <span className="font-bold text-slate-900">{formatTRY(item.price * item.quantity)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Toplam Tutar (KDV dahil)</span>
                <span className="text-2xl font-black text-slate-900 tracking-tighter">{formatTRY(selectedOrder.totalAmount)}</span>
              </div>
            </div>

            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex gap-4">
              <button
                onClick={() => navigate('/admin/orders')}
                className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]"
              >
                Onay Ekranına Git
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            {greeting()}, <span className="text-indigo-600">{user?.name?.split(' ')[0] || 'Admin'}!</span>
          </h1>
          <p className="text-gray-400 text-sm font-medium">Satış, risk ve tahsilat özetiniz.</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <Link to={stat.link} key={stat.title} className={`${stat.color} ${stat.shadow} p-6 rounded-[2rem] text-white flex flex-col justify-between min-h-[180px] hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden`}>
            <Award className="absolute -right-4 -top-4 h-24 w-24 text-white/10 rotate-12" />
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[9px] text-white/70 font-black uppercase tracking-[0.2em] mb-1">{stat.title}</p>
              <h3 className="text-xl font-black mb-1 leading-tight tracking-tighter">{stat.value}</h3>
              <p className="text-[8px] text-white/60 font-bold leading-relaxed">{stat.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card-premium p-8">
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-50 rounded-lg">
                <FileText className="h-4 w-4 text-indigo-500" />
              </div>
              <h3 className="text-base font-black text-gray-900 tracking-tight">Satış Analizi · Son 30 Gün</h3>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.salesSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} interval={4} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `₺${(v / 1000).toLocaleString('tr-TR')}b`} width={56} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                  formatter={(value, name) => (name === 'revenue' ? [formatTRY(value), 'Ciro'] : [value, 'Sipariş'])}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium p-8 flex flex-col">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShoppingCart className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">Sipariş Durumları</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div className="h-[200px] w-full">
              {totalOrders === 0 ? <EmptyChart text="Henüz sipariş yok" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={4} dataKey="value">
                      {statusData.map((entry) => <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} cornerRadius={10} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            {totalOrders > 0 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <p className="text-2xl font-black text-gray-900">{totalOrders}</p>
              </div>
            )}
          </div>
          <div className="space-y-3 mt-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">
            {statusData.map((s) => (
              <div key={s.status} className="flex justify-between items-center">
                <span className="flex items-center"><span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: STATUS_COLORS[s.status] }} />{s.name}</span>
                <span className="text-gray-900">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calisma4: En çok alım yapan bayiler, en çok iade edilen ürünler, risk limitine yaklaşan firmalar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="card-premium p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-emerald-50 rounded-lg"><Trophy className="h-4 w-4 text-emerald-500" /></div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">En Çok Alım Yapan Bayiler</h3>
          </div>
          <div className="h-[240px]">
            {data.topDealers.length === 0 ? <EmptyChart text="Onaylı sipariş yok" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topDealers} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatTRY(v), 'Toplam']} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="total" fill="#10b981" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-premium p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-orange-50 rounded-lg"><RotateCcw className="h-4 w-4 text-orange-500" /></div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">En Çok İade Edilen Ürünler</h3>
          </div>
          <div className="h-[240px]">
            {data.mostReturned.length === 0 ? <EmptyChart text="İade talebi yok" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.mostReturned} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} adet`, 'İade']} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="quantity" fill="#f97316" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-premium p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-red-50 rounded-lg"><ShieldAlert className="h-4 w-4 text-red-500" /></div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">Risk Limitine Yaklaşanlar</h3>
          </div>
          <div className="space-y-5">
            {data.riskCompanies.length === 0 ? (
              <div className="h-[200px]"><EmptyChart text="%70 üzeri limit kullanan yok" /></div>
            ) : data.riskCompanies.map((c) => (
              <div key={c.id}>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-gray-700 truncate pr-2">{c.name}</span>
                  <span className={c.usage >= 90 ? 'text-red-600' : 'text-amber-600'}>%{c.usage.toFixed(0)}</span>
                </div>
                <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${c.usage >= 90 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, c.usage)}%` }} />
                </div>
                <p className="text-[10px] font-bold text-gray-400 mt-1">{formatTRY(-c.currentBalance)} / {formatTRY(c.riskLimit)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Orders & Stocks Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card-premium p-8">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">Son Bekleyen Siparişler</h3>
            </div>
            <Link to="/admin/orders" className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Hepsini Gör</Link>
          </div>

          <div className="w-full overflow-x-auto">
            {data.pendingOrders.length === 0 ? (
              <p className="text-center text-xs font-bold text-gray-300 uppercase tracking-widest py-10">Bekleyen sipariş yok</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-slate-50">
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Bayi Adı</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 text-center">Zaman</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 text-center">Tutar</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 text-right">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50/50">
                  {data.pendingOrders.map((order, idx) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="group hover:bg-slate-50/50 transition-all cursor-pointer"
                    >
                      <td className="py-5 px-2">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm ${
                            ['bg-orange-400', 'bg-indigo-400', 'bg-emerald-400'][idx % 3]
                          }`}>
                            {order.company?.name?.substring(0, 1)}
                          </div>
                          <span className="text-xs font-bold text-slate-700">{order.company?.name}</span>
                        </div>
                      </td>
                      <td className="py-5 px-2 text-center">
                        <span className="text-xs font-medium text-slate-500">{timeAgo(order.createdAt)}</span>
                      </td>
                      <td className="py-5 px-2 text-center">
                        <span className="text-xs font-black text-slate-900">{formatTRY(order.totalAmount)}</span>
                      </td>
                      <td className="py-5 px-2 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500">Beklemede</span>
                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card-premium p-8">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Activity className="h-4 w-4 text-orange-500" />
            </div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">Stok Uyarıları</h3>
          </div>
          <div className="space-y-3">
            {data.lowStock.length === 0 ? (
              <p className="text-center text-xs font-bold text-gray-300 uppercase tracking-widest py-6">Kritik stok yok</p>
            ) : data.lowStock.map((item) => (
              <Link to="/admin/products" key={item.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center hover:bg-white transition-colors">
                <span className="text-[10px] font-black text-gray-700">{item.name}</span>
                <span className={`pill-badge ${item.stock <= 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'} text-[8px]`}>{item.stock <= 0 ? 'BİTTİ' : `${item.stock} ADET`}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card-premium p-8">
        <div className="flex justify-between items-center mb-10">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-500">
              <Wallet className="h-4 w-4" />
            </div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">Ödeme Takibi · Borçlu Bayiler</h3>
          </div>
          <div className="flex space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Vadesi Geçen</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ödeme Bekleyen</span>
            </div>
          </div>
        </div>

        {data.debtors.length === 0 ? (
          <p className="text-center text-xs font-bold text-gray-300 uppercase tracking-widest py-6">Borçlu bayi yok</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.debtors.map((d) => {
              const overdue = d.nextDue && new Date(d.nextDue) < new Date();
              return (
                <div key={d.id} className="p-6 bg-gray-50/50 border border-gray-100 rounded-[2rem] hover:bg-white hover:shadow-2xl hover:shadow-gray-100 transition-all relative group">
                  <div className={`absolute top-6 right-6 p-2 rounded-xl ${overdue ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                    {overdue ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </div>
                  <div className="mb-4">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{overdue ? 'VADESİ GEÇTİ' : 'BEKLEYEN'}</p>
                    <h4 className="text-sm font-black text-gray-900 leading-tight pr-10">{d.name}</h4>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-lg font-black text-gray-900 tracking-tighter">{formatMoney(-d.balance, d.currency)}</p>
                      <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">{d.phone || 'Telefon yok'}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[8px] font-black text-gray-300 block mb-1 uppercase">En Yakın Vade</span>
                      <span className="text-[10px] font-black text-gray-500">{d.nextDue ? formatDate(d.nextDue) : '-'}</span>
                    </div>
                  </div>
                  <Link to={`/admin/partners?id=${d.id}`} className="block text-center w-full mt-6 py-3 bg-white border border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest rounded-xl group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                    Ekstreyi Gör
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboardHome;
