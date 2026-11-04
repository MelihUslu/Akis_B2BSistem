import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, Phone, PhoneCall, Check } from 'lucide-react';
import { publicApi, errorMessage } from '../../services/api';
import { getUtm, trackEvent } from '../../utils/site';

const SESSION_KEY = 'akis_chat_session';
const readSession = () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } };

// Mesajdaki bağlantıları tıklanabilir yap (yalnızca http/https)
const CALL_TIMES = ['Hemen', 'Bugün', 'Yarın'];

// Sohbet içindeki hızlı "Beni arayın" formu: ad + telefon yeterli, bilgiler satış ekibine anında gider
const ContactCard = ({ sessionId, onDone, onClose }) => {
  const [f, setF] = useState({ name: '', phone: '', company: '', callTime: 'Hemen' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await publicApi.post(`/chat/${sessionId}/contact`, f);
      onDone(r.data.messages);
    } catch (err) {
      setError(errorMessage(err, 'Gönderilemedi.'));
    } finally {
      setBusy(false);
    }
  };
  const input = 'w-full h-10 rounded-xl bg-slate-50 border border-slate-200 px-3 text-sm outline-none focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100';
  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-brand-200 shadow-[0_10px_30px_-15px_rgba(152,107,71,0.4)] p-4 space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-2.5">
        <span className="h-8 w-8 shrink-0 rounded-lg bg-brand-600 flex items-center justify-center"><PhoneCall className="h-4 w-4 text-white" /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900 leading-tight">Sizi arayalım</p>
          <p className="text-[11px] text-slate-500">Satış ekibimiz kısa bir görüşmeyle dönsün.</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Kapat"><X className="h-4 w-4" /></button>
      </div>
      <input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ad soyad" className={input} maxLength={120} />
      <input required type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Telefon (05xx xxx xx xx)" className={input} maxLength={20} />
      <input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Firma adı (isteğe bağlı)" className={input} maxLength={160} />
      <div className="flex gap-1.5">
        {CALL_TIMES.map((t) => (
          <button key={t} type="button" onClick={() => setF({ ...f, callTime: t })}
            className={`flex-1 h-8 rounded-lg text-xs font-semibold border transition-colors ${f.callTime === t ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'}`}>{t}</button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={busy} className="w-full h-10 rounded-xl bg-navy-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />} Beni arayın
      </button>
      <p className="text-[10px] text-slate-400 leading-snug">Bilgileriniz yalnızca sizinle iletişim için <a href="/kvkk" className="underline">KVKK metni</a> kapsamında kullanılır.</p>
    </form>
  );
};

const Linkify = ({ text }) => text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => (
  /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline break-all">{part}</a> : <span key={i}>{part}</span>
));

/**
 * Tanıtım sitesi canlı sohbeti. Bot otomatik yanıtlar; temsilci platform panelinden devralırsa yanıtları burada görünür.
 * hideLauncher: yüzen düğme gizlenir (kayıt sayfası); sohbet yalnızca 'akis:open-chat' olayıyla açılır.
 * Sohbet tarayıcıda hatırlanır (sayfa yenilenince devam eder). Açıkken 4 sn'de bir yeni mesaj kontrol edilir.
 */
const ChatWidget = ({ chatbot, company, raised = false, hideLauncher = false }) => {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(readSession);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [nudge, setNudge] = useState(false);
  const [hasLead, setHasLead] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const listRef = useRef(null);
  const tempSeq = useRef(0); // gönderilirken gösterilen geçici mesajın kimliği
  const lastId = messages.at(-1)?.id || 0;

  // 20 sn sonra küçük bir davet balonu (bir kez)
  useEffect(() => {
    if (sessionId || hideLauncher) return undefined;
    const t = setTimeout(() => setNudge(true), 20000);
    return () => clearTimeout(t);
  }, [sessionId, hideLauncher]);

  // Sayfadaki "Ekibimize yazın" bağlantıları sohbeti açar
  useEffect(() => {
    const show = () => { setNudge(false); setOpen(true); };
    window.addEventListener('akis:open-chat', show);
    return () => window.removeEventListener('akis:open-chat', show);
  }, []);

  // Açılınca: mevcut sohbeti yükle ya da yenisini başlat
  useEffect(() => {
    if (!open) return;
    if (sessionId && messages.length === 0) {
      publicApi.get(`/chat/${sessionId}`).then((r) => { setMessages(r.data.messages); setHasLead(r.data.hasLead); }).catch(() => {
        try { localStorage.removeItem(SESSION_KEY); } catch { /* gizli sekme */ }
        setSessionId(null);
      });
    } else if (!sessionId) {
      publicApi.post('/chat', { pageUrl: window.location.href, utm: getUtm() }).then((r) => {
        try { localStorage.setItem(SESSION_KEY, r.data.id); } catch { /* gizli sekme */ }
        setSessionId(r.data.id);
        setMessages(r.data.messages);
      }).catch((e) => setError(errorMessage(e, 'Sohbet başlatılamadı.')));
    }
  }, [open, sessionId, messages.length]);

  // Temsilci yanıtları için yoklama
  useEffect(() => {
    if (!open || !sessionId) return undefined;
    const t = setInterval(() => {
      publicApi.get(`/chat/${sessionId}`, { params: { after: lastId } }).then((r) => {
        if (r.data.messages.length) setMessages((prev) => [...prev, ...r.data.messages.filter((m) => !prev.some((p) => p.id === m.id))]);
      }).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [open, sessionId, lastId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending, open, contactOpen]);

  const contactDone = (msgs) => {
    setMessages((prev) => [...prev, ...msgs.filter((m) => !prev.some((p) => p.id === m.id))]);
    setHasLead(true);
    setContactOpen(false);
    trackEvent('lead');
  };

  const send = async (value) => {
    const body = (value ?? text).trim();
    if (!body || !sessionId || sending) return;
    setText('');
    setError(null);
    setSending(true);
    tempSeq.current += 1;
    const temp = { id: `t${tempSeq.current}`, role: 'USER', text: body };
    setMessages((prev) => [...prev, temp]);
    try {
      const r = await publicApi.post(`/chat/${sessionId}/messages`, { text: body });
      setMessages((prev) => [...prev.filter((m) => m.id !== temp.id), ...r.data.messages]);
      if (r.data.hasLead && !hasLead) trackEvent('lead');
      setHasLead(Boolean(r.data.hasLead));
      if (r.data.askContact && !r.data.hasLead) setContactOpen(true);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setText(body);
      setError(errorMessage(e, 'Mesaj gönderilemedi.'));
    } finally {
      setSending(false);
    }
  };

  const userWrote = messages.some((m) => m.role === 'USER');
  const wa = company?.whatsapp?.replace(/\D/g, '');

  return (
    <div className={`fixed right-4 md:right-6 z-50 transition-[bottom] ${raised ? 'bottom-[5.5rem] md:bottom-6' : 'bottom-4 md:bottom-6'}`}>
      {open && (
        <div className="absolute bottom-[4.5rem] right-0 w-[calc(100vw-2rem)] max-w-[24rem] h-[min(36rem,calc(100dvh-8rem))] rounded-3xl bg-white border border-slate-200 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.45)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="px-5 py-4 bg-navy-900 text-white flex items-center gap-3">
            <span className="relative h-10 w-10 rounded-2xl bg-brand-500/20 ring-1 ring-white/15 flex items-center justify-center"><MessageCircle className="h-5 w-5 text-brand-300" /><span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-navy-900" /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold leading-tight">{chatbot.botName}</p>
              <p className="text-xs text-slate-400">Genellikle anında yanıt verir</p>
            </div>
            {wa && <a href={`https://wa.me/${wa.startsWith('0') ? `9${wa}` : wa}`} target="_blank" rel="noreferrer" title="WhatsApp" className="h-9 w-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300"><Phone className="h-4 w-4" /></a>}
            <button onClick={() => setOpen(false)} className="h-9 w-9 rounded-xl hover:bg-white/10 flex items-center justify-center text-slate-300" aria-label="Kapat"><X className="h-5 w-5" /></button>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${m.role === 'USER' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}>
                  {m.role === 'AGENT' && <p className="text-[11px] font-bold text-brand-600 mb-0.5">Müşteri temsilcisi</p>}
                  <Linkify text={m.text} />
                </div>
              </div>
            ))}
            {sending && <div className="flex"><span className="rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</span></div>}
            {!userWrote && chatbot.quickReplies?.length > 0 && messages.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {chatbot.quickReplies.map((q) => <button key={q} onClick={() => send(q)} className="px-3 py-1.5 rounded-full bg-white border border-brand-200 text-xs font-semibold text-brand-700 hover:bg-brand-50">{q}</button>)}
              </div>
            )}
            {contactOpen && !hasLead && sessionId && <ContactCard sessionId={sessionId} onDone={contactDone} onClose={() => setContactOpen(false)} />}
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          </div>

          {userWrote && !hasLead && !contactOpen && (
            <div className="px-3 pt-2 flex">
              <button onClick={() => setContactOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-100 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
                <PhoneCall className="h-3.5 w-3.5" /> Beni arayın
              </button>
            </div>
          )}
          {hasLead && (
            <p className="px-4 pt-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Bilgileriniz satış ekibine iletildi</p>
          )}

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-slate-100 flex items-end gap-2">
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Mesajınızı yazın…" className="flex-1 resize-none max-h-28 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-200" />
            <button disabled={!text.trim() || sending || !sessionId} className="h-10 w-10 shrink-0 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Gönder">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <p className="pb-2 text-center text-[10px] text-slate-400">Yanıtlar otomatik asistan tarafından verilir. Yazdıklarınız <a href="/kvkk" className="underline">KVKK metni</a> kapsamında işlenir.</p>
        </div>
      )}

      {nudge && !open && !hideLauncher && (
        <button onClick={() => { setNudge(false); setOpen(true); }} className="absolute bottom-[4.5rem] right-0 w-64 text-left rounded-2xl rounded-br-md bg-white border border-slate-200 shadow-xl px-4 py-3 text-sm text-slate-700 animate-in fade-in slide-in-from-bottom-2">
          Merhaba, aklınıza takılan bir şey var mı? Hemen yanıtlayalım.
          <span onClick={(e) => { e.stopPropagation(); setNudge(false); }} className="absolute top-1.5 right-2 text-slate-400 text-xs">✕</span>
        </button>
      )}
      {(!hideLauncher || open) && <button onClick={() => { setNudge(false); setOpen(!open); }} aria-label={open ? 'Sohbeti kapat' : 'Canlı sohbet'}
        className="h-14 w-14 rounded-2xl bg-navy-900 text-white shadow-[0_15px_40px_-10px_rgba(15,23,42,0.6)] flex items-center justify-center hover:scale-105 transition-transform">
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>}
    </div>
  );
};

export default ChatWidget;
