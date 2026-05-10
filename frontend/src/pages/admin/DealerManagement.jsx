import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, Plus, Search, MoreVertical, Shield, Mail, Phone, 
  MapPin, Hash, DollarSign, Percent, Lock, Edit3, 
  CheckCircle2, XCircle, Clock, FileText, UserCheck, ShieldCheck, X, Trash2
} from 'lucide-react';

const DealerManagement = () => {
  const [dealers, setDealers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState(null);

  const [formData, setFormData] = useState({
    name: '', taxNumber: '', taxOffice: '', authorizedPerson: '',
    phone: '', address: '', email: '', password: '',
    riskLimit: 0, dealerGroup: 'STANDART', netDiscount: 0, minOrderAmount: 0,
    status: 'ACTIVE'
  });

  const fetchDealers = async () => {
    try {
      const res = await axios.get(`http://localhost:5001/api/companies?search=${search}`);
      setDealers(res.data);
    } catch (error) {
      console.error('Bayiler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDealers();
  }, [search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedDealer) {
        await axios.patch(`http://localhost:5001/api/companies/${selectedDealer.id}`, formData);
      } else {
        await axios.post('http://localhost:5001/api/companies', formData);
      }
      setIsDrawerOpen(false);
      fetchDealers();
    } catch (error) {
      alert(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const resetPassword = async (id) => {
    if (!window.confirm('Bu bayinin şifresini sıfırlayıp mail göndermek istediğinize emin misiniz?')) return;
    try {
      const res = await axios.post(`http://localhost:5001/api/companies/${id}/reset-password`);
      alert(res.data.message);
    } catch (error) {
      alert('Hata oluştu');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE': return <span className="pill-badge pill-green">AKTİF</span>;
      case 'PASSIVE': return <span className="pill-badge pill-red">PASİF</span>;
      default: return <span className="pill-badge pill-orange">BEKLİYOR</span>;
    }
  };

  return (
    <div className="p-10 space-y-12 max-w-7xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
        <div>
          <div className="flex items-center space-x-5 mb-4">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-5 rounded-[2rem] shadow-2xl shadow-blue-500/30">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Bayi Ağı</h1>
              <p className="text-gray-400 text-sm font-semibold uppercase tracking-[0.3em] mt-1">Ticari Ortaklık Yönetimi</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-6 w-full md:w-auto">
          <div className="relative flex-1 md:w-96 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300 group-focus-within:text-blue-600 transition-all" />
            <input 
              type="text" 
              placeholder="Unvan veya Vergi No ile ara..." 
              className="w-full pl-14 pr-6 py-5 bg-white border border-gray-100 rounded-[1.5rem] text-sm font-bold focus:ring-4 focus:ring-blue-100 shadow-xl shadow-gray-200/40 outline-none transition-all placeholder:text-gray-300"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button 
            onClick={() => { setSelectedDealer(null); setIsDrawerOpen(true); }}
            className="btn-gradient px-8 py-5 whitespace-nowrap"
          >
            <Plus className="mr-2 h-5 w-5" /> YENİ BAYİ TANIMLA
          </button>
        </div>
      </div>

      <div className="card-premium">
        <table className="w-full text-left">
          <thead className="bg-gray-50/50 border-b border-gray-100">
            <tr>
              <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Kurumsal Kimlik</th>
              <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Yetkili</th>
              <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Finansal Limitler</th>
              <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">Grup & Durum</th>
              <th className="px-10 py-6 text-[11px] font-black text-gray-400 uppercase tracking-[0.3em] text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan="5" className="text-center py-32 text-gray-400 font-bold uppercase text-xs tracking-widest">Bayi verileri yükleniyor...</td></tr>
            ) : dealers.map((dealer) => (
              <tr key={dealer.id} className="hover:bg-blue-50/30 transition-all group relative">
                <td className="px-10 py-8">
                  <div className="font-black text-gray-900 group-hover:text-blue-600 transition-colors text-lg tracking-tight">{dealer.name}</div>
                  <div className="text-[10px] font-black text-gray-300 mt-1 uppercase tracking-widest">VERGİ NO: {dealer.taxNumber || '-'}</div>
                </td>
                <td className="px-10 py-8">
                  <div className="font-bold text-gray-700">{dealer.authorizedPerson || '-'}</div>
                  <div className="flex items-center text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">
                    <Mail className="h-3 w-3 mr-2 text-blue-400" /> {dealer.users?.[0]?.email || '-'}
                  </div>
                </td>
                <td className="px-10 py-8">
                  <div className="text-base font-black text-gray-900">
                    {dealer.currentBalance?.toLocaleString('tr-TR')} ₺
                  </div>
                  <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">LİMİT: {dealer.riskLimit?.toLocaleString('tr-TR')} ₺</div>
                </td>
                <td className="px-10 py-8 space-y-2">
                  <span className="pill-badge pill-blue block w-fit">
                    {dealer.dealerGroup}
                  </span>
                  {getStatusBadge(dealer.status)}
                </td>
                <td className="px-10 py-8 text-right">
                  <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                    <button 
                      onClick={() => { setSelectedDealer(dealer); setFormData({...dealer, email: dealer.users?.[0]?.email || ''}); setIsDrawerOpen(true); }}
                      className="p-3 text-blue-500 hover:bg-blue-600 hover:text-white rounded-xl transition-all shadow-sm"
                    >
                      <Edit3 className="h-5 w-5" />
                    </button>
                    <button className="p-3 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-over Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          <div className="fixed inset-y-0 right-0 max-w-2xl w-full bg-white shadow-2xl animate-slide-in flex flex-col">
            <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/30">
              <div className="flex items-center space-x-5">
                <div className="bg-blue-600 p-4 rounded-3xl shadow-xl shadow-blue-500/20">
                  <UserCheck className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Bayi Kartı Düzenle</h3>
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mt-1">Detaylı Profil & Finansal Ayarlar</p>
                </div>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-3 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-2xl transition-all">
                <X className="h-8 w-8" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-12 space-y-12 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-2 gap-x-10 gap-y-10">
                <div className="col-span-2 border-l-4 border-blue-600 pl-5 bg-blue-50/50 py-3 rounded-r-2xl">
                  <h4 className="text-xs font-black text-blue-600 uppercase tracking-[0.3em]">Kurumsal Bilgiler</h4>
                </div>
                
                <div className="col-span-2 space-y-2">
                  <label className="premium-label">Şirket Tam Unvanı</label>
                  <input required className="premium-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Örn: Akis Teknoloji Ltd. Şti." />
                </div>

                <div className="space-y-2">
                  <label className="premium-label">Vergi Numarası</label>
                  <input required className="premium-input" value={formData.taxNumber} onChange={e => setFormData({...formData, taxNumber: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="premium-label">Vergi Dairesi</label>
                  <input className="premium-input" value={formData.taxOffice} onChange={e => setFormData({...formData, taxOffice: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <label className="premium-label">Yetkili Kişi</label>
                  <input className="premium-input" value={formData.authorizedPerson} onChange={e => setFormData({...formData, authorizedPerson: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="premium-label">Telefon</label>
                  <input className="premium-input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="premium-label">Adres Bilgisi</label>
                  <textarea className="premium-input h-24 resize-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>

                <div className="col-span-2 border-l-4 border-blue-600 pl-5 bg-blue-50/50 py-3 rounded-r-2xl mt-4">
                  <h4 className="text-xs font-black text-blue-600 uppercase tracking-[0.3em]">Erişim & Finans</h4>
                </div>

                <div className="space-y-2">
                  <label className="premium-label">Giriş E-Posta</label>
                  <input required disabled={!!selectedDealer} className="premium-input disabled:opacity-50" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>

                <div className="flex items-center pt-6">
                  {selectedDealer ? (
                    <button type="button" onClick={() => resetPassword(selectedDealer.id)} className="w-full flex items-center justify-center px-6 py-4 bg-orange-50 text-orange-600 rounded-2xl text-[10px] font-black hover:bg-orange-100 transition-all border border-orange-100 uppercase tracking-widest shadow-sm">
                      <Lock className="h-4 w-4 mr-3" /> Şifreyi Sıfırla & Gönder
                    </button>
                  ) : (
                    <div className="w-full space-y-2">
                      <label className="premium-label">Geçici Şifre</label>
                      <input required className="premium-input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="premium-label">Risk Limiti (₺)</label>
                  <input type="number" className="premium-input" value={formData.riskLimit} onChange={e => setFormData({...formData, riskLimit: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="premium-label">Net İskonto (%)</label>
                  <input type="number" className="premium-input" value={formData.netDiscount} onChange={e => setFormData({...formData, netDiscount: e.target.value})} />
                </div>

                <div className="space-y-2">
                  <label className="premium-label">Bayi Grubu</label>
                  <select className="premium-input appearance-none cursor-pointer" value={formData.dealerGroup} onChange={e => setFormData({...formData, dealerGroup: e.target.value})}>
                    <option value="STANDART">STANDART (Normal)</option>
                    <option value="GOLD">GOLD (Avantajlı)</option>
                    <option value="VIP">VIP (Özel)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="premium-label">Hesap Durumu</label>
                  <div className="flex bg-gray-50 p-1.5 rounded-2xl">
                    <button type="button" onClick={() => setFormData({...formData, status: 'ACTIVE' })} className={`flex-1 py-4 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${formData.status === 'ACTIVE' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-400'}`}>AKTİF</button>
                    <button type="button" onClick={() => setFormData({...formData, status: 'PASSIVE' })} className={`flex-1 py-4 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest ${formData.status === 'PASSIVE' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-400'}`}>PASİF</button>
                  </div>
                </div>
              </div>
            </form>

            <div className="p-10 bg-gray-50/50 border-t border-gray-100 flex space-x-6">
              <button onClick={() => setIsDrawerOpen(false)} className="flex-1 py-6 border border-gray-200 rounded-2xl font-black text-gray-400 hover:bg-white transition-all uppercase tracking-widest text-[10px]">İPTAL</button>
              <button onClick={handleSubmit} className="btn-gradient flex-[2] py-6">
                <ShieldCheck className="h-5 w-5 mr-3" /> KAYDET VE DEĞİŞİKLİKLERİ YAYINLA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DealerManagement;
