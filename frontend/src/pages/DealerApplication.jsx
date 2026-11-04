import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, ArrowLeft } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import { useTenant } from '../context/TenantContext';
import { t } from '../i18n';

const DealerApplication = () => {
  const { tenant } = useTenant();
  const [form, setForm] = useState({ companyName: '', taxNumber: '', taxOffice: '', authorizedPerson: '', phone: '', email: '', address: '', password: '', note: '', kvkkConsent: false });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await api.post('/dealer-applications', form);
      setDone(res.data.message);
    } catch (err) {
      setError(errorMessage(err, t('Başvuru gönderilemedi.')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-50 flex items-center justify-center p-4 md:p-6">
      <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 w-full max-w-2xl p-6 md:p-10">
        <Link to="/login" className="inline-flex items-center text-xs font-black text-gray-400 hover:text-brand-600 uppercase tracking-widest mb-6"><ArrowLeft className="h-4 w-4 mr-1.5" /> {t('Girişe dön')}</Link>
        {done ? (
          <div className="text-center space-y-4 py-8">
            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
            <h1 className="text-2xl font-black text-slate-900">{t('Başvurunuz alındı')}</h1>
            <p className="text-sm text-slate-500">{done}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5">
            <div className="flex items-center gap-4">
              {tenant?.logoUrl ? <img src={tenant.logoUrl} alt={tenant.name} className="h-12 max-w-[10rem] object-contain" /> : <div className="p-3 rounded-2xl bg-brand-50 text-brand-600"><Building2 className="h-6 w-6" /></div>}
              <div>
                <h1 className="text-2xl font-black text-slate-900">{t('Bayilik Başvurusu')}</h1>
                <p className="text-sm text-slate-500">{tenant?.name} B2B portalına bayi olarak katılın.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2"><label className="premium-label">{t('Firma Unvanı')}</label><input required className="premium-input" value={form.companyName} onChange={set('companyName')} /></div>
              <div><label className="premium-label">{t('Vergi Numarası')}</label><input required className="premium-input" value={form.taxNumber} onChange={set('taxNumber')} /></div>
              <div><label className="premium-label">{t('Vergi Dairesi')}</label><input className="premium-input" value={form.taxOffice} onChange={set('taxOffice')} /></div>
              <div><label className="premium-label">{t('Yetkili Ad Soyad')}</label><input required className="premium-input" value={form.authorizedPerson} onChange={set('authorizedPerson')} /></div>
              <div><label className="premium-label">{t('Telefon')}</label><input required className="premium-input" value={form.phone} onChange={set('phone')} placeholder={t('05xx xxx xx xx')} /></div>
              <div className="md:col-span-2"><label className="premium-label">{t('Adres')}</label><input className="premium-input" value={form.address} onChange={set('address')} /></div>
              <div><label className="premium-label">{t('Giriş E-postası')}</label><input required type="email" autoComplete="email" className="premium-input" value={form.email} onChange={set('email')} /></div>
              <div><label className="premium-label">{t('Şifre (en az 8 karakter)')}</label><input required minLength={8} type="password" autoComplete="new-password" className="premium-input" value={form.password} onChange={set('password')} /></div>
              <div className="md:col-span-2"><label className="premium-label">{t('Mesajınız (isteğe bağlı)')}</label><textarea className="premium-input h-24 resize-none" value={form.note} onChange={set('note')} placeholder={t('Faaliyet alanınız, bölgeniz, aylık tahmini alım...')} /></div>
            </div>
            <label className="flex items-start gap-3 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.kvkkConsent} onChange={set('kvkkConsent')} />
              <span>{t('Başvurumun değerlendirilmesi için paylaştığım kişisel verilerin {company} tarafından 6698 sayılı KVKK kapsamında işlenmesini kabul ediyorum.', { company: tenant?.name || t('firma') })}</span>
            </label>
            {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
            <button type="submit" disabled={sending || !form.kvkkConsent} className="w-full btn-gradient py-4 disabled:opacity-50">{sending ? t('Gönderiliyor...') : t('Başvuruyu Gönder')}</button>
            <p className="text-[11px] text-center text-slate-400">{t('Başvurunuz onaylandığında e-posta ile bilgilendirilir, belirlediğiniz şifreyle giriş yaparsınız.')}</p>
          </form>
        )}
      </div>
    </div>
  );
};

export default DealerApplication;
