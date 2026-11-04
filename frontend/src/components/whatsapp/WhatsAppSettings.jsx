import { useState } from 'react';
import { Copy, Check, Link2, Sparkles, Save, Send, AlertTriangle, CheckCircle2, Unplug, Bot, UserRound } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';

const KNOWLEDGE_HINT = `Örnek:
Kargo: 2.000 TL üzeri siparişlerde kargo ücretsiz, altında 150 TL. Saat 15:00'e kadar verilen siparişler aynı gün çıkar.
Ödeme: Havale/EFT, kredi kartı (3 taksit). Bayilerimiz için 30 gün vade.
Minimum sipariş: 1 koli.
Çalışma saatleri: Hafta içi 09:00-18:00, Cumartesi 09:00-13:00.
Adres: …
İade: Hasarlı ürünler 7 gün içinde değiştirilir.
Bayilik: Vergi levhası ile başvuru yapılır, onay 1 iş günü.`;

const CopyField = ({ label, value }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* izin yok */ } };
  return (
    <div>
      <label className="premium-label">{label}</label>
      <div className="flex gap-2">
        <input readOnly className="premium-input font-mono text-xs" value={value} onFocus={(e) => e.target.select()} />
        <button type="button" onClick={copy} className={`h-11 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 ${copied ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

const Step = ({ n, title, children }) => (
  <li className="flex gap-3">
    <span className="h-6 w-6 shrink-0 rounded-lg bg-emerald-600 text-white text-xs font-black flex items-center justify-center">{n}</span>
    <div className="text-sm text-gray-600"><p className="font-bold text-gray-900">{title}</p>{children}</div>
  </li>
);

/**
 * WhatsApp ayarları: Meta bağlantısı (numara kimliği, erişim anahtarı, uygulama gizli anahtarı),
 * webhook bilgileri, yapay zekâ cevapları ve firma bilgileri; "yapay zekâyı dene".
 */
// Kaydedilen ayarlar değişince üst bileşen key ile yeniden kurar (form ilk değerleri güncellenir)
const WhatsAppSettings = ({ data, reload, showAlert, confirm, canEdit }) => {
  const channel = data.channel;
  const [editing, setEditing] = useState(!data.connected);
  const [conn, setConn] = useState({ phoneNumberId: channel?.phoneNumberId || '', wabaId: channel?.wabaId || '', accessToken: '', appSecret: '' });
  const [ai, setAi] = useState({ aiEnabled: channel?.aiEnabled ?? true, knowledge: channel?.knowledge || '', handoffMessage: channel?.handoffMessage || '' });
  const [busy, setBusy] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);

  const run = async (key, fn) => {
    setBusy(key);
    try { await fn(); } catch (err) { showAlert({ type: 'error', title: 'WhatsApp', message: errorMessage(err, 'İşlem yapılamadı.') }); } finally { setBusy(''); }
  };

  const connect = (e) => {
    e.preventDefault();
    run('connect', async () => {
      const res = await api.put('/whatsapp/channel', conn);
      showAlert({ type: 'success', title: 'WhatsApp', message: res.data.message });
      setEditing(false);
      setConn({ ...conn, accessToken: '', appSecret: '' });
      reload();
    });
  };
  const saveAi = () => run('ai', async () => {
    const res = await api.patch('/whatsapp/channel', ai);
    showAlert({ type: 'success', title: 'WhatsApp', message: res.data.message });
    reload();
  });
  const disconnect = () => run('disconnect', async () => {
    if (!await confirm({ title: 'WhatsApp bağlantısı kaldırılsın mı?', message: 'Gelen mesajlar artık panele düşmez ve yapay zekâ cevap vermez. Eski konuşmalar kalır.', confirmText: 'Kaldır' })) return;
    await api.delete('/whatsapp/channel');
    setEditing(true);
    reload();
  });
  const tryAi = (e) => {
    e.preventDefault();
    run('try', async () => {
      setAnswer(null);
      const res = await api.post('/whatsapp/preview', { question, knowledge: ai.knowledge, handoffMessage: ai.handoffMessage });
      setAnswer(res.data);
    });
  };
  const set = (setter, obj) => (k) => (e) => setter({ ...obj, [k]: e.target.value });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      {/* Bağlantı */}
      <div className="card-premium p-5 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0"><Link2 className="h-5 w-5" /></span>
            <div>
              <h2 className="font-black text-gray-900">WhatsApp numarası</h2>
              <p className="text-sm text-gray-500 mt-0.5">Meta'nın resmi WhatsApp Business (Cloud API) bağlantısı.</p>
            </div>
          </div>
          {data.connected && <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[11px] font-black whitespace-nowrap">Bağlı</span>}
        </div>

        {data.connected && !editing && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gray-50 p-4 grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Numara</p><p className="font-bold text-gray-900">{channel.displayPhone || '—'}</p></div>
              <div><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">İşletme adı</p><p className="font-bold text-gray-900">{channel.verifiedName || '—'}</p></div>
              <div><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Son gelen bildirim</p><p className="font-bold text-gray-900">{channel.lastWebhookAt ? formatDate(channel.lastWebhookAt, true) : 'Henüz yok'}</p></div>
              <div><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Erişim anahtarı</p><p className="font-mono text-gray-700">{channel.tokenHint}</p></div>
            </div>
            {channel.lastError && <p className="text-xs font-bold text-red-700 bg-red-50 rounded-xl p-3 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> Son hata: {channel.lastError}</p>}
            {!channel.lastWebhookAt && <p className="text-xs font-bold text-amber-800 bg-amber-50 rounded-xl p-3">Meta'dan henüz bildirim gelmedi. Aşağıdaki webhook bilgilerini Meta paneline girin ve "messages" alanına abone olun.</p>}
            <div className="space-y-3">
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Meta paneline girilecek webhook bilgileri</p>
              <CopyField label="Callback URL" value={channel.webhookUrl} />
              <CopyField label="Verify token" value={channel.verifyToken} />
              {!data.publicUrlOk && <p className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3">Sunucunun dış adresi (API_PUBLIC_URL) localhost görünüyor; Meta bu adrese ulaşamaz. Canlı sunucuda doğru adres kullanılır.</p>}
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => setEditing(true)} className="h-10 px-4 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50">Bilgileri güncelle</button>
                <button type="button" onClick={disconnect} disabled={busy === 'disconnect'} className="h-10 px-4 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 flex items-center gap-1.5"><Unplug className="h-4 w-4" /> Bağlantıyı kaldır</button>
              </div>
            )}
          </div>
        )}

        {editing && canEdit && (
          <>
            <ol className="space-y-3">
              <Step n={1} title="Meta uygulaması">
                <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-brand-600 font-semibold hover:underline">developers.facebook.com</a> adresinde "İşletme" türünde bir uygulama oluşturup WhatsApp ürününü ekleyin ve numaranızı kaydedin.
              </Step>
              <Step n={2} title="Bilgileri kopyalayın">
                <b>Phone number ID</b> ve <b>WhatsApp Business Account ID</b>: WhatsApp → API Setup. <b>Kalıcı erişim anahtarı</b>: Business Settings → System users → Generate token (whatsapp_business_messaging izniyle). <b>App secret</b>: App settings → Basic.
              </Step>
              <Step n={3} title="Bağlayın, sonra webhook'u girin">Kaydettikten sonra çıkan Callback URL ve Verify token'ı WhatsApp → Configuration → Webhook bölümüne girip "messages" alanına abone olun.</Step>
            </ol>
            <form onSubmit={connect} className="grid gap-3 md:grid-cols-2">
              <div><label className="premium-label">Phone number ID</label><input required className="premium-input font-mono" inputMode="numeric" value={conn.phoneNumberId} onChange={set(setConn, conn)('phoneNumberId')} /></div>
              <div><label className="premium-label">Business Account ID</label><input className="premium-input font-mono" value={conn.wabaId} onChange={set(setConn, conn)('wabaId')} /></div>
              <div className="md:col-span-2"><label className="premium-label">Kalıcı erişim anahtarı (access token)</label><input required={!data.connected} type="password" autoComplete="off" className="premium-input font-mono" value={conn.accessToken} onChange={set(setConn, conn)('accessToken')} placeholder={data.connected ? 'Değiştirmeyecekseniz boş bırakın' : ''} /></div>
              <div className="md:col-span-2"><label className="premium-label">App secret</label><input required={!data.connected} type="password" autoComplete="off" className="premium-input font-mono" value={conn.appSecret} onChange={set(setConn, conn)('appSecret')} placeholder={data.connected ? 'Değiştirmeyecekseniz boş bırakın' : ''} /></div>
              <p className="md:col-span-2 text-[11px] text-gray-400">Anahtarlar şifreli saklanır ve bir daha gösterilmez.</p>
              <div className="md:col-span-2 flex gap-2">
                {data.connected && <button type="button" onClick={() => setEditing(false)} className="h-11 px-5 rounded-xl border border-gray-200 font-bold text-gray-600">Vazgeç</button>}
                <button type="submit" disabled={busy === 'connect'} className="flex-1 btn-gradient disabled:opacity-60">{busy === 'connect' ? 'Doğrulanıyor…' : data.connected ? 'Güncelle' : 'Bağla'}</button>
              </div>
            </form>
          </>
        )}
        {!data.connected && !canEdit && <p className="text-sm text-gray-500">WhatsApp henüz bağlanmadı. Bağlamak için "Ayarlar" yetkisi olan bir yöneticiye başvurun.</p>}
      </div>

      {/* Yapay zekâ */}
      <div className="card-premium p-5 md:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="p-2.5 rounded-xl bg-brand-50 text-brand-600 shrink-0"><Sparkles className="h-5 w-5" /></span>
          <div>
            <h2 className="font-black text-gray-900">Yapay zekâ cevapları</h2>
            <p className="text-sm text-gray-500 mt-0.5">Müşteri yazınca yapay zekâ aşağıdaki bilgiler ve ürün kataloğunuzla hemen cevap verir. Bilmediği konuda uydurmaz, konuşmayı ekibinize devreder.</p>
          </div>
        </div>
        {!data.ai.enabled && <p className="text-xs font-bold text-red-700 bg-red-50 rounded-xl p-3">{data.ai.reason}</p>}
        {data.ai.mock && <p className="text-xs font-bold text-amber-800 bg-amber-50 rounded-xl p-3">{data.ai.reason}</p>}

        <label className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${ai.aiEnabled ? 'border-brand-200 bg-brand-50/40' : 'border-gray-200'}`}>
          <span className="flex items-center gap-3">
            {ai.aiEnabled ? <Bot className="h-5 w-5 text-brand-600" /> : <UserRound className="h-5 w-5 text-gray-400" />}
            <span>
              <span className="block text-sm font-black text-gray-900">{ai.aiEnabled ? 'Yapay zekâ otomatik cevaplıyor' : 'Tüm mesajları ekip cevaplıyor'}</span>
              <span className="block text-xs text-gray-500">Kapatırsanız gelen her mesaj ekibe düşer.</span>
            </span>
          </span>
          <input type="checkbox" className="h-5 w-5" checked={ai.aiEnabled} disabled={!canEdit || !data.connected} onChange={(e) => setAi({ ...ai, aiEnabled: e.target.checked })} />
        </label>

        <div>
          <label className="premium-label">Firma bilgileri (yapay zekâ bunlarla cevaplar)</label>
          <textarea className="premium-input h-56 resize-y text-sm" maxLength={8000} value={ai.knowledge} onChange={(e) => setAi({ ...ai, knowledge: e.target.value })} placeholder={KNOWLEDGE_HINT} readOnly={!canEdit} />
          <p className="text-[11px] text-gray-400 mt-1.5">Ürün adı, fiyat ve stok katalogdan otomatik alınır. Fiyatları gizlediyseniz (Ayarlar) yapay zekâ da fiyat paylaşmaz. {ai.knowledge.length}/8000</p>
        </div>
        <div>
          <label className="premium-label">Ekibe devrederken söylenecek cümle (isteğe bağlı)</label>
          <input className="premium-input" maxLength={300} value={ai.handoffMessage} onChange={(e) => setAi({ ...ai, handoffMessage: e.target.value })} placeholder="Sizi ekibimize aktarıyorum, en kısa sürede buradan dönüş yapacağız." readOnly={!canEdit} />
        </div>
        {canEdit && (
          <button type="button" onClick={saveAi} disabled={!data.connected || busy === 'ai'} className="w-full btn-gradient disabled:opacity-50"><Save className="h-4 w-4 mr-2" /> {data.connected ? 'Kaydet' : 'Kaydetmek için önce numarayı bağlayın'}</button>
        )}

        {/* Deneme */}
        <form onSubmit={tryAi} className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-3">
          <p className="text-sm font-black text-gray-900">Yapay zekâyı deneyin <span className="font-medium text-gray-400 text-xs">· WhatsApp'a gönderilmez, ekrandaki bilgilerle cevaplar</span></p>
          <div className="flex gap-2">
            <input className="premium-input bg-white" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Örn: Kargo ücreti ne kadar? / 18V matkap var mı?" />
            <button type="submit" disabled={!question.trim() || busy === 'try'} className="h-11 w-11 shrink-0 rounded-xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50" aria-label="Sor"><Send className="h-4 w-4" /></button>
          </div>
          {busy === 'try' && <p className="text-xs font-bold text-gray-400">Cevap hazırlanıyor…</p>}
          {answer && (
            <div className="space-y-2">
              <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-md bg-[#d9fdd3] px-4 py-3 text-sm text-gray-900 whitespace-pre-line">{answer.reply.split(/(\*[^*\n]+\*)/g).map((part, i) => (/^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : part))}</div>
              {answer.handoff
                ? <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Bu soruda konuşma ekibe devredilirdi{answer.handoffReason ? `: ${answer.handoffReason}` : '.'}</p>
                : <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Yapay zekâ bu soruyu kendisi cevaplardı.</p>}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default WhatsAppSettings;
