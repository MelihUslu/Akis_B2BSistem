import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { CreditCard, Wallet, ArrowUpRight, ArrowDownLeft, Info } from 'lucide-react';

const BayiFinance = () => {
  const [balance, setBalance] = useState(0);
  const [riskLimit, setRiskLimit] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Gerçek uygulamada login olan kullanıcının şirket bilgileri çekilmeli
    const fetchFinance = async () => {
      try {
        const response = await api.get('/companies');
        if (response.data.length > 0) {
          const myCompany = response.data[0]; // Örnek olarak ilkini alıyoruz
          setBalance(myCompany.currentBalance);
          setRiskLimit(myCompany.riskLimit);
        }
      } catch (error) {
        console.error('Finansal bilgiler yüklenemedi');
      } finally {
        setIsLoading(false);
      }
    };
    fetchFinance();
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <CreditCard className="mr-3 h-7 w-7 text-blue-600" />
          Finansal Durum
        </h1>
        <p className="text-gray-500 text-sm mt-1">Cari bakiye, risk limiti ve ödeme durumunuzu inceleyin.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-sm font-medium text-gray-400 mb-1">Güncel Bakiyeniz</p>
            <h2 className={`text-4xl font-black ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₺{balance.toLocaleString('tr-TR')}
            </h2>
            <p className="text-xs text-gray-400 mt-2 font-bold uppercase tracking-wider">
              {balance >= 0 ? 'ALACAKLI DURUMDASINIZ' : 'TOPLAM BORÇ TUTARI'}
            </p>
          </div>
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Wallet className="h-24 w-24 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-400 mb-1">Risk Limitiniz</p>
              <h2 className="text-4xl font-black text-gray-900">
                ₺{riskLimit.toLocaleString('tr-TR')}
              </h2>
              <div className="mt-4 w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-600 h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${Math.min(100, (Math.abs(balance) / riskLimit) * 100)}%` }}
                ></div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase">
                LİMİT KULLANIMI: %{riskLimit > 0 ? ((Math.abs(balance) / riskLimit) * 100).toFixed(1) : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 p-6 rounded-3xl flex items-start space-x-4">
        <div className="bg-blue-600 p-2 rounded-xl text-white">
          <Info className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-bold text-blue-900">Bilgilendirme</h4>
          <p className="text-sm text-blue-700 mt-1 leading-relaxed">
            Ödemelerinizi Sanal POS üzerinden veya banka havalesi ile gerçekleştirebilirsiniz. 
            Havale bildirimleri için lütfen finans birimi ile iletişime geçin.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BayiFinance;
