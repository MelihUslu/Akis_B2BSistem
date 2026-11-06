import { useEffect, useState } from 'react';
import { MessageSquareText, User, Lock, PlugZap, Save, CheckCircle2, Info, Send, Smartphone, Unplug, AlertTriangle } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Section, Field, IconInput, Toggle } from '../form/FormKit';
import { formatDate } from '../../utils/format';

/**
 * SMS bildirimi (Netgsm): firma kendi hesabını bağlar, açar / kapatır. Açıkken seçilen bildirimler cep telefonu kayıtlı
 * kullanıcılara SMS olarak da gider (kullanıcı Bildirim tercihleri'nden kapatabilir). Ücret firmanın Netgsm hesabından düşer.
 */
const SmsSettings = ({ showAlert, confirm }) => {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [testPhone, setTestPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/sms-settings').then((r) => {
    setSaved(r.data);
    setForm({ enabled: r.data.enabled, username: r.data.username, password: '', header: r.data.header, types: r.data.types, optOutText: r.data.optOut || '' });
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const call = async (fn, title) => {
    setBusy(true);
    try {
      const res = await fn();
      showAlert({ type: 'success', title, message: res.data.message });
      return res;
    } catch (err) {
      showAlert({ type: 'error', title: 'Olmadı', message: errorMessage(err, 'İşlem başarısız.') });
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!saved || !form) return null;
  const creds = { username: form.username, password: form.password, header: form.header };
  const toggleType = (group, id) => {
    const list = form.types[group];
    setForm({ ...form, types: { ...form.types, [group]: list.includes(id) ? list.filter((t) => t !== id) : [...list, id] } });
  };
  const fetchHeaders = async () => {
    const res = await call(() => api.post('/sms-settings/headers', creds), 'Bağlantı başarılı');
    if (res) {
      setHeaders(res.data.headers);
      if (!form.header && res.data.headers.length === 1) setForm({ ...form, header: res.data.headers[0] });
    }
  };
  const disconnect = async () => {
    if (!(await confirm({ title: 'Netgsm bağlantısı kaldırılsın mı?', message: 'Kullanıcı adı, şifre ve gönderici adı silinir; SMS gönderilmez.', confirmText: 'Kaldır' }))) return;
    if (await call(() => api.put('/sms-settings', { disconnect: true }), 'Kaldırıldı')) load();
  };
  const typeList = (group, title) => (
    <div>
      <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5">
        {saved.options[group].map((t) => (
          <label key={t.id} className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={form.types[group].includes(t.id)} onChange={() => toggleType(group, t.id)} className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span><span className="font-bold text-gray-800">{t.label}</span><span className="block text-[11px] text-gray-400">{t.description}</span></span>
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <Section icon={MessageSquareText} title="SMS bildirimleri" description="Açıkken seçtiğiniz bildirimler, cep telefonu kayıtlı kullanıcılara SMS olarak da gider. Firmanızın kendi Netgsm hesabı kullanılır; ücret o hesaptan düşer."
        aside={<span className="flex items-center gap-2 text-xs font-black whitespace-nowrap"><span className={form.enabled ? 'text-emerald-600' : 'text-gray-400'}>{form.enabled ? 'Açık' : 'Kapalı'}</span><Toggle color="emerald" checked={form.enabled} onChange={(v) => setForm({ ...form, enabled: v })} label="SMS bildirimleri" /></span>}>
        <p className="text-xs text-gray-500 flex items-start gap-2"><Info className="h-4 w-4 shrink-0" />
          Yalnızca bilgilendirme mesajı gönderilir (sipariş, ödeme, vade); reklam / kampanya SMS'i gönderilmez. Kapatınca bilgiler silinmez, istediğiniz zaman yeniden açabilirsiniz.</p>
        {saved.configured && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-lg font-black text-gray-900">{saved.stats.sent}</p><p className="text-[11px] text-gray-500">SMS gönderildi (14 gün)</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className={`text-lg font-black ${saved.stats.failed ? 'text-red-600' : 'text-gray-900'}`}>{saved.stats.failed}</p><p className="text-[11px] text-gray-500">gönderilemedi</p></div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="text-lg font-black text-gray-900">{saved.phones.dealer} / {saved.phones.staff}</p><p className="text-[11px] text-gray-500">telefonu kayıtlı bayi / ekip</p></div>
          </div>
        )}
        {saved.stats.lastError && (
          <p className="text-xs text-red-600 flex items-start gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Son hata ({formatDate(saved.stats.lastError.at, true)}): {saved.stats.lastError.message}</p>
        )}
      </Section>

      <Section icon={PlugZap} title="Netgsm hesabı" color="violet"
        description="Netgsm panelinde API kullanıcısı oluşturun (Ayarlar → API İşlemleri; IP kısıtı varsa sunucunun IP'sini ekleyin). Gönderici adı, BTK onaylı SMS başlığınızdır."
        aside={saved.configured ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Bağlı</span> : null}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Kullanıcı adı (abone no)" required><IconInput icon={User} className="font-mono" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="850XXXXXXX" /></Field>
          <Field label="API şifresi" required hint={saved.hasPassword ? 'Kayıtlı; değiştirmek için yazın' : undefined}>
            <IconInput icon={Lock} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={saved.hasPassword ? '••••••••' : ''} />
          </Field>
          <Field label="Gönderici adı (SMS başlığı)" required hint={headers.length ? `Hesaptaki başlıklar: ${headers.join(', ')}` : 'Bilgileri girip "Bağlantıyı test et" ile hesaptaki başlıkları getirin'}>
            {headers.length > 1
              ? <select className="premium-input" value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value })}><option value="">Seçin</option>{headers.map((h) => <option key={h}>{h}</option>)}</select>
              : <IconInput icon={MessageSquareText} className="font-mono" value={form.header} onChange={(e) => setForm({ ...form, header: e.target.value.toUpperCase() })} />}
          </Field>
          <div className="flex items-end">
            <button type="button" disabled={busy} onClick={fetchHeaders} className="btn-secondary w-full"><PlugZap className="h-4 w-4 mr-1.5" /> Bağlantıyı test et</button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <div className="flex-1"><IconInput icon={Smartphone} type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="Deneme için cep telefonu (5XX XXX XX XX)" /></div>
          <button type="button" disabled={busy || !testPhone} onClick={() => call(() => api.post('/sms-settings/test', { ...creds, phone: testPhone }), 'Gönderildi')} className="btn-secondary shrink-0"><Send className="h-4 w-4 mr-1.5" /> Deneme SMS'i gönder</button>
        </div>
      </Section>

      <Section icon={Send} title="Hangi bildirimler SMS ile gitsin?" color="emerald"
        description="Her SMS ücretlidir. Kullanıcı kendisine gelenleri Bildirim tercihleri'nden kapatabilir; cep telefonu olmayan kullanıcıya SMS gitmez.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {typeList('dealer', 'Bayilere')}
          {typeList('staff', 'Ekibinize')}
        </div>
        <p className="text-[11px] text-gray-400">Bayi telefonları: Bayiler → Kullanıcılar (ya da bayinin kendi profili). Ekip: her kullanıcı Hesabım → Bildirim tercihleri'nden kendi numarasını girer.</p>
      </Section>

      <Section icon={MessageSquareText} title="Toplu SMS: ticari mesaj ret metni" color="amber"
        description="Müşteriler → Toplu SMS'te “Ticari (İYS)” gönderimlerin sonuna eklenir. İYS'deki marka kodunuzu ve ret yolunu Netgsm panelinden alın. Boşsa ticari SMS gönderilemez; bilgilendirme mesajlarına eklenmez.">
        <Field label="Ret metni" hint={`${form.optOutText.length} / 160 karakter`}>
          <IconInput icon={MessageSquareText} maxLength={160} value={form.optOutText} onChange={(e) => setForm({ ...form, optOutText: e.target.value })} placeholder="Ör. Ret için RET yazıp 3XXX'e gönderin. B0XX" />
        </Field>
      </Section>

      <div className="flex flex-wrap justify-between gap-3">
        {saved.configured ? <button type="button" disabled={busy} onClick={disconnect} className="inline-flex items-center h-12 px-5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50"><Unplug className="h-4 w-4 mr-2" /> Bağlantıyı kaldır</button> : <span />}
        <button disabled={busy} onClick={async () => { if (await call(() => api.put('/sms-settings', { ...creds, enabled: form.enabled, types: form.types, optOutText: form.optOutText }), 'Kaydedildi')) load(); }} className="btn-gradient h-12 px-8 py-0 disabled:opacity-50"><Save className="h-4 w-4 mr-2" /> Kaydet</button>
      </div>
    </div>
  );
};

export default SmsSettings;
