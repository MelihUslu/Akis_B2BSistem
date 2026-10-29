import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Check, Plus, Minus, LayoutGrid, ClipboardCheck, Wallet, Sparkles, Webhook, RotateCcw, ArrowDown
} from 'lucide-react';
import { publicApi } from '../../services/api';
import { ROOT_DOMAIN_LABEL } from '../../utils/tenant';
import { formatTRY } from '../../utils/format';
import { Chip, Highlight, Heading, PrimaryButton, Frame, Brackets } from './landing/ui';
import { PortalMockup, CatalogMock, ApprovalMock, CreditMock, AiQuoteMock, ErpMock, ReturnMock, FloatingLimit, LiveTicker } from './landing/mockups';
import { ProblemSolution, Sectors, DualView, FeatureCatalog, SavingsCalculator, Comparison, StickyCta, SetupSteps, LiveDemo, SiteFooter } from './landing/sections';
import { FAQ as FAQ_ITEMS, NAV } from './landing/data';
import { SiteHeader } from './landing/layout';

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B';
const limitText = (n, label) => (n < 0 ? `Sınırsız ${label}` : `${n.toLocaleString('tr-TR')} ${label}`);

const HOME_NAV = NAV.map(([l, id]) => [l, `#${id}`]);

const TABS = [
  { id: 'catalog', icon: LayoutGrid, label: 'Bayiye özel katalog', title: 'Her bayi kendi fiyatını görür', text: 'Bayi grubu iskontoları, bayiye özel ve kademeli fiyatlar, miktar indirimi, koli katsayısı ve minimum sipariş. Dövizli ürünler günün kuruyla TL\'ye çevrilir.', mock: CatalogMock },
  { id: 'approval', icon: ClipboardCheck, label: 'Sipariş onayı', title: 'Kalem bazında onay, otomatik stok', text: 'Gelen siparişi kalem kalem onaylayın veya iptal edin. Stok düşer, cari hesaba işlenir, kargo takip numarası bayiye otomatik gider.', mock: ApprovalMock },
  { id: 'credit', icon: Wallet, label: 'Cari, risk ve tahsilat', title: 'Risk limiti aşılmadan sipariş', text: 'Bayi bakiyesi, kullanılabilir limit, vade takibi ve gecikmiş alacaklar tek ekranda. Bayi sanal POS ile kartla öder, ödeme cariye anında yansır.', mock: CreditMock },
  { id: 'ai', icon: Sparkles, label: 'Yapay zekâ ile teklif', title: 'Serbest metinden taslak teklif', text: 'Müşterinin talebini yapıştırın; ürünler katalogdan eşleştirilir, birim çevrimi yapılır, bayinin iskontosuyla fiyatlanır. Göndermeden önce siz onaylarsınız.', mock: AiQuoteMock },
  { id: 'erp', icon: Webhook, label: 'ERP entegrasyonu', title: 'ERP\'nizle konuşan portal', text: 'REST API ile ürün, stok, fiyat ve cari bakiyeleri senkronlayın; yeni siparişler webhook ile ERP\'nize düşsün. Test anahtarıyla canlıya dokunmadan deneyin.', mock: ErpMock },
  { id: 'rma', icon: RotateCcw, label: 'İade / değişim', title: 'Fotoğraflı, takip edilebilir iade', text: 'Bayi sipariş detayından iade ister, fotoğraf ekler. Siz onaylayınca tutar cari hesaba alacak olarak yazılır, stok geri alınır.', mock: ReturnMock },
];

// "Ekibimize yazın" bağlantıları canlı sohbeti açar (ChatWidget bu olayı dinler)
const openChat = () => window.dispatchEvent(new Event('akis:open-chat'));

const FAQ = FAQ_ITEMS.map(([q, a]) => [q, a.replace('{domain}', ROOT_DOMAIN_LABEL)]);

const Landing = ({ site }) => {
  const company = site?.company || {};
  const brand = company.brand || PLATFORM_NAME;
  const [plans, setPlans] = useState([]);
  const [cycle, setCycle] = useState('MONTHLY');
  const [tab, setTab] = useState(TABS[0].id);
  const [faq, setFaq] = useState(0);

  useEffect(() => { document.title = `${brand} · Bayileriniz için B2B sipariş portalı`; }, [brand]);

  useEffect(() => { publicApi.get('/plans').then((res) => setPlans(res.data)).catch(() => {}); }, []);


  const trialDays = plans[1]?.trialDays ?? plans[0]?.trialDays ?? 14;
  const active = TABS.find((x) => x.id === tab);
  const yearlyDiscount = plans.length && plans[0].priceMonthly > 0
    ? Math.round((1 - plans[0].priceYearly / (plans[0].priceMonthly * 12)) * 100) : 0;


  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900 antialiased">
      <SiteHeader brand={brand} />

      {/* Giriş bölümü */}
      <section className="px-3 md:px-6 -mt-16">
        <div className="relative max-w-[90rem] mx-auto rounded-b-[2.5rem] md:rounded-[2.5rem] overflow-hidden pt-36 md:pt-44 pb-16 md:pb-24 px-5 bg-[radial-gradient(70%_55%_at_50%_0%,rgba(129,140,248,0.28),transparent_70%),linear-gradient(180deg,#eef0fb,#f6f7f8)] border border-white">
          <div className="hidden xl:block absolute left-[4%] top-40"><Brackets><LiveTicker /></Brackets></div>
          <div className="hidden xl:block absolute right-[4%] top-40"><Brackets><FloatingLimit /></Brackets></div>

          <div className="relative max-w-3xl mx-auto text-center">
            <Chip>Bayileriniz için B2B sipariş portalı</Chip>
            <h1 className="mt-6 text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4.5rem] font-semibold tracking-[-0.045em] text-slate-950">
              Bayi siparişlerini <br className="hidden sm:block" /><Highlight>tek portalda</Highlight> toplayın
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl mx-auto">
              Bayileriniz kendi fiyatlarıyla 7/24 sipariş versin; siz onay, stok, cari hesap ve tahsilatı tek yerden yönetin.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <PrimaryButton to="/kayit">{trialDays} gün ücretsiz deneyin <ArrowRight className="h-4 w-4" /></PrimaryButton>
              <a href="#ozellikler" className="flex items-center gap-2 h-12 px-3 text-[15px] font-semibold text-slate-800 hover:text-slate-950">Özellikleri inceleyin <ArrowDown className="h-4 w-4" /></a>
            </div>
            <p className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-slate-600">{['Kredi kartı gerekmez', 'Kurulum ücreti yok', 'Dakikalar içinde hazır'].map((x) => <span key={x} className="flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-500" />{x}</span>)}</p>
          </div>

          <div className="relative max-w-5xl mx-auto mt-14 md:mt-20">
            <div className="rounded-[2rem] p-[3px] bg-[#0b1120] shadow-[0_40px_100px_-40px_rgba(15,23,42,0.6)]">
              <PortalMockup />
            </div>
          </div>
        </div>
      </section>

      <ProblemSolution />

      {/* Sekmeli özellikler */}
      <section id="ozellikler" className="scroll-mt-24 max-w-6xl mx-auto px-5 pt-24 md:pt-32">
        <div className="text-center max-w-3xl mx-auto">
          <Chip>Modüller</Chip>
          <Heading className="mt-5">Siparişten tahsilata, her adım tek sistemde</Heading>
          <p className="mt-5 text-lg text-slate-600">Ayrı program, ayrı Excel yok. Bir modül seçin, nasıl çalıştığını görün.</p>
        </div>
        <Frame className="mt-12" inner="grid lg:grid-cols-[19rem_minmax(0,1fr)] gap-2 p-2">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible p-2 -mx-1 lg:mx-0">
            {TABS.map((x) => (
              <button key={x.id} onClick={() => setTab(x.id)}
                className={`shrink-0 flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left text-[15px] font-medium transition-all ${tab === x.id ? 'bg-white shadow-[0_8px_25px_-12px_rgba(15,23,42,0.3)] text-slate-950 ring-1 ring-slate-100' : 'text-slate-500 hover:text-slate-900'}`}>
                <x.icon className={`h-5 w-5 shrink-0 ${tab === x.id ? 'text-indigo-600' : ''}`} /> {x.label}
              </button>
            ))}
          </div>
          <div className="rounded-[1.4rem] bg-gradient-to-br from-slate-50 to-indigo-50/60 p-6 md:p-10 grid md:grid-cols-2 gap-8 items-center min-h-[22rem]">
            <div>
              <h3 className="text-2xl md:text-[2rem] font-semibold tracking-[-0.03em] leading-tight text-slate-950">{active.title}</h3>
              <p className="mt-4 text-slate-600 leading-relaxed">{active.text}</p>
              <PrimaryButton to="/kayit" className="mt-7">Ücretsiz deneyin <ArrowRight className="h-4 w-4" /></PrimaryButton>
            </div>
            <div key={active.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500"><active.mock /></div>
          </div>
        </Frame>
      </section>

      <DualView />
      <LiveDemo demo={site?.demo} />
      <FeatureCatalog />
      <Sectors />

      <SetupSteps />

      <Comparison />
      <SavingsCalculator />

      {/* Paketler */}
      {plans.length > 0 && (
        <section id="paketler" className="scroll-mt-24 max-w-6xl mx-auto px-5 pt-24 md:pt-32">
          <div className="text-center">
            <Chip>Paketler</Chip>
            <Heading className="mt-5">İşletmenize uygun paketi seçin</Heading>
            <div className="mt-7 inline-flex items-center gap-3 text-[15px]">
              <button onClick={() => setCycle('MONTHLY')} className={cycle === 'MONTHLY' ? 'font-semibold text-slate-950' : 'text-slate-500'}>Aylık</button>
              <button onClick={() => setCycle(cycle === 'MONTHLY' ? 'YEARLY' : 'MONTHLY')} aria-label="Ödeme dönemini değiştir"
                className={`h-6 w-11 rounded-full p-0.5 transition-colors ${cycle === 'YEARLY' ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${cycle === 'YEARLY' ? 'translate-x-5' : ''}`} />
              </button>
              <button onClick={() => setCycle('YEARLY')} className={cycle === 'YEARLY' ? 'font-semibold text-slate-950' : 'text-slate-500'}>
                Yıllık {yearlyDiscount > 0 && <span className="ml-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">%{yearlyDiscount} avantajlı</span>}
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-500">Fiyatlara KDV dahil değildir. Tüm paketlerde bütün özellikler açıktır; fark yalnızca bayi, ürün ve yönetici sayısındadır.</p>
          <div className={`mt-10 grid gap-5 ${plans.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {plans.map((p, i) => (
              <div key={p.code} className={`rounded-[2rem] border p-2 flex flex-col ${i === 1 ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200/70 bg-white/40'}`}>
                <div className="rounded-[1.6rem] bg-white p-7 flex-1 shadow-[0_10px_40px_-20px_rgba(15,23,42,0.18)]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
                    {i === 1 && <span className="px-3 py-1.5 rounded-xl bg-[#0b0d12] text-white text-xs font-semibold">Popüler</span>}
                  </div>
                  <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-4xl font-semibold tracking-[-0.04em]">{formatTRY(cycle === 'YEARLY' ? p.priceYearly : p.priceMonthly)}</span>
                    <span className="text-slate-500">/{cycle === 'YEARLY' ? 'yıl' : 'ay'} + KDV</span>
                  </p>
                  {p.description && <p className="mt-3 text-slate-500">{p.description}</p>}
                  <ul className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                    {[limitText(p.maxDealers, 'bayi'), limitText(p.maxProducts, 'ürün'), limitText(p.maxAdmins, 'yönetici'), 'Tüm modüller dahil', `${p.trialDays} gün ücretsiz deneme`].map((t) => (
                      <li key={t} className="flex items-center gap-3 text-[15px] text-slate-800"><Check className="h-4 w-4 text-indigo-600 shrink-0" /> {t}</li>
                    ))}
                  </ul>
                </div>
                <Link to={`/kayit?paket=${encodeURIComponent(p.code)}`} className={`mt-2 h-14 rounded-[1.4rem] text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors ${i === 1 ? 'bg-[#0b0d12] text-white hover:bg-black' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}>
                  Bu paketle başla <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-slate-600">Hangi paketin size uygun olduğundan emin değil misiniz? <button type="button" onClick={openChat} className="font-semibold text-indigo-600 hover:underline">Ekibimize yazın</button>, bayi ve ürün sayınıza göre birlikte bakalım.</p>
        </section>
      )}

      {/* SSS */}
      <section id="sss" className="scroll-mt-24 max-w-4xl mx-auto px-5 pt-24 md:pt-32">
        <div className="text-center">
          <Chip>Merak edilenler</Chip>
          <Heading className="mt-5">Sık sorulan sorular</Heading>
        </div>
        <div className="mt-10 space-y-3">
          {FAQ.map(([q, a], i) => {
            const open = faq === i;
            return (
              // Tüm sorular aynı görünür; yalnızca açık olan ince indigo gradyan çerçeve ve hafif zemin alır
              <div key={q} className={`rounded-[1.6rem] p-px transition-all duration-300 ${open ? 'bg-gradient-to-br from-indigo-400/70 via-indigo-200 to-sky-300/70 shadow-[0_20px_50px_-30px_rgba(79,70,229,0.55)]' : 'bg-slate-200/60 shadow-[0_10px_40px_-28px_rgba(15,23,42,0.25)]'}`}>
                <div className={`rounded-[calc(1.6rem-1px)] transition-colors duration-300 ${open ? 'bg-gradient-to-br from-white via-white to-indigo-50/60' : 'bg-white'}`}>
                  <button onClick={() => setFaq(open ? -1 : i)} aria-expanded={open} className="w-full flex items-center gap-4 px-6 md:px-8 py-5 text-left">
                    <span className={`h-8 w-8 shrink-0 rounded-lg text-[13px] font-bold tabular-nums flex items-center justify-center transition-colors duration-300 ${open ? 'bg-gradient-to-br from-indigo-600 to-blue-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{String(i + 1).padStart(2, '0')}</span>
                    <span className="flex-1 text-[17px] font-semibold tracking-tight text-slate-950">{q}</span>
                    <span className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-colors ${open ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-400'}`}>{open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
                  </button>
                  <div className={`grid transition-[grid-template-rows,opacity] duration-300 ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <p className="overflow-hidden px-6 md:px-8 pl-[4.5rem] md:pl-[5rem] text-slate-600 leading-relaxed"><span className="block pb-6">{a}</span></p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Kapanış + alt bilgi */}
      <section className="px-3 md:px-6 pt-24 md:pt-32 pb-3 md:pb-6">
        <div className="max-w-[90rem] mx-auto rounded-[2.5rem] overflow-hidden bg-[#0b1120] p-3 md:p-4">
          <div className="text-center py-20 md:py-24 px-5 text-white bg-[radial-gradient(60%_80%_at_50%_0%,rgba(99,102,241,0.35),transparent_70%)] rounded-[2rem]">
            <h2 className="text-3xl sm:text-4xl lg:text-[3.25rem] font-semibold tracking-[-0.04em] leading-[1.08]">Bayi siparişlerinizi <span className="text-indigo-300">bugün</span> dijitale taşıyın</h2>
            <p className="mt-5 text-lg text-slate-300">Ücretsiz deneyin; beğenmezseniz hiçbir şey ödemezsiniz.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link to="/kayit" className="h-12 px-6 rounded-xl bg-white text-[#0b1120] text-[15px] font-semibold flex items-center gap-2 hover:bg-indigo-50">Ücretsiz başla <ArrowRight className="h-4 w-4" /></Link>
              <button type="button" onClick={openChat} className="h-12 px-4 flex items-center text-[15px] font-semibold text-slate-300 hover:text-white">Ekibimize yazın</button>
            </div>
          </div>
          <SiteFooter company={company} brand={brand} nav={HOME_NAV} />
        </div>
      </section>
      <StickyCta trialDays={trialDays} />
    </div>
  );
};

export default Landing;
