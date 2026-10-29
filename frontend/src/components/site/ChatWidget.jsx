import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2, Phone } from 'lucide-react';
import { publicApi, errorMessage } from '../../services/api';
import { getUtm, trackEvent } from '../../utils/site';

const SESSION_KEY = 'akis_chat_session';
const readSession = () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } };
const PHONE_OR_EMAIL = /(\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.-]+)/;

// Mesajdaki bağlantıları tıklanabilir yap (yalnızca http/https)
const Linkify = ({ text }) => text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) => (
  /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline break-all">{part}</a> : <span key={i}>{part}</span>
));

/**
 * Tanıtım sitesi canlı sohbeti. Bot otomatik yanıtlar; temsilci platform panelinden devralırsa yanıtları burada görünür.
 * Sohbet tarayıcıda hatırlanır (sayfa yenilenince devam eder). Açıkken 4 sn'de bir yeni mesaj kontrol edilir.
 */
const ChatWidget = ({ chatbot, company, raised = false }) => {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState(readSession);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [nudge, setNudge] = useState(false);
  const listRef = useRef(null);
  const tempSeq = useRef(0); // gönderilirken gösterilen geçici mesajın kimliği
  const lastId = messages.at(-1)?.id || 0;

  // 20 sn sonra küçük bir davet balonu (bir kez)
  useEffect(() => {
    if (sessionId) return undefined;
    const t = setTimeout(() => setNudge(true), 20000);
    return () => clearTimeout(t);
  }, [sessionId]);

  // Açılınca: mevcut sohbeti yükle ya da yenisini başlat
  useEffect(() => {
    if (!open) return;
    if (sessionId && messages.length === 0) {
      publicApi.get(`/chat/${sessionId}`).then((r) => setMessages(r.data.messages)).catch(() => {
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

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending, open]);

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
      if (PHONE_OR_EMAIL.test(body)) trackEvent('lead');
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
          <div className="px-5 py-4 bg-[#0b1120] text-white flex items-center gap-3">
            <span className="relative h-10 w-10 rounded-2xl bg-indigo-500/20 ring-1 ring-white/15 flex items-center justify-center"><MessageCircle className="h-5 w-5 text-indigo-300" /><span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#0b1120]" /></span>
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
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${m.role === 'USER' ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}>
                  {m.role === 'AGENT' && <p className="text-[11px] font-bold text-indigo-600 mb-0.5">Müşteri temsilcisi</p>}
                  <Linkify text={m.text} />
                </div>
              </div>
            ))}
            {sending && <div className="flex"><span className="rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />)}</span></div>}
            {!userWrote && chatbot.quickReplies?.length > 0 && messages.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {chatbot.quickReplies.map((q) => <button key={q} onClick={() => send(q)} className="px-3 py-1.5 rounded-full bg-white border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{q}</button>)}
              </div>
            )}
            {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-3 border-t border-slate-100 flex items-end gap-2">
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Mesajınızı yazın…" className="flex-1 resize-none max-h-28 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200" />
            <button disabled={!text.trim() || sending || !sessionId} className="h-10 w-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Gönder">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <p className="pb-2 text-center text-[10px] text-slate-400">Yanıtlar otomatik asistan tarafından verilir. Yazdıklarınız <a href="/kvkk" className="underline">KVKK metni</a> kapsamında işlenir.</p>
        </div>
      )}

      {nudge && !open && (
        <button onClick={() => { setNudge(false); setOpen(true); }} className="absolute bottom-[4.5rem] right-0 w-64 text-left rounded-2xl rounded-br-md bg-white border border-slate-200 shadow-xl px-4 py-3 text-sm text-slate-700 animate-in fade-in slide-in-from-bottom-2">
          Merhaba, aklınıza takılan bir şey var mı? Hemen yanıtlayalım.
          <span onClick={(e) => { e.stopPropagation(); setNudge(false); }} className="absolute top-1.5 right-2 text-slate-400 text-xs">✕</span>
        </button>
      )}
      <button onClick={() => { setNudge(false); setOpen(!open); }} aria-label={open ? 'Sohbeti kapat' : 'Canlı sohbet'}
        className="h-14 w-14 rounded-2xl bg-[#0b1120] text-white shadow-[0_15px_40px_-10px_rgba(15,23,42,0.6)] flex items-center justify-center hover:scale-105 transition-transform">
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
};

export default ChatWidget;
