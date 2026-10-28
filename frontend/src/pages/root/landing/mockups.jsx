import { ShoppingCart, Search, Check, X, Package, Truck, Sparkles, CreditCard, RotateCcw, Camera, Webhook, Store } from 'lucide-react';

// Tanıtım sayfasındaki ürün çizimleri (gerçek ekranların sadeleştirilmiş HTML hali; görsel dosya kullanılmaz)

const tl = (n) => `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRODUCTS = [
  { name: '18V Akülü Matkap', sku: 'AK-18-MTK', price: 4500, stock: 'Stokta', hue: 'from-sky-100 to-indigo-100', icon: '🛠️' },
  { name: '7 Parça Anahtar Takımı', sku: 'EA-7-ANH', price: 850, stock: '45 adet', hue: 'from-amber-100 to-orange-100', icon: '🔧' },
  { name: 'S1P Çelik Burunlu Bot', sku: 'IG-SB-BOT', price: 1200, stock: 'Stokta', hue: 'from-emerald-100 to-teal-100', icon: '🥾' },
];

// Bayi portalı: katalog kartları + sepet özeti (ana vitrin çizimi)
export const PortalMockup = () => (
  <div className="rounded-[1.6rem] bg-[#f7f8fb] overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-100">
      <span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
      <span className="ml-3 flex-1 max-w-xs h-7 rounded-lg bg-slate-100 flex items-center px-3 text-[11px] text-slate-400">yildizhirdavat.akisb2b.com</span>
    </div>
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] md:grid-cols-[11rem_minmax(0,1fr)_14rem]">
      <div className="hidden sm:block bg-[#0f172a] p-4 space-y-3">
        <span className="block h-6 w-20 rounded-md bg-white/90" />
        {['Ürün Kataloğu', 'Hızlı Sipariş', 'Siparişlerim', 'Finansal Durum'].map((m, i) => (
          <span key={m} className={`block text-[11px] font-semibold px-2.5 py-2 rounded-lg ${i === 0 ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400'}`}>{m}</span>
        ))}
      </div>
      <div className="col-span-2 sm:col-span-1 p-4 space-y-3 min-w-0">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-400"><Search className="h-3.5 w-3.5" /> Ürün adı, SKU veya barkod</div>
        <div className="flex gap-1.5">{['Kategoriler', 'Marka', 'Stoktakiler'].map((c, i) => <span key={c} className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border ${i === 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}>{c}</span>)}</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {PRODUCTS.map((p, i) => (
            <div key={p.sku} className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${i === 2 ? 'hidden lg:block' : ''}`}>
              <div className={`aspect-[4/3] bg-gradient-to-br ${p.hue} flex items-center justify-center text-3xl`}>{p.icon}</div>
              <div className="p-2.5 space-y-1">
                <p className="text-[9px] text-slate-400 font-semibold">{p.sku}</p>
                <p className="text-[11px] font-bold text-slate-900 truncate">{p.name}</p>
                <div className="flex items-center justify-between"><p className="text-[13px] font-black text-slate-900">{tl(p.price)}</p><span className="text-[9px] font-bold text-emerald-600">● {p.stock}</span></div>
                <div className="flex gap-1.5 pt-1"><span className="flex-1 h-6 rounded-md border border-slate-200 text-[10px] font-bold flex items-center justify-center">1</span><span className="flex-1 h-6 rounded-md bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center gap-1"><ShoppingCart className="h-3 w-3" />Ekle</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden md:block p-4 border-l border-slate-200/70 bg-white space-y-3">
        <p className="text-[11px] font-black text-slate-900">Sepetim</p>
        {[['Akülü Matkap', '2 × ₺4.500'], ['Anahtar Takımı', '10 × ₺850']].map(([n, q]) => (
          <div key={n} className="flex items-center gap-2"><span className="h-8 w-8 rounded-lg bg-slate-100" /><span className="min-w-0"><span className="block text-[10px] font-bold text-slate-800 truncate">{n}</span><span className="block text-[9px] text-slate-400">{q}</span></span></div>
        ))}
        <div className="pt-2 border-t border-slate-100 space-y-1 text-[10px]">
          <p className="flex justify-between text-slate-500"><span>Miktar indirimi</span><span className="text-emerald-600 font-bold">−%5</span></p>
          <p className="flex justify-between font-black text-slate-900 text-[12px]"><span>Toplam</span><span>₺18.278</span></p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2 space-y-1"><p className="text-[9px] text-slate-500">Kullanılabilir limit</p><span className="block h-1.5 rounded-full bg-slate-200"><span className="block h-full w-3/5 rounded-full bg-gradient-to-r from-sky-400 to-indigo-600" /></span></div>
        <span className="block h-8 rounded-lg bg-[#0b0d12] text-white text-[10px] font-bold flex items-center justify-center">Siparişi Onayla</span>
      </div>
    </div>
  </div>
);

// Sekmeli özelliklerin çizimleri
export const CatalogMock = () => (
  <div className="space-y-2.5">
    <div className="ml-auto max-w-[15rem] rounded-2xl rounded-br-md bg-[#0b0d12] text-white text-xs px-4 py-2.5">Ben "Gold" grubundayım, fiyatlarım farklı mı?</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-2 shadow-sm">
      {PRODUCTS.slice(0, 2).map((p) => (
        <div key={p.sku} className="flex items-center gap-3">
          <span className={`h-10 w-10 rounded-lg bg-gradient-to-br ${p.hue} flex items-center justify-center`}>{p.icon}</span>
          <span className="flex-1 min-w-0"><span className="block text-xs font-bold text-slate-900 truncate">{p.name}</span><span className="block text-[10px] text-slate-400">Liste {tl(p.price)} · Gold −%12</span></span>
          <span className="text-sm font-black text-slate-900">{tl(p.price * 0.88)}</span>
        </div>
      ))}
      <p className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1.5">10 ve üzeri alımlarda sepette ekstra %5</p>
    </div>
  </div>
);

export const ApprovalMock = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
    <div className="flex items-center justify-between"><p className="text-sm font-black text-slate-900">#AK-1042 · Yıldız Hırdavat</p><span className="text-[10px] font-black text-orange-600 bg-orange-50 px-2 py-1 rounded-full">Onay bekliyor</span></div>
    {[['Akülü Matkap × 2', true], ['Anahtar Takımı × 10', true], ['Çelik Burunlu Bot × 6', false]].map(([n, ok]) => (
      <div key={n} className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{n}</span>
        {ok ? <span className="flex items-center gap-1 text-emerald-700 font-bold"><Check className="h-3.5 w-3.5" />Onay</span> : <span className="flex items-center gap-1 text-red-600 font-bold"><X className="h-3.5 w-3.5" />Stok yok</span>}
      </div>
    ))}
    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500"><Truck className="h-4 w-4 text-indigo-500" /> Onaylanan kalemler kargoya hazır · takip no otomatik</div>
  </div>
);

export const CreditMock = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <div><p className="text-[10px] font-bold text-slate-400 uppercase">Bakiye</p><p className="text-lg font-black text-red-600">₺42.350</p></div>
      <div><p className="text-[10px] font-bold text-slate-400 uppercase">Risk limiti</p><p className="text-lg font-black text-slate-900">₺100.000</p></div>
    </div>
    <span className="block h-2 rounded-full bg-slate-100"><span className="block h-full w-[42%] rounded-full bg-gradient-to-r from-sky-400 to-indigo-600" /></span>
    <p className="text-[11px] text-slate-500">Vadesi 5 gün içinde dolan 2 fatura · otomatik hatırlatma gönderildi</p>
    <span className="flex items-center justify-center gap-2 h-9 rounded-lg bg-[#0b0d12] text-white text-xs font-bold"><CreditCard className="h-4 w-4" /> Kartla öde (sanal POS)</span>
  </div>
);

export const AiQuoteMock = () => (
  <div className="space-y-2.5">
    <div className="ml-auto max-w-[17rem] rounded-2xl rounded-br-md bg-[#0b0d12] text-white text-xs px-4 py-2.5">20 koli 8 oz karton bardak ve uygun kapak, en ekonomik olsun.</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600"><Sparkles className="h-3.5 w-3.5" /> Taslak teklif hazır</p>
      {[['8 oz Karton Bardak', '20 koli × 50 = 1.000 adet', 'Eşleşti'], ['8 oz Bardak Kapağı', 'Katalogda uyumlu', 'Eşleşti']].map(([n, d, s]) => (
        <div key={n} className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0"><span className="block font-bold text-slate-800 truncate">{n}</span><span className="block text-[10px] text-slate-400">{d}</span></span>
          <span className="shrink-0 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{s}</span>
        </div>
      ))}
      <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-100">Fiyatlar bayinin iskontosuyla hesaplandı · göndermeden önce siz onaylarsınız</p>
    </div>
  </div>
);

export const ErpMock = () => (
  <div className="rounded-2xl bg-[#0b0d12] text-[11px] font-mono p-4 space-y-1.5 shadow-sm overflow-hidden">
    <p className="text-slate-500"># Stok ve fiyatları ERP'den gönderin</p>
    <p className="text-sky-300">PUT <span className="text-white">/api/v1/products/stock</span></p>
    <p className="text-slate-300 whitespace-pre">{'[{ "sku": "AK-18-MTK", "stock": 120 }]'}</p>
    <p className="text-slate-500 pt-2"># Yeni siparişler webhook ile size gelir</p>
    <p className="flex items-center gap-1.5 text-emerald-300"><Webhook className="h-3.5 w-3.5" /> order.created → 200 OK</p>
  </div>
);

export const ReturnMock = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
    <div className="flex items-center gap-3">
      <span className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-xl">🥾</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900">Çelik Burunlu Bot × 2</span><span className="block text-[10px] text-slate-400">Neden: Yanlış beden</span></span>
      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><Camera className="h-3.5 w-3.5" />2 foto</span>
    </div>
    <div className="flex items-center gap-1">
      {['Talep', 'İnceleme', 'Onay', 'Alacak'].map((s, i) => (
        <span key={s} className="flex-1"><span className={`block h-1.5 rounded-full ${i < 3 ? 'bg-gradient-to-r from-sky-400 to-indigo-600' : 'bg-slate-200'}`} /><span className="block text-[9px] text-slate-500 mt-1 text-center">{s}</span></span>
      ))}
    </div>
    <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><RotateCcw className="h-3.5 w-3.5 text-indigo-500" /> Onaylanınca tutar bayinin cari hesabına alacak yazılır</p>
  </div>
);

// Kurulum adımlarının çizimleri
export const StepMock = ({ step }) => {
  if (step === 0) return (
    <div className="rounded-2xl bg-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)] p-6 space-y-3 w-full max-w-sm bg-gradient-to-b from-indigo-50/70 to-white">
      <span className="mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-lg"><Store className="h-6 w-6 text-white" /></span>
      <p className="text-center font-semibold text-slate-900">Portalınızı oluşturun</p>
      {['Firma adı', 'yildizhirdavat.akisb2b.com', 'İş e-postası'].map((p) => <span key={p} className="block h-10 rounded-xl bg-slate-100 px-3 text-xs text-slate-400 flex items-center">{p}</span>)}
      <span className="block h-10 rounded-xl bg-[#0b0d12] border-b-4 border-indigo-500 text-white text-xs font-bold flex items-center justify-center">Ücretsiz denemeyi başlat</span>
    </div>
  );
  if (step === 1) return (
    <div className="rounded-2xl bg-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)] p-5 space-y-3 w-full max-w-sm">
      <p className="text-sm font-semibold text-slate-900">Excel ile toplu ürün yükleme</p>
      <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-5 text-center text-xs text-indigo-700 font-semibold">urunler.xlsx · 1.240 satır</div>
      {[['Yeni ürün', '1.180'], ['Güncellenen', '54'], ['Hatalı satır', '6']].map(([k, v], i) => (
        <p key={k} className="flex justify-between text-xs"><span className="text-slate-500">{k}</span><span className={`font-black ${i === 2 ? 'text-red-600' : 'text-slate-900'}`}>{v}</span></p>
      ))}
    </div>
  );
  if (step === 2) return (
    <div className="rounded-2xl bg-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)] p-5 space-y-2.5 w-full max-w-sm">
      <p className="text-sm font-semibold text-slate-900">Bayi davetleri</p>
      {[['Yıldız Hırdavat', 'Gold · %12', true], ['Kaya Yapı Market', 'Standart', true], ['Demir Teknik', 'Başvuru', false]].map(([n, g, ok]) => (
        <div key={n} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 text-[11px] font-black flex items-center justify-center">{n.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
          <span className="flex-1 min-w-0"><span className="block text-xs font-bold text-slate-800 truncate">{n}</span><span className="block text-[10px] text-slate-400">{g}</span></span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-600'}`}>{ok ? 'Aktif' : 'Onay bekliyor'}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="rounded-2xl bg-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)] p-5 space-y-3 w-full max-w-sm">
      <p className="text-sm font-semibold text-slate-900">Bu ay</p>
      <svg viewBox="0 0 300 110" className="w-full h-28" aria-hidden="true">
        <defs><linearGradient id="lg-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" /><stop offset="100%" stopColor="#6366f1" stopOpacity="0" /></linearGradient></defs>
        <path d="M0 90 C40 80 60 60 90 66 S150 30 180 40 S240 14 300 8 L300 110 L0 110 Z" fill="url(#lg-area)" />
        <path d="M0 90 C40 80 60 60 90 66 S150 30 180 40 S240 14 300 8" fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Sipariş', '128'], ['Ciro', '₺1,2 M'], ['Aktif bayi', '34']].map(([k, v]) => <div key={k} className="rounded-xl bg-slate-50 py-2"><p className="text-sm font-black text-slate-900">{v}</p><p className="text-[10px] text-slate-500">{k}</p></div>)}
      </div>
    </div>
  );
};

export const FloatingOrder = () => (
  <div className="w-64 rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] px-4 py-3 text-[13px] leading-snug text-slate-800">
    <p className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 mb-0.5"><Package className="h-3.5 w-3.5" /> Yeni sipariş · 02:14</p>
    Yıldız Hırdavat <b>#AK-1042</b> siparişi verdi · {tl(18278)}
  </div>
);

export const FloatingLimit = () => (
  <div className="w-64 rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] px-4 py-3 space-y-2">
    <p className="flex justify-between text-[12px]"><span className="font-bold text-slate-800">Kaya Yapı Market</span><span className="font-black text-slate-900">%62</span></p>
    <span className="block h-1.5 rounded-full bg-slate-100"><span className="block h-full w-[62%] rounded-full bg-gradient-to-r from-sky-400 to-indigo-600" /></span>
    <p className="text-[11px] text-slate-500">Risk limitinin %62'si kullanıldı</p>
  </div>
);

