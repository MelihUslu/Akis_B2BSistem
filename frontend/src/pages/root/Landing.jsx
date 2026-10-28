import { useEffect, useState } from 'react';
import {
  ArrowRight, Check, LogIn, MailCheck, Loader2, Menu, X, PlayCircle, Store, ShoppingCart, Plus, Minus,
  LayoutGrid, ClipboardCheck, Wallet, Sparkles, Webhook, RotateCcw, Globe, Coins, CreditCard, Smartphone, Truck, Languages
} from 'lucide-react';
import { publicApi, errorMessage } from '../../services/api';
import { tenantUrl, ROOT_DOMAIN_LABEL } from '../../utils/tenant';
import { formatTRY } from '../../utils/format';
import { Chip, Highlight, Heading, PrimaryButton, Frame, Brackets, IconTile } from './landing/ui';
import { PortalMockup, CatalogMock, ApprovalMock, CreditMock, AiQuoteMock, ErpMock, ReturnMock, StepMock, FloatingOrder, FloatingLimit } from './landing/mockups';

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B';
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL;
const limitText = (n, label) => (n < 0 ? `Sınırsız ${label}` : `${n.toLocaleString('tr-TR')} ${label}`);

const NAV = [['Özellikler', '#ozellikler'], ['Nasıl çalışır', '#adimlar'], ['Paketler', '#paketler'], ['SSS', '#sss']];

const TABS = [
  { id: 'catalog', icon: LayoutGrid, label: 'Bayiye özel katalog', title: 'Her bayi kendi fiyatını görür', text: 'Bayi grubu iskontoları, bayiye özel ve kademeli fiyatlar, miktar indirimi, koli katsayısı ve minimum sipariş. Dövizli ürünler günün kuruyla TL\'ye çevrilir.', mock: CatalogMock },
  { id: 'approval', icon: ClipboardCheck, label: 'Sipariş onayı', title: 'Kalem bazında onay, otomatik stok', text: 'Gelen siparişi kalem kalem onaylayın veya iptal edin. Stok düşer, cari hesaba işlenir, kargo takip numarası bayiye otomatik gider.', mock: ApprovalMock },
  { id: 'credit', icon: Wallet, label: 'Cari, risk ve tahsilat', title: 'Risk limiti aşılmadan sipariş', text: 'Bayi bakiyesi, kullanılabilir limit, vade takibi ve gecikmiş alacaklar tek ekranda. Bayi sanal POS ile kartla öder, ödeme cariye anında yansır.', mock: CreditMock },
  { id: 'ai', icon: Sparkles, label: 'Yapay zekâ ile teklif', title: 'Serbest metinden taslak teklif', text: 'Müşterinin talebini yapıştırın; ürünler katalogdan eşleştirilir, birim çevrimi yapılır, bayinin iskontosuyla fiyatlanır. Göndermeden önce siz onaylarsınız.', mock: AiQuoteMock },
  { id: 'erp', icon: Webhook, label: 'ERP entegrasyonu', title: 'ERP\'nizle konuşan portal', text: 'REST API ile ürün, stok, fiyat ve cari bakiyeleri senkronlayın; yeni siparişler webhook ile ERP\'nize düşsün. Test anahtarıyla canlıya dokunmadan deneyin.', mock: ErpMock },
  { id: 'rma', icon: RotateCcw, label: 'İade / değişim', title: 'Fotoğraflı, takip edilebilir iade', text: 'Bayi sipariş detayından iade ister, fotoğraf ekler. Siz onaylayınca tutar cari hesaba alacak olarak yazılır, stok geri alınır.', mock: ReturnMock },
];

const FEATURES = [
  { icon: Globe, title: 'Kendi alan adınız', text: 'firmaniz.' + ROOT_DOMAIN_LABEL + ' ya da b2b.firmaniz.com; logonuz, renkleriniz.', chips: ['Logo', 'Alt alan adı', 'Özel alan adı'] },
  { icon: Coins, title: 'Dövizli cari', text: 'USD ve EUR fiyatlı ürünler, dövizli cari hesap, TCMB kuru.', chips: ['TL', 'USD', 'EUR'] },
  { icon: CreditCard, title: 'Sanal POS', text: 'Bayi borcunu kartla öder; tahsilat cariye otomatik işlenir.', chips: ['iyzico', 'PayTR'] },
  { icon: Smartphone, title: 'Telefona uygulama', text: 'Bayileriniz portalı telefona yükler, sipariş durumunu bildirimle alır.', chips: ['iOS', 'Android', 'Bildirim'] },
  { icon: Truck, title: 'Kargo ve e-fatura', text: 'Gönderi oluşturma, etiket, takip; e-arşiv ve e-fatura kesimi.', chips: ['Yurtiçi Kargo', 'Paraşüt'] },
  { icon: Languages, title: 'Türkçe ve İngilizce', text: 'Bayi portalı iki dilde; yurt dışı bayileriniz de rahatça sipariş verir.', chips: ['Türkçe', 'English'] },
];

const STEPS = [
  { title: 'Hesabınızı açın', points: ['Firma adınızı ve portal adresinizi seçin.', 'Kredi kartı gerekmez; deneme hemen başlar.'] },
  { title: 'Ürünlerinizi yükleyin', points: ['Excel ile toplu yükleme ya da ERP\'den API ile.', 'Kategori, varyant, döviz ve stok bilgileriyle.'] },
  { title: 'Bayilerinizi ekleyin', points: ['Bayi gruplarını ve iskontoları tanımlayın.', 'Bayiler başvurur ya da siz davet edersiniz.'] },
  { title: 'Sipariş almaya başlayın', points: ['Bayileriniz 7/24 sipariş verir.', 'Onay, sevkiyat ve tahsilatı tek yerden yönetin.'] },
];

const FAQ = [
  ['Kurulum ne kadar sürer?', 'Hesabınız birkaç dakikada açılır. Ürünlerinizi Excel ile yükleyip bayilerinizi ekledikten sonra portal kullanıma hazırdır; teknik bilgi gerekmez.'],
  ['Bayilerim portala nasıl giriş yapar?', 'Her firmanın kendi adresi vardır (firmaniz.' + ROOT_DOMAIN_LABEL + '). Bayileriniz bu adresten e-posta ve şifreyle giriş yapar; telefonlarına uygulama olarak da yükleyebilir.'],
  ['Kendi alan adımı kullanabilir miyim?', 'Evet. Paketiniz destekliyorsa b2b.firmaniz.com gibi kendi alan adınızı bağlayabilirsiniz; sertifika otomatik alınır.'],
  ['ERP ya da muhasebe programımla çalışır mı?', 'REST API ve webhook ile ürün, stok, fiyat, cari bakiye ve siparişleri senkronlayabilirsiniz. E-fatura için Paraşüt entegrasyonu hazırdır.'],
  ['Deneme süresi bitince ne olur?', 'Deneme bitmeden bir paket seçerseniz kesintisiz devam edersiniz. Seçmezseniz verileriniz saklanır ama bayi girişleri paket seçilene kadar durur.'],
  ['Verilerim güvende mi?', 'Her firmanın verisi ayrıdır, başka firma göremez. Veritabanı her gün yedeklenir; hesabınızı kapattığınızda verileriniz KVKK\'ya uygun şekilde silinir.'],
];

const Landing = () => {
  const [plans, setPlans] = useState([]);
  const [cycle, setCycle] = useState('MONTHLY');
  const [form, setForm] = useState({ companyName: '', slug: '', name: '', email: '', phone: '', password: '', planCode: '' });
  const [lastSlugState, setSlugState] = useState(null); // { available, message, slug }
  const slugState = form.slug || form.companyName ? lastSlugState : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [goSlug, setGoSlug] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState(TABS[0].id);
  const [step, setStep] = useState(0);
  const [faq, setFaq] = useState(0);

  useEffect(() => {
    publicApi.get('/plans').then((res) => {
      setPlans(res.data);
      setForm((f) => ({ ...f, planCode: f.planCode || res.data[1]?.code || res.data[0]?.code || '' }));
    }).catch(() => {});
  }, []);

  // Firma adından adres önerisi + uygunluk kontrolü (yazmayı bitirince)
  useEffect(() => {
    const value = form.slug || form.companyName;
    if (!value) return undefined;
    const timer = setTimeout(() => {
      publicApi.get('/slug-available', { params: { slug: value } }).then((res) => setSlugState(res.data)).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [form.slug, form.companyName]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await publicApi.post('/signup', { ...form, slug: slugState?.slug || form.slug });
      setDone(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Kayıt yapılamadı.'));
    } finally {
      setSubmitting(false);
    }
  };

  const selectPlan = (code) => {
    setForm((f) => ({ ...f, planCode: code }));
    document.getElementById('kayit')?.scrollIntoView({ behavior: 'smooth' });
  };
  const goTenant = (e) => {
    e.preventDefault();
    if (goSlug.trim()) window.location.href = `${tenantUrl(goSlug.trim().toLowerCase())}/login`;
  };

  const trialDays = plans.find((p) => p.code === form.planCode)?.trialDays ?? plans[0]?.trialDays ?? 14;
  const active = TABS.find((x) => x.id === tab);
  const yearlyDiscount = plans.length && plans[0].priceMonthly > 0
    ? Math.round((1 - plans[0].priceYearly / (plans[0].priceMonthly * 12)) * 100) : 0;

  // autoFocus yalnızca açılan menüde (alt bilgideki form sayfa açılınca imleci çekmesin)
  const loginForm = (focus = false) => (
    <form onSubmit={goTenant} className="space-y-2">
      <p className="text-xs font-semibold text-slate-500">Firmanızın portal adresi</p>
      <div className="flex items-center h-11 rounded-xl bg-slate-100 px-3 text-sm">
        <input autoFocus={focus} className="flex-1 min-w-0 bg-transparent outline-none font-semibold text-right" placeholder="firmaniz" value={goSlug} onChange={(e) => setGoSlug(e.target.value)} />
        <span className="text-slate-400">.{ROOT_DOMAIN_LABEL}</span>
      </div>
      <button className="w-full h-10 rounded-xl bg-[#0b0d12] text-white text-sm font-semibold flex items-center justify-center gap-2"><LogIn className="h-4 w-4" /> Portala git</button>
    </form>
  );

  return (
    <div className="min-h-screen bg-[#f6f7f8] text-slate-900 antialiased">
      {/* Menü çubuğu */}
      <header className="sticky top-3 z-40 px-3 md:px-6">
        <div className="max-w-6xl mx-auto h-16 flex items-center justify-between gap-4 px-4 md:px-6 rounded-2xl bg-white/90 backdrop-blur border border-white shadow-[0_8px_30px_-15px_rgba(15,23,42,0.25)]">
          <a href="#" className="flex items-center gap-2.5 shrink-0">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-md"><Store className="h-5 w-5 text-white" /></span>
            <span className="text-lg font-semibold tracking-tight">{PLATFORM_NAME}</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium text-slate-700">
            {NAV.map(([l, h]) => <a key={h} href={h} className="hover:text-slate-950">{l}</a>)}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setLoginOpen(!loginOpen)} className="h-10 px-3 text-[15px] font-medium text-slate-700 hover:text-slate-950">Giriş yap</button>
              {loginOpen && <div className="absolute right-0 mt-3 w-72 rounded-2xl bg-white border border-slate-200 shadow-2xl p-4">{loginForm(true)}</div>}
            </div>
            <a href="#kayit" className="h-11 px-5 rounded-xl bg-[#0b0d12] text-white text-[15px] font-semibold flex items-center hover:bg-black">Ücretsiz başla</a>
          </div>
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 -mr-2 text-slate-700" aria-label="Menü">{menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
        </div>
        {menuOpen && (
          <div className="md:hidden max-w-6xl mx-auto mt-2 rounded-2xl bg-white border border-slate-200 shadow-xl p-4 space-y-4">
            <nav className="grid gap-1">{NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setMenuOpen(false)} className="px-3 py-2.5 rounded-xl text-[15px] font-medium hover:bg-slate-50">{l}</a>)}</nav>
            {loginForm()}
            <a href="#kayit" onClick={() => setMenuOpen(false)} className="h-11 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center">Ücretsiz başla</a>
          </div>
        )}
      </header>

      {/* Giriş bölümü */}
      <section className="px-3 md:px-6 -mt-16">
        <div className="relative max-w-[90rem] mx-auto rounded-b-[2.5rem] md:rounded-[2.5rem] overflow-hidden pt-36 md:pt-44 pb-16 md:pb-24 px-5 bg-[radial-gradient(60%_60%_at_20%_80%,rgba(103,232,249,0.35),transparent_70%),radial-gradient(55%_60%_at_80%_20%,rgba(165,180,252,0.55),transparent_70%),linear-gradient(180deg,#eef2ff,#f6f7f8)] border border-white">
          <div className="hidden lg:block absolute left-[6%] top-40"><Brackets><FloatingOrder /></Brackets></div>
          <div className="hidden lg:block absolute right-[9%] top-36"><Brackets><IconTile icon={Store} /></Brackets></div>
          <div className="hidden min-[1400px]:block absolute left-[11%] top-[21.5rem]"><Brackets><IconTile icon={ShoppingCart} from="from-sky-300" to="to-blue-500" /></Brackets></div>
          <div className="hidden min-[1400px]:block absolute right-[5%] top-[23rem]"><Brackets><FloatingLimit /></Brackets></div>

          <div className="relative max-w-3xl mx-auto text-center">
            <Chip>Bayileriniz için B2B sipariş portalı</Chip>
            <h1 className="mt-6 text-[2.6rem] leading-[1.05] sm:text-6xl lg:text-[4.5rem] font-semibold tracking-[-0.045em] text-slate-950">
              Bayi siparişlerini <br className="hidden sm:block" /><Highlight>tek portalda</Highlight> toplayın
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl mx-auto">
              Bayileriniz kendi fiyatlarıyla 7/24 sipariş versin; siz onay, stok, cari hesap ve tahsilatı tek yerden yönetin.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <PrimaryButton href="#kayit">{trialDays} gün ücretsiz deneyin <ArrowRight className="h-4 w-4" /></PrimaryButton>
              <a href="#ozellikler" className="flex items-center gap-2 h-12 px-3 text-[15px] font-semibold text-slate-800 hover:text-slate-950"><PlayCircle className="h-5 w-5" /> Nasıl çalıştığını görün</a>
            </div>
            <p className="mt-5 text-sm text-slate-500">Kredi kartı gerekmez · Dakikalar içinde kurulum</p>
          </div>

          <div className="relative max-w-5xl mx-auto mt-14 md:mt-20">
            <div className="rounded-[2rem] p-[3px] bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 shadow-[0_40px_100px_-40px_rgba(79,70,229,0.55)]">
              <PortalMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Sekmeli özellikler */}
      <section id="ozellikler" className="scroll-mt-24 max-w-6xl mx-auto px-5 pt-24 md:pt-32">
        <div className="text-center max-w-3xl mx-auto">
          <Chip>Akıllı B2B</Chip>
          <Heading className="mt-5">Telefonla, WhatsApp'la sipariş toplamaya <Highlight>son verin</Highlight></Heading>
          <p className="mt-5 text-lg text-slate-600">Bayi ağınızın her adımı için hazır modüller; ayrı program, ayrı Excel yok.</p>
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
              <PrimaryButton href="#kayit" className="mt-7">Ücretsiz deneyin <ArrowRight className="h-4 w-4" /></PrimaryButton>
            </div>
            <div key={active.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500"><active.mock /></div>
          </div>
        </Frame>
      </section>

      {/* Özellik kartları */}
      <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
        <div className="max-w-2xl">
          <Chip>Her şey dahil</Chip>
          <Heading className="mt-5">Bayi ağınızı büyütecek <span className="whitespace-nowrap">her şey</span></Heading>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <Frame key={f.title} inner="p-6 flex flex-col">
              <span className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-100 text-indigo-600 flex items-center justify-center"><f.icon className="h-5 w-5" /></span>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">{f.title}</h3>
              <p className="mt-2 text-slate-600 leading-relaxed flex-1">{f.text}</p>
              <div className="mt-5 flex flex-wrap gap-1.5">{f.chips.map((c) => <span key={c} className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">{c}</span>)}</div>
            </Frame>
          ))}
        </div>
      </section>

      {/* Kurulum adımları */}
      <section id="adimlar" className="scroll-mt-24 px-3 md:px-6 pt-24 md:pt-32">
        <div className="max-w-[90rem] mx-auto rounded-[2.5rem] bg-white py-20 md:py-24 px-5">
          <div className="text-center max-w-3xl mx-auto">
            <Chip>Kolay kurulum</Chip>
            <Heading className="mt-5">Teknik bilgi gerekmeden <br className="hidden md:block" />4 adımda yayında</Heading>
          </div>
          <div className="max-w-6xl mx-auto mt-12 rounded-[2rem] border border-slate-200/80 p-2 grid lg:grid-cols-2 gap-2">
            <div className="rounded-[1.6rem] bg-[#f3f4f7] min-h-[24rem] flex items-center justify-center p-6 md:p-10">
              <div key={step} className="w-full flex justify-center animate-in fade-in zoom-in-95 duration-500"><StepMock step={step} /></div>
            </div>
            <div className="p-3 md:p-6 flex flex-col justify-center gap-2">
              {STEPS.map((s, i) => (
                <button key={s.title} onClick={() => setStep(i)}
                  className={`text-left rounded-2xl px-5 py-4 transition-all ${step === i ? 'bg-white border border-slate-200 shadow-[0_10px_30px_-15px_rgba(15,23,42,0.25)]' : 'hover:bg-slate-50'}`}>
                  <p className="flex items-center gap-3 text-[17px] font-semibold tracking-tight text-slate-950">
                    <span className={`h-7 w-7 rounded-lg text-xs font-black flex items-center justify-center ${step === i ? 'bg-gradient-to-br from-sky-400 to-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                    {s.title}
                  </p>
                  {step === i && <ul className="mt-3 ml-10 space-y-1 text-slate-600 list-disc">{s.points.map((p) => <li key={p}>{p}</li>)}</ul>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Rakamlar (gerçek ürün bilgileri) */}
      <section className="max-w-6xl mx-auto px-5 pt-24 md:pt-32">
        <div className="grid md:grid-cols-3 gap-5 items-start">
          {[
            [`${trialDays} gün`, 'Ücretsiz deneme', 'Tüm modüller açık, kredi kartı istenmez.'],
            ['7/24', 'Bayileriniz sipariş verir', 'Mesai dışında, hafta sonu, telefondan; siparişler sizi bekler.'],
            ['%100', 'Verileriniz sizin', 'Her firmanın verisi ayrıdır; dilediğinizde Excel olarak alırsınız.'],
          ].map(([v, t, d], i) => (
            <div key={t} className={`rounded-[2rem] bg-white text-center px-6 py-10 shadow-[0_10px_40px_-20px_rgba(15,23,42,0.2)] ${i === 1 ? 'md:-mt-6 border-b-[6px] border-indigo-500' : ''}`}>
              <p className="text-6xl font-light tracking-[-0.05em] text-slate-950">{v}</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{t}</p>
              <p className="mt-4 text-slate-500 max-w-[16rem] mx-auto">{d}</p>
            </div>
          ))}
        </div>
      </section>

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
          <div className={`mt-12 grid gap-5 ${plans.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {plans.map((p, i) => (
              <div key={p.code} className={`rounded-[2rem] border p-2 flex flex-col ${i === 1 ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200/70 bg-white/40'}`}>
                <div className="rounded-[1.6rem] bg-white p-7 flex-1 shadow-[0_10px_40px_-20px_rgba(15,23,42,0.18)]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
                    {i === 1 && <span className="px-3 py-1.5 rounded-xl bg-[#0b0d12] text-white text-xs font-semibold">Popüler</span>}
                  </div>
                  <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-4xl font-semibold tracking-[-0.04em]">{formatTRY(cycle === 'YEARLY' ? p.priceYearly : p.priceMonthly)}</span>
                    <span className="text-slate-500">/{cycle === 'YEARLY' ? 'yıl' : 'ay'}</span>
                  </p>
                  {p.description && <p className="mt-3 text-slate-500">{p.description}</p>}
                  <ul className="mt-6 pt-6 border-t border-slate-100 space-y-3">
                    {[limitText(p.maxDealers, 'bayi'), limitText(p.maxProducts, 'ürün'), limitText(p.maxAdmins, 'yönetici'), 'Tüm modüller dahil', `${p.trialDays} gün ücretsiz deneme`].map((t) => (
                      <li key={t} className="flex items-center gap-3 text-[15px] text-slate-800"><Check className="h-4 w-4 text-indigo-600 shrink-0" /> {t}</li>
                    ))}
                  </ul>
                </div>
                <button onClick={() => selectPlan(p.code)} className={`mt-2 h-14 rounded-[1.4rem] text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors ${i === 1 ? 'bg-[#0b0d12] text-white hover:bg-black' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}>
                  Bu paketle başla <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kayıt */}
      <section id="kayit" className="scroll-mt-24 max-w-6xl mx-auto px-5 pt-24 md:pt-32">
        <Frame inner="grid lg:grid-cols-2 gap-2 p-2">
          <div className="rounded-[1.4rem] bg-gradient-to-br from-cyan-50 via-indigo-50 to-violet-100 p-8 md:p-12 flex flex-col items-start justify-center">
            <Chip>Hemen başlayın</Chip>
            <h2 className="mt-5 text-3xl md:text-4xl font-semibold tracking-[-0.04em] leading-tight text-slate-950">Portalınız birkaç dakika içinde hazır</h2>
            <ul className="mt-7 space-y-3.5">
              {[`${trialDays} gün boyunca tüm özellikler ücretsiz`, 'Kredi kartı istenmez', `firmaniz.${ROOT_DOMAIN_LABEL} adresi hemen açılır`, 'Excel ile ürün yükleme, hazır örnek dosya'].map((t) => (
                <li key={t} className="flex items-center gap-3 text-slate-800"><span className="h-6 w-6 rounded-full bg-white shadow flex items-center justify-center"><Check className="h-3.5 w-3.5 text-indigo-600" /></span>{t}</li>
              ))}
            </ul>
          </div>
          <div className="p-6 md:p-10">
            {done ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-5 py-10">
                <MailCheck className="h-14 w-14 text-emerald-500" />
                <h2 className="text-2xl font-semibold tracking-tight">Neredeyse hazır!</h2>
                <p className="text-slate-500">{done.message}</p>
                <p className="font-semibold">Portal adresiniz: <a className="text-indigo-600" href={done.portalUrl}>{done.portalUrl}</a></p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Portalınızı oluşturun</h2>
                  <p className="text-sm text-slate-500 mt-1">{trialDays} gün boyunca tüm özellikler ücretsiz.</p>
                </div>
                <div>
                  <label className="premium-label">Firma adı</label>
                  <input required className="premium-input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Örn: Yıldız Hırdavat" />
                </div>
                <div>
                  <label className="premium-label">Portal adresi</label>
                  <div className="flex items-center bg-gray-50 rounded-2xl pr-4">
                    <input className="premium-input !bg-transparent" value={form.slug} placeholder={slugState?.slug || 'firmaniz'} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                    <span className="text-sm font-bold text-slate-400 whitespace-nowrap">.{ROOT_DOMAIN_LABEL}</span>
                  </div>
                  {slugState && (
                    <p className={`text-[11px] font-bold mt-1.5 ml-1 ${slugState.available ? 'text-emerald-600' : 'text-red-500'}`}>
                      {slugState.available ? `${slugState.slug}.${ROOT_DOMAIN_LABEL} kullanılabilir` : slugState.message}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="premium-label">Ad soyad</label>
                    <input required className="premium-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="premium-label">Telefon</label>
                    <input className="premium-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
                  </div>
                </div>
                <div>
                  <label className="premium-label">İş e-postası</label>
                  <input required type="email" autoComplete="email" className="premium-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="premium-label">Şifre (en az 8 karakter)</label>
                  <input required minLength={8} type="password" autoComplete="new-password" className="premium-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                {plans.length > 0 && (
                  <div>
                    <label className="premium-label">Paket</label>
                    <select className="premium-input" value={form.planCode} onChange={(e) => setForm({ ...form, planCode: e.target.value })}>
                      {plans.map((p) => <option key={p.code} value={p.code}>{p.name} — {formatTRY(p.priceMonthly)}/ay</option>)}
                    </select>
                  </div>
                )}
                {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
                <PrimaryButton type="submit" className="w-full" disabled={submitting || slugState?.available === false}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Ücretsiz denemeyi başlat <ArrowRight className="h-4 w-4" /></>}
                </PrimaryButton>
                {slugState?.available === false && <p className="text-[11px] text-center text-red-500">Başka bir portal adresi seçin.</p>}
                <p className="text-[11px] text-center text-slate-400">Kayıt olarak hizmet koşullarını kabul etmiş olursunuz.</p>
              </form>
            )}
          </div>
        </Frame>
      </section>

      {/* SSS */}
      <section id="sss" className="scroll-mt-24 max-w-4xl mx-auto px-5 pt-24 md:pt-32">
        <div className="text-center">
          <Chip>Merak edilenler</Chip>
          <Heading className="mt-5">Sık sorulan sorular</Heading>
        </div>
        <div className="mt-10 space-y-3">
          {FAQ.map(([q, a], i) => (
            <div key={q} className="rounded-[1.6rem] bg-white shadow-[0_10px_40px_-25px_rgba(15,23,42,0.25)]">
              <button onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i} className="w-full flex items-center gap-4 px-6 md:px-8 py-5 text-left">
                {faq === i ? <Minus className="h-5 w-5 shrink-0 text-indigo-600" /> : <Plus className="h-5 w-5 shrink-0 text-slate-400" />}
                <span className="text-[17px] font-semibold tracking-tight text-slate-950">{i + 1}. {q}</span>
              </button>
              {faq === i && <p className="px-6 md:px-8 pb-6 pl-[3.75rem] md:pl-[4.25rem] text-slate-600 leading-relaxed">{a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Kapanış + alt bilgi */}
      <section className="px-3 md:px-6 pt-24 md:pt-32 pb-3 md:pb-6">
        <div className="max-w-[90rem] mx-auto rounded-[2.5rem] overflow-hidden bg-[radial-gradient(60%_80%_at_0%_100%,rgba(165,180,252,0.6),transparent_70%),radial-gradient(60%_80%_at_100%_0%,rgba(103,232,249,0.45),transparent_70%),linear-gradient(180deg,#f5f7ff,#eef2ff)] p-3 md:p-4">
          <div className="text-center py-20 md:py-24 px-5">
            <Heading>Bayi siparişlerinizi <Highlight>bugün</Highlight> dijitale taşıyın</Heading>
            <p className="mt-5 text-lg text-slate-700">Ücretsiz deneyin; beğenmezseniz hiçbir şey ödemezsiniz.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <PrimaryButton href="#kayit">Ücretsiz başla <ArrowRight className="h-4 w-4" /></PrimaryButton>
              <a href="#paketler" className="h-12 px-3 flex items-center text-[15px] font-semibold text-slate-800 hover:text-slate-950">Paketleri incele</a>
            </div>
          </div>
          <footer className="rounded-[2rem] bg-white px-6 md:px-12 py-12">
            <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
              <div>
                <span className="flex items-center gap-2.5">
                  <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center"><Store className="h-5 w-5 text-white" /></span>
                  <span className="text-xl font-semibold tracking-tight">{PLATFORM_NAME}</span>
                </span>
                <p className="mt-4 text-slate-500 max-w-xs">Üreticiler ve distribütörler için bayi sipariş, cari ve tahsilat platformu.</p>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Ürün</p>
                <ul className="mt-4 space-y-2.5 text-slate-600">{NAV.map(([l, h]) => <li key={h}><a href={h} className="hover:text-slate-950">{l}</a></li>)}</ul>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Başlayın</p>
                <ul className="mt-4 space-y-2.5 text-slate-600">
                  <li><a href="#kayit" className="hover:text-slate-950">Ücretsiz deneme</a></li>
                  <li><a href="#paketler" className="hover:text-slate-950">Paketler</a></li>
                  {SUPPORT_EMAIL && <li><a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-slate-950">{SUPPORT_EMAIL}</a></li>}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-950">Firma girişi</p>
                <div className="mt-4">{loginForm()}</div>
              </div>
            </div>
            <p className="mt-12 pt-6 border-t border-slate-100 text-center text-sm text-slate-500">© {new Date().getFullYear()} {PLATFORM_NAME}. Tüm hakları saklıdır.</p>
          </footer>
        </div>
      </section>
    </div>
  );
};

export default Landing;
