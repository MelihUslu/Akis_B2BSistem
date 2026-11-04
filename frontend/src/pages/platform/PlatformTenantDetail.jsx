import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Save, Wallet, KeyRound, Ban, PlayCircle, UserCog, Download, Trash2, RotateCcw, Globe } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate, formatTRY, localDate } from '../../utils/format';
import { StatusPill, TENANT_STATUS, limitLabel } from './shared';
import { downloadFile } from '../../utils/download';
import AuditLogTable from '../../components/shared/AuditLogTable';

const toInputDate = (d) => (d ? localDate(d) : '');

const PlatformTenantDetail = () => {
  const { id } = useParams();
  const [tenant, setTenant] = useState(null);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(null);
  const [payment, setPayment] = useState({ planCode: '', billingCycle: 'MONTHLY', amount: '', reference: '', note: '' });
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => Promise.all([platformApi.get(`/tenants/${id}`), platformApi.get('/plans')]).then(([t, p]) => {
    setTenant(t.data);
    setPlans(p.data.plans);
    setForm({
      name: t.data.name, contactEmail: t.data.contactEmail, phone: t.data.phone || '', taxNumber: t.data.taxNumber || '',
      status: t.data.status, planCode: t.data.plan.code, billingCycle: t.data.billingCycle,
      trialEndsAt: toInputDate(t.data.trialEndsAt), currentPeriodEnd: toInputDate(t.data.currentPeriodEnd), notes: t.data.notes || ''
    });
    setPayment((pm) => ({ ...pm, planCode: t.data.plan.code, billingCycle: t.data.billingCycle }));
  });

  useEffect(() => { load().catch(() => {}); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tenant || !form) return <div className="text-center text-gray-400 py-20">Yükleniyor...</div>;

  const save = async (patch = form) => {
    try {
      const res = await platformApi.patch(`/tenants/${id}`, patch);
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Kaydedilemedi.') });
    }
  };

  const setStatus = async (status) => {
    const ok = await confirm({
      type: status === 'SUSPENDED' ? 'warning' : 'info',
      title: status === 'SUSPENDED' ? 'Müşteri askıya alınsın mı?' : 'Müşteri aktifleştirilsin mi?',
      message: status === 'SUSPENDED' ? 'Firmanın yöneticileri ve bayileri sisteme giremez. Veriler silinmez.' : 'Erişim, abonelik / deneme tarihlerine göre yeniden açılır.',
      confirmText: status === 'SUSPENDED' ? 'Askıya Al' : 'Aktifleştir'
    });
    if (ok) save({ status: status === 'SUSPENDED' ? 'SUSPENDED' : (tenant.currentPeriodEnd ? 'ACTIVE' : 'TRIAL') });
  };

  const addPayment = async (e) => {
    e.preventDefault();
    try {
      const res = await platformApi.post(`/tenants/${id}/payments`, payment);
      setPayment({ ...payment, amount: '', reference: '', note: '' });
      showAlert({ type: 'success', title: 'Ödeme Kaydedildi', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Ödeme kaydedilemedi.') });
    }
  };

  const resetAdmin = async (admin) => {
    const ok = await confirm({ title: 'Şifre sıfırlansın mı?', message: `${admin.email} için yeni şifre üretilip e-posta ile gönderilecek.`, confirmText: 'Sıfırla' });
    if (!ok) return;
    try {
      const res = await platformApi.post(`/tenants/${id}/admins/${admin.id}/reset-password`);
      showAlert({ type: res.data.message.includes('gönderilemedi') ? 'warning' : 'success', title: 'Şifre Sıfırlandı', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Şifre sıfırlanamadı.') });
    }
  };

  // Destek için firma sahibinin yetkisiyle 1 saatlik oturum; yeni sekmede firmanın portalı açılır
  const impersonate = async () => {
    const ok = await confirm({
      type: 'warning', title: 'Müşteri olarak giriş yapılsın mı?',
      message: 'Firma sahibinin yetkileriyle 1 saatlik destek oturumu açılır. Firma sahibine bildirim gider ve yaptığınız her işlem firmanın işlem kaydında "destek oturumu" olarak görünür.',
      confirmText: 'Giriş Yap'
    });
    if (!ok) return;
    try {
      const res = await platformApi.post(`/tenants/${id}/impersonate`);
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Oturum açılamadı.') });
    }
  };

  const exportData = () => downloadFile(`/tenants/${id}/export`, {}, `${tenant.slug}-tum-veriler.xlsx`, platformApi)
    .catch((err) => showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Dışa aktarılamadı.') }));

  const reopen = async () => {
    try {
      const res = await platformApi.post(`/tenants/${id}/reopen`);
      showAlert({ type: 'success', title: 'Geri Açıldı', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Açılamadı.') });
    }
  };

  const purge = async () => {
    const typed = window.prompt(`Bu işlem GERİ ALINAMAZ. ${tenant.name} firmasının tüm ürün, bayi, sipariş ve finans verisi silinecek.\n\nOnaylamak için müşteri adresini yazın: ${tenant.slug}`);
    if (typed === null) return;
    try {
      const res = await platformApi.post(`/tenants/${id}/purge`, { confirm: typed, force: !tenant.closedAt });
      showAlert({ type: 'success', title: 'Silindi', message: res.data.message });
      setTimeout(() => { window.location.href = '/tenants'; }, 1500);
    } catch (err) {
      showAlert({ type: 'error', title: 'Silinemedi', message: errorMessage(err, 'Silinemedi.') });
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const selectedPlan = plans.find((p) => p.code === payment.planCode);
  const suggested = selectedPlan ? (payment.billingCycle === 'YEARLY' ? selectedPlan.priceYearly : selectedPlan.priceMonthly) : 0;

  return (
    <div className="space-y-8 max-w-6xl">
      {alertElement}
      <Link to="/tenants" className="inline-flex items-center text-xs font-black text-gray-400 hover:text-brand-600"><ArrowLeft className="h-4 w-4 mr-2" /> Müşteriler</Link>

      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{tenant.name}</h1>
            <StatusPill status={tenant.status} access={tenant.access} />
          </div>
          <a href={tenant.url} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm font-bold text-brand-600 mt-1">{tenant.url} <ExternalLink className="h-3.5 w-3.5 ml-1" /></a>
          <p className="text-xs text-gray-400 font-semibold mt-1">{tenant.signupSource === 'SELF' ? 'Kendi kayıt oldu' : 'Platformdan açıldı'} · {formatDate(tenant.createdAt)}{tenant.iyzicoSubscriptionRef && ' · iyzico aboneliği aktif'}{tenant.cancelAtPeriodEnd && ' · Yenileme iptal edildi'}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={impersonate} className="flex items-center px-4 py-2.5 rounded-xl bg-brand-50 text-brand-700 text-xs font-black"><UserCog className="h-4 w-4 mr-2" /> Müşteri Olarak Giriş</button>
          {tenant.status === 'SUSPENDED' ? (
            <button onClick={() => setStatus('ACTIVE')} className="flex items-center px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-black"><PlayCircle className="h-4 w-4 mr-2" /> Aktifleştir</button>
          ) : (
            <button onClick={() => setStatus('SUSPENDED')} className="flex items-center px-4 py-2.5 rounded-xl bg-red-50 text-red-600 text-xs font-black"><Ban className="h-4 w-4 mr-2" /> Askıya Al</button>
          )}
        </div>
      </div>

      {tenant.closedAt && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex flex-wrap justify-between items-center gap-4">
          <p className="text-sm font-bold text-red-700">
            Müşteri hesabını {formatDate(tenant.closedAt)} tarihinde kapattı. Veriler {formatDate(tenant.deletionScheduledAt)} tarihinde kalıcı silinecek
            {' '}(otomatik silme <code>AUTO_PURGE_CLOSED=true</code> ise).
          </p>
          <button onClick={reopen} className="flex items-center px-4 py-2.5 rounded-xl bg-white text-red-700 text-xs font-black"><RotateCcw className="h-4 w-4 mr-2" /> Hesabı Geri Aç</button>
        </div>
      )}
      {tenant.customDomain && (
        <p className="text-xs font-bold text-gray-500 flex items-center"><Globe className="h-4 w-4 mr-2 text-brand-500" /> Özel alan adı: {tenant.customDomain} · {tenant.customDomainVerifiedAt ? 'doğrulandı' : 'doğrulanmadı'}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[['Bayi', tenant.usage.dealers, tenant.plan.maxDealers], ['Ürün', tenant.usage.products, tenant.plan.maxProducts], ['Yönetici', tenant.usage.admins, tenant.plan.maxAdmins], ['Sipariş', tenant.usage.orders, -1]].map(([label, used, max]) => (
          <div key={label} className="card-premium p-5">
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
            <p className="text-2xl font-black text-gray-900">{used}<span className="text-sm text-gray-400"> / {limitLabel(max)}</span></p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 card-premium p-6 space-y-5">
          <h3 className="font-black text-gray-900">Müşteri ve Abonelik</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="premium-label">Firma Adı</label><input className="premium-input" value={form.name} onChange={set('name')} /></div>
            <div><label className="premium-label">İletişim E-postası</label><input className="premium-input" value={form.contactEmail} onChange={set('contactEmail')} /></div>
            <div><label className="premium-label">Telefon</label><input className="premium-input" value={form.phone} onChange={set('phone')} /></div>
            <div><label className="premium-label">Vergi No</label><input className="premium-input" value={form.taxNumber} onChange={set('taxNumber')} /></div>
            <div><label className="premium-label">Paket</label>
              <select className="premium-input" value={form.planCode} onChange={set('planCode')}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
            </div>
            <div><label className="premium-label">Durum</label>
              <select className="premium-input" value={form.status} onChange={set('status')}>{Object.entries(TENANT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </div>
            <div><label className="premium-label">Deneme Bitişi</label><input type="date" className="premium-input" value={form.trialEndsAt} onChange={set('trialEndsAt')} /></div>
            <div><label className="premium-label">Abonelik Bitişi</label><input type="date" className="premium-input" value={form.currentPeriodEnd} onChange={set('currentPeriodEnd')} /></div>
            <div className="col-span-2"><label className="premium-label">İç Notlar</label><textarea className="premium-input h-20 resize-none" value={form.notes} onChange={set('notes')} /></div>
          </div>
          <button onClick={() => save()} className="btn-gradient"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
        </div>

        <form onSubmit={addPayment} className="card-premium p-6 space-y-4">
          <h3 className="font-black text-gray-900 flex items-center"><Wallet className="h-4 w-4 mr-2 text-emerald-500" /> Manuel Ödeme (Havale / Fatura)</h3>
          <div><label className="premium-label">Paket</label>
            <select className="premium-input" value={payment.planCode} onChange={(e) => setPayment({ ...payment, planCode: e.target.value })}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
          </div>
          <div><label className="premium-label">Dönem</label>
            <select className="premium-input" value={payment.billingCycle} onChange={(e) => setPayment({ ...payment, billingCycle: e.target.value })}><option value="MONTHLY">1 Ay</option><option value="YEARLY">1 Yıl</option></select>
          </div>
          <div><label className="premium-label">Tutar (boşsa {formatTRY(suggested)})</label><input type="number" step="0.01" className="premium-input" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></div>
          <div><label className="premium-label">Dekont / Fatura No</label><input className="premium-input" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} /></div>
          <div><label className="premium-label">Not</label><input className="premium-input" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} /></div>
          <button type="submit" className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black">Ödemeyi Kaydet ve Uzat</button>
          <p className="text-[11px] text-gray-400 font-semibold">Süre, mevcut bitiş tarihinden (geçmişse bugünden) itibaren uzatılır.</p>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-premium p-6">
          <h3 className="font-black text-gray-900 mb-4">Yöneticiler</h3>
          <div className="divide-y divide-gray-50">
            {tenant.admins.map((a) => (
              <div key={a.id} className="flex justify-between items-center py-3">
                <div>
                  <p className="text-sm font-bold text-gray-800">{a.name}</p>
                  <p className="text-[11px] text-gray-400 font-semibold">{a.email}{a.pendingVerification && <span className="text-amber-600"> · E-posta doğrulanmadı</span>}</p>
                </div>
                <button onClick={() => resetAdmin(a)} className="flex items-center text-xs font-black text-orange-600 hover:underline"><KeyRound className="h-3.5 w-3.5 mr-1" /> Şifre Sıfırla</button>
              </div>
            ))}
          </div>
        </div>
        <div className="card-premium p-6">
          <h3 className="font-black text-gray-900 mb-4">Ödeme Geçmişi</h3>
          {tenant.payments.length === 0 ? <p className="text-sm text-gray-400 font-semibold py-4 text-center">Ödeme yok.</p> : (
            <div className="divide-y divide-gray-50">
              {tenant.payments.map((p) => (
                <div key={p.id} className="flex justify-between py-3">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{p.planCode} · {p.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'} · {p.method === 'IYZICO' ? 'iyzico' : 'Manuel'}</p>
                    <p className="text-[11px] text-gray-400 font-semibold">{formatDate(p.createdAt)} · {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}{p.note && ` · ${p.note}`}</p>
                  </div>
                  <span className={`text-sm font-black ${p.status === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'}`}>{p.status === 'SUCCESS' ? formatTRY(p.amount) : 'Başarısız'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="card-premium p-6">
        <h3 className="font-black text-gray-900 mb-4">İşlem Kaydı</h3>
        <AuditLogTable fetchPage={({ page, q }) => platformApi.get('/audit-logs', { params: { page, q, tenantId: id, limit: 20 } }).then((r) => r.data)} deps={[id]} />
      </div>

      <div className="card-premium p-6 flex flex-wrap justify-between items-center gap-4 border-red-100">
        <div>
          <h3 className="font-black text-gray-900">Veri ve Hesap</h3>
          <p className="text-xs text-gray-500 mt-1">KVKK talepleri için firmanın tüm verisini Excel olarak indirebilir veya kalıcı olarak silebilirsiniz.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportData} className="flex items-center px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-black"><Download className="h-4 w-4 mr-2" /> Tüm Veriyi İndir</button>
          <button onClick={purge} className="flex items-center px-4 py-2.5 rounded-xl bg-red-500 text-white text-xs font-black"><Trash2 className="h-4 w-4 mr-2" /> Kalıcı Olarak Sil</button>
        </div>
      </div>
    </div>
  );
};

export default PlatformTenantDetail;
