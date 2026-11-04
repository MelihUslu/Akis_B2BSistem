import { useEffect, useState } from 'react';
import { Globe, Save, Loader2, ExternalLink, Plus, X } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';

const TABS = [['company', 'Firma bilgileri'], ['billing', 'Abonelik ödemesi'], ['chatbot', 'Chatbot'], ['demo', 'Canlı demo'], ['tracking', 'Reklam ölçümü'], ['legal', 'Yasal metinler']];

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="premium-label">{label}</span>
    {children}
    {hint && <span className="block text-xs text-gray-500 mt-1 ml-1">{hint}</span>}
  </label>
);

/**
 * Tanıtım sitesi ayarları: alt bilgideki firma bilgileri, chatbot, canlı demo hesabı, reklam ölçüm kimlikleri ve yasal metinler.
 */
const PlatformSite = () => {
  const [s, setS] = useState(null);
  const [tab, setTab] = useState('company');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { platformApi.get('/site').then((r) => setS(r.data)).catch((e) => setMsg({ error: errorMessage(e) })); }, []);
  if (!s) return <p className="p-10 text-center text-gray-400">{msg?.error || 'Yükleniyor…'}</p>;

  const set = (group, key) => (e) => setS({ ...s, [group]: { ...s[group], [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } });
  const input = (group, key, props = {}) => <input className="premium-input" value={s[group][key] ?? ''} onChange={set(group, key)} {...props} />;
  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      setS((await platformApi.put('/site', s)).data);
      setMsg({ ok: 'Kaydedildi. Tanıtım sitesine en geç 30 saniye içinde yansır.' });
    } catch (e) {
      setMsg({ error: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };
  const rootUrl = `${window.location.protocol}//${window.location.host.replace(/^platform\./, '')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="page-icon"><Globe className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Site ve Chatbot</h1>
            <p className="text-gray-500 text-sm mt-1">Tanıtım sitesindeki firma bilgileri, otomatik sohbet botu, demo hesabı, reklam ölçümü ve yasal metinler.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:mr-14">
          <a href={rootUrl} target="_blank" rel="noreferrer" className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><ExternalLink className="h-4 w-4 mr-1.5" /> Siteyi aç</a>
          <button onClick={save} disabled={saving} className="flex items-center px-5 h-10 rounded-xl text-xs font-black text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />} Kaydet</button>
        </div>
      </div>
      {msg && <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.ok || msg.error}</p>}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-100">
        {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px ${tab === k ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500'}`}>{l}</button>)}
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-6 md:p-8">
        {tab === 'company' && (
          <div className="grid md:grid-cols-2 gap-5">
            <Field label="Marka adı" hint="Menüde ve sayfa başlığında görünür.">{input('company', 'brand')}</Field>
            <Field label="Ticari unvan" hint="Alt bilgide ve yasal metinlerde veri sorumlusu olarak geçer.">{input('company', 'legalName', { placeholder: 'Örn: Akis Yazılım Ltd. Şti.' })}</Field>
            <Field label="Adres">{input('company', 'address')}</Field>
            <Field label="E-posta">{input('company', 'email', { type: 'email' })}</Field>
            <Field label="Telefon">{input('company', 'phone', { placeholder: '0850 000 00 00' })}</Field>
            <Field label="WhatsApp numarası" hint="Sohbet kutusunda ve iletişim bölümünde WhatsApp düğmesi çıkar.">{input('company', 'whatsapp', { placeholder: '0532 000 00 00' })}</Field>
            <Field label="Vergi dairesi">{input('company', 'taxOffice')}</Field>
            <Field label="Vergi no">{input('company', 'taxNumber')}</Field>
            <Field label="MERSİS no">{input('company', 'mersis')}</Field>
            <Field label="KEP adresi" hint="KVKK başvuruları için.">{input('company', 'kepAddress')}</Field>
          </div>
        )}

        {tab === 'chatbot' && (
          <div className="space-y-5">
            <label className="flex items-center gap-3 font-bold text-gray-800"><input type="checkbox" checked={s.chatbot.enabled} onChange={set('chatbot', 'enabled')} className="h-5 w-5 accent-brand-600" /> Sitede canlı sohbet açık</label>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">Bot ziyaretçiyle otomatik konuşur: ürün, paket fiyatları, entegrasyon ve kurulum sorularını yanıtlar; ilgilenen ziyaretçiden iletişim bilgisi alıp <b>Canlı Destek → Satış talepleri</b>'ne ekler ve size e-posta gönderir. Sunucuda yapay zekâ anahtarı (AI_API_KEY) yoksa sık sorulan sorulara hazır yanıtlarla çalışır.</p>
            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Bot adı">{input('chatbot', 'botName')}</Field>
              <Field label="Temsilciye aktarım mesajı" hint="Ziyaretçi bir insanla görüşmek istediğinde.">{input('chatbot', 'handoffMessage')}</Field>
            </div>
            <Field label="Karşılama mesajı"><textarea rows={2} className="premium-input" value={s.chatbot.greeting} onChange={set('chatbot', 'greeting')} /></Field>
            <Field label="Hızlı yanıt düğmeleri" hint="En fazla 6; ziyaretçi henüz yazmadıysa gösterilir.">
              <div className="flex flex-wrap gap-2">
                {s.chatbot.quickReplies.map((q, i) => (
                  <span key={i} className="flex items-center gap-1 h-9 pl-3 pr-1 rounded-lg bg-brand-50 text-brand-700 text-sm font-semibold">
                    <input value={q} onChange={(e) => setS({ ...s, chatbot: { ...s.chatbot, quickReplies: s.chatbot.quickReplies.map((x, j) => (j === i ? e.target.value : x)) } })} className="bg-transparent outline-none w-40" />
                    <button type="button" onClick={() => setS({ ...s, chatbot: { ...s.chatbot, quickReplies: s.chatbot.quickReplies.filter((_, j) => j !== i) } })} className="p-1 hover:bg-brand-100 rounded"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
                {s.chatbot.quickReplies.length < 6 && <button type="button" onClick={() => setS({ ...s, chatbot: { ...s.chatbot, quickReplies: [...s.chatbot.quickReplies, 'Yeni soru'] } })} className="h-9 px-3 rounded-lg bg-gray-100 text-sm font-semibold text-gray-600 flex items-center gap-1"><Plus className="h-4 w-4" /> Ekle</button>}
              </div>
            </Field>
            <Field label="Bota ek bilgi" hint="Kampanyalar, kurulum desteği, referans politikası gibi botun bilmesini istediğiniz bilgiler. Yalnızca yapay zekâ modu kullanır; ziyaretçiye doğrudan gösterilmez.">
              <textarea rows={8} className="premium-input font-mono text-sm" value={s.chatbot.knowledge} onChange={set('chatbot', 'knowledge')} placeholder={'Örn:\n- Kurulum ve ilk veri aktarımı ücretsizdir.\n- Yıllık ödemede 2 ay ücretsiz.\n- Logo ve Mikro ile entegrasyon için iş ortağımız destek veriyor.'} />
            </Field>
          </div>
        )}

        {tab === 'demo' && (
          <div className="space-y-5">
            <label className="flex items-center gap-3 font-bold text-gray-800"><input type="checkbox" checked={s.demo.enabled} onChange={set('demo', 'enabled')} className="h-5 w-5 accent-brand-600" /> Ana sayfada "Canlı demo" bölümünü göster</label>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">Örnek verili bir demo firması açın (sunucuda <code>SEED_DEMO=true</code> ile otomatik oluşur) ve giriş bilgilerini buraya yazın. Bu bilgiler herkese açık gösterilir; demo hesabında gerçek veri tutmayın.</p>
            <Field label="Demo portal adresi">{input('demo', 'url', { placeholder: 'https://demo.akisb2b.com/login' })}</Field>
            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Bayi e-postası">{input('demo', 'dealerEmail')}</Field>
              <Field label="Bayi şifresi">{input('demo', 'dealerPassword')}</Field>
              <Field label="Yönetici e-postası">{input('demo', 'adminEmail')}</Field>
              <Field label="Yönetici şifresi">{input('demo', 'adminPassword')}</Field>
            </div>
          </div>
        )}

        {tab === 'billing' && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">IBAN girildiğinde firmalar Abonelik sayfasında <b>Havale / EFT</b> ile de satın alabilir: banka bilgilerini görür, ödemeyi yapıp bildirir. Bildirim e-postayla gelir; <b>Ödemeler</b> ekranından onaylayınca abonelik uzar ve fatura kesilir. Kartla ödeme iyzico ayarlarıyla çalışır.</p>
            <div className="grid md:grid-cols-2 gap-5">
              <Field label="IBAN" hint="Boşsa havale seçeneği gösterilmez.">{input('billing', 'iban', { placeholder: 'TR00 0000 0000 0000 0000 0000 00' })}</Field>
              <Field label="Banka">{input('billing', 'bankName', { placeholder: 'Örn: Ziraat Bankası' })}</Field>
              <Field label="Alıcı adı" hint="Boşsa firma bilgilerindeki ticari unvan kullanılır.">{input('billing', 'accountName')}</Field>
              <Field label="Firmalara not" hint="Örn: Açıklamaya firma kodunu yazmayı unutmayın.">{input('billing', 'transferNote')}</Field>
            </div>
          </div>
        )}

        {tab === 'tracking' && (
          <div className="space-y-5">
            <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-3">Kimlik girildiğinde ziyaretçiye çerez onayı sorulur; ölçüm kodları yalnızca "Kabul et" seçilirse yüklenir. Deneme kaydı ve demo talebi dönüşüm olarak gönderilir. Hangi reklamdan gelindiği (utm) kayıtlarda ve taleplerde her durumda saklanır.</p>
            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Meta (Facebook) Pixel ID">{input('tracking', 'metaPixelId', { placeholder: '123456789012345' })}</Field>
              <Field label="Google etiketi (GA4 / Ads)">{input('tracking', 'googleTagId', { placeholder: 'G-XXXXXXX veya AW-XXXXXXX' })}</Field>
              <Field label="Google Ads dönüşüm etiketi" hint="Biçim: AW-123456789/AbC-dEfGhIj">{input('tracking', 'googleAdsConversion')}</Field>
            </div>
          </div>
        )}

        {tab === 'legal' && (
          <div className="space-y-5">
            <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-4 py-3">Boş bırakılan metinler için hazır <b>taslak</b> gösterilir (firma bilgileri otomatik eklenir). Taslaklar hukuki danışmanlık değildir; yayına almadan önce bir hukukçuya kontrol ettirin. Buraya yazdığınız metin taslağın yerine geçer (paragrafları boş satırla ayırın).</p>
            {[['kvkk', 'KVKK Aydınlatma Metni', '/kvkk'], ['privacy', 'Gizlilik Politikası', '/gizlilik'], ['terms', 'Kullanım Koşulları', '/kullanim-kosullari'], ['cookies', 'Çerez Politikası', '/cerez-politikasi']].map(([k, l, path]) => (
              <Field key={k} label={<span className="flex items-center gap-2">{l} <a href={`${rootUrl}${path}`} target="_blank" rel="noreferrer" className="text-brand-600 normal-case tracking-normal font-semibold flex items-center gap-1"><ExternalLink className="h-3 w-3" /> görüntüle</a></span>}>
                <textarea rows={5} className="premium-input text-sm" value={s.legal[k]} onChange={set('legal', k)} placeholder="Boş: taslak metin gösterilir" />
              </Field>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformSite;
