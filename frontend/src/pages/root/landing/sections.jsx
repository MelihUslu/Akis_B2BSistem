import { useEffect, useRef, useState } from 'react';
import {
  X, Check, Minus, ArrowRight, Crown, Briefcase, Calculator, Store, LayoutGrid, ClipboardCheck, Sparkles, Webhook, ShieldCheck
} from 'lucide-react';
import { Chip, Heading, Highlight, PrimaryButton, Frame } from './ui';
import { PhoneMockup, DashboardMockup } from './mockups';
import { PROBLEMS, SOLUTIONS, SECTORS, ROLES, FEATURE_GROUPS, COMPARISON } from './data';

const ICONS = { owner: Crown, sales: Briefcase, finance: Calculator, dealer: Store, catalog: LayoutGrid, order: ClipboardCheck, erp: Webhook, security: ShieldCheck };

// Görünüme girince yumuşakça beliren blok (hareket azaltma tercihine uyar)
export const Reveal = ({ children, className = '', delay = 0 }) => {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window) || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShown(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}>
      {children}
    </div>
  );
};

// Önce / sonra
export const ProblemSolution = () => (
  <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
    <Reveal className="text-center max-w-3xl mx-auto">
      <Chip>Tanıdık geldi mi?</Chip>
      <Heading className="mt-5">Bayi siparişi toplamak <Highlight>bu kadar</Highlight> zor olmamalı</Heading>
    </Reveal>
    <div className="mt-12 grid lg:grid-cols-2 gap-5">
      <Reveal>
        <div className="h-full rounded-[2rem] bg-white/60 border border-slate-200/70 p-7 md:p-9">
          <p className="text-sm font-black text-rose-600 uppercase tracking-wider">Bugün</p>
          <ul className="mt-6 space-y-5">
            {PROBLEMS.map(([t, d]) => (
              <li key={t} className="flex gap-4">
                <span className="h-8 w-8 shrink-0 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center"><X className="h-4 w-4" /></span>
                <span><span className="block font-semibold text-slate-900">{t}</span><span className="block text-slate-500 mt-0.5">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
      <Reveal delay={120}>
        <div className="h-full rounded-[2rem] p-[2px] bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 shadow-[0_30px_80px_-40px_rgba(79,70,229,0.6)]">
          <div className="h-full rounded-[1.9rem] bg-white p-7 md:p-9">
            <p className="text-sm font-black text-indigo-600 uppercase tracking-wider">B2B portalla</p>
            <ul className="mt-6 space-y-5">
              {SOLUTIONS.map(([t, d]) => (
                <li key={t} className="flex gap-4">
                  <span className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-white flex items-center justify-center shadow"><Check className="h-4 w-4" /></span>
                  <span><span className="block font-semibold text-slate-900">{t}</span><span className="block text-slate-500 mt-0.5">{d}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </div>
  </section>
);

// Sektörler: sade etiketler
export const Sectors = () => (
  <section className="max-w-5xl mx-auto px-5 pt-24 md:pt-32">
    <Reveal className="rounded-[2rem] border border-slate-200/70 bg-white/60 px-6 py-12 md:px-12 md:py-14 text-center">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Kimler için?</p>
      <h2 className="mt-4 text-2xl md:text-[2rem] font-semibold tracking-[-0.03em] leading-tight text-slate-950">Bayi ve toptan satış yapan her üretici ve distribütör için</h2>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {SECTORS.map(([, n]) => (
          <span key={n} className="px-4 py-2 rounded-full bg-white border border-slate-200 text-sm font-medium text-slate-700">{n}</span>
        ))}
      </div>
    </Reveal>
  </section>
);

// Kim ne kazanır
export const Roles = () => (
  <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
    <Reveal className="max-w-3xl">
      <Chip>Herkes kazanır</Chip>
      <Heading className="mt-5">Ekibinizin her üyesi için <br className="hidden md:block" />daha az iş, daha çok satış</Heading>
    </Reveal>
    <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {ROLES.map((r, i) => {
        const Icon = ICONS[r.icon];
        return (
          <Reveal key={r.who} delay={i * 80} className="h-full">
            <Frame className="h-full" inner="p-6 h-full">
              <span className="h-12 w-12 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 text-white flex items-center justify-center shadow-lg"><Icon className="h-6 w-6" /></span>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">{r.who}</h3>
              <ul className="mt-4 space-y-3">
                {r.points.map((p) => <li key={p} className="flex gap-2.5 text-slate-600 leading-snug"><Check className="h-4 w-4 mt-1 shrink-0 text-indigo-600" />{p}</li>)}
              </ul>
            </Frame>
          </Reveal>
        );
      })}
    </div>
  </section>
);

// İki ekran: bayinin telefonu + yöneticinin panosu (üstte metin, altta iki çizim yan yana)
export const DualView = () => (
  <section className="px-3 md:px-6 pt-24 md:pt-32">
    <div className="max-w-[90rem] mx-auto rounded-[2.5rem] bg-[#0b0d12] text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_15%_20%,rgba(56,189,248,0.25),transparent_70%),radial-gradient(50%_60%_at_85%_80%,rgba(129,140,248,0.3),transparent_70%)]" />
      <div className="relative max-w-6xl mx-auto px-5 py-20 md:py-28">
        <Reveal className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-[13px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-sky-300" /> İki taraf, tek sistem</span>
            <h2 className="mt-5 text-3xl sm:text-4xl lg:text-[3.25rem] font-semibold tracking-[-0.04em] leading-[1.08]">Bayiniz telefonundan sipariş verir, siz panodan yönetirsiniz</h2>
          </div>
          <p className="text-lg text-slate-300">Bayi portalı telefona uygulama gibi yüklenir. Sipariş onayı, kargo ve tahsilat bildirimleri anında gelir; siz de ciroyu, onay bekleyenleri ve riskli bayileri tek bakışta görürsünüz.</p>
        </Reveal>
        <div className="mt-14 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-10 items-center">
          <Reveal className="space-y-6 order-2 lg:order-1">
            <div className="text-slate-900"><DashboardMockup /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[['Yönetim tarafı', ['Onay bekleyen siparişler', 'Limit ve gecikmiş alacak uyarısı', 'Satış ve bayi raporları']], ['Bayi tarafı', ['Kendi fiyatlarıyla katalog', 'Sipariş ve kargo takibi', 'Ekstre, mutabakat, kartla ödeme']]].map(([title, items]) => (
                <div key={title} className="rounded-2xl bg-white/5 border border-white/10 p-5">
                  <p className="font-semibold">{title}</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">{items.map((x) => <li key={x} className="flex gap-2"><Check className="h-4 w-4 mt-0.5 text-sky-300 shrink-0" />{x}</li>)}</ul>
                </div>
              ))}
            </div>
          </Reveal>
          <Reveal delay={150} className="order-1 lg:order-2 flex justify-center"><PhoneMockup /></Reveal>
        </div>
      </div>
    </div>
  </section>
);

// Tam özellik listesi
export const FeatureCatalog = () => (
  <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
    <Reveal className="text-center max-w-3xl mx-auto">
      <Chip>Tüm özellikler</Chip>
      <Heading className="mt-5">Bir B2B işinin ihtiyaç duyduğu <Highlight>her şey</Highlight> dahil</Heading>
      <p className="mt-5 text-lg text-slate-600">Ek modül ya da gizli ücret yok; her pakette tüm özellikler açık.</p>
    </Reveal>
    <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
      {FEATURE_GROUPS.map((g, i) => {
        const Icon = ICONS[g.icon];
        return (
          <Reveal key={g.title} delay={(i % 3) * 80} className="h-full">
            <Frame className="h-full" inner="p-6 h-full">
              <div className="flex items-center gap-3">
                <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-100 text-indigo-600 flex items-center justify-center"><Icon className="h-5 w-5" /></span>
                <h3 className="text-xl font-semibold tracking-tight text-slate-950">{g.title}</h3>
              </div>
              <ul className="mt-5 space-y-2.5">
                {g.items.map((x) => <li key={x} className="flex gap-2.5 text-[15px] text-slate-700 leading-snug"><Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />{x}</li>)}
              </ul>
            </Frame>
          </Reveal>
        );
      })}
    </div>
  </section>
);

// Kazanç hesaplayıcı (tahmini)
const Slider = ({ label, value, onChange, min, max, step = 1, suffix }) => (
  <label className="block">
    <span className="flex items-baseline justify-between"><span className="font-semibold text-slate-800">{label}</span><span className="text-xl font-semibold tracking-tight text-slate-950">{value.toLocaleString('tr-TR')}{suffix}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-3 w-full accent-indigo-600 cursor-pointer" />
  </label>
);

export const SavingsCalculator = () => {
  const [orders, setOrders] = useState(25);
  const [minutes, setMinutes] = useState(8);
  const [share, setShare] = useState(70);
  const days = 22;
  const hours = Math.round((orders * minutes * days * (share / 100)) / 60);
  const workdays = Math.round((hours / 8) * 10) / 10;
  return (
    <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
      <Reveal>
        <Frame inner="grid lg:grid-cols-2 gap-2 p-2">
          <div className="p-6 md:p-10">
            <Chip icon={Calculator}>Hesaplayın</Chip>
            <h2 className="mt-5 text-3xl md:text-4xl font-semibold tracking-[-0.04em] leading-tight text-slate-950">Siparişleri elle yazmak size ayda kaç saate mal oluyor?</h2>
            <div className="mt-8 space-y-7">
              <Slider label="Günlük telefon / WhatsApp siparişi" value={orders} onChange={setOrders} min={5} max={200} />
              <Slider label="Sipariş başına harcanan süre" value={minutes} onChange={setMinutes} min={2} max={30} suffix=" dk" />
              <Slider label="Portala taşınacak sipariş oranı" value={share} onChange={setShare} min={20} max={100} step={5} suffix="%" />
            </div>
          </div>
          <div className="rounded-[1.4rem] bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 text-white p-8 md:p-10 flex flex-col justify-center">
            <p className="text-white/80 font-semibold">Ekibinize geri kazandıracağınız süre</p>
            <p className="mt-3 text-6xl md:text-7xl font-semibold tracking-[-0.05em] tabular-nums">{hours.toLocaleString('tr-TR')}<span className="text-2xl md:text-3xl font-medium"> saat / ay</span></p>
            <p className="mt-3 text-lg text-white/90">≈ {workdays.toLocaleString('tr-TR')} tam iş günü; satışa ve bayi ziyaretine ayrılabilir.</p>
            <p className="mt-6 text-sm text-white/70">Tahmini hesap: ayda {days} iş günü varsayılmıştır. Yanlış ürün, yanlış fiyat ve tahsilat takibi için harcanan süre dahil değildir.</p>
            <PrimaryButton href="#kayit" className="mt-8 self-start">Bu süreyi geri kazanın <ArrowRight className="h-4 w-4" /></PrimaryButton>
          </div>
        </Frame>
      </Reveal>
    </section>
  );
};

// Karşılaştırma tablosu
const Cell = ({ v, strong }) => (
  v === true ? <span className={`inline-flex h-7 w-7 rounded-full items-center justify-center ${strong ? 'bg-gradient-to-br from-sky-400 to-indigo-600 text-white' : 'bg-emerald-50 text-emerald-600'}`}><Check className="h-4 w-4" /></span>
    : v === false ? <span className="inline-flex h-7 w-7 rounded-full items-center justify-center bg-slate-100 text-slate-400"><Minus className="h-4 w-4" /></span>
      : <span className={`text-sm font-semibold ${strong ? 'text-indigo-700' : 'text-slate-500'}`}>{v}</span>
);

export const Comparison = () => (
  <section className="max-w-5xl mx-auto px-5 pt-24 md:pt-32">
    <Reveal className="text-center">
      <Chip>Karşılaştırın</Chip>
      <Heading className="mt-5">Neden genel bir e-ticaret sitesi değil?</Heading>
      <p className="mt-5 text-lg text-slate-600 max-w-2xl mx-auto">Perakende sitesi tek fiyat ve kartla ödeme için tasarlanır. Bayi satışı ise cari hesap, limit, vade ve bayiye özel fiyat ister.</p>
    </Reveal>
    <Reveal className="mt-10">
      <div className="rounded-[2rem] bg-white shadow-[0_10px_40px_-20px_rgba(15,23,42,0.2)] overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr>
              <th className="p-5" />
              {COMPARISON.cols.map((c, i) => <th key={c} className={`p-5 text-center text-sm font-semibold ${i === 2 ? 'text-indigo-700 bg-indigo-50/60 rounded-t-2xl' : 'text-slate-500'}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.rows.map(([label, ...vals]) => (
              <tr key={label} className="border-t border-slate-100">
                <td className="p-5 font-semibold text-slate-800">{label}</td>
                {vals.map((v, i) => <td key={i} className={`p-5 text-center ${i === 2 ? 'bg-indigo-50/60' : ''}`}><Cell v={v} strong={i === 2} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Reveal>
  </section>
);

// Telefonda: giriş bölümü geçilince altta sabit "ücretsiz dene" çubuğu (kayıt formuna gelince gizlenir)
export const StickyCta = ({ trialDays }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const form = document.getElementById('kayit')?.getBoundingClientRect();
      const nearForm = form && form.top < window.innerHeight && form.bottom > 0;
      setShow(window.scrollY > 700 && !nearForm);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className={`md:hidden fixed inset-x-3 z-40 transition-all duration-300 ${show ? 'bottom-3 opacity-100' : '-bottom-24 opacity-0'}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <a href="#kayit" className="flex items-center justify-between gap-3 h-14 pl-5 pr-2 rounded-2xl bg-[#0b0d12] text-white shadow-2xl">
        <span className="text-sm font-semibold">{trialDays} gün ücretsiz deneyin</span>
        <span className="h-10 px-4 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 text-sm font-semibold flex items-center gap-1.5">Başla <ArrowRight className="h-4 w-4" /></span>
      </a>
    </div>
  );
};
