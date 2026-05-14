import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { ShoppingBag, X, Trash2, Minus, Plus, ArrowRight, Zap } from 'lucide-react';

const CartDrawer = ({ isOpen, onClose }) => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleCheckout = () => {
    onClose();
    navigate('/bayi/checkout');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-gray-900/60 backdrop-blur-md transition-opacity"
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
                  {item.images ? (
                     <img src={JSON.parse(item.images)[0]} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                  ) : (
                     <ShoppingBag className="h-8 w-8 text-gray-300" />
                  )}
                </div>
                
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2 pr-8">{item.name}</h3>
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
                        className="w-8 bg-transparent text-center font-black text-gray-900 text-xs outline-none"
                      />
                      <button onClick={() => updateQuantity(item.id, item.quantity + (item.stepQuantity || 1))} className="p-1.5 hover:text-indigo-600 text-gray-400 transition-colors">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-sm font-black text-indigo-600">
                      ₺{(item.price * item.quantity).toLocaleString('tr-TR')}
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
                   <p className="text-[10px] text-gray-500 mt-1">({cartCount} Ürün)</p>
                </div>
                <span className="text-3xl font-black text-white tracking-tighter shadow-indigo-500/50 drop-shadow-lg">
                  ₺{(cartTotal * 1.2).toLocaleString('tr-TR')}
                </span>
              </div>
            </div>

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
