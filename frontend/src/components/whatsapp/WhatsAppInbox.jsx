import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Bot, UserRound, Send, Check, CheckCheck, AlertCircle, ArrowLeft, Hand, Archive, MessageCircle, Clock } from 'lucide-react';
import api, { errorMessage } from '../../services/api';

const FILTERS = [
  ['', 'Açık'], ['waiting', 'Ekip bekliyor'], ['bot', 'Yapay zekâda'], ['human', 'Ekipte'], ['closed', 'Kapalı'],
];
const LIST_POLL = 5000;
const THREAD_POLL = 4000;

const phone = (waId) => (waId?.startsWith('90') && waId.length === 12 ? `+90 ${waId.slice(2, 5)} ${waId.slice(5, 8)} ${waId.slice(8, 10)} ${waId.slice(10)}` : `+${waId}`);
const time = (d) => {
  const date = new Date(d);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};
// WhatsApp biçimi: *kalın*
const rich = (text) => text.split(/(\*[^*\n]+\*)/g).map((part, i) => (/^\*[^*\n]+\*$/.test(part) ? <b key={i}>{part.slice(1, -1)}</b> : part));
const Tick = ({ status }) => {
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 text-gray-400" />;
  return <Check className="h-3.5 w-3.5 text-gray-400" />;
};

const StatusPill = ({ c }) => (c.status === 'BOT'
  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-black"><Bot className="h-3 w-3" /> Yapay zekâ</span>
  : c.status === 'HUMAN'
    ? <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black ${c.needsHuman ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}><UserRound className="h-3 w-3" /> {c.needsHuman ? 'Ekip bekliyor' : 'Ekipte'}</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-black">Kapalı</span>);

/**
 * WhatsApp gelen kutusu: solda konuşmalar, sağda mesajlar. Yapay zekânın cevapları, ekibin yazdıkları ve
 * sistem notları ayrı görünür. Ekip yazınca konuşmayı devralır; istenirse yapay zekâya geri bırakır.
 */
const WhatsAppInbox = ({ aiEnabled, showAlert }) => {
  const [params, setParams] = useSearchParams();
  const selected = parseInt(params.get('c')) || null;
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState({ items: [], counts: {} });
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef(null);
  const lastCount = useRef(0);

  const loadList = useCallback(() => api.get('/whatsapp/conversations', { params: { filter: filter || undefined, q: q || undefined } }).then((r) => setList(r.data)).catch(() => {}), [filter, q]);
  const loadThread = useCallback(() => (selected ? api.get(`/whatsapp/conversations/${selected}`).then((r) => setThread(r.data)).catch(() => setThread(null)) : Promise.resolve()), [selected]);

  useEffect(() => {
    const first = setTimeout(loadList, q ? 300 : 0);
    const t = setInterval(loadList, LIST_POLL);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [loadList, q]);
  useEffect(() => {
    loadThread();
    const t = setInterval(loadThread, THREAD_POLL);
    return () => clearInterval(t);
  }, [loadThread]);

  // Yeni mesaj gelince en alta kay
  const count = thread?.messages.length || 0;
  useEffect(() => {
    if (count !== lastCount.current) bottom.current?.scrollIntoView({ block: 'end' });
    lastCount.current = count;
  }, [count, selected]);

  const open = (id) => setParams(id ? { c: String(id) } : {});
  const conv = thread?.conversation?.id === selected ? thread.conversation : null;

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/whatsapp/conversations/${selected}/messages`, { text });
      setText('');
      await Promise.all([loadThread(), loadList()]);
    } catch (err) {
      showAlert({ type: 'error', title: 'Gönderilemedi', message: errorMessage(err, 'Mesaj gönderilemedi.') });
    } finally {
      setSending(false);
    }
  };
  const setStatus = async (status) => {
    try {
      await api.patch(`/whatsapp/conversations/${selected}`, { status });
      await Promise.all([loadThread(), loadList()]);
    } catch (err) {
      showAlert({ type: 'error', title: 'WhatsApp', message: errorMessage(err, 'Durum değiştirilemedi.') });
    }
  };

  return (
    <div className="card-premium overflow-hidden grid md:grid-cols-[20rem_minmax(0,1fr)] h-[calc(100vh-15rem)] min-h-[32rem]">
      {/* Konuşmalar */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col border-r border-gray-100 min-h-0`}>
        <div className="p-3 space-y-2 border-b border-gray-100">
          <div className="relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input className="premium-input !pl-10 !h-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, numara, mesaj ara…" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {FILTERS.map(([k, l]) => {
              const n = k ? list.counts[k] : null;
              return (
                <button key={k} type="button" onClick={() => setFilter(k)}
                  className={`h-8 px-3 rounded-lg text-xs font-black whitespace-nowrap flex items-center gap-1.5 ${filter === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {l}{n > 0 && <span className={`px-1.5 rounded ${k === 'waiting' && filter !== k ? 'bg-red-500 text-white' : filter === k ? 'bg-white/20' : 'bg-white text-gray-500'}`}>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {list.items.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)} className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 ${selected === c.id ? 'bg-emerald-50/60' : ''}`}>
              <span className="h-10 w-10 shrink-0 rounded-full bg-emerald-100 text-emerald-700 font-black flex items-center justify-center">{(c.name || '#').slice(0, 1).toLocaleUpperCase('tr-TR')}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-black text-gray-900 truncate">{c.name || phone(c.waId)}</span>
                  <span className={`text-[11px] shrink-0 ${c.unread ? 'text-emerald-600 font-black' : 'text-gray-400'}`}>{time(c.lastMessageAt)}</span>
                </span>
                <span className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-gray-500 truncate">{c.lastPreview}</span>
                  {c.unread > 0 && <span className="h-5 min-w-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-black flex items-center justify-center">{c.unread}</span>}
                </span>
                <span className="mt-1 block"><StatusPill c={c} /></span>
              </span>
            </button>
          ))}
          {list.items.length === 0 && <p className="p-8 text-center text-sm font-bold text-gray-400">{q || filter ? 'Bu filtrede konuşma yok.' : 'Henüz mesaj yok. Müşteriler WhatsApp numaranıza yazınca burada görünür.'}</p>}
        </div>
      </div>

      {/* Mesajlar */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-col min-h-0 bg-[#efeae2]`}>
        {!conv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-8 text-center">
            <MessageCircle className="h-12 w-12" />
            <p className="font-bold">{selected ? 'Yükleniyor…' : 'Soldan bir konuşma seçin.'}</p>
          </div>
        ) : (
          <>
            <div className="bg-white px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => open(null)} className="md:hidden p-1 -ml-1 text-gray-500" aria-label="Geri"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1">
                <p className="font-black text-gray-900 truncate">{conv.name || phone(conv.waId)}</p>
                <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-1"><span className="whitespace-nowrap">{phone(conv.waId)}</span> <StatusPill c={conv} />
                  {thread.lead && <Link to="/admin/leads" className="text-brand-600 font-bold hover:underline">Müşteri adayı</Link>}
                </p>
              </div>
              <div className="flex gap-2">
                {conv.status === 'BOT' && <button type="button" onClick={() => setStatus('HUMAN')} title="Devral" className="h-9 px-3 rounded-xl bg-amber-50 text-amber-800 text-xs font-black flex items-center gap-1.5 hover:bg-amber-100"><Hand className="h-4 w-4" /> <span className="hidden sm:inline">Devral</span></button>}
                {conv.status !== 'BOT' && aiEnabled && <button type="button" onClick={() => setStatus('BOT')} title="Yapay zekâya bırak" className="h-9 px-3 rounded-xl bg-brand-50 text-brand-700 text-xs font-black flex items-center gap-1.5 hover:bg-brand-100"><Bot className="h-4 w-4" /> <span className="hidden sm:inline">Yapay zekâya bırak</span></button>}
                {conv.status !== 'CLOSED' && <button type="button" onClick={() => setStatus('CLOSED')} title="Kapat" className="h-9 px-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-black flex items-center gap-1.5 hover:bg-gray-200"><Archive className="h-4 w-4" /> <span className="hidden sm:inline">Kapat</span></button>}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 md:px-8 py-4 space-y-2">
              {thread.messages.map((m) => {
                if (m.author === 'SYSTEM') return <p key={m.id} className="mx-auto max-w-md text-center text-[11px] font-bold text-gray-600 bg-white/80 rounded-lg px-3 py-1.5">{m.body}</p>;
                const mine = m.direction === 'OUT';
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-sm ${mine ? 'rounded-tr-md bg-[#d9fdd3]' : 'rounded-tl-md bg-white'}`}>
                      {mine && (
                        <p className={`text-[11px] font-black mb-0.5 flex items-center gap-1 ${m.author === 'AI' ? 'text-brand-600' : 'text-emerald-700'}`}>
                          {m.author === 'AI' ? <><Bot className="h-3 w-3" /> Yapay zekâ</> : <><UserRound className="h-3 w-3" /> {m.agentName || 'Ekip'}</>}
                        </p>
                      )}
                      <p className="text-sm text-gray-900 whitespace-pre-line break-words">{rich(m.body)}</p>
                      <p className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-gray-400">
                        {time(m.createdAt)}{mine && <Tick status={m.status} />}
                      </p>
                      {m.error && <p className="text-[11px] font-bold text-red-600">{m.error}</p>}
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>

            {thread.windowOpen ? (
              <form onSubmit={send} className="bg-white p-3 border-t border-gray-100 space-y-1.5">
                {conv.status === 'BOT' && <p className="text-[11px] text-gray-500 px-1">Yazarsanız konuşmayı devralırsınız; yapay zekâ bu konuşmada cevap vermeyi bırakır.</p>}
                <div className="flex gap-2 items-end">
                  <textarea rows={1} className="premium-input flex-1 resize-none !min-h-11 max-h-40" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mesaj yazın…"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
                  <button type="submit" disabled={sending || !text.trim()} className="h-11 w-11 shrink-0 rounded-xl bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50" aria-label="Gönder"><Send className="h-4 w-4" /></button>
                </div>
              </form>
            ) : (
              <p className="bg-white p-4 border-t border-gray-100 text-xs font-bold text-amber-800 flex items-center gap-2"><Clock className="h-4 w-4 shrink-0" /> Müşterinin son mesajının üzerinden 24 saat geçti; WhatsApp kuralları gereği buradan serbest mesaj gönderilemiyor. Müşteri tekrar yazınca yanıtlayabilirsiniz ya da telefonla arayın.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WhatsAppInbox;
