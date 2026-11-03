import { useEffect, useState } from 'react';
import { FileText, PlugZap, KeyRound, User, Lock, Building2, Save, CheckCircle2, Code2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Section, Field, IconInput, Segmented } from '../form/FormKit';

const EMPTY = { provider: '', autoOn: 'MANUAL', clientId: '', clientSecret: '', username: '', password: '', companyId: '' };

// E-fatura / e-arşiv: Paraşüt ile otomatik kesim ya da ERP'den / elle fatura numarası
const InvoiceSettings = ({ showAlert, confirm }) => {
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/invoicing').then((r) => {
    setSaved(r.data);
    setForm({ ...EMPTY, provider: r.data.provider || '', autoOn: r.data.autoOn, clientId: r.data.clientId, username: r.data.username, companyId: r.data.companyId });
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const test = async () => {
    setBusy(true);
    try {
      const res = await api.post('/invoicing/test', form);
      setCompanies(res.data.companies);
      if (!form.companyId && res.data.companies.length === 1) setForm((f) => ({ ...f, companyId: res.data.companies[0].id }));
      showAlert({ type: 'success', title: 'Bağlantı başarılı', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Bağlanılamadı', message: errorMessage(err, 'Paraşüt bağlantısı kurulamadı.') });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!form.provider && saved?.provider && !(await confirm({ type: 'warning', title: 'Paraşüt bağlantısı kaldırılsın mı?', message: 'Faturalar artık otomatik kesilmez; numaralar ERP\'den veya elle girilir.', confirmText: 'Kaldır' }))) return;
    setBusy(true);
    try {
      const res = await api.put('/invoicing', form);
      showAlert({ type: 'success', title: 'Kaydedildi', message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Ayarlar kaydedilemedi.') });
    } finally {
      setBusy(false);
    }
  };

  if (!saved) return null;
  const parasut = form.provider === 'PARASUT';

  return (
    <div className="space-y-5 max-w-4xl">
      <Section icon={FileText} title="Fatura yöntemi" description="Siparişlerin faturası nasıl kesilecek? Bayi, kesilen faturayı sipariş detayında görür ve PDF'ini indirir.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { id: '', title: 'ERP\'den veya elle', desc: 'Faturayı Logo, Mikro, Netsis… keser; numara ve PDF API ile ya da sipariş ekranından girilir.', icon: Code2 },
            { id: 'PARASUT', title: 'Paraşüt ile otomatik', desc: 'Fatura Paraşüt\'te oluşturulur; alıcı e-fatura mükellefiyse e-fatura, değilse e-arşiv gönderilir.', icon: PlugZap },
          ].map((o) => (
            <button key={o.id} type="button" onClick={() => setForm({ ...form, provider: o.id })}
              className={`text-left flex items-start gap-3 p-4 rounded-xl ring-1 transition-all ${form.provider === o.id ? 'ring-2 ring-indigo-400 bg-indigo-50/50' : 'ring-gray-100 hover:ring-gray-200 hover:bg-gray-50'}`}>
              <span className={`p-2 rounded-lg shrink-0 ${form.provider === o.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}><o.icon className="h-4 w-4" /></span>
              <span>
                <span className="block text-sm font-bold text-gray-900">{o.title}</span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Section>

      {parasut && (
        <Section icon={KeyRound} title="Paraşüt API bilgileri" color="violet"
          description="Paraşüt'ten API erişimi isteyin (destek@parasut.com); size Client ID ve Client Secret verilir. Kullanıcı, Paraşüt'e giriş yaptığınız e-posta ve şifredir."
          aside={saved.configured && saved.provider === 'PARASUT' ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Bağlı</span> : null}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Client ID" required><IconInput icon={KeyRound} className="font-mono" value={form.clientId} onChange={set('clientId')} /></Field>
            <Field label="Client Secret" required hint={saved.hasSecret ? `Kayıtlı (${saved.secretHint}); değiştirmek için yazın` : undefined}>
              <IconInput icon={Lock} type="password" autoComplete="off" className="font-mono" value={form.clientSecret} onChange={set('clientSecret')} placeholder={saved.hasSecret ? '••••••••' : ''} />
            </Field>
            <Field label="Paraşüt kullanıcı e-postası" required><IconInput icon={User} type="email" value={form.username} onChange={set('username')} /></Field>
            <Field label="Paraşüt şifresi" required hint={saved.hasPassword ? 'Kayıtlı; değiştirmek için yazın' : undefined}>
              <IconInput icon={Lock} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder={saved.hasPassword ? '••••••••' : ''} />
            </Field>
            <Field label="Firma (şirket numarası)" required hint="“Bağlantıyı test et” ile hesabınızdaki şirketler listelenir.">
              {companies.length ? (
                <IconInput as="select" icon={Building2} value={form.companyId} onChange={set('companyId')}>
                  <option value="">Şirket seçin</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name} (#{c.id})</option>)}
                </IconInput>
              ) : <IconInput icon={Building2} className="font-mono" value={form.companyId} onChange={set('companyId')} placeholder="Örn. 123456" />}
            </Field>
            <div className="flex items-end">
              <button type="button" disabled={busy} onClick={test} className="btn-secondary w-full"><PlugZap className="h-4 w-4 mr-1.5" /> BAĞLANTIYI TEST ET</button>
            </div>
          </div>
        </Section>
      )}

      {parasut && (
        <Section icon={FileText} title="Ne zaman kesilsin?" color="emerald" description="Otomatik seçilirse fatura arka planda kesilir; sorun olursa sipariş ekranında hata ve “Tekrar dene” görünür.">
          <Segmented value={form.autoOn} onChange={(v) => setForm({ ...form, autoOn: v })}
            options={[{ value: 'MANUAL', label: 'Elle (sipariş ekranından)' }, { value: 'APPROVED', label: 'Sipariş onaylanınca' }, { value: 'SHIPPED', label: 'Kargoya verilince' }]} />
        </Section>
      )}

      {!parasut && (
        <Section icon={Code2} title="ERP'den fatura numarası" color="slate" description="ERP'niz faturayı kestikten sonra numarayı ve PDF adresini şu istekle gönderebilir (API anahtarı Ayarlar → Entegrasyon'dan):">
          <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto">{`PUT /api/v1/orders/{siparisId}/invoice
X-Api-Key: akb2b_…
{ "number": "ABC2026000000123", "documentType": "E_FATURA", "pdfUrl": "https://…/fatura.pdf" }`}</pre>
          <p className="text-xs text-gray-500 flex items-center gap-1">Fatura kesilince <code className="font-mono">invoice.issued</code> webhook olayı da gönderilir.</p>
        </Section>
      )}

      <div className="flex justify-end">
        <button disabled={busy} onClick={save} className="btn-gradient h-12 px-8 py-0 disabled:opacity-50"><Save className="h-4 w-4 mr-2" /> KAYDET</button>
      </div>
    </div>
  );
};

export default InvoiceSettings;
