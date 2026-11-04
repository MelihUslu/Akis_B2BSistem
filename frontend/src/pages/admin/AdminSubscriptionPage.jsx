import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Crown, Check, CreditCard, AlertTriangle, X, Loader2, Landmark, Copy, ShieldCheck, Receipt, RefreshCcw, Clock, Phone, Mail, MessageCircle, Sparkles, Pencil, Users, Package, UserCog, FileText, ShoppingBag
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { useTenant } from '../../context/TenantContext';
import { formatTRY, formatDate } from '../../utils/format';
import ModalHeader from '../../components/shared/ModalHeader';

const limitText = (n) => (n < 0 ? 'Sınırsız' : n.toLocaleString('tr-TR'));
const priceOf = (p, cycle) => (cycle === 'YEARLY' ? p.priceYearly : p.priceMonthly);
const yearlySaving = (p) => (p.priceMonthly > 0 && p.priceYearly > 0 ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0);
const daysUntil = (d) => Math.ceil((new Date(d) - Date.now()) / 864e5);
const STATUS_TEXT = { TRIAL: 'Deneme', ACTIVE: 'Aktif', PAST_DUE: 'Ödeme bekleniyor', SUSPENDED: 'Askıda', CANCELLED: 'İptal edildi' };
const STATUS_TONE = { TRIAL: 'bg-amber-100 text-amber-800', ACTIVE: 'bg-emerald-100 text-emerald-800', PAST_DUE: 'bg-red-100 text-red-700', SUSPENDED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-200 text-gray-700' };
const PROFILE_KEYS = ['fullName', 'identityNumber', 'gsmNumber', 'city', 'address'];

const CopyRow = ({ label, value, mono }) => {
  const [done, setDone] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); };
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
        <p className={`text-sm font-bold text-gray-900 break-all ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
      <button type="button" onClick={copy} className={`shrink-0 h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {done ? 'Kopyalandı' : 'Kopyala'}
      </button>
    </div>
  );
};

// iyzico'nun döndürdüğü ödeme formu betiğini sayfaya yerleştirir
const IyzicoForm = ({ content }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '<div id="iyzipay-checkout-form" class="responsive"></div>';
    const tmp = document.createElement('div');
    tmp.innerHTML = content;
    const added = [];
    tmp.querySelectorAll('script').forEach((s) => {
      const script = document.createElement('script');
      if (s.src) script.src = s.src;
      script.text = s.text;
      document.body.appendChild(script);
      added.push(script);
    });
    return () => added.forEach((s) => s.remove());
  }, [content]);
  return <div ref={ref} />;
};

// ─── Satın alma: tek pencere, kart ya da havale ──────────────────────────────

const Checkout = ({ plan, cycle, data, onClose, onDone }) => {
  const { tenant, bank, contact, profile, iyzicoEnabled, transferRef } = data;
  const cardOk = iyzicoEnabled && plan.onlinePayment[cycle];
  const [method, setMethod] = useState(cardOk ? 'CARD' : bank ? 'TRANSFER' : null);
  const [form, setForm] = useState(() => Object.fromEntries(PROFILE_KEYS.map((k) => [k, profile?.[k] || ''])));
  const complete = PROFILE_KEYS.every((k) => String(profile?.[k] || '').trim());
  const [editing, setEditing] = useState(!complete);
  const [sender, setSender] = useState(profile?.fullName || tenant.name);
  const [note, setNote] = useState('');
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const amount = priceOf(plan, cycle);
  const upgrade = cardOk && tenant.hasIyzicoSubscription && cycle === tenant.billingCycle;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (fn) => {
    setLoading(true);
    setError(null);
    try { await fn(); } catch (err) { setError(errorMessage(err, 'İşlem yapılamadı.')); } finally { setLoading(false); }
  };
  const payCard = (e) => {
    e?.preventDefault();
    run(async () => {
      const res = await api.post('/billing/checkout', { planCode: plan.code, billingCycle: cycle, customer: form });
      if (res.data.upgraded) return onDone({ title: 'Paket güncellendi', message: res.data.message });
      setContent(res.data.checkoutFormContent);
    });
  };
  const notify = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post('/billing/transfer', { planCode: plan.code, billingCycle: cycle, senderName: sender, note });
      onDone({ title: 'Bildiriminiz alındı', message: res.data.message });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[94vh] rounded-none sm:rounded-[1.75rem] flex flex-col">
        <ModalHeader icon={ShoppingBag} title={`${plan.name} · ${cycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}`} subtitle="Satın al" onClose={onClose} />

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Sipariş özeti */}
          <div className="rounded-2xl bg-gray-50 p-4 flex items-end justify-between gap-3">
            <div className="text-xs text-gray-500 space-y-0.5">
              <p>{limitText(plan.maxDealers)} bayi · {limitText(plan.maxProducts)} ürün · {limitText(plan.maxAdmins)} yönetici</p>
              <p>{method === 'TRANSFER' ? `${cycle === 'YEARLY' ? '1 yıl' : '1 ay'} kullanım; süre bitmeden hatırlatırız` : `Her ${cycle === 'YEARLY' ? 'yıl' : 'ay'} otomatik yenilenir, istediğiniz zaman durdurursunuz`}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-black text-gray-900 tabular-nums">{formatTRY(amount)}</p>
              <p className="text-[11px] text-gray-400 font-semibold">KDV dahil</p>
            </div>
          </div>

          {content ? <IyzicoForm content={content} /> : <>
            {/* Ödeme yöntemi */}
            {cardOk && bank && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-2xl">
                {[['CARD', 'Kartla öde', 'Anında aktif', CreditCard], ['TRANSFER', 'Havale / EFT', 'Onaydan sonra aktif', Landmark]].map(([id, label, sub, Icon]) => (
                  <button key={id} type="button" onClick={() => { setMethod(id); setError(null); }}
                    className={`rounded-xl px-3 py-2.5 text-left flex items-center gap-2.5 ${method === id ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
                    <Icon className={`h-5 w-5 shrink-0 ${method === id ? 'text-brand-600' : ''}`} />
                    <span><span className="block text-sm font-black text-gray-900">{label}</span><span className="block text-[11px] text-gray-500">{sub}</span></span>
                  </button>
                ))}
              </div>
            )}

            {method === 'CARD' && (upgrade ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Kayıtlı kartınızdaki abonelik <b>{plan.name}</b> paketine geçirilir. Üst pakete geçişte yeni ücret hemen kartınızdan çekilir; alt pakete geçiş bir sonraki yenilemede başlar.</p>
                {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
                <button onClick={payCard} disabled={loading} className="w-full btn-gradient h-12 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Paketi değiştir'}</button>
              </div>
            ) : (
              <form onSubmit={payCard} className="space-y-4">
                {editing ? (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500">Fatura bilgileri <span className="font-semibold text-gray-400">· bir kez girersiniz, sonraki ödemelerde hazır gelir</span></p>
                    <div><label className="premium-label">Ad soyad / yetkili</label><input required className="premium-input" value={form.fullName} onChange={set('fullName')} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="premium-label">TCKN / VKN</label><input required inputMode="numeric" className="premium-input" value={form.identityNumber} onChange={set('identityNumber')} /></div>
                      <div><label className="premium-label">Cep telefonu</label><input required inputMode="tel" className="premium-input" placeholder="05xx xxx xx xx" value={form.gsmNumber} onChange={set('gsmNumber')} /></div>
                    </div>
                    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
                      <div><label className="premium-label">Şehir</label><input required className="premium-input" value={form.city} onChange={set('city')} /></div>
                      <div><label className="premium-label">Fatura adresi</label><input required className="premium-input" value={form.address} onChange={set('address')} /></div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl ring-1 ring-gray-100 p-4 flex items-start justify-between gap-3">
                    <div className="text-sm min-w-0">
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Fatura bilgileri</p>
                      <p className="font-bold text-gray-900 truncate">{form.fullName} · {form.identityNumber}</p>
                      <p className="text-xs text-gray-500 truncate">{form.address}, {form.city} · {form.gsmNumber}</p>
                    </div>
                    <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-black text-brand-600 flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Değiştir</button>
                  </div>
                )}
                {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
                <button type="submit" disabled={loading} className="w-full btn-gradient h-12 text-base disabled:opacity-60">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CreditCard className="h-4 w-4 mr-2" /> {formatTRY(amount)} öde</>}
                </button>
                <p className="text-[11px] text-center text-gray-400 flex items-center justify-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Kart bilgileriniz iyzico güvenli ödeme sayfasında işlenir, bizde saklanmaz.</p>
              </form>
            ))}

            {method === 'TRANSFER' && bank && (
              <form onSubmit={notify} className="space-y-4">
                <div className="rounded-2xl ring-1 ring-gray-100 px-4 divide-y divide-gray-50">
                  <CopyRow label="IBAN" value={bank.iban} mono />
                  <CopyRow label="Alıcı" value={bank.accountName} />
                  {bank.bankName && <div className="py-2.5"><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Banka</p><p className="text-sm font-bold text-gray-900">{bank.bankName}</p></div>}
                  <CopyRow label="Tutar" value={formatTRY(amount)} />
                  <CopyRow label="Açıklamaya yazın" value={`${transferRef}-${plan.code}`} mono />
                </div>
                {bank.note && <p className="text-xs text-gray-500">{bank.note}</p>}
                <div>
                  <label className="premium-label">Gönderen (hesap sahibi)</label>
                  <input required minLength={3} className="premium-input" value={sender} onChange={(e) => setSender(e.target.value)} />
                </div>
                <div>
                  <label className="premium-label">Not (isteğe bağlı)</label>
                  <input className="premium-input" placeholder="Dekont no, gönderim tarihi…" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
                <button type="submit" disabled={loading} className="w-full btn-gradient h-12 text-base disabled:opacity-60">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-4 w-4 mr-2" /> Havaleyi yaptım, bildir</>}
                </button>
                <p className="text-[11px] text-center text-gray-400">Ödeme hesabımıza geçince aboneliğiniz aktifleşir ve size bildirim gelir (genellikle aynı iş günü).</p>
              </form>
            )}

            {!method && (
              <div className="space-y-3 text-sm text-gray-600">
                <p>Bu paket için online ödeme şu an açık değil. Bize ulaşın, hemen aktifleştirelim:</p>
                <div className="flex flex-wrap gap-2">
                  {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="h-10 px-3 rounded-xl bg-gray-900 text-white text-xs font-black flex items-center gap-1.5"><Phone className="h-4 w-4" /> {contact.phone}</a>}
                  {contact.whatsapp && <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '').replace(/^0/, '90')}`} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
                  {contact.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`${plan.name} paketi`)}`} className="h-10 px-3 rounded-xl bg-white ring-1 ring-gray-200 text-gray-800 text-xs font-black flex items-center gap-1.5"><Mail className="h-4 w-4" /> {contact.email}</a>}
                </div>
              </div>
            )}
          </>}
        </div>
      </div>
    </div>
  );
};

// ─── Sayfa ───────────────────────────────────────────────────────────────────

const AdminSubscriptionPage = () => {
  const [data, setData] = useState(null);
  const [cycle, setCycle] = useState('MONTHLY');
  const [buying, setBuying] = useState(null);
  const [tab, setTab] = useState('subscription');
  const [params, setParams] = useSearchParams();
  const { alertElement, showAlert, confirm } = useAlert();
  const { refresh: refreshTenant } = useTenant();

  const load = () => api.get('/billing').then((res) => {
    setData(res.data);
    if (res.data.tenant.status === 'ACTIVE') setCycle(res.data.tenant.billingCycle);
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  // iyzico ödeme dönüşü
  useEffect(() => {
    const result = params.get('payment');
    if (!result) return;
    showAlert(result === 'success'
      ? { type: 'success', title: 'Ödeme başarılı', message: 'Aboneliğiniz aktifleştirildi. Teşekkür ederiz!' }
      : { type: 'error', title: 'Ödeme tamamlanamadı', message: params.get('message') || 'Lütfen tekrar deneyin.' });
    setParams({}, { replace: true });
    refreshTenant?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="p-10 text-center text-gray-400">Yükleniyor...</div>;

  const { tenant, plan, usage, plans, payments, access, transfer } = data;
  const endDate = tenant.status === 'TRIAL' ? tenant.trialEndsAt : tenant.currentPeriodEnd;
  const left = endDate ? daysUntil(endDate) : null;
  const paidActive = tenant.status === 'ACTIVE' && access.active;
  const maxSaving = Math.max(0, ...plans.map(yearlySaving));
  const planName = (code) => plans.find((x) => x.code === code)?.name || (code === plan.code ? plan.name : code);
  const usageRows = [['Bayi', Users, usage.dealers, plan.maxDealers], ['Ürün', Package, usage.products, plan.maxProducts], ['Yönetici', UserCog, usage.admins, plan.maxAdmins]];
  const nearLimit = usageRows.some(([, , used, max]) => max > 0 && used / max >= 0.9);
  const featuredCode = paidActive ? plan.code : (plans[Math.min(1, plans.length - 1)]?.code);

  const cancelRenewal = async () => {
    if (!(await confirm({ type: 'warning', title: 'Otomatik yenileme durdurulsun mu?', message: `Mevcut döneminizin sonuna (${formatDate(endDate)}) kadar kullanmaya devam edersiniz.`, confirmText: 'Durdur' }))) return;
    try {
      const res = await api.post('/billing/cancel');
      showAlert({ type: 'success', title: 'Yenileme durduruldu', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İşlem yapılamadı.') });
    }
  };
  const cancelTransfer = async () => {
    try {
      await api.delete(`/billing/transfer/${transfer.id}`);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İptal edilemedi.') });
    }
  };

  // Duruma göre üst bant: deneme süresi, süresi dolmuş, yenileme durdurulmuş
  const banner = !access.active
    ? { tone: 'bg-red-50 ring-red-100 text-red-900', icon: AlertTriangle, text: `${access.reason === 'TRIAL_EXPIRED' ? 'Deneme süreniz sona erdi' : 'Aboneliğinizin süresi doldu'}. Bayileriniz şu an portala giremiyor; paketinizi seçin, ödeme sonrası hemen açılır.` }
    : tenant.status === 'TRIAL'
      ? { tone: 'bg-amber-50 ring-amber-100 text-amber-900', icon: Clock, text: `Deneme sürenizin bitmesine ${left > 0 ? `${left} gün` : 'bugün'} kaldı (${formatDate(endDate)}). Şimdi paketinizi seçin, kesintisiz devam edin.` }
      : tenant.cancelAtPeriodEnd
        ? { tone: 'bg-amber-50 ring-amber-100 text-amber-900', icon: Clock, text: `Otomatik yenileme kapalı; erişiminiz ${formatDate(endDate)} tarihinde biter. Devam etmek için paketinizi yenileyin.` }
        : null;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {alertElement}
      {buying && <Checkout plan={buying} cycle={cycle} data={data} onClose={() => setBuying(null)}
        onDone={({ title, message }) => { setBuying(null); showAlert({ type: 'success', title, message }); load(); refreshTenant?.(); }} />}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><Crown className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Abonelik</h1>
            <p className="text-gray-500 text-sm mt-1">
              <b className="text-gray-800">{plan.name}</b> · {STATUS_TEXT[tenant.status]}{endDate && ` · ${tenant.status === 'TRIAL' ? 'deneme bitişi' : tenant.cancelAtPeriodEnd ? 'erişim bitişi' : 'yenileme'} ${formatDate(endDate)}`}
            </p>
          </div>
        </div>
      </div>

      {banner && (
        <div className={`flex items-start gap-3 rounded-2xl ring-1 px-5 py-4 text-sm font-semibold ${banner.tone}`}>
          <banner.icon className="h-5 w-5 shrink-0 mt-0.5" /> <span>{banner.text}</span>
        </div>
      )}

      {transfer?.status === 'PENDING' && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-50 ring-1 ring-brand-100 px-5 py-4 text-sm text-brand-900">
          <Landmark className="h-5 w-5 shrink-0" />
          <span className="flex-1 min-w-0"><b>Havale bildiriminiz alındı</b> · {plans.find((x) => x.code === transfer.planCode)?.name || transfer.planCode} {transfer.billingCycle === 'YEARLY' ? 'yıllık' : 'aylık'} · {formatTRY(transfer.amount)} · {formatDate(transfer.createdAt, true)}. Ödeme hesabımıza geçince aboneliğiniz aktifleşir.</span>
          <button onClick={cancelTransfer} className="text-xs font-black text-brand-700 hover:underline">Bildirimi iptal et</button>
        </div>
      )}
      {transfer?.status === 'REJECTED' && (
        <div className="flex items-start gap-3 rounded-2xl bg-red-50 ring-1 ring-red-100 px-5 py-4 text-sm text-red-900">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <span><b>Havale bildiriminiz onaylanmadı:</b> {transfer.rejectReason} Dekontu kontrol edip aşağıdan tekrar bildirebilirsiniz.</span>
        </div>
      )}

      {/* Paketler */}
      <section className="space-y-6">
        <div className="text-center space-y-3">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">{paidActive ? 'Paketiniz' : 'Paketinizi seçin'}</h2>
          <div className="inline-flex items-center p-1 rounded-2xl bg-gray-100">
            {[['MONTHLY', 'Aylık'], ['YEARLY', 'Yıllık']].map(([id, label]) => (
              <button key={id} onClick={() => setCycle(id)} className={`h-10 px-5 rounded-xl text-sm font-black flex items-center gap-2 ${cycle === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                {label}{id === 'YEARLY' && maxSaving > 0 && <span className="rounded-md bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[11px]">%{maxSaving}'e varan indirim</span>}
              </button>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-5 ${plans.length >= 3 ? 'md:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'max-w-md mx-auto'}`}>
          {plans.map((p) => {
            const isCurrent = p.code === plan.code && paidActive && cycle === tenant.billingCycle;
            const featured = p.code === featuredCode;
            const saving = cycle === 'YEARLY' ? yearlySaving(p) : 0;
            return (
              <div key={p.code} className={`relative rounded-[1.75rem] p-6 flex flex-col bg-white ${featured ? 'ring-2 ring-brand-500 shadow-xl shadow-brand-500/10' : 'ring-1 ring-gray-100 shadow-sm'}`}>
                {featured && !isCurrent && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white flex items-center gap-1"><Sparkles className="h-3 w-3" /> Önerilen</span>}
                {isCurrent && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white">Mevcut paketiniz</span>}
                <h3 className="text-lg font-black text-gray-900">{p.name}</h3>
                {p.description && <p className="text-xs text-gray-500 mt-1 min-h-8">{p.description}</p>}
                <div className="mt-5">
                  <p className="flex items-baseline gap-1"><span className="text-4xl font-black tracking-tighter text-gray-900 tabular-nums">{formatTRY(priceOf(p, cycle))}</span><span className="text-sm font-bold text-gray-400">/{cycle === 'YEARLY' ? 'yıl' : 'ay'}</span></p>
                  <p className="mt-1 text-xs font-semibold text-gray-500 min-h-4">
                    {cycle === 'YEARLY' ? <>Aylık {formatTRY(p.priceYearly / 12)}'ye denk{saving > 0 && <span className="ml-1.5 text-emerald-700 font-black">· %{saving} tasarruf</span>}</> : 'KDV dahil'}
                  </p>
                </div>
                <ul className="space-y-2.5 mt-5 text-sm text-gray-700 flex-1">
                  {[`${limitText(p.maxDealers)} bayi`, `${limitText(p.maxProducts)} ürün`, `${limitText(p.maxAdmins)} yönetici`].map((t) => (
                    <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0" /> {t}</li>
                  ))}
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 shrink-0" /> Tüm modüller (sipariş, cari, teklif, raporlar)</li>
                  <li className={`flex items-center gap-2 ${p.allowCustomDomain ? '' : 'text-gray-400'}`}>
                    {p.allowCustomDomain ? <Check className="h-4 w-4 text-emerald-600 shrink-0" /> : <X className="h-4 w-4 shrink-0" />} Kendi alan adınız
                  </li>
                </ul>
                <button disabled={isCurrent || transfer?.status === 'PENDING'} onClick={() => setBuying(p)}
                  className={`mt-6 h-12 rounded-2xl text-sm font-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${featured ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg shadow-brand-600/25' : 'bg-gray-900 text-white hover:bg-navy-950'}`}>
                  {isCurrent ? 'Kullanıyorsunuz' : paidActive && p.code !== plan.code ? 'Bu pakete geç' : paidActive ? `${cycle === 'YEARLY' ? 'Yıllığa' : 'Aylığa'} geç` : 'Satın al'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-semibold text-gray-500">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Güvenli ödeme</span>
          <span className="flex items-center gap-1.5"><RefreshCcw className="h-4 w-4 text-emerald-600" /> İstediğiniz zaman iptal</span>
          <span className="flex items-center gap-1.5"><Receipt className="h-4 w-4 text-emerald-600" /> Faturanız otomatik kesilir</span>
        </div>
      </section>

      {/* Aboneliğim / Kullanım / Ödemeler: tek kartta sekmeler */}
      <section className="card-premium overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex w-full sm:w-auto p-1 rounded-xl bg-gray-100" role="tablist">
            {[['subscription', 'Aboneliğim', Crown], ['usage', 'Kullanım', Users], ['payments', 'Ödemeler', Receipt]].map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`h-8 flex-1 sm:flex-none justify-center px-2.5 sm:px-3 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors ${tab === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
                {id === 'payments' && payments.length > 0 && <span className="rounded bg-gray-200 px-1 text-[11px] text-gray-600">{payments.length}</span>}
                {id === 'usage' && nearLimit && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="Sınıra yakın" />}
              </button>
            ))}
          </div>
          <span className={`hidden sm:inline rounded-full px-2.5 py-1 text-[11px] font-black ${STATUS_TONE[tenant.status] || 'bg-gray-100 text-gray-600'}`}>{plan.name} · {STATUS_TEXT[tenant.status]}</span>
        </div>

        <div className="p-4 sm:p-5">
          {tab === 'subscription' && (
            <>
              <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['Paket', plan.name],
                  [tenant.status === 'TRIAL' ? 'Deneme bitişi' : tenant.cancelAtPeriodEnd || !tenant.hasIyzicoSubscription ? 'Bitiş' : 'Yenileme', endDate ? <>{formatDate(endDate)}{left != null && left >= 0 && <span className="ml-1 text-[11px] font-bold text-gray-400">({left} gün)</span>}</> : '—'],
                  ['Ödeme', tenant.status === 'TRIAL' ? 'Ücretsiz deneme' : `${tenant.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'} · ${tenant.hasIyzicoSubscription ? 'kart' : 'havale / elle'}`],
                  ['Yenileme şekli', tenant.status === 'TRIAL' ? 'Paket seçilince' : tenant.hasIyzicoSubscription && !tenant.cancelAtPeriodEnd ? 'Otomatik (kart)' : 'Elle; hatırlatılır']
                ].map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-gray-50 px-3.5 py-3">
                    <dt className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{k}</dt>
                    <dd className="mt-0.5 text-sm font-black text-gray-900">{v}</dd>
                  </div>
                ))}
              </dl>
              {tenant.hasIyzicoSubscription && !tenant.cancelAtPeriodEnd && (
                <button onClick={cancelRenewal} className="mt-4 text-xs font-bold text-gray-400 hover:text-red-600">Otomatik yenilemeyi durdur</button>
              )}
            </>
          )}

          {tab === 'usage' && (
            <div className="grid gap-4 sm:grid-cols-3">
              {usageRows.map(([label, Icon, used, max]) => {
                const unlimited = max < 0;
                const pct = unlimited ? 0 : Math.min(100, (used / Math.max(max, 1)) * 100);
                const tone = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-500';
                return (
                  <div key={label} className="rounded-2xl bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><Icon className="h-4 w-4 text-brand-500" /> {label}</span>
                      <span className="text-xs tabular-nums"><b className="text-gray-900">{used.toLocaleString('tr-TR')}</b> <span className="text-gray-400">/ {limitText(max)}</span></span>
                    </div>
                    <div className="mt-3 h-1.5 rounded-full bg-white overflow-hidden">
                      {!unlimited && <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(pct, 2)}%` }} />}
                    </div>
                    <p className={`mt-2 text-[11px] font-semibold ${pct >= 90 ? 'text-red-600' : 'text-gray-400'}`}>
                      {unlimited ? 'Sınırsız' : max - used > 0 ? `${(max - used).toLocaleString('tr-TR')} hakkınız kaldı` : 'Sınıra ulaştınız; üst pakete geçin'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'payments' && (payments.length === 0 ? (
            <div className="flex flex-col items-center text-center py-8">
              <span className="h-11 w-11 rounded-2xl bg-gray-50 flex items-center justify-center"><Receipt className="h-5 w-5 text-gray-300" /></span>
              <p className="mt-3 text-sm font-bold text-gray-600">Henüz ödeme yok</p>
              <p className="mt-1 text-xs text-gray-400">İlk ödemenizden sonra ödemeleriniz ve faturalarınız burada listelenir.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50 max-h-80 overflow-y-auto -mx-2">
              {payments.map((p) => {
                const ok = p.status === 'SUCCESS';
                const method = p.method === 'IYZICO' ? 'Kart' : p.reference?.startsWith('transfer:') ? 'Havale' : 'Elle kayıt';
                return (
                  <li key={p.id} className="flex items-center gap-3 px-2 py-2.5">
                    <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{planName(p.planCode)} · {p.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</p>
                      <p className="text-[11px] text-gray-400 truncate">{formatDate(p.createdAt)} · {method}{ok && p.periodEnd && ` · ${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-black tabular-nums ${ok ? 'text-gray-900' : 'text-red-600'}`}>{ok ? formatTRY(p.amount) : 'Başarısız'}</p>
                      {p.invoiceStatus === 'ISSUED' ? (
                        <button onClick={() => api.get(`/billing/payments/${p.id}/invoice`).then((r) => window.open(r.data.url, '_blank', 'noopener')).catch(() => showAlert({ type: 'error', title: 'Fatura', message: 'Fatura açılamadı.' }))}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:underline"><FileText className="h-3 w-3" /> Fatura</button>
                      ) : ok && p.invoiceStatus === 'PENDING' ? <p className="text-[11px] font-semibold text-gray-400">Fatura hazırlanıyor</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminSubscriptionPage;
