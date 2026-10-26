import React, { useEffect, useState } from 'react';
import { useCart } from '../../context/CartContext';
import { Truck, CreditCard, Landmark, ArrowRight, ShieldCheck, AlertTriangle, Tag, TicketPercent, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import AddressBook from '../../components/shared/AddressBook';
import { formatTRY } from '../../utils/format';

const CheckoutPage = () => {
  const { cart, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState('CURRENT_ACCOUNT');
  const [addressId, setAddressId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState(null);
  const navigate = useNavigate();
  const { alertElement, showAlert } = useAlert();

  const payloadItems = cart.map((item) => ({ productId: item.id, quantity: item.quantity }));

  // Tutarlar sunucuda hesaplanır: bayi iskontosu, miktar indirimi, döviz kuru ve ürün bazlı KDV
  useEffect(() => {
    if (cart.length === 0) { setQuote(null); return; }
    api.post('/orders/quote', { items: payloadItems, couponCode: couponCode || undefined })
      .then((res) => {
        // Geçersiz kupon: hatayı kupon alanında göster ve kuponsuz hesapla
        if (couponCode && !res.data.coupon) {
          setCouponError(res.data.errors.find(e => /kupon/i.test(e)) || 'Kupon uygulanamadı.');
          setCouponCode('');
          return;
        }
        setQuote(res.data);
        setQuoteError(null);
      })
      .catch((error) => setQuoteError(errorMessage(error, 'Sipariş özeti hesaplanamadı.')));
  }, [cart, couponCode]);

  const creditShort = paymentMethod === 'CURRENT_ACCOUNT' && quote && quote.total > quote.credit.available;
  const blocked = !quote || quote.errors.length > 0 || creditShort;

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
      const res = await api.post('/orders', { items: payloadItems, paymentMethod, couponCode: quote?.coupon?.code, addressId });
      clearCart();

      showAlert({
        type: 'success',
        title: 'Sipariş Oluşturuldu! 🎉',
        message: `#AK-${res.data.id} numaralı siparişiniz alındı. Onay durumunu sipariş detayından takip edebilirsiniz.`,
        confirmText: 'Siparişe Git',
        onConfirm: () => navigate(`/bayi/orders/${res.data.id}`),
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: 'Sipariş Oluşturulamadı',
        message: errorMessage(error, 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {alertElement}

      <div className="p-1 md:p-10 max-w-5xl mx-auto space-y-8 md:space-y-12 animate-in fade-in duration-700">
        <div className="text-center space-y-4">
          <div className="bg-blue-600 w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl md:text-3xl font-black text-gray-900 tracking-tight">Siparişi Onayla</h1>
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
                  desc: quote ? `Kullanılabilir limit: ${formatTRY(Math.max(0, quote.credit.available))}` : 'Risk limitinizden düşülür.',
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

            <div className="bg-gray-50 p-4 md:p-8 rounded-[2rem] border border-gray-100 space-y-4">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                <Truck className="mr-2 h-4 w-4" /> Teslimat Adresi
              </h4>
              <AddressBook selectable compact value={addressId} onSelect={setAddressId} showAlert={showAlert} />
            </div>
          </div>

          {/* Final Summary */}
          <div className="bg-white border border-gray-100 rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 shadow-xl shadow-gray-200/50 space-y-10 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight mb-8">
                Sipariş Toplamı
              </h3>

              {quote && quote.lines.length > 0 && (
                <div className="space-y-3 mb-8 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {quote.lines.map((line) => (
                    <div key={line.productId} className="flex justify-between items-start text-xs">
                      <div className="pr-4">
                        <p className="font-bold text-gray-800">{line.name}</p>
                        {line.variantLabel && <p className="text-[11px] font-black text-indigo-600">{line.variantLabel}</p>}
                        <p className="text-gray-400 font-semibold mt-0.5">
                          {line.quantity} {line.unit} × {formatTRY(line.unitPrice)}
                          {line.priceSource === 'SPECIAL' && <span className="ml-2 text-emerald-600 font-black">size özel</span>}
                          {line.qtyDiscount > 0 && (
                            <span className="ml-2 inline-flex items-center text-emerald-600 font-black"><Tag className="h-3 w-3 mr-0.5" />%{line.qtyDiscount}</span>
                          )}
                        </p>
                      </div>
                      <span className="font-black text-gray-900 whitespace-nowrap">{formatTRY(line.lineSubtotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-6">
                <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                  <span>Ürünler (KDV hariç)</span>
                  <span className="text-gray-900">{formatTRY(quote?.subtotal)}</span>
                </div>
                {quote?.coupon ? (
                  <div className="flex justify-between items-center text-sm font-bold text-pink-600 uppercase tracking-widest">
                    <span className="flex items-center">
                      <TicketPercent className="h-4 w-4 mr-1.5" /> {quote.coupon.code}
                      <button onClick={() => { setCouponCode(''); setCouponInput(''); }} className="ml-2 text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    </span>
                    <span>−{formatTRY(quote.discountAmount)}</span>
                  </div>
                ) : (
                  <form onSubmit={(e) => { e.preventDefault(); setCouponError(null); setCouponCode(couponInput.trim().toUpperCase()); }} className="space-y-1">
                    <div className="flex gap-2">
                      <input className="premium-input !py-2.5 font-mono uppercase" placeholder="Kupon kodu" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
                      <button disabled={!couponInput.trim()} className="px-4 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Uygula</button>
                    </div>
                    {couponError && <p className="text-[11px] font-bold text-red-500 normal-case tracking-normal">{couponError}</p>}
                  </form>
                )}
                <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                  <span>KDV</span>
                  <span className="text-gray-900">{formatTRY(quote?.vatAmount)}</span>
                </div>
                <div className="pt-8 border-t border-gray-50 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                      GENEL TOPLAM
                    </p>
                    <p className="text-4xl md:text-5xl font-black text-gray-900 tracking-tighter">
                      {formatTRY(quote?.total)}
                    </p>
                  </div>
                </div>
              </div>

              {(quoteError || quote?.errors.length > 0 || creditShort) && (
                <div className="mt-8 bg-amber-50 border border-amber-100 rounded-2xl p-5 space-y-2">
                  {[quoteError, ...(quote?.errors || []), creditShort && `Risk limitiniz yetersiz. Kullanılabilir limit: ${formatTRY(Math.max(0, quote.credit.available))}. Finansal Durum sayfasından ödeme yapabilir veya Havale/EFT seçebilirsiniz.`]
                    .filter(Boolean)
                    .map((msg) => (
                      <p key={msg} className="text-xs font-bold text-amber-800 flex items-start">
                        <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" /> {msg}
                      </p>
                    ))}
                </div>
              )}
            </div>

            <button
              disabled={isSubmitting || blocked}
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
