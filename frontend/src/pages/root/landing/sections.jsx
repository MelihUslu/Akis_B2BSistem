import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  X, Check, Minus, ArrowRight, Hammer, BrickWall, Package, Wheat, SprayCan, CarFront, PlugZap, Stethoscope, Shirt, NotebookPen, Sprout, Factory, Crown, Briefcase, Calculator, Store, LayoutGrid, ClipboardCheck, Sparkles, Webhook, ShieldCheck
} from 'lucide-react';
import { Chip, Heading, PrimaryButton, Frame } from './ui';
import { PhoneMockup, DashboardMockup, StepMock } from './mockups';
import { PROBLEMS, SOLUTIONS, SECTORS, FEATURE_GROUPS, COMPARISON } from './data';

const ICONS = { owner: Crown, sales: Briefcase, finance: Calculator, dealer: Store, catalog: LayoutGrid, order: ClipboardCheck, erp: Webhook, security: ShieldCheck };
const SECTOR_ICONS = { hammer: Hammer, brick: BrickWall, package: Package, wheat: Wheat, spray: SprayCan, car: CarFront, plug: PlugZap, medical: Stethoscope, shirt: Shirt, notebook: NotebookPen, sprout: Sprout, factory: Factory };

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
      <Heading className="mt-5">Bayi siparişi toplamak bu kadar zor olmamalı</Heading>
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
        <div className="h-full rounded-[2rem] p-[2px] bg-brand-500 shadow-[0_30px_80px_-40px_rgba(152,107,71,0.5)]">
          <div className="h-full rounded-[1.9rem] bg-white p-7 md:p-9">
            <p className="text-sm font-black text-brand-600 uppercase tracking-wider">B2B portalla</p>
            <ul className="mt-6 space-y-5">
              {SOLUTIONS.map(([t, d]) => (
                <li key={t} className="flex gap-4">
                  <span className="h-8 w-8 shrink-0 rounded-xl bg-brand-600 text-white flex items-center justify-center"><Check className="h-4 w-4" /></span>
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
const SectorCard = ({ sector }) => {
  const Icon = SECTOR_ICONS[sector.icon];
  return (
    <div className="shrink-0 w-64 flex items-center gap-3.5 rounded-2xl bg-white border border-slate-200/80 px-4 py-3.5 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-18px_rgba(15,23,42,0.35)]">
      <span className="h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ring-1 ring-inset"
        style={{ color: sector.color, background: `color-mix(in srgb, ${sector.color} 9%, white)`, '--tw-ring-color': `color-mix(in srgb, ${sector.color} 18%, transparent)` }}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold tracking-tight text-slate-900 truncate">{sector.name}</span>
        <span className="block text-xs text-slate-500 truncate">{sector.items}</span>
      </span>
    </div>
  );
};

// İki sıra, zıt yönlerde yavaşça kayan sektör kartları. Kesintisiz döngü için liste iki kez yazılır;
// fareyle üstüne gelince durur, hareket azaltma tercihi açıksa kartlar sabit dizilir.
const SectorRow = ({ items, reverse }) => (
  <div className="sector-marquee group flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_6%,black_94%,transparent)]">
    {[0, 1].map((copy) => (
      <div key={copy} aria-hidden={copy === 1} className={`sector-track flex shrink-0 gap-3 pr-3 ${reverse ? 'sector-reverse' : ''}`}>
        {items.map((s) => <SectorCard key={s.name} sector={s} />)}
      </div>
    ))}
  </div>
);

export const Sectors = () => (
  <section className="pt-24 md:pt-32 overflow-hidden">
    <Reveal>
      <div className="text-center max-w-4xl mx-auto px-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-600">Kimler için?</p>
        <h2 className="mt-4 text-2xl md:text-[2rem] font-semibold tracking-[-0.03em] leading-tight text-slate-950">Bayi ve toptan satış yapan her üretici ve distribütör için</h2>
        <p className="mt-3 text-slate-500">Katalog, fiyat ve sipariş yapınız ne olursa olsun aynı portal uyum sağlar.</p>
      </div>
      <div className="mt-10 space-y-3">
        <SectorRow items={SECTORS.slice(0, 6)} />
        <SectorRow items={SECTORS.slice(6)} reverse />
      </div>
    </Reveal>
  </section>
);

// İki ekran: bayinin telefonu + yöneticinin panosu (üstte metin, altta iki çizim yan yana)
export const DualView = () => (
  <section className="px-3 md:px-6 pt-24 md:pt-32">
    <div className="max-w-[90rem] mx-auto rounded-[2.5rem] bg-navy-900 text-white overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(50%_60%_at_85%_80%,rgba(183,134,95,0.28),transparent_70%)]" />
      <div className="relative max-w-6xl mx-auto px-5 py-20 md:py-28">
        <Reveal className="grid lg:grid-cols-2 gap-8 lg:gap-14 items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-[13px] font-semibold"><Sparkles className="h-3.5 w-3.5 text-brand-300" /> İki taraf, tek sistem</span>
            <h2 className="mt-5 text-3xl sm:text-4xl lg:text-[3.25rem] font-semibold tracking-[-0.04em] leading-[1.08]">Bayiniz telefonundan sipariş verir, siz panodan yönetirsiniz</h2>
          </div>
          <p className="text-lg text-slate-300">Bayi portalı telefona uygulama gibi yüklenir. Sipariş onayı, kargo ve tahsilat bildirimleri anında gelir; siz de ciroyu, onay bekleyenleri ve riskli bayileri tek bakışta görürsünüz.</p>
        </Reveal>
        <div className="mt-14 grid lg:grid-cols-[minmax(0,1fr)_auto] gap-10 items-center">
          <Reveal className="order-2 lg:order-1 text-slate-900"><DashboardMockup /></Reveal>
          <Reveal delay={150} className="order-1 lg:order-2 flex justify-center"><PhoneMockup /></Reveal>
        </div>
      </div>
    </div>
  </section>
);

// Tam özellik listesi: tam genişlikte kartlar; masaüstünde hepsi aynı yere yapışır,
// kaydırınca sonraki kart alttan gelip öncekini tamamen örter (telefonda alt alta)
export const FeatureCatalog = () => (
  <section className="pt-24 md:pt-32">
    <Reveal className="text-center max-w-3xl mx-auto px-5">
      <Chip>Tüm özellikler</Chip>
      <Heading className="mt-5">Bir B2B işinin ihtiyaç duyduğu her şey dahil</Heading>
      <p className="mt-5 text-lg text-slate-600">Ek modül ya da gizli ücret yok; her pakette tüm özellikler açık. Kaydırarak inceleyin.</p>
    </Reveal>
    <div className="mt-12 px-3 md:px-6 space-y-4 md:space-y-0">
      {FEATURE_GROUPS.map((g, i) => {
        const Icon = ICONS[g.icon];
        return (
          <div key={g.title} className="md:sticky md:top-24 md:h-[calc(100vh-7rem)] md:min-h-[28rem] md:pb-4">
            <article className="relative h-full max-w-[90rem] mx-auto overflow-hidden rounded-[2.5rem] bg-navy-900 text-white ring-1 ring-white/10 shadow-[0_-30px_60px_-30px_rgba(15,23,42,0.55)]"
              style={{ '--accent': g.accent }}>
              {/* İnce ızgara + tek, hafif vurgu ışığı */}
              <div className="absolute inset-0 opacity-[0.07] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top_right,black_20%,transparent_70%)]" />
              <div className="absolute inset-0" style={{ background: `radial-gradient(45rem 30rem at 100% 0%, color-mix(in srgb, ${g.accent} 22%, transparent), transparent 70%)` }} />
              <div className="relative h-full max-w-6xl mx-auto px-7 py-10 md:px-10 grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-8 md:gap-14 items-center">
                <div>
                  <div className="flex items-center gap-4">
                    <span className="h-14 w-14 rounded-2xl bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center" style={{ color: g.accent }}><Icon className="h-7 w-7" /></span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: g.accent }}>{String(i + 1).padStart(2, '0')}<span className="text-white/35"> / {String(FEATURE_GROUPS.length).padStart(2, '0')}</span></span>
                  </div>
                  <h3 className="mt-7 text-4xl md:text-5xl lg:text-[3.5rem] font-semibold tracking-[-0.04em] leading-[1.05]">{g.title}</h3>
                  <p className="mt-4 text-lg md:text-xl text-slate-400 max-w-md">{g.desc}</p>
                  <div className="mt-8 flex gap-1.5">
                    {FEATURE_GROUPS.map((x, j) => <span key={x.title} className={`h-1 rounded-full ${j === i ? 'w-10' : 'w-4 bg-white/15'}`} style={j === i ? { background: g.accent } : undefined} />)}
                  </div>
                </div>
                <ul className="divide-y divide-white/[0.07] rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
                  {g.items.map((x) => (
                    <li key={x} className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-slate-200 leading-snug">
                      <Check className="h-4 w-4 shrink-0" style={{ color: g.accent }} />{x}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        );
      })}
    </div>
  </section>
);

// Kazanç hesaplayıcı (tahmini)
const Slider = ({ label, value, onChange, min, max, step = 1, suffix }) => (
  <label className="block">
    <span className="flex items-baseline justify-between"><span className="font-semibold text-slate-800">{label}</span><span className="text-xl font-semibold tracking-tight text-slate-950">{value.toLocaleString('tr-TR')}{suffix}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-3 w-full accent-brand-600 cursor-pointer" />
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
          <div className="rounded-[1.4rem] bg-gradient-to-br from-brand-600 via-blue-600 to-sky-500 text-white p-8 md:p-10 flex flex-col justify-center">
            <p className="text-white/80 font-semibold">Ekibinize geri kazandıracağınız süre</p>
            <p className="mt-3 text-6xl md:text-7xl font-semibold tracking-[-0.05em] tabular-nums">{hours.toLocaleString('tr-TR')}<span className="text-2xl md:text-3xl font-medium"> saat / ay</span></p>
            <p className="mt-3 text-lg text-white/90">≈ {workdays.toLocaleString('tr-TR')} tam iş günü; satışa ve bayi ziyaretine ayrılabilir.</p>
            <p className="mt-6 text-sm text-white/70">Tahmini hesap: ayda {days} iş günü varsayılmıştır. Yanlış ürün, yanlış fiyat ve tahsilat takibi için harcanan süre dahil değildir.</p>
            <PrimaryButton to="/kayit" className="mt-8 self-start">Bu süreyi geri kazanın <ArrowRight className="h-4 w-4" /></PrimaryButton>
          </div>
        </Frame>
      </Reveal>
    </section>
  );
};

// Karşılaştırma tablosu
const Cell = ({ v, strong }) => (
  v === true ? <span className={`inline-flex h-7 w-7 rounded-full items-center justify-center ${strong ? 'bg-brand-600 text-white' : 'bg-emerald-50 text-emerald-600'}`}><Check className="h-4 w-4" /></span>
    : v === false ? <span className="inline-flex h-7 w-7 rounded-full items-center justify-center bg-slate-100 text-slate-400"><Minus className="h-4 w-4" /></span>
      : <span className={`text-sm font-semibold ${strong ? 'text-brand-700' : 'text-slate-500'}`}>{v}</span>
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
              {COMPARISON.cols.map((c, i) => <th key={c} className={`p-5 text-center text-sm font-semibold ${i === 2 ? 'text-brand-700 bg-brand-50/60 rounded-t-2xl' : 'text-slate-500'}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.rows.map(([label, ...vals]) => (
              <tr key={label} className="border-t border-slate-100">
                <td className="p-5 font-semibold text-slate-800">{label}</td>
                {vals.map((v, i) => <td key={i} className={`p-5 text-center ${i === 2 ? 'bg-brand-50/60' : ''}`}><Cell v={v} strong={i === 2} /></td>)}
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
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div className={`md:hidden fixed inset-x-3 z-40 transition-all duration-300 ${show ? 'bottom-3 opacity-100' : '-bottom-24 opacity-0'}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Link to="/kayit" className="flex items-center justify-between gap-3 h-14 pl-5 pr-2 rounded-2xl bg-navy-900 text-white shadow-2xl">
        <span className="text-sm font-semibold">{trialDays} gün ücretsiz deneyin</span>
        <span className="h-10 px-4 rounded-xl bg-brand-500 text-sm font-semibold flex items-center gap-1.5">Başla <ArrowRight className="h-4 w-4" /></span>
      </Link>
    </div>
  );
};

// Canlı demo (platform panelinden açılırsa)
export const LiveDemo = ({ demo }) => {
  if (!demo?.enabled || !demo.url) return null;
  const accounts = [['Bayi gözüyle', demo.dealerEmail, demo.dealerPassword], ['Yönetici gözüyle', demo.adminEmail, demo.adminPassword]].filter(([, e]) => e);
  return (
    <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
      <Reveal>
        <div className="rounded-[2rem] bg-white border border-slate-200/70 shadow-[0_10px_40px_-20px_rgba(15,23,42,0.2)] p-7 md:p-10 grid md:grid-cols-[minmax(0,1fr)_auto] gap-8 items-center">
          <div>
            <Chip>Canlı demo</Chip>
            <h2 className="mt-5 text-3xl md:text-4xl font-semibold tracking-[-0.04em] leading-tight text-slate-950">Kayıt olmadan, örnek verilerle gezin</h2>
            <p className="mt-3 text-lg text-slate-600">Örnek ürünler, bayiler ve siparişlerle hazırlanmış demo portalında katalogu, sepeti ve cari ekranını kendiniz deneyin.</p>
            {accounts.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {accounts.map(([label, email, pass]) => (
                  <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm">
                    <p className="font-semibold text-slate-900">{label}</p>
                    <p className="text-slate-600 font-mono text-[13px]">{email} · {pass}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <PrimaryButton href={demo.url}>Demo portalını aç <ArrowRight className="h-4 w-4" /></PrimaryButton>
        </div>
      </Reveal>
    </section>
  );
};

// Alt bilgi: firma bilgileri ve yasal bağlantılar
const LEGAL_LINKS = [['KVKK Aydınlatma Metni', '/kvkk'], ['Gizlilik Politikası', '/gizlilik'], ['Kullanım Koşulları', '/kullanim-kosullari'], ['Çerez Politikası', '/cerez-politikasi']];
export const SiteFooter = ({ company, brand, nav, className = 'mt-3' }) => (
  <footer className={`${className} rounded-[2rem] bg-white px-6 md:px-12 py-12`}>
    <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1fr_1.2fr]">
      <div>
        <span className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-navy-900 flex items-center justify-center"><Store className="h-5 w-5 text-white" /></span>
          <span className="text-xl font-semibold tracking-tight">{brand}</span>
        </span>
        <p className="mt-4 text-slate-500 max-w-xs">Üreticiler ve distribütörler için bayi sipariş, cari ve tahsilat platformu.</p>
        <div className="mt-5 space-y-1 text-sm text-slate-600">
          {company?.legalName && <p className="font-semibold text-slate-800">{company.legalName}</p>}
          {company?.address && <p>{company.address}</p>}
          {(company?.taxOffice || company?.taxNumber) && <p>{[company.taxOffice && `${company.taxOffice} V.D.`, company.taxNumber].filter(Boolean).join(' · ')}</p>}
          {company?.mersis && <p>MERSİS: {company.mersis}</p>}
          {company?.phone && <p><a href={`tel:${company.phone.replace(/\s/g, '')}`} className="hover:text-slate-950">{company.phone}</a></p>}
          {company?.email && <p><a href={`mailto:${company.email}`} className="hover:text-slate-950">{company.email}</a></p>}
        </div>
      </div>
      <div>
        <p className="font-semibold text-slate-950">Ürün</p>
        <ul className="mt-4 space-y-2.5 text-slate-600">{nav.map(([l, h]) => <li key={h}>{h.startsWith('/') ? <Link to={h} className="hover:text-slate-950">{l}</Link> : <a href={h} className="hover:text-slate-950">{l}</a>}</li>)}</ul>
      </div>
      <div>
        <p className="font-semibold text-slate-950">Yasal</p>
        <ul className="mt-4 space-y-2.5 text-slate-600">{LEGAL_LINKS.map(([l, h]) => <li key={h}><a href={h} className="hover:text-slate-950">{l}</a></li>)}</ul>
      </div>
      <div>
        <p className="font-semibold text-slate-950">Firma girişi</p>
        <p className="mt-4 text-sm text-slate-600">E-posta ve şifrenizle portalınıza girin.</p>
        <Link to="/giris" className="mt-4 h-10 px-4 rounded-xl bg-navy-900 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-navy-950">Giriş yap <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
    <p className="mt-12 pt-6 border-t border-slate-100 text-center text-sm text-slate-500">© {new Date().getFullYear()} {(company?.legalName || brand).replace(/\.$/, '')}. Tüm hakları saklıdır.</p>
  </footer>
);

// ─── Kurulum adımları: kendiliğinden sırayla ilerler ──────────────────────────
const STEPS = [
  { title: 'Hesabınızı açın', points: ['Firma adınızı ve portal adresinizi seçin.', 'Kredi kartı gerekmez; deneme hemen başlar.'] },
  { title: 'Ürünlerinizi yükleyin', points: ['Excel ile toplu yükleme ya da ERP\'den API ile.', 'Kategori, varyant, döviz ve stok bilgileriyle.'] },
  { title: 'Bayilerinizi ekleyin', points: ['Bayi gruplarını ve iskontoları tanımlayın.', 'Bayiler başvurur ya da siz davet edersiniz.'] },
  { title: 'Sipariş almaya başlayın', points: ['Bayileriniz 7/24 sipariş verir.', 'Onay, sevkiyat ve tahsilatı tek yerden yönetin.'] },
];
const STEP_MS = 5000;

// Adımlar 5 sn'de bir kendiliğinden değişir (ilerleme çubuğu dolunca). Fareyle üstüne gelince
// ya da bölüm ekranda değilken durur; tıklanan adımdan devam eder. Hareket azaltma tercihi açıksa elle seçilir.
export const SetupSteps = () => {
  const [step, setStep] = useState(0);
  const [hover, setHover] = useState(false);
  const [inView, setInView] = useState(() => !('IntersectionObserver' in window));
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const running = inView && !hover;
  const next = () => setStep((s) => (s + 1) % STEPS.length);

  return (
    <section id="adimlar" className="scroll-mt-24 px-3 md:px-6 pt-24 md:pt-32">
      <div className="max-w-[90rem] mx-auto rounded-[2.5rem] bg-white py-20 md:py-24 px-5">
        <div className="text-center max-w-3xl mx-auto">
          <Chip>Kolay kurulum</Chip>
          <Heading className="mt-5">Teknik bilgi gerekmeden <br className="hidden md:block" />4 adımda yayında</Heading>
        </div>
        <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          className="max-w-6xl mx-auto mt-12 rounded-[2rem] border border-slate-200/80 p-2 grid lg:grid-cols-2 gap-2">
          <div className="relative overflow-hidden rounded-[1.6rem] bg-[#f3f4f7] min-h-[26rem] flex items-center justify-center p-6 md:p-10">
            <div aria-hidden="true" className="absolute inset-0 opacity-60 [background-image:radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div aria-hidden="true" className="absolute h-72 w-72 rounded-full bg-brand-300/30 blur-3xl transition-transform duration-1000" style={{ transform: `translate(${[-30, 30, -20, 25][step]}%, ${[-20, 15, 25, -10][step]}%)` }} />
            <span className="absolute top-5 left-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
              Adım {step + 1} / {STEPS.length}
              <span className="flex gap-1">{STEPS.map((s, i) => <span key={s.title} className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? 'w-4 bg-brand-600' : i < step ? 'w-1.5 bg-brand-300' : 'w-1.5 bg-slate-300'}`} />)}</span>
            </span>
            <div key={step} className="relative w-full flex justify-center animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-700"><StepMock step={step} /></div>
          </div>
          <div className="p-3 md:p-6 flex flex-col justify-center gap-2">
            {STEPS.map((s, i) => {
              const active = step === i;
              return (
                <button key={s.title} onClick={() => setStep(i)}
                  className={`relative overflow-hidden text-left rounded-2xl px-5 py-4 transition-all duration-500 ${active ? 'bg-white border border-slate-200 shadow-[0_10px_30px_-15px_rgba(15,23,42,0.25)]' : 'border border-transparent hover:bg-slate-50'}`}>
                  <p className={`flex items-center gap-3 text-[17px] font-semibold tracking-tight transition-colors ${active ? 'text-slate-950' : i < step ? 'text-slate-700' : 'text-slate-500'}`}>
                    <span className={`h-7 w-7 rounded-lg text-xs font-black flex items-center justify-center transition-all duration-500 ${active ? 'bg-brand-600 text-white scale-110' : i < step ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    {s.title}
                  </p>
                  <div className={`grid transition-[grid-template-rows,opacity] duration-500 ${active ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <ul className="overflow-hidden ml-10 space-y-1 text-slate-600 list-disc">{s.points.map((p, j) => <li key={p} className={j === 0 ? 'mt-3' : ''}>{p}</li>)}</ul>
                  </div>
                  {active && (
                    <span className="absolute left-0 bottom-0 h-[3px] w-full bg-slate-100">
                      <span key={step} onAnimationEnd={next} className="step-progress block h-full bg-brand-600"
                        style={{ '--step-ms': `${STEP_MS}ms`, animationPlayState: running ? 'running' : 'paused' }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
