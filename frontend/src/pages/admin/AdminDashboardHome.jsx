import React from 'react';
import { 
  Users, Package, ShoppingCart, TrendingUp, Activity, Award, CreditCard, 
  ChevronRight, PieChart as PieChartIcon, FileText, Box, Plus, 
  Clock, MapPin, ExternalLink, AlertCircle, CheckCircle2, Wallet
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const AdminDashboardHome = () => {
  const [selectedOrder, setSelectedOrder] = React.useState(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Mock Data
  const salesData = [
    { name: 'Feb 21', orders: 40, revenue: 2400 },
    { name: 'Feb 24', orders: 30, revenue: 1398 },
    { name: 'Feb 28', orders: 60, revenue: 9800 },
    { name: 'Mar 03', orders: 20, revenue: 3908 },
    { name: 'Mar 07', orders: 80, revenue: 4800 },
    { name: 'Mar 11', orders: 50, revenue: 3800 },
    { name: 'Mar 15', orders: 90, revenue: 4300 },
    { name: 'Mar 19', orders: 70, revenue: 9800 },
    { name: 'Mar 23', orders: 110, revenue: 11000 },
  ];

  const customerData = [
    { name: 'Yeni Bayiler', value: 68 },
    { name: 'Eski Bayiler', value: 32 },
  ];
  const COLORS = ['#10b981', '#3b82f6'];

  const stats = [
    { title: 'Toplam Satış', value: '₺1,240,500', desc: 'Bu ay %12 artış', icon: TrendingUp, color: 'bg-indigo-500', shadow: 'shadow-indigo-500/30' },
    { title: 'Aktif Bayiler', value: '842', desc: '14 yeni başvuru bekliyor', icon: Users, color: 'bg-emerald-400', shadow: 'shadow-emerald-400/30' },
    { title: 'Bekleyen Sipariş', value: '18', desc: 'Onay bekleyen kalemler', icon: ShoppingCart, color: 'bg-pink-500', shadow: 'shadow-pink-500/30' },
    { title: 'Toplam Prim', value: '₺42,150', desc: 'Plasiyer hakedişleri', icon: CreditCard, color: 'bg-blue-500', shadow: 'shadow-blue-500/30' },
  ];

  const recentOrders = [
    { id: 'ORD-8429', dealer: 'Akis Teknoloji Ltd.', date: '10 Dakika Önce', amount: '₺12,450', status: 'PENDING' },
    { id: 'ORD-8430', dealer: 'Güven Yapı Market', date: '45 Dakika Önce', amount: '₺8,900', status: 'PENDING' },
    { id: 'ORD-8431', dealer: 'Mega Enerji Sistemleri', date: '2 Saat Önce', amount: '₺24,100', status: 'PENDING' },
  ];

  const pendingPayments = [
    { dealer: 'Kardeşler Hırdavat', amount: '₺45,200', type: 'ÇEKİLEMEDİ', date: '12.05.2026', reason: 'Yetersiz Bakiye' },
    { dealer: 'Sönmez Grup', amount: '₺12,150', type: 'BEKLEYEN', date: '14.05.2026', reason: 'Vade Bekliyor' },
    { dealer: 'Uğur İnşaat', amount: '₺8,400', type: 'ÇEKİLEMEDİ', date: '10.05.2026', reason: 'Provizyon Hatası' },
  ];

  const handleOrderClick = (order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 relative">
      {/* Order Detail Modal */}
      {isModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          <div className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl relative overflow-hidden border border-slate-100">
            {/* Modal Header */}
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
                  <ShoppingCart className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight">Sipariş Detayı</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedOrder.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="w-10 h-10 bg-white hover:bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5 text-slate-400 rotate-45" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bayi Bilgisi</span>
                  <p className="text-sm font-bold text-slate-800">{selectedOrder.dealer}</p>
                </div>
                <div className="space-y-1 text-right">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Zaman</span>
                  <p className="text-sm font-bold text-slate-800">{selectedOrder.date}</p>
                </div>
              </div>

              <div className="space-y-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sipariş İçeriği</span>
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-600 border-b border-slate-200/50 pb-2">
                    <span>Ürün</span>
                    <div className="flex space-x-8">
                      <span>Adet</span>
                      <span>Toplam</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">Akis Pro Matkap G-20</span>
                    <div className="flex space-x-10 text-slate-500 font-medium">
                      <span>2</span>
                      <span className="font-bold text-slate-900">₺4,500</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-800">Darbeli Vidalama Seti</span>
                    <div className="flex space-x-10 text-slate-500 font-medium">
                      <span>1</span>
                      <span className="font-bold text-slate-900">₺7,950</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Toplam Tutar</span>
                <span className="text-2xl font-black text-slate-900 tracking-tighter">{selectedOrder.amount}</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex gap-4">
              <button className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98]">
                Siparişi Onayla
              </button>
              <button className="px-8 py-4 bg-white hover:bg-red-50 text-red-500 font-black text-[11px] uppercase tracking-widest rounded-2xl border border-slate-200 transition-all">
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">
            Günaydın, <span className="text-indigo-600">Admin!</span>
          </h1>
          <p className="text-gray-400 text-sm font-medium">Finansal akış ve bekleyen ödemeler özeti.</p>
        </div>
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
           <button className="px-4 py-2 text-[10px] font-black bg-white shadow-sm rounded-lg text-indigo-600 uppercase tracking-widest transition-all">Bugün</button>
           <button className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-all">Bu Hafta</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={`${stat.color} ${stat.shadow} p-6 rounded-[2rem] text-white flex flex-col justify-between min-h-[180px] hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden`}>
            <Award className="absolute -right-4 -top-4 h-24 w-24 text-white/10 rotate-12" />
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
              <stat.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[9px] text-white/70 font-black uppercase tracking-[0.2em] mb-1">{stat.title}</p>
              <h3 className="text-xl font-black mb-1 leading-tight tracking-tighter">{stat.value}</h3>
              <p className="text-[8px] text-white/60 font-bold leading-relaxed">{stat.desc}</p>
            </div>
          </div>
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
              <h3 className="text-base font-black text-gray-900 tracking-tight">Satış Analizi</h3>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} dy={10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-premium p-8 flex flex-col">
          <div className="flex items-center space-x-3 mb-8">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-base font-black text-gray-900 tracking-tight">Bayi Portföyü</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={customerData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={8} dataKey="value">
                    {customerData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={10} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pt-5">
               <p className="text-2xl font-black text-gray-900">100%</p>
            </div>
          </div>
          <div className="space-y-4 mt-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">
             <div className="flex justify-between items-center">
                <span>Yeni Bayiler</span>
                <span className="text-gray-900">68%</span>
             </div>
             <div className="flex justify-between items-center">
                <span>Düzenli Bayiler</span>
                <span className="text-gray-900">32%</span>
             </div>
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
            <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Hepsini Gör</button>
          </div>
          
          <div className="w-full overflow-x-auto">
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
                {recentOrders.map((order, idx) => (
                  <tr 
                    key={order.id} 
                    onClick={() => handleOrderClick(order)}
                    className="group hover:bg-slate-50/50 transition-all cursor-pointer"
                  >
                    <td className="py-5 px-2">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-sm ${
                          idx === 0 ? 'bg-orange-400' : idx === 1 ? 'bg-indigo-400' : 'bg-emerald-400'
                        }`}>
                          {order.dealer.substring(0, 1)}
                        </div>
                        <span className="text-xs font-bold text-slate-700">{order.dealer}</span>
                      </div>
                    </td>
                    <td className="py-5 px-2 text-center">
                      <span className="text-xs font-medium text-slate-500">{order.date}</span>
                    </td>
                    <td className="py-5 px-2 text-center">
                      <span className="text-xs font-black text-slate-900">{order.amount}</span>
                    </td>
                    <td className="py-5 px-2 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          order.status === 'PENDING' ? 'text-orange-500' : 'text-emerald-500'
                        }`}>
                          {order.status === 'PENDING' ? 'Beklemede' : 'Başarılı'}
                        </span>
                        <div className={`w-2 h-2 rounded-full ${
                          order.status === 'PENDING' ? 'bg-orange-500' : 'bg-emerald-500'
                        }`}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
             {[
               { name: 'Akis Pro Matkap', stock: 3 },
               { name: 'Kömürsüz Taşlama', stock: 0 },
               { name: 'Darbeli Vidalama', stock: 5 },
             ].map((item, i) => (
               <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                  <span className="text-[10px] font-black text-gray-700">{item.name}</span>
                  <span className={`pill-badge ${item.stock === 0 ? 'pill-red' : 'pill-orange'} text-[7px]`}>{item.stock === 0 ? 'BİTTİ' : `${item.stock} ADET`}</span>
               </div>
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
            <h3 className="text-base font-black text-gray-900 tracking-tight">Ödeme Takibi & Tahsilat Sorunları</h3>
          </div>
          <div className="flex space-x-4">
             <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Çekilemeyen</span>
             </div>
             <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Ödeme Bekleyen</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {pendingPayments.map((payment, i) => (
             <div key={i} className="p-6 bg-gray-50/50 border border-gray-100 rounded-[2rem] hover:bg-white hover:shadow-2xl hover:shadow-gray-100 transition-all cursor-pointer relative group">
                <div className={`absolute top-6 right-6 p-2 rounded-xl ${payment.type === 'ÇEKİLEMEDİ' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                   {payment.type === 'ÇEKİLEMEDİ' ? <AlertCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </div>
                <div className="mb-4">
                   <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{payment.type}</p>
                   <h4 className="text-sm font-black text-gray-900 leading-tight">{payment.dealer}</h4>
                </div>
                <div className="flex items-end justify-between">
                   <div>
                      <p className="text-lg font-black text-gray-900 tracking-tighter">{payment.amount}</p>
                      <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">{payment.reason}</p>
                   </div>
                   <div className="text-right">
                      <span className="text-[8px] font-black text-gray-300 block mb-1 uppercase">Vade/Tarih</span>
                      <span className="text-[10px] font-black text-gray-500">{payment.date}</span>
                   </div>
                </div>
                <button className="w-full mt-6 py-3 bg-white border border-gray-100 text-[9px] font-black text-gray-400 uppercase tracking-widest rounded-xl group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-all">
                   İletişime Geç
                </button>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardHome;
