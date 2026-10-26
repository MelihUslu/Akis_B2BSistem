import React, { useEffect, useState } from 'react';
import { Check, ArrowRight, Store, Users, Package, ShieldCheck, Zap, LogIn, MailCheck, Loader2 } from 'lucide-react';
import { publicApi, errorMessage } from '../../services/api';
import { tenantUrl, ROOT_DOMAIN_LABEL } from '../../utils/tenant';
import { formatTRY } from '../../utils/format';

const PLATFORM_NAME = import.meta.env.VITE_PLATFORM_NAME || 'Akis B2B';
const limitText = (n, label) => (n < 0 ? `Sınırsız ${label}` : `${n.toLocaleString('tr-TR')} ${label}`);

const FEATURES = [
  { icon: Store, title: 'Bayiye özel katalog', text: 'İskontolu net fiyat, döviz çevrimi, miktar indirimi, MOQ ve koli katsayısı.' },
  { icon: Users, title: 'Cari ve risk yönetimi', text: 'Risk limiti, ekstre, mutabakat, sanal POS ve vade hatırlatmaları.' },
  { icon: Package, title: 'Parçalı onay ve RMA', text: 'Kalem bazlı onay, stok düşümü, kargo takibi, fotoğraflı iade süreci.' },
  { icon: ShieldCheck, title: 'Firmanıza ait portal', text: 'Kendi alt alan adınız, logonuz ve tamamen ayrılmış verileriniz.' },
];

const Landing = () => {
  const [plans, setPlans] = useState([]);
  const [cycle, setCycle] = useState('MONTHLY');
  const [form, setForm] = useState({ companyName: '', slug: '', name: '', email: '', phone: '', password: '', planCode: '' });
  const [slugState, setSlugState] = useState(null); // { available, message, slug }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [goSlug, setGoSlug] = useState('');

  useEffect(() => {
    publicApi.get('/plans').then((res) => {
      setPlans(res.data);
      setForm((f) => ({ ...f, planCode: f.planCode || res.data[1]?.code || res.data[0]?.code || '' }));
    }).catch(() => {});
  }, []);

  // Firma adından adres önerisi + uygunluk kontrolü (yazmayı bitirince)
  useEffect(() => {
    const value = form.slug || form.companyName;
    if (!value) { setSlugState(null); return; }
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

  const trialDays = plans.find((p) => p.code === form.planCode)?.trialDays ?? 14;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      <header className="max-w-6xl mx-auto px-6 py-6 flex justify-between items-center">
        <span className="text-xl font-black tracking-tighter uppercase">{PLATFORM_NAME}</span>
        <form
          onSubmit={(e) => { e.preventDefault(); if (goSlug.trim()) window.location.href = `${tenantUrl(goSlug.trim().toLowerCase())}/login`; }}
          className="flex items-center gap-2"
        >
          <div className="hidden sm:flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <input className="w-28 outline-none bg-transparent font-semibold text-right" placeholder="firmaniz" value={goSlug} onChange={(e) => setGoSlug(e.target.value)} />
            <span className="text-slate-400">.{ROOT_DOMAIN_LABEL}</span>
          </div>
          <button className="flex items-center px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest"><LogIn className="h-4 w-4 mr-2" /> Giriş</button>
        </form>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-12 pb-20 text-center">
        <p className="inline-flex items-center text-[11px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full mb-6">
          <Zap className="h-3.5 w-3.5 mr-1.5" /> {trialDays} gün ücretsiz deneyin · Kredi kartı gerekmez
        </p>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-tight max-w-3xl mx-auto">
          Bayilerinize <span className="text-indigo-600">7/24 sipariş</span> portalı, dakikalar içinde.
        </h1>
        <p className="text-slate-500 text-lg mt-6 max-w-2xl mx-auto">
          Katalog, iskonto, cari hesap, risk limiti, sipariş onayı ve iade süreçlerini tek bir B2B platformda yönetin.
        </p>
        <a href="#kayit" className="inline-flex items-center mt-10 px-8 py-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-500/30 hover:-translate-y-0.5 transition-all">
          Ücretsiz Başla <ArrowRight className="h-5 w-5 ml-2" />
        </a>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4"><f.icon className="h-5 w-5" /></div>
            <h3 className="font-black text-slate-900">{f.title}</h3>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{f.text}</p>
          </div>
        ))}
      </section>

      {plans.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <div className="flex flex-col items-center mb-10">
            <h2 className="text-3xl font-black tracking-tight">Paketler</h2>
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 mt-5">
              {[['MONTHLY', 'Aylık'], ['YEARLY', 'Yıllık']].map(([id, label]) => (
                <button key={id} onClick={() => setCycle(id)} className={`px-5 py-2 text-xs font-black rounded-lg ${cycle === id ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p, i) => (
              <div key={p.code} className={`bg-white rounded-3xl p-8 border-2 flex flex-col ${i === 1 ? 'border-indigo-500 shadow-2xl shadow-indigo-500/10' : 'border-slate-100'}`}>
                <h3 className="text-xl font-black">{p.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{p.description}</p>
                <p className="text-4xl font-black tracking-tighter mt-6">
                  {formatTRY(cycle === 'YEARLY' ? p.priceYearly : p.priceMonthly)}
                  <span className="text-sm text-slate-400 font-bold">/{cycle === 'YEARLY' ? 'yıl' : 'ay'}</span>
                </p>
                <ul className="space-y-3 mt-6 text-sm font-semibold text-slate-600 flex-1">
                  {[limitText(p.maxDealers, 'bayi'), limitText(p.maxProducts, 'ürün'), limitText(p.maxAdmins, 'yönetici'), 'Tüm modüller dahil', `${p.trialDays} gün ücretsiz deneme`].map((t) => (
                    <li key={t} className="flex items-center"><Check className="h-4 w-4 mr-2 text-emerald-500" /> {t}</li>
                  ))}
                </ul>
                <button onClick={() => selectPlan(p.code)} className={`mt-8 py-3.5 rounded-xl text-xs font-black uppercase tracking-widest ${i === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  Denemeye Başla
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="kayit" className="max-w-xl mx-auto px-6 pb-24">
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl p-8 md:p-10">
          {done ? (
            <div className="text-center space-y-5">
              <MailCheck className="h-14 w-14 mx-auto text-emerald-500" />
              <h2 className="text-2xl font-black">Neredeyse hazır!</h2>
              <p className="text-sm text-slate-500">{done.message}</p>
              <p className="text-sm font-bold">Portal adresiniz: <a className="text-indigo-600" href={done.portalUrl}>{done.portalUrl}</a></p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <h2 className="text-2xl font-black">Portalınızı oluşturun</h2>
                <p className="text-sm text-slate-500 mt-1">{trialDays} gün boyunca tüm özellikler ücretsiz.</p>
              </div>
              <div>
                <label className="premium-label">Firma Adı</label>
                <input required className="premium-input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Örn: Yıldız Hırdavat" />
              </div>
              <div>
                <label className="premium-label">Portal Adresi</label>
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
                  <label className="premium-label">Ad Soyad</label>
                  <input required className="premium-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <label className="premium-label">Telefon</label>
                  <input className="premium-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xx xxx xx xx" />
                </div>
              </div>
              <div>
                <label className="premium-label">İş E-postası</label>
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
              <button type="submit" disabled={submitting || slugState?.available === false} className="w-full btn-gradient py-4 disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Ücretsiz Denemeyi Başlat <ArrowRight className="h-4 w-4 ml-2" /></>}
              </button>
              <p className="text-[11px] text-center text-slate-400">Kayıt olarak hizmet koşullarını kabul etmiş olursunuz.</p>
            </form>
          )}
        </div>
      </section>

      <footer className="text-center text-xs text-slate-400 pb-10">© {new Date().getFullYear()} {PLATFORM_NAME}</footer>
    </div>
  );
};

export default Landing;
