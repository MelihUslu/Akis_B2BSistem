import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { CreditCard, Plus, ArrowUpRight, ArrowDownLeft, Award, Search } from 'lucide-react';

const FinanceManagement = () => {
  const [dealers, setDealers] = useState([]);
  const [plasiyerPoints, setPlasiyerPoints] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    companyId: '',
    type: 'DEBT',
    amount: '',
    description: ''
  });

  const fetchData = async () => {
    try {
      const [dealersRes, pointsRes] = await Promise.all([
        api.get('/companies'),
        api.get('/finance/plasiyer-points')
      ]);
      setDealers(dealersRes.data);
      setPlasiyerPoints(pointsRes.data);
    } catch (error) {
      console.error('Veriler yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/finance/transaction', formData);
      alert('İşlem başarıyla kaydedildi');
      setIsModalOpen(false);
      fetchData();
      setFormData({ companyId: '', type: 'DEBT', amount: '', description: '' });
    } catch (error) {
      alert('İşlem başarısız');
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <CreditCard className="mr-3 h-7 w-7 text-blue-600" />
            Finans ve Prim Yönetimi
          </h1>
          <p className="text-gray-500 text-sm mt-1">Cari ekstre girişleri ve plasiyer prim takibi.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 bg-blue-600 rounded-xl text-sm font-medium text-white hover:bg-blue-700 shadow-md transition-all"
        >
          <Plus className="mr-2 h-4 w-4" />
          Manuel İşlem Girişi
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bayi Bakiyeleri ve Manuel Giriş Özeti */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Bayi Bakiyeleri</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input type="text" placeholder="Bayi ara..." className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-[400px] overflow-auto">
            {dealers.map((dealer) => (
              <div key={dealer.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition-colors">
                <div>
                  <p className="text-sm font-bold text-gray-800">{dealer.name}</p>
                  <p className="text-xs text-gray-500">Risk: ₺{dealer.riskLimit.toLocaleString('tr-TR')}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${dealer.currentBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₺{dealer.currentBalance.toLocaleString('tr-TR')}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">{dealer.currentBalance >= 0 ? 'Alacaklı' : 'Borçlu'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Plasiyer Prim Sistemi */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center space-x-2">
            <Award className="h-5 w-5 text-orange-500" />
            <h3 className="font-bold text-gray-900">Plasiyer Prim Sistemi</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {plasiyerPoints.length === 0 ? (
                <p className="text-center py-8 text-gray-400 text-sm italic">Henüz prim puanı bulunmuyor.</p>
              ) : plasiyerPoints.map((point) => (
                <div key={point.id} className="flex items-center justify-between p-4 bg-orange-50/50 rounded-2xl border border-orange-100/50">
                  <div className="flex items-center space-x-4">
                    <div className="bg-orange-500 text-white p-2 rounded-xl">
                      <Award className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{point.user?.name}</p>
                      <p className="text-[10px] text-orange-600 font-black uppercase">Sipariş #AK-{point.orderId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-orange-600">+{point.points.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Puan</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Standardized Centered Modal - Restored Rich Content */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white">
              <h3 className="text-xl font-bold text-gray-900">Manuel İşlem Girişi</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bayi Seçimi</label>
                <select required className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={formData.companyId} onChange={e => setFormData({...formData, companyId: e.target.value})}>
                  <option value="">Bayi Seçin...</option>
                  {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">İşlem Tipi</label>
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button type="button" onClick={() => setFormData({...formData, type: 'DEBT'})} className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center transition-all ${formData.type === 'DEBT' ? 'bg-red-500 text-white shadow-md' : 'text-gray-400'}`}>
                      <ArrowUpRight className="h-3 w-3 mr-1" /> BORÇ
                    </button>
                    <button type="button" onClick={() => setFormData({...formData, type: 'CREDIT'})} className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center transition-all ${formData.type === 'CREDIT' ? 'bg-green-500 text-white shadow-md' : 'text-gray-400'}`}>
                      <ArrowDownLeft className="h-3 w-3 mr-1" /> ALACAK
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (₺)</label>
                  <input required type="number" step="0.01" className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none" placeholder="İşlem detayı..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
              </div>
              <div className="pt-4 flex space-x-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Vazgeç</button>
                <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg">İşlemi Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FinanceManagement;
