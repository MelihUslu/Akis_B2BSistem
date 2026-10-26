import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Check, CreditCard, AlertTriangle, X, Loader2, CalendarClock } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { useTenant } from '../../context/TenantContext';
import { formatTRY, formatDate } from '../../utils/format';

const limitText = (n) => (n < 0 ? 'Sınırsız' : n.toLocaleString('tr-TR'));

const STATUS_TEXT = {
  TRIAL: 'Deneme sürümü', ACTIVE: 'Aktif', PAST_DUE: 'Ödeme bekleniyor', SUSPENDED: 'Askıya alındı', CANCELLED: 'İptal edildi'
};

const UsageBar = ({ label, used, max }) => {
  const pct = max < 0 ? 0 : Math.min(100, (used / Math.max(max, 1)) * 100);
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1.5">
        <span className="text-gray-600">{label}</span>
        <span className={pct >= 90 ? 'text-red-600' : 'text-gray-900'}>{used} / {limitText(max)}</span>
      </div>
      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${max < 0 ? 4 : pct}%` }} />
      </div>
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

const CheckoutModal = ({ plan, cycle, tenant, onClose, onUpgraded }) => {
  const [form, setForm] = useState({ fullName: '', identityNumber: tenant.taxNumber || '', gsmNumber: tenant.phone || '', city: '', address: tenant.address || '' });
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const start = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/billing/checkout', { planCode: plan.code, billingCycle: cycle, customer: form });
      if (res.data.upgraded) return onUpgraded(res.data.message);
      setContent(res.data.checkoutFormContent);
    } catch (err) {
      setError(errorMessage(err, 'Ödeme başlatılamadı.'));
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="modal-header items-center">
          <div>
            <h3 className="modal-title">{plan.name} · {cycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</h3>
            <p className="text-sm font-bold text-indigo-600">{formatTRY(cycle === 'YEARLY' ? plan.priceYearly : plan.priceMonthly)} <span className="text-gray-400 text-xs">KDV dahil, otomatik yenilenir</span></p>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto">
          {content ? <IyzicoForm content={content} /> : tenant.hasIyzicoSubscription && cycle === tenant.billingCycle ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Kayıtlı kart aboneliğiniz <b>{plan.name}</b> paketine geçirilecek. Üst pakete geçişte yeni paket ücreti hemen kartınızdan çekilir; alt pakete geçiş bir sonraki yenileme tarihinde başlar.</p>
              {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
              <button onClick={start} disabled={loading} className="w-full btn-gradient disabled:opacity-60">{loading ? 'İşleniyor...' : 'Paketi Değiştir'}</button>
            </div>
          ) : (
            <form onSubmit={start} className="space-y-4">
              <p className="text-xs text-gray-500 font-semibold">Fatura bilgileri (iyzico ödeme formu için gereklidir)</p>
              <div><label className="premium-label">Yetkili Ad Soyad</label><input required className="premium-input" value={form.fullName} onChange={set('fullName')} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="premium-label">TCKN / VKN</label><input required inputMode="numeric" className="premium-input" value={form.identityNumber} onChange={set('identityNumber')} /></div>
                <div><label className="premium-label">Cep Telefonu</label><input required className="premium-input" placeholder="05xx xxx xx xx" value={form.gsmNumber} onChange={set('gsmNumber')} /></div>
              </div>
              <div><label className="premium-label">Şehir</label><input required className="premium-input" value={form.city} onChange={set('city')} /></div>
              <div><label className="premium-label">Fatura Adresi</label><textarea required className="premium-input h-20 resize-none" value={form.address} onChange={set('address')} /></div>
              {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
              <button type="submit" disabled={loading} className="w-full btn-gradient disabled:opacity-60">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-4 w-4 mr-2" /> Ödeme Adımına Geç</>}
              </button>
              <p className="text-[10px] text-center text-gray-400">Kart bilgileriniz iyzico güvenli ödeme sayfasında işlenir, bizde saklanmaz.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminSubscriptionPage = () => {
  const [data, setData] = useState(null);
  const [cycle, setCycle] = useState('MONTHLY');
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [params, setParams] = useSearchParams();
  const { alertElement, showAlert, confirm } = useAlert();
  const { refresh: refreshTenant } = useTenant();

  const load = () => api.get('/billing').then((res) => { setData(res.data); setCycle(res.data.tenant.billingCycle); }).catch(() => {});

  useEffect(() => { load(); }, []);

  // iyzico ödeme dönüşü
  useEffect(() => {
    const result = params.get('payment');
    if (!result) return;
    showAlert(result === 'success'
      ? { type: 'success', title: 'Ödeme Başarılı', message: 'Aboneliğiniz aktifleştirildi. Teşekkür ederiz!' }
      : { type: 'error', title: 'Ödeme Tamamlanamadı', message: params.get('message') || 'Lütfen tekrar deneyin.' });
    setParams({}, { replace: true });
    refreshTenant?.();
  }, []);

  if (!data) return <div className="p-10 text-center text-gray-400">Yükleniyor...</div>;

  const { tenant, plan, usage, plans, payments, access, iyzicoEnabled } = data;
  const endDate = tenant.status === 'TRIAL' ? tenant.trialEndsAt : tenant.currentPeriodEnd;

  const cancel = async () => {
    const ok = await confirm({ type: 'warning', title: 'Otomatik yenileme durdurulsun mu?', message: `Mevcut döneminiz (${formatDate(endDate)}) sonuna kadar kullanmaya devam edersiniz. Sonrasında portal kapanır.`, confirmText: 'Durdur' });
    if (!ok) return;
    try {
      const res = await api.post('/billing/cancel');
      showAlert({ type: 'success', title: 'Yenileme Durduruldu', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İşlem yapılamadı.') });
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {alertElement}
      {checkoutPlan && (
        <CheckoutModal plan={checkoutPlan} cycle={cycle} tenant={tenant} onClose={() => setCheckoutPlan(null)}
          onUpgraded={(message) => { setCheckoutPlan(null); showAlert({ type: 'success', title: 'Paket Güncellendi', message }); load(); }} />
      )}

      <div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-amber-500 to-amber-700 p-3.5 rounded-2xl shadow-lg shadow-amber-500/25 shrink-0"><Crown className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Abonelik</h1>
            <p className="text-gray-500 text-sm mt-1">Paketiniz, kullanım limitleriniz ve ödemeleriniz.</p>
          </div>
        </div>
      </div>

      {!access.active && (
        <div className="bg-red-50 border border-red-100 text-red-800 p-5 rounded-3xl flex items-center gap-4">
          <AlertTriangle className="h-6 w-6 flex-shrink-0" />
          <p className="text-sm font-bold">
            {access.reason === 'TRIAL_EXPIRED' ? 'Deneme süreniz sona erdi.' : 'Abonelik süreniz doldu.'} Bayileriniz şu an portala giremiyor. Devam etmek için aşağıdan bir paket seçin.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-premium p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mevcut Paket</p>
              <h2 className="text-3xl font-black text-gray-900">{plan.name}</h2>
              <p className="text-sm font-bold text-gray-500 mt-1">{STATUS_TEXT[tenant.status]} · {tenant.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-end"><CalendarClock className="h-3.5 w-3.5 mr-1" /> {tenant.status === 'TRIAL' ? 'Deneme bitişi' : tenant.cancelAtPeriodEnd ? 'Erişim bitişi' : 'Yenileme'}</p>
              <p className="text-lg font-black text-gray-900">{formatDate(endDate)}</p>
            </div>
          </div>
          <div className="space-y-4">
            <UsageBar label="Bayi" used={usage.dealers} max={plan.maxDealers} />
            <UsageBar label="Ürün" used={usage.products} max={plan.maxProducts} />
            <UsageBar label="Yönetici" used={usage.admins} max={plan.maxAdmins} />
          </div>
          {tenant.hasIyzicoSubscription && !tenant.cancelAtPeriodEnd && (
            <button onClick={cancel} className="text-xs font-black text-red-500 hover:underline">Otomatik yenilemeyi durdur</button>
          )}
        </div>

        <div className="card-premium p-6">
          <h3 className="font-black text-gray-900 mb-4">Ödeme Geçmişi</h3>
          {payments.length === 0 ? <p className="text-sm text-gray-400 font-semibold py-6 text-center">Henüz ödeme yok.</p> : (
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto custom-scrollbar">
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between py-3">
                  <div>
                    <p className="text-xs font-bold text-gray-800">{p.planCode} · {p.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">{formatDate(p.createdAt)}</p>
                  </div>
                  <span className={`text-xs font-black ${p.status === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'}`}>{p.status === 'SUCCESS' ? formatTRY(p.amount) : 'Başarısız'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <h3 className="modal-title">Paketler</h3>
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
          {[['MONTHLY', 'Aylık'], ['YEARLY', 'Yıllık']].map(([id, label]) => (
            <button key={id} onClick={() => setCycle(id)} className={`px-5 py-2 text-xs font-black rounded-lg ${cycle === id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p) => {
          const current = p.code === plan.code && cycle === tenant.billingCycle && tenant.status === 'ACTIVE' && access.active;
          const canPay = iyzicoEnabled && p.onlinePayment[cycle];
          return (
            <div key={p.code} className={`card-premium p-6 flex flex-col ${p.code === plan.code ? 'ring-2 ring-indigo-500' : ''}`}>
              <h4 className="text-lg font-black text-gray-900">{p.name}</h4>
              <p className="text-xs text-gray-500 mt-1">{p.description}</p>
              <p className="text-3xl font-black tracking-tighter mt-4">{formatTRY(cycle === 'YEARLY' ? p.priceYearly : p.priceMonthly)}<span className="text-xs text-gray-400">/{cycle === 'YEARLY' ? 'yıl' : 'ay'}</span></p>
              <ul className="space-y-2 mt-4 text-xs font-semibold text-gray-600 flex-1">
                {[`${limitText(p.maxDealers)} bayi`, `${limitText(p.maxProducts)} ürün`, `${limitText(p.maxAdmins)} yönetici`].map((t) => (
                  <li key={t} className="flex items-center"><Check className="h-4 w-4 mr-2 text-emerald-500" /> {t}</li>
                ))}
              </ul>
              {current ? (
                <span className="mt-6 py-3 rounded-xl bg-gray-100 text-gray-500 text-xs font-black uppercase tracking-widest text-center">Mevcut Paket</span>
              ) : canPay ? (
                <button onClick={() => setCheckoutPlan(p)} className="mt-6 btn-gradient">{p.code === plan.code ? 'Ödeme Yap' : 'Bu Pakete Geç'}</button>
              ) : (
                <p className="mt-6 text-[11px] font-bold text-gray-400 text-center">Bu paket için satış ekibimizle iletişime geçin.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminSubscriptionPage;
