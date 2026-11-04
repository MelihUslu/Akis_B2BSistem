import { useEffect, useState } from 'react';
import { useCart } from '../../context/CartContext';
import { Truck, CreditCard, Landmark, ArrowRight, ShieldCheck, AlertTriangle, Tag, TicketPercent, X, Store, MapPin, Clock, MessageSquareText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import AddressBook from '../../components/shared/AddressBook';
import { formatTRY } from '../../utils/format';
import { t } from '../../i18n';
import PageHeader from '../../components/shared/PageHeader';
import usePortalSettings from '../../hooks/usePortalSettings';

// datetime-local alanı için yerel saatle 'YYYY-MM-DDTHH:mm'
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const CheckoutPage = () => {
  const { cart, clearCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState('CURRENT_ACCOUNT');
  const [addressId, setAddressId] = useState(null);
  const { pickup } = usePortalSettings();
  const [delivery, setDelivery] = useState('SHIPPING');
  const [pickupAt, setPickupAt] = useState('');
  const isPickup = pickup.enabled && delivery === 'PICKUP';
  const [openedAt] = useState(() => Date.now()); // sayfanın açıldığı an (seçilebilir zaman aralığı için)
  const minPickup = localInput(new Date(openedAt + pickup.leadHours * 3600e3));
  const maxPickup = localInput(new Date(openedAt + 60 * 864e5));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastQuote, setQuote] = useState(null);
  const quote = cart.length ? lastQuote : null; // boş sepette özet gösterilmez
  const [quoteError, setQuoteError] = useState(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState(null);
  const [note, setNote] = useState('');
  const [customerRef, setCustomerRef] = useState('');
  const navigate = useNavigate();
  const { alertElement, showAlert } = useAlert();

  const payloadItems = cart.map((item) => ({ productId: item.id, quantity: item.quantity }));

  // Tutarlar sunucuda hesaplanır: bayi iskontosu, miktar indirimi, döviz kuru ve ürün bazlı KDV
  useEffect(() => {
    if (cart.length === 0) return;
    api.post('/orders/quote', { items: payloadItems, couponCode: couponCode || undefined, deliveryMethod: isPickup ? 'PICKUP' : 'SHIPPING' })
      .then((res) => {
        // Geçersiz kupon: hatayı kupon alanında göster ve kuponsuz hesapla
        if (couponCode && !res.data.coupon) {
          setCouponError(res.data.errors.find(e => /kupon/i.test(e)) || t('Kupon uygulanamadı.'));
          setCouponCode('');
          return;
        }
        setQuote(res.data);
        setQuoteError(null);
      })
      .catch((error) => setQuoteError(errorMessage(error, t('Sipariş özeti hesaplanamadı.'))));
  }, [cart, couponCode, isPickup]); // eslint-disable-line react-hooks/exhaustive-deps

  const creditShort = paymentMethod === 'CURRENT_ACCOUNT' && quote && quote.total > quote.credit.available;
  const blocked = !quote || quote.errors.length > 0 || creditShort || (isPickup && !pickupAt);

  const handlePlaceOrder = async () => {
    if (!cart || cart.length === 0) {
      showAlert({
        type: 'warning',
        title: t('Sepet Boş'),
        message: t('Sipariş verebilmek için sepetinizde en az bir ürün bulunmalıdır.'),
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post('/orders', {
        items: payloadItems, paymentMethod, couponCode: quote?.coupon?.code, note: note.trim() || undefined, customerRef: customerRef.trim() || undefined,
        ...(isPickup ? { deliveryMethod: 'PICKUP', pickupAt: new Date(pickupAt).toISOString() } : { addressId })
      });
      clearCart();

      showAlert({
        type: 'success',
        title: t('Sipariş Oluşturuldu! 🎉'),
        message: t('#AK-{id} numaralı siparişiniz alındı. Onay durumunu sipariş detayından takip edebilirsiniz.', { id: res.data.id }),
        confirmText: t('Siparişe Git'),
        onConfirm: () => navigate(`/bayi/orders/${res.data.id}`),
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: t('Sipariş Oluşturulamadı'),
        message: errorMessage(error, t('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {alertElement}

      <div className="space-y-6 md:space-y-8 animate-in fade-in duration-700">
        <PageHeader icon={ShieldCheck} tone="blue" title={t('Siparişi Onayla')} subtitle={t('Lütfen bilgilerinizi kontrol edip siparişinizi tamamlayın.')} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Payment Method */}
          <div className="space-y-8">
            <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
              <CreditCard className="mr-3 h-5 w-5 text-brand-600" /> {t('Ödeme Yöntemi Seçin')}
            </h3>

            <div className="space-y-4">
              {[
                {
                  id: 'CURRENT_ACCOUNT',
                  name: t('Cari Hesaptan Öde'),
                  desc: quote ? t('Kullanılabilir limit: {amount}', { amount: formatTRY(Math.max(0, quote.credit.available)) }) : t('Risk limitinizden düşülür.'),
                  icon: Landmark,
                },
                {
                  id: 'WIRE_TRANSFER',
                  name: t('Havale / EFT'),
                  desc: t('Siparişiniz ödeme sonrası onaylanır.'),
                  icon: CreditCard,
                },
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => setPaymentMethod(method.id)}
                  className={`w-full text-left p-6 rounded-[2rem] border-2 transition-all flex items-center space-x-6 ${
                    paymentMethod === method.id
                      ? 'border-brand-600 bg-brand-50/50 shadow-lg shadow-brand-500/10'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div
                    className={`p-4 rounded-2xl ${
                      paymentMethod === method.id
                        ? 'bg-brand-600 text-white'
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

            {pickup.enabled && (
              <div className="space-y-4">
                <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center">
                  <Truck className="mr-3 h-5 w-5 text-brand-600" /> {t('Teslimat Şekli')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'SHIPPING', name: t('Adrese Teslim'), desc: t('Kargo / sevkiyat ile'), icon: Truck },
                    { id: 'PICKUP', name: t('Gel-Al'), desc: t('Depodan kendim alırım'), icon: Store },
                  ].map((m) => (
                    <button key={m.id} type="button" onClick={() => setDelivery(m.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${delivery === m.id ? 'border-brand-600 bg-brand-50/50' : 'border-gray-100 bg-white hover:border-gray-200'}`}>
                      <div className={`p-2.5 rounded-xl shrink-0 ${delivery === m.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400'}`}><m.icon className="h-5 w-5" /></div>
                      <div className="min-w-0">
                        <h4 className="font-black text-gray-900 text-sm">{m.name}</h4>
                        <p className="text-[11px] text-gray-400 font-bold">{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isPickup ? (
              <div className="bg-gray-50 p-4 md:p-8 rounded-[2rem] border border-gray-100 space-y-4">
                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                  <Store className="mr-2 h-4 w-4" /> {t('Gel-Al Bilgileri')}
                </h4>
                {pickup.address && <p className="text-sm font-bold text-gray-800 flex items-start"><MapPin className="h-4 w-4 mr-2 mt-0.5 text-brand-600 shrink-0" /> {pickup.address}</p>}
                {pickup.hours && <p className="text-sm font-semibold text-gray-600 flex items-start"><Clock className="h-4 w-4 mr-2 mt-0.5 text-brand-600 shrink-0" /> {pickup.hours}</p>}
                <div>
                  <label className="premium-label">{t('Teslim alacağınız tarih ve saat')}</label>
                  <input type="datetime-local" className="premium-input !bg-white" value={pickupAt} min={minPickup} max={maxPickup} onChange={(e) => setPickupAt(e.target.value)} />
                  <p className="text-[11px] font-semibold text-gray-400 mt-1 ml-1">
                    {pickup.leadHours > 0 ? t('En erken {n} saat sonrası seçilebilir. Sipariş hazır olunca bildirim alırsınız.', { n: pickup.leadHours }) : t('Sipariş hazır olunca bildirim alırsınız.')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 p-4 md:p-8 rounded-[2rem] border border-gray-100 space-y-4">
                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                  <Truck className="mr-2 h-4 w-4" /> {t('Teslimat Adresi')}
                </h4>
                <AddressBook selectable compact value={addressId} onSelect={setAddressId} showAlert={showAlert} />
              </div>
            )}

            {/* Sipariş notu ve bayinin kendi sipariş numarası (muhasebesinde eşleştirmek için) */}
            <div className="bg-white p-4 md:p-6 rounded-[2rem] border border-gray-100 space-y-4">
              <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest flex items-center">
                <MessageSquareText className="mr-2 h-4 w-4" /> {t('Sipariş notu (isteğe bağlı)')}
              </h4>
              <div>
                <label htmlFor="order-ref" className="premium-label">{t('Sipariş / referans numaranız')}</label>
                <input id="order-ref" className="premium-input" maxLength={60} value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} placeholder={t('Örn. SAS-2026-118')} />
              </div>
              <div>
                <label htmlFor="order-note" className="premium-label">{t('Not')}</label>
                <textarea id="order-note" className="premium-input h-20 resize-none" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Örn. Pazartesi teslim olsun, depoya haber verin.')} />
              </div>
            </div>
          </div>

          {/* Final Summary */}
          <div className="bg-white border border-gray-100 rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 shadow-xl shadow-gray-200/50 space-y-10 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight mb-8">
                {t('Sipariş Toplamı')}
              </h3>

              {quote && quote.lines.length > 0 && (
                <div className="space-y-3 mb-8 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {quote.lines.map((line) => (
                    <div key={line.productId} className="flex justify-between items-start text-xs">
                      <div className="pr-4">
                        <p className="font-bold text-gray-800">{line.name}</p>
                        {line.variantLabel && <p className="text-[11px] font-black text-brand-600">{line.variantLabel}</p>}
                        <p className="text-gray-400 font-semibold mt-0.5">
                          {line.quantity} {line.unit} × {formatTRY(line.unitPrice)}
                          {line.priceSource === 'SPECIAL' && <span className="ml-2 text-emerald-600 font-black">{t('size özel')}</span>}
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
                  <span>{t('Ürünler (KDV hariç)')}</span>
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
                      <input className="premium-input !py-2.5 font-mono uppercase" placeholder={t('Kupon kodu')} value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
                      <button disabled={!couponInput.trim()} className="px-4 rounded-2xl bg-gray-900 text-white text-xs font-black disabled:opacity-40">{t('Uygula')}</button>
                    </div>
                    {couponError && <p className="text-[11px] font-bold text-red-500 normal-case tracking-normal">{couponError}</p>}
                  </form>
                )}
                {isPickup ? (
                  <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                    <span className="flex items-center"><Store className="h-4 w-4 mr-1.5" /> {t('Gel-Al')}</span>
                    <span className="text-emerald-600">{t('Kargo ücreti yok')}</span>
                  </div>
                ) : quote?.rules?.shipping?.fee > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                      <span className="flex items-center"><Truck className="h-4 w-4 mr-1.5" /> {t('Kargo (KDV hariç)')}</span>
                      <span className={quote.shippingFee > 0 ? 'text-gray-900' : 'text-emerald-600'}>{quote.shippingFee > 0 ? formatTRY(quote.shippingFee) : t('Ücretsiz')}</span>
                    </div>
                    {quote.shippingFee > 0 && quote.rules.shipping.freeOver > 0 && (
                      <p className="text-[11px] font-semibold text-gray-400">{t('{amount} (KDV hariç) ve üzeri siparişlerde kargo ücretsiz. Kalan: {left}', { amount: formatTRY(quote.rules.shipping.freeOver), left: formatTRY(Math.max(0, quote.rules.shipping.freeOver - (quote.subtotal - quote.discountAmount))) })}</p>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center text-sm font-bold text-gray-500 uppercase tracking-widest">
                  <span>{t('KDV')}</span>
                  <span className="text-gray-900">{formatTRY(quote?.vatAmount)}</span>
                </div>
                <div className="pt-8 border-t border-gray-50 flex justify-between items-end">
                  <div>
                    <p className="text-[11px] font-black text-brand-600 uppercase tracking-widest">
                      {t('GENEL TOPLAM')}
                    </p>
                    <p className="text-4xl md:text-5xl font-black text-gray-900 tracking-tighter">
                      {formatTRY(quote?.total)}
                    </p>
                  </div>
                </div>
              </div>

              {isPickup && !pickupAt && quote && (
                <p className="mt-6 text-xs font-bold text-amber-700 flex items-center"><Clock className="h-4 w-4 mr-2" /> {t('Gel-Al için teslim alma tarih ve saatini seçin.')}</p>
              )}

              {(quoteError || quote?.errors.length > 0 || creditShort) && (
                <div className="mt-8 bg-amber-50 border border-amber-100 rounded-2xl p-5 space-y-2">
                  {[quoteError, ...(quote?.errors || []), creditShort && t('Risk limitiniz yetersiz. Kullanılabilir limit: {amount}. Finansal Durum sayfasından ödeme yapabilir veya Havale/EFT seçebilirsiniz.', { amount: formatTRY(Math.max(0, quote.credit.available)) })]
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
              className="w-full btn-gradient py-6 shadow-2xl shadow-brand-600/30 text-lg group disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {t('İşleniyor...')}
                </span>
              ) : (
                <>
                  {t('Siparişi onayla')}{' '}
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
