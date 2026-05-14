import React, { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { Truck, CreditCard, Landmark, ArrowRight, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import CustomAlert from '../../components/CustomAlert';

const CheckoutPage = () => {
  const { cart, cartTotal, clearCart } = useCart();
  const { user } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState('CURRENT_ACCOUNT');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  // Alert state
  const [alert, setAlert] = useState({
    isOpen: false,
    type: 'info',
    title: '',
    message: '',
    onConfirm: null,
  });

  const showAlert = ({ type, title, message, onConfirm }) => {
    setAlert({ isOpen: true, type, title, message, onConfirm: onConfirm || null });
  };

  const closeAlert = () => setAlert((prev) => ({ ...prev, isOpen: false }));

  const handlePlaceOrder = async () => {
    if (!cart || cart.length === 0) {
      showAlert({
        type: 'warning',
        title: 'Sepet Boş',
        message: 'Sipariş verebilmek için sepetinizde en az bir ürün bulunmalıdır.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const orderData = {
        companyId: user.companyId,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        })),
        totalAmount: cartTotal * 1.2,
        paymentMethod,
      };

      await api.post('/orders', orderData);
      clearCart();

      showAlert({
        type: 'success',
        title: 'Sipariş Oluşturuldu! 🎉',
        message: 'Siparişiniz başarıyla alındı. Siparişlerim sayfasından takip edebilirsiniz.',
        onConfirm: () => navigate('/bayi/orders'),
      });
    } catch (error) {
      const errMsg =
        error.response?.data?.message || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';
      showAlert({
        type: 'error',
        title: 'Sipariş Oluşturulamadı',
        message: errMsg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Custom Alert Popup */}
      <CustomAlert
        isOpen={alert.isOpen}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        confirmText={alert.type === 'success' ? 'Siparişlerime Git' : 'Tamam'}
        onConfirm={alert.onConfirm}
        onClose={closeAlert}
      />

      <div className="p-10 max-w-5xl mx-auto space-y-12 animate-in fade-in duration-700">
        <div className="text-center space-y-4">
          <div className="bg-blue-600 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter">Siparişi Onayla</h1>
          <p className="text-gray-400 font-medium">
            Lütfen bilgilerinizi kontrol edip siparişinizi tamamlayın.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Payment Method */}
          <div className="space-y-8">
            <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
              <CreditCard className="mr-3 h-5 w-5 text-blue-600" /> Ödeme Yöntemi Seçin
            </h3>

            <div className="space-y-4">
              {[
                {
                  id: 'CURRENT_ACCOUNT',
                  name: 'Cari Hesaptan Öde',
                  desc: 'Bakiye ve risk limitinizden düşülür.',
                  icon: Landmark,
                },
                {
                  id: 'WIRE_TRANSFER',
                  name: 'Havale / EFT',
                  desc: 'Siparişiniz ödeme sonrası onaylanır.',
                  icon: CreditCard,
                },
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all flex items-center space-x-6 ${
                    paymentMethod === method.id
                      ? 'border-blue-600 bg-blue-50/50 shadow-lg shadow-blue-500/10'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div
                    className={`p-4 rounded-2xl ${
                      paymentMethod === method.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <method.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-black text-gray-900">{method.name}</h4>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
                      {method.desc}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="bg-gray-50 p-8 rounded-[2rem] border border-gray-100 space-y-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                <Truck className="mr-2 h-4 w-4" /> Teslimat Adresi
              </h4>
              <p className="text-sm font-bold text-gray-700 leading-relaxed">
                Sistemde kayıtlı olan varsayılan şirket adresiniz kullanılacaktır. Değişiklik için
                müşteri temsilcinizle iletişime geçin.
              </p>
            </div>
          </div>

          {/* Final Summary */}
          <div className="bg-white border border-gray-100 rounded-[3rem] p-12 shadow-xl shadow-gray-200/50 space-y-10 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight mb-8">
                Sipariş Toplamı
              </h3>
              <div className="space-y-6">
                <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                  <span>Ürünler</span>
                  <span className="text-gray-900">₺{cartTotal.toLocaleString('tr-TR')}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                  <span>KDV (%20)</span>
                  <span className="text-gray-900">
                    ₺{(cartTotal * 0.2).toLocaleString('tr-TR')}
                  </span>
                </div>
                <div className="pt-8 border-t border-gray-50 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                      GENEL TOPLAM
                    </p>
                    <p className="text-5xl font-black text-gray-900 tracking-tighter">
                      ₺{(cartTotal * 1.2).toLocaleString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <button
              disabled={isSubmitting}
              onClick={handlePlaceOrder}
              className="w-full btn-gradient py-6 shadow-2xl shadow-blue-600/30 text-lg group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  İŞLENİYOR...
                </span>
              ) : (
                <>
                  SİPARİŞİ ONAYLA{' '}
                  <ArrowRight className="inline-block ml-2 h-6 w-6 group-hover:translate-x-2 transition-transform" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CheckoutPage;
