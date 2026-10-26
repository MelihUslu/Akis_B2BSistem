import React from 'react';
import { useCart } from '../../context/CartContext';
import { Trash2, ShoppingBag, ArrowRight, Minus, Plus, CreditCard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const CartPage = () => {
  const { cart, removeFromCart, updateQuantity, cartTotal, cartCount } = useCart();
  const navigate = useNavigate();

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <div className="bg-gray-100 p-8 rounded-full">
          <ShoppingBag className="h-16 w-16 text-gray-300" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Sepetiniz Boş</h2>
          <p className="text-gray-500 mt-2">Kataloğa dönüp ürün seçmeye ne dersiniz?</p>
        </div>
        <Link to="/bayi" className="btn-gradient px-8 py-4">
          ÜRÜNLERİ İNCELE
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">Sepetim</h1>
          <p className="text-gray-400 text-sm font-semibold uppercase tracking-widest mt-1">Siparişi Tamamlamaya Hazır Mısınız?</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">TOPLAM ÜRÜN</span>
          <span className="text-2xl font-black text-blue-600 bg-blue-50 px-4 py-1 rounded-xl">{cartCount} ADET</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.map((item) => (
            <div key={item.id} className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 hover:shadow-md transition-all flex items-center space-x-6">
              <div className="w-24 h-24 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100">
                 {item.images ? <img src={JSON.parse(item.images)[0]} className="w-full h-full object-cover" /> : <ShoppingBag className="h-10 w-10 text-gray-200" />}
              </div>
              
              <div className="flex-1">
                <h3 className="font-black text-gray-900 text-lg leading-tight">{item.name}</h3>
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mt-1">SKU: {item.sku}</p>
                
                <div className="flex items-center mt-4 space-x-6">
                   <div className="flex items-center bg-gray-50 rounded-xl p-1 border border-gray-100">
                      <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-2 hover:bg-white hover:text-blue-600 rounded-lg transition-all text-gray-400">
                        <Minus className="h-4 w-4" />
                      </button>
                      <input 
                        type="number" 
                        value={item.quantity} 
                        onChange={(e) => updateQuantity(item.id, e.target.value)}
                        className="w-12 bg-transparent text-center font-black text-sm outline-none"
                      />
                      <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-2 hover:bg-white hover:text-blue-600 rounded-lg transition-all text-gray-400">
                        <Plus className="h-4 w-4" />
                      </button>
                   </div>
                   
                   <div className="text-right">
                      <p className="text-[9px] font-black text-gray-400 uppercase">Birim Fiyat</p>
                      <p className="font-bold text-gray-700">₺{item.price.toLocaleString('tr-TR')}</p>
                   </div>
                </div>
              </div>

              <div className="text-right flex flex-col items-end justify-between self-stretch py-2">
                <button onClick={() => removeFromCart(item.id)} className="p-2 text-gray-300 hover:text-red-500 transition-all">
                  <Trash2 className="h-5 w-5" />
                </button>
                <div>
                   <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">TOPLAM</p>
                   <p className="text-xl font-black text-gray-900 tracking-tight">₺{(item.price * item.quantity).toLocaleString('tr-TR')}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Card */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-blue-500/20 sticky top-32">
             <div className="flex items-center space-x-4 mb-8">
                <div className="bg-blue-600 p-4 rounded-2xl">
                   <CreditCard className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-black tracking-tight">Sipariş Özeti</h2>
             </div>

             <div className="space-y-6">
                <div className="flex justify-between items-center text-gray-400 text-sm font-bold">
                   <span>Ara Toplam</span>
                   <span className="text-white">₺{cartTotal.toLocaleString('tr-TR')}</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 text-sm font-bold">
                   <span>KDV (%20)</span>
                   <span className="text-white">₺{(cartTotal * 0.2).toLocaleString('tr-TR')}</span>
                </div>
                <div className="pt-6 border-t border-gray-800 flex justify-between items-end">
                   <div>
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">ÖDENECEK TUTAR</p>
                      <p className="text-4xl font-black tracking-tighter">₺{(cartTotal * 1.2).toLocaleString('tr-TR')}</p>
                   </div>
                </div>
             </div>

             <button 
              onClick={() => navigate('/bayi/checkout')}
              className="w-full mt-10 btn-gradient py-6 shadow-xl shadow-blue-500/40 group"
             >
                SİPARİŞİ TAMAMLA <ArrowRight className="inline-block ml-2 h-5 w-5 group-hover:translate-x-2 transition-transform" />
             </button>
          </div>
          
          <div className="bg-white border border-gray-100 rounded-[2rem] p-8 space-y-4">
             <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Teslimat & Ödeme</h4>
             <p className="text-xs text-gray-500 font-medium leading-relaxed">
               Siparişiniz onaylandıktan sonra 24 saat içerisinde kargoya verilir. Mevcut limitleriniz dahilinde cari hesap üzerinden ödeme yapabilirsiniz.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
