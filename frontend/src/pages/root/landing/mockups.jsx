import { useEffect, useState } from 'react';
import { ShoppingCart, Search, Check, X, Package, Truck, Sparkles, CreditCard, RotateCcw, Camera, Webhook, Store } from 'lucide-react';

// Tanıtım sayfasındaki ürün çizimleri (gerçek ekranların sadeleştirilmiş HTML hali; görsel dosya kullanılmaz)

const tl = (n) => `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRODUCTS = [
  { name: '18V Akülü Matkap', sku: 'AK-18-MTK', price: 4500, stock: 'Stokta', hue: 'from-sky-100 to-brand-100', icon: '🛠️' },
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
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] md:grid-cols-[11rem_minmax(0,1fr)]">
      <div className="hidden sm:block bg-navy-900 p-4 space-y-3">
        <span className="block h-6 w-20 rounded-md bg-white/90" />
        {['Ürün Kataloğu', 'Hızlı Sipariş', 'Siparişlerim', 'Finansal Durum'].map((m, i) => (
          <span key={m} className={`block text-[11px] font-semibold px-2.5 py-2 rounded-lg ${i === 0 ? 'bg-brand-500/15 text-brand-300' : 'text-slate-400'}`}>{m}</span>
        ))}
      </div>
      <div className="col-span-2 sm:col-span-1 p-4 space-y-3 min-w-0">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-400"><Search className="h-3.5 w-3.5" /> Ürün adı, SKU veya barkod</div>
        <div className="flex gap-1.5">{['Kategoriler', 'Marka', 'Stoktakiler'].map((c, i) => <span key={c} className={`text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border ${i === 0 ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-white border-slate-200 text-slate-600'}`}>{c}</span>)}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {PRODUCTS.map((p, i) => (
            <div key={p.sku} className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${i === 2 ? 'hidden md:block' : ''}`}>
              <div className={`aspect-[4/3] bg-gradient-to-br ${p.hue} flex items-center justify-center text-3xl`}>{p.icon}</div>
              <div className="p-2.5 space-y-1">
                <p className="text-[9px] text-slate-400 font-semibold">{p.sku}</p>
                <p className="text-[11px] font-bold text-slate-900 truncate">{p.name}</p>
                <div className="flex items-center justify-between"><p className="text-[13px] font-black text-slate-900">{tl(p.price)}</p><span className="text-[9px] font-bold text-emerald-600">● {p.stock}</span></div>
                <div className="flex gap-1.5 pt-1"><span className="flex-1 h-6 rounded-md border border-slate-200 text-[10px] font-bold flex items-center justify-center">1</span><span className="flex-1 h-6 rounded-md bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center gap-1"><ShoppingCart className="h-3 w-3" />Ekle</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Sekmeli özelliklerin çizimleri
export const CatalogMock = () => (
  <div className="space-y-2.5">
    <div className="ml-auto max-w-[15rem] rounded-2xl rounded-br-md bg-navy-900 text-white text-xs px-4 py-2.5">Ben "Gold" grubundayım, fiyatlarım farklı mı?</div>
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
    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500"><Truck className="h-4 w-4 text-brand-500" /> Onaylanan kalemler kargoya hazır · takip no otomatik</div>
  </div>
);

export const CreditMock = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <div><p className="text-[10px] font-bold text-slate-400 uppercase">Bakiye</p><p className="text-lg font-black text-red-600">₺42.350</p></div>
      <div><p className="text-[10px] font-bold text-slate-400 uppercase">Risk limiti</p><p className="text-lg font-black text-slate-900">₺100.000</p></div>
    </div>
    <span className="block h-2 rounded-full bg-slate-100"><span className="block h-full w-[42%] rounded-full bg-gradient-to-r from-sky-400 to-brand-600" /></span>
    <p className="text-[11px] text-slate-500">Vadesi 5 gün içinde dolan 2 fatura · otomatik hatırlatma gönderildi</p>
    <span className="flex items-center justify-center gap-2 h-9 rounded-lg bg-navy-900 text-white text-xs font-bold"><CreditCard className="h-4 w-4" /> Kartla öde (sanal POS)</span>
  </div>
);

export const AiQuoteMock = () => (
  <div className="space-y-2.5">
    <div className="ml-auto max-w-[17rem] rounded-2xl rounded-br-md bg-navy-900 text-white text-xs px-4 py-2.5">20 koli 8 oz karton bardak ve uygun kapak, en ekonomik olsun.</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-black text-brand-600"><Sparkles className="h-3.5 w-3.5" /> Taslak teklif hazır</p>
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
  <div className="rounded-2xl bg-navy-900 text-[11px] font-mono p-4 space-y-1.5 shadow-sm overflow-hidden">
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
        <span key={s} className="flex-1"><span className={`block h-1.5 rounded-full ${i < 3 ? 'bg-gradient-to-r from-sky-400 to-brand-600' : 'bg-slate-200'}`} /><span className="block text-[9px] text-slate-500 mt-1 text-center">{s}</span></span>
      ))}
    </div>
    <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><RotateCcw className="h-3.5 w-3.5 text-brand-500" /> Onaylanınca tutar bayinin cari hesabına alacak yazılır</p>
  </div>
);

// Kurulum adımlarının çizimleri: her adım açıldığında kendi içinde canlanır (alanlar yazılır, dosya yüklenir, bayiler eklenir, grafik çizilir)
const at = (ms) => ({ animationDelay: `${ms}ms` });

// Sayıyı sıfırdan hedefe sayar; hareket azaltma tercihi açıksa doğrudan hedefi gösterir
const CountUp = ({ to, delay = 0, format = (n) => n.toLocaleString('tr-TR') }) => {
  const [reduced] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const [n, setN] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) return undefined;
    let raf;
    let start;
    const tick = (t) => {
      start ??= t + delay;
      const p = Math.min(1, Math.max(0, (t - start) / 1200));
      setN(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, reduced]);
  return format(n);
};

const CARD = 'rounded-2xl bg-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)] p-5 w-full max-w-sm';

export const StepMock = ({ step }) => {
  if (step === 0) return (
    <div className={`${CARD} p-6 space-y-3 bg-gradient-to-b from-brand-50/70 to-white`}>
      <span className="step-pop mx-auto h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg"><Store className="h-6 w-6 text-white" /></span>
      <p className="step-rise text-center font-semibold text-slate-900" style={at(150)}>Portalınızı oluşturun</p>
      {['Yıldız Hırdavat', 'yildizhirdavat.akisb2b.com', 'satis@yildizhirdavat.com'].map((p, i) => (
        <span key={p} className="step-rise block h-10 rounded-xl bg-slate-100 px-3 text-xs text-slate-700 font-medium flex items-center" style={at(300 + i * 700)}>
          <span className="step-type truncate" style={at(450 + i * 700)}>{p}</span>
          {i === 1 && <Check className="step-pop ml-auto h-4 w-4 text-emerald-600 shrink-0" style={at(1300)} />}
        </span>
      ))}
      <span className="step-rise block" style={at(2500)}><span className="step-pulse h-10 rounded-xl bg-navy-900 border-b-4 border-brand-500 text-white text-xs font-bold flex items-center justify-center">Ücretsiz denemeyi başlat</span></span>
    </div>
  );
  if (step === 1) return (
    <div className={`${CARD} space-y-3`}>
      <p className="step-rise text-sm font-semibold text-slate-900">Excel ile toplu ürün yükleme</p>
      <div className="step-rise rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-4 text-center" style={at(150)}>
        <p className="text-xs text-brand-700 font-semibold">urunler.xlsx · 1.240 satır</p>
        <div className="mt-3 h-1.5 rounded-full bg-brand-100 overflow-hidden"><div className="step-fill h-full rounded-full bg-brand-600" style={at(400)} /></div>
      </div>
      {[['Yeni ürün', 1180], ['Güncellenen', 54], ['Hatalı satır', 6]].map(([k, v], i) => (
        <p key={k} className="step-rise flex justify-between text-xs" style={at(1900 + i * 200)}>
          <span className="text-slate-500">{k}</span>
          <span className={`font-black tabular-nums ${i === 2 ? 'text-red-600' : 'text-slate-900'}`}><CountUp to={v} delay={1900 + i * 200} format={(n) => Math.round(n).toLocaleString('tr-TR')} /></span>
        </p>
      ))}
      <p className="step-rise flex items-center gap-1.5 text-[11px] font-bold text-emerald-700" style={at(3000)}><Check className="h-3.5 w-3.5" /> Katalog yayında</p>
    </div>
  );
  if (step === 2) return (
    <div className={`${CARD} space-y-2.5`}>
      <p className="step-rise text-sm font-semibold text-slate-900">Bayi davetleri</p>
      {[['Yıldız Hırdavat', 'Gold · %12', true], ['Kaya Yapı Market', 'Standart', true], ['Demir Teknik', 'Başvuru', false]].map(([n, g, ok], i) => (
        <div key={n} className="step-rise flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5" style={at(250 + i * 550)}>
          <span className="h-8 w-8 rounded-lg bg-brand-100 text-brand-600 text-[11px] font-black flex items-center justify-center">{n.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
          <span className="flex-1 min-w-0"><span className="block text-xs font-bold text-slate-800 truncate">{n}</span><span className="block text-[10px] text-slate-400">{g}</span></span>
          <span className={`step-pop text-[10px] font-black px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-600'}`} style={at(550 + i * 550)}>{ok ? 'Aktif' : 'Onay bekliyor'}</span>
        </div>
      ))}
      <p className="step-rise text-[11px] text-slate-500 pt-1" style={at(2100)}>Davet e-postaları gönderildi · <b className="text-slate-800">3 bayi</b></p>
    </div>
  );
  return (
    <div className={`${CARD} space-y-3`}>
      <p className="step-rise flex items-center justify-between text-sm font-semibold text-slate-900">Bu ay <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">▲ %38</span></p>
      <svg viewBox="0 0 300 110" className="w-full h-28" aria-hidden="true">
        <defs><linearGradient id="lg-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#B7865F" stopOpacity="0.25" /><stop offset="100%" stopColor="#B7865F" stopOpacity="0" /></linearGradient></defs>
        <path className="step-fade" style={at(900)} d="M0 90 C40 80 60 60 90 66 S150 30 180 40 S240 14 300 8 L300 110 L0 110 Z" fill="url(#lg-area)" />
        <path className="step-draw" pathLength="1" d="M0 90 C40 80 60 60 90 66 S150 30 180 40 S240 14 300 8" fill="none" stroke="#B7865F" strokeWidth="3" strokeLinecap="round" />
        <circle className="step-pop" style={{ ...at(1500), transformOrigin: '296px 9px' }} cx="296" cy="9" r="5" fill="#B7865F" stroke="white" strokeWidth="2" />
      </svg>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Sipariş', 128, (n) => Math.round(n)], ['Ciro', 1.2, (n) => `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`], ['Aktif bayi', 34, (n) => Math.round(n)]].map(([k, v, f], i) => (
          <div key={k} className="step-rise rounded-xl bg-slate-50 py-2" style={at(300 + i * 150)}><p className="text-sm font-black text-slate-900 tabular-nums"><CountUp to={v} delay={300 + i * 150} format={f} /></p><p className="text-[10px] text-slate-500">{k}</p></div>
        ))}
      </div>
    </div>
  );
};

export const FloatingOrder = () => (
  <div className="w-64 rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] px-4 py-3 text-[13px] leading-snug text-slate-800">
    <p className="flex items-center gap-1.5 text-[11px] font-black text-brand-600 mb-0.5"><Package className="h-3.5 w-3.5" /> Yeni sipariş · 02:14</p>
    Yıldız Hırdavat <b>#AK-1042</b> siparişi verdi · {tl(18278)}
  </div>
);

export const FloatingLimit = () => (
  <div className="w-64 rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] px-4 py-3 space-y-2">
    <p className="flex justify-between text-[12px]"><span className="font-bold text-slate-800">Kaya Yapı Market</span><span className="font-black text-slate-900">%62</span></p>
    <span className="block h-1.5 rounded-full bg-slate-100"><span className="block h-full w-[62%] rounded-full bg-gradient-to-r from-sky-400 to-brand-600" /></span>
    <p className="text-[11px] text-slate-500">Risk limitinin %62'si kullanıldı</p>
  </div>
);


// Bayinin telefonundaki portal (telefona yüklenen uygulama)
export const PhoneMockup = () => (
  <div className="relative mx-auto w-[16.5rem] rounded-[2.6rem] bg-navy-900 p-2.5 shadow-[0_40px_80px_-30px_rgba(15,23,42,0.6)]">
    <span className="absolute top-3.5 left-1/2 -translate-x-1/2 h-5 w-20 rounded-full bg-black z-10" />
    <div className="rounded-[2.1rem] bg-[#f7f8fb] overflow-hidden h-[33rem] flex flex-col">
      <div className="px-4 pt-9 pb-3 bg-white flex items-center justify-between">
        <span className="text-[13px] font-black text-slate-900">Yıldız Hırdavat</span>
        <span className="relative"><ShoppingCart className="h-5 w-5 text-brand-600" /><span className="absolute -top-1.5 -right-2 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">3</span></span>
      </div>
      <div className="mx-3 mt-3 rounded-2xl bg-gradient-to-br from-brand-600 to-violet-600 p-3.5 text-white">
        <p className="text-[10px] opacity-80">Kullanılabilir limit</p>
        <p className="text-xl font-black">₺57.650</p>
        <span className="mt-2 block h-1.5 rounded-full bg-white/25"><span className="block h-full w-[42%] rounded-full bg-white" /></span>
      </div>
      <div className="mx-3 mt-3 rounded-2xl bg-white p-3 border border-slate-100 flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><Truck className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block text-[11px] font-bold text-slate-900">#AK-1038 kargoda</span><span className="block text-[10px] text-slate-400">Yurtiçi · yarın teslim</span></span>
      </div>
      <p className="px-4 mt-4 text-[11px] font-black text-slate-500">Sık aldıklarınız</p>
      <div className="px-3 mt-2 grid grid-cols-2 gap-2">
        {PRODUCTS.slice(0, 2).map((p) => (
          <div key={p.sku} className="rounded-xl bg-white border border-slate-100 overflow-hidden">
            <div className={`h-16 bg-gradient-to-br ${p.hue} flex items-center justify-center text-2xl`}>{p.icon}</div>
            <div className="p-2"><p className="text-[10px] font-bold text-slate-800 truncate">{p.name}</p><p className="text-[11px] font-black text-slate-900">{tl(p.price * 0.88)}</p></div>
          </div>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-4 bg-white border-t border-slate-100 py-2.5 text-[9px] font-bold text-slate-400">
        {['Katalog', 'Sepet', 'Siparişler', 'Cari'].map((x, i) => <span key={x} className={`text-center ${i === 0 ? 'text-brand-600' : ''}`}>{x}</span>)}
      </div>
    </div>
  </div>
);

// Yöneticinin panosu
export const DashboardMockup = () => (
  <div className="rounded-[1.6rem] bg-white border border-slate-200/70 shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] p-5 space-y-4">
    <div className="flex items-center justify-between"><p className="font-semibold text-slate-950">Bu ayın özeti</p><span className="text-[11px] font-bold text-slate-400">Ekim</span></div>
    <div className="grid grid-cols-3 gap-2.5">
      {[['Ciro', '₺1,24 M', 'from-brand-500 to-violet-600'], ['Sipariş', '128', 'from-emerald-500 to-teal-600'], ['Onay bekleyen', '6', 'from-orange-400 to-rose-500']].map(([k, v, g]) => (
        <div key={k} className={`rounded-xl bg-gradient-to-br ${g} p-3 text-white`}><p className="text-[10px] opacity-80">{k}</p><p className="text-lg font-black">{v}</p></div>
      ))}
    </div>
    <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="w-full h-28" aria-hidden="true">
      <defs><linearGradient id="dash-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#B7865F" stopOpacity="0.28" /><stop offset="100%" stopColor="#B7865F" stopOpacity="0" /></linearGradient></defs>
      {[30, 60, 90].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />)}
      <path d="M0 100 C50 92 70 70 110 76 S170 44 210 52 S280 22 320 30 S370 10 400 8 L400 120 L0 120 Z" fill="url(#dash-area)" />
      <path d="M0 100 C50 92 70 70 110 76 S170 44 210 52 S280 22 320 30 S370 10 400 8" fill="none" stroke="#B7865F" strokeWidth="3" strokeLinecap="round" />
    </svg>
    <div className="space-y-2">
      <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Limitine yaklaşan bayiler</p>
      {[['Kaya Yapı Market', 86], ['Demir Teknik', 74]].map(([n, p]) => (
        <div key={n} className="flex items-center gap-3 text-xs"><span className="w-32 font-semibold text-slate-700 truncate">{n}</span><span className="flex-1 h-1.5 rounded-full bg-slate-100"><span className={`block h-full rounded-full ${p > 80 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${p}%` }} /></span><span className="w-9 text-right font-black text-slate-900">%{p}</span></div>
      ))}
    </div>
  </div>
);

// Giriş bölümünde sırayla beliren canlı olaylar
const LIVE_EVENTS = [
  { icon: Package, tone: 'text-brand-600', title: 'Yeni sipariş · 02:14', text: <>Yıldız Hırdavat <b>#AK-1042</b> · {tl(18278)}</> },
  { icon: CreditCard, tone: 'text-emerald-600', title: 'Tahsilat alındı', text: <>Kaya Yapı Market kartla <b>{tl(12400)}</b> ödedi</> },
  { icon: Truck, tone: 'text-sky-600', title: 'Kargoya verildi', text: <><b>#AK-1038</b> · takip no bayiye gönderildi</> },
  { icon: Sparkles, tone: 'text-violet-600', title: 'Teklif hazır', text: <>Yapay zekâ 12 kalemi eşleştirdi · onayınızı bekliyor</> },
];

// Olaylar 3 saniyede bir değişir; hareket azaltma tercihi açıksa ilk olayda kalır
export const LiveTicker = () => {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setI((x) => (x + 1) % LIVE_EVENTS.length), 3000);
    return () => clearInterval(timer);
  }, []);
  const event = LIVE_EVENTS[i];
  return (
    <div key={i} className="w-72 rounded-2xl bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)] px-4 py-3 text-[13px] leading-snug text-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <p className={`flex items-center gap-1.5 text-[11px] font-black mb-0.5 ${event.tone}`}><event.icon className="h-3.5 w-3.5" /> {event.title}</p>
      {event.text}
    </div>
  );
};
