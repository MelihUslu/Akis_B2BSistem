import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { ShoppingBag, X, Trash2, Minus, Plus, ArrowRight, Zap, FileSignature, BookmarkPlus } from 'lucide-react';
import { formatTRY, firstImage } from '../utils/format';
import api, { errorMessage } from '../services/api';
import QuoteRequestModal from './bayi/QuoteRequestModal';
import useAlert from '../hooks/useAlert';

const CartDrawer = ({ isOpen, onClose }) => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartVat, cartCount, clearCart } = useCart();
  const navigate = useNavigate();
  const [quoteOpen, setQuoteOpen] = React.useState(false);
  const [templateName, setTemplateName] = React.useState(null); // null = kapalı
  const { alertElement, showAlert } = useAlert();

  if (!isOpen) return alertElement;

  const saveTemplate = async () => {
    try {
      const res = await api.post('/lists/templates', { name: templateName, items: cart.map(i => ({ sku: i.sku, quantity: i.quantity })) });
      setTemplateName(null);
      showAlert({ type: 'success', title: 'Şablon Kaydedildi', message: `${res.data.message} Listelerim sayfasından tek tıkla sepete ekleyebilirsiniz.` });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Şablon kaydedilemedi.') });
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
          onDone={(message) => { setQuoteOpen(false); clearCart(); showAlert({ type: 'success', title: 'Teklif Talebi Gönderildi', message }); }}
        />
      )}
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[6px] transition-opacity"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative flex flex-col w-full max-w-md bg-[#0f172a] h-full shadow-[0_0_60px_-15px_rgba(0,0,0,0.7)] animate-in slide-in-from-right duration-500 border-l border-white/10">
        
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 relative overflow-hidden">
          {/* Subtle glow effect behind header */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 blur-3xl rounded-full" />
          
          <div className="flex items-center space-x-4 relative z-10">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <ShoppingBag className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight leading-none">Sepetim</h2>
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1.5 flex items-center">
                 <Zap className="h-3 w-3 mr-1" /> Premium Sipariş
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all relative z-10"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4 bg-white">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="bg-gray-50 p-8 rounded-full border border-gray-100">
                <ShoppingBag className="h-16 w-16 text-gray-300" />
              </div>
              <div>
                <p className="text-xl font-black text-gray-900 tracking-tighter">Sepetiniz Boş</p>
                <p className="text-sm text-gray-400 font-medium mt-2">Kataloğa dönüp ürün seçebilirsiniz.</p>
              </div>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-4 p-4 bg-white hover:bg-gray-50 rounded-3xl border border-gray-100 relative group transition-all duration-300 shadow-sm hover:shadow-md">
                <div className="w-24 h-24 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100 flex-shrink-0">
                  {firstImage(item.images) ? (
                     <img src={firstImage(item.images)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  ) : (
                     <ShoppingBag className="h-8 w-8 text-gray-300" />
                  )}
                </div>
                
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 pr-8">{item.name}</h3>
                    {item.variantLabel && <p className="text-[11px] font-black text-indigo-600 mt-1">{item.variantLabel}</p>}
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5">SKU: {item.sku}</p>
                  </div>
                  
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center bg-white rounded-xl border border-gray-200 p-0.5 shadow-sm">
                      <button onClick={() => updateQuantity(item.id, item.quantity - (item.stepQuantity || 1))} className="p-1.5 hover:text-indigo-600 text-gray-400 transition-colors">
                        <Minus className="h-3 w-3" />
                      </button>
                      <input 
                        type="number" 
                        value={item.quantity} 
                        onChange={(e) => updateQuantity(item.id, e.target.value)}
                        className="w-12 bg-transparent text-center font-black text-gray-900 text-xs outline-none"
                      />
                      <button onClick={() => updateQuantity(item.id, item.quantity + (item.stepQuantity || 1))} className="p-1.5 hover:text-indigo-600 text-gray-400 transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm font-black text-indigo-600">
                      {formatTRY(item.price * item.quantity)}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => removeFromCart(item.id)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 bg-white rounded-xl opacity-0 group-hover:opacity-100 transition-all border border-gray-100 shadow-sm"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer / Summary */}
        {cart.length > 0 && (
          <div className="p-8 bg-gradient-to-t from-[#0b1120] to-[#0f172a] border-t border-white/5 space-y-6 relative">
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between items-end">
                <div>
                   <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Genel Toplam</span>
                   <p className="text-[10px] text-gray-500 mt-1">({cartCount} Ürün · KDV dahil tahmini)</p>
                </div>
                <span className="text-3xl font-black text-white tracking-tighter shadow-indigo-500/50 drop-shadow-lg">
                  {formatTRY(cartTotal + cartVat)}
                </span>
              </div>
            </div>

            {templateName !== null ? (
              <div className="flex gap-2 relative z-10">
                <input autoFocus className="flex-1 bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none" placeholder="Şablon adı (örn. Haftalık sipariş)"
                  value={templateName} onChange={(e) => setTemplateName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && templateName.trim() && saveTemplate()} />
                <button disabled={!templateName.trim()} onClick={saveTemplate} className="px-4 rounded-xl bg-indigo-500 text-white text-xs font-black disabled:opacity-40">Kaydet</button>
                <button onClick={() => setTemplateName(null)} className="px-3 rounded-xl text-gray-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 relative z-10">
                <button onClick={() => setTemplateName('')} className="flex items-center justify-center py-2.5 rounded-xl border border-white/10 text-[10px] font-black text-gray-300 uppercase tracking-widest hover:bg-white/5">
                  <BookmarkPlus className="h-3.5 w-3.5 mr-1.5" /> Şablon Kaydet
                </button>
                <button onClick={() => setQuoteOpen(true)} className="flex items-center justify-center py-2.5 rounded-xl border border-white/10 text-[10px] font-black text-gray-300 uppercase tracking-widest hover:bg-white/5">
                  <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Teklif İste
                </button>
              </div>
            )}

            <button 
              onClick={handleCheckout}
              className="w-full relative group overflow-hidden rounded-[1.5rem] p-[1px]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-[1.5rem] opacity-70 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-xy"></span>
              <div className="relative bg-[#0f172a] hover:bg-transparent transition-colors duration-500 py-5 rounded-[1.5rem] flex items-center justify-center">
                <span className="text-sm font-black text-white uppercase tracking-widest flex items-center">
                   SİPARİŞİ TAMAMLA <ArrowRight className="inline-block ml-3 h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartDrawer;
