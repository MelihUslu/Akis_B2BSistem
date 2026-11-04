import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { ShoppingBag, X, Trash2, Minus, Plus, ArrowRight, FileSignature, BookmarkPlus, Package } from 'lucide-react';
import { formatTRY, firstImage } from '../utils/format';
import api, { errorMessage } from '../services/api';
import QuoteRequestModal from './bayi/QuoteRequestModal';
import useAlert from '../hooks/useAlert';
import { t } from '../i18n';

/**
 * Sepet (sağdan açılır). Tutarlar tahminidir; kesin tutar (iskonto, kupon, kargo) ödeme sayfasında sunucudan hesaplanır.
 */
const CartDrawer = ({ isOpen, onClose }) => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartVat, cartCount, clearCart } = useCart();
  const navigate = useNavigate();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [templateName, setTemplateName] = useState(null); // null = kapalı
  const { alertElement, showAlert } = useAlert();

  if (!isOpen) return alertElement;

  const saveTemplate = async () => {
    try {
      const res = await api.post('/lists/templates', { name: templateName, items: cart.map(i => ({ sku: i.sku, quantity: i.quantity })) });
      setTemplateName(null);
      showAlert({ type: 'success', title: t('Şablon Kaydedildi'), message: `${res.data.message} ${t('Listelerim sayfasından tek tıkla sepete ekleyebilirsiniz.')}` });
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('Şablon kaydedilemedi.')) });
    }
  };

  const handleCheckout = () => {
    onClose();
    navigate('/bayi/checkout');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {alertElement}
      {quoteOpen && (
        <QuoteRequestModal
          items={cart.map(i => ({ productId: i.id, name: i.name, sku: i.sku, variantLabel: i.variantLabel, quantity: i.quantity, unit: i.unit }))}
          onClose={() => setQuoteOpen(false)}
          onDone={(message) => { setQuoteOpen(false); clearCart(); showAlert({ type: 'success', title: t('Teklif Talebi Gönderildi'), message }); }}
        />
      )}
      <div className="modal-backdrop" onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-label={t('Sepetim')} className="relative flex flex-col w-full max-w-md bg-white h-full shadow-2xl animate-slide-in">
        <div className="modal-header items-center">
          <div className="flex items-center gap-3 min-w-0">
            <span className="modal-icon"><ShoppingBag className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="modal-title">{t('Sepetim')}</h2>
              <p className="modal-subtitle">{cart.length ? t('{n} kalem · {qty} adet', { n: cart.length, qty: cartCount }) : t('Sepetiniz Boş')}</p>
            </div>
          </div>
          <button onClick={onClose} className="modal-close" aria-label={t('Kapat')}><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-3 bg-navy-50">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <span className="h-16 w-16 rounded-2xl bg-white ring-1 ring-gray-100 flex items-center justify-center"><ShoppingBag className="h-8 w-8 text-gray-300" /></span>
              <div>
                <p className="text-lg font-black text-gray-900">{t('Sepetiniz Boş')}</p>
                <p className="text-sm text-gray-500 mt-1">{t('Kataloğa dönüp ürün seçebilirsiniz.')}</p>
              </div>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-3 p-3 bg-white rounded-2xl ring-1 ring-gray-100">
                <div className="w-16 h-16 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                  {firstImage(item.images) ? <img src={firstImage(item.images)} alt="" className="w-full h-full object-contain" /> : <Package className="h-6 w-6 text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{item.name}</h3>
                      {item.variantLabel && <p className="text-xs font-bold text-brand-600 mt-0.5">{item.variantLabel}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{t('SKU:')} {item.sku}</p>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="p-1.5 -mr-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" aria-label={t('{name} sepetten çıkar', { name: item.name })}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center h-9 rounded-lg border border-gray-200 overflow-hidden">
                      <button onClick={() => updateQuantity(item.id, item.quantity - (item.stepQuantity || 1))} className="h-full px-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50" aria-label={t('Azalt')}><Minus className="h-3.5 w-3.5" /></button>
                      <input type="number" value={item.quantity} onChange={(e) => updateQuantity(item.id, e.target.value)} aria-label={t('Miktar')}
                        className="w-12 h-full bg-transparent text-center font-bold text-gray-900 text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                      <button onClick={() => updateQuantity(item.id, item.quantity + (item.stepQuantity || 1))} className="h-full px-2.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50" aria-label={t('Artır')}><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <p className="text-sm font-black text-gray-900 tabular-nums">{formatTRY(item.price * item.quantity)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-100 p-4 sm:p-5 space-y-4 bg-white" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>{t('Ürünler (KDV hariç)')}</span><span className="tabular-nums">{formatTRY(cartTotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>{t('KDV')}</span><span className="tabular-nums">{formatTRY(cartVat)}</span></div>
              <div className="flex justify-between items-end pt-1">
                <span className="font-black text-gray-900">{t('Genel Toplam')}</span>
                <span className="text-xl font-black text-gray-900 tabular-nums">{formatTRY(cartTotal + cartVat)}</span>
              </div>
              <p className="text-[11px] text-gray-400">{t('Tahmini tutar; kupon, kargo ve kesin fiyat ödeme adımında hesaplanır.')}</p>
            </div>

            {templateName !== null ? (
              <div className="flex gap-2">
                <input autoFocus className="premium-input !py-2.5" placeholder={t('Şablon adı (örn. Haftalık sipariş)')} aria-label={t('Şablon adı')}
                  value={templateName} onChange={(e) => setTemplateName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && templateName.trim() && saveTemplate()} />
                <button disabled={!templateName.trim()} onClick={saveTemplate} className="px-4 rounded-xl bg-brand-600 text-white text-sm font-bold disabled:opacity-40">{t('Kaydet')}</button>
                <button onClick={() => setTemplateName(null)} className="px-3 rounded-xl text-gray-400 hover:text-gray-700" aria-label={t('Vazgeç')}><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setTemplateName('')} className="h-10 flex items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200">
                  <BookmarkPlus className="h-4 w-4 mr-1.5" /> {t('Şablon Kaydet')}
                </button>
                <button onClick={() => setQuoteOpen(true)} className="h-10 flex items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-700 hover:bg-gray-200">
                  <FileSignature className="h-4 w-4 mr-1.5" /> {t('Teklif İste')}
                </button>
              </div>
            )}

            <button onClick={handleCheckout} className="btn-gradient w-full h-12 py-0 text-base">
              {t('Siparişi tamamla')} <ArrowRight className="ml-2 h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;
