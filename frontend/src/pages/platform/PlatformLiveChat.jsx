import { useEffect, useRef, useState } from 'react';
import { MessagesSquare, Bot, UserRound, Send, Hand, RotateCcw, XCircle, Phone, Mail, Building2, RefreshCw } from 'lucide-react';
import { platformApi, errorMessage } from '../../services/api';
import { formatDate } from '../../utils/format';

const LEAD_STATUS = {
  NEW: ['Yeni', 'bg-indigo-100 text-indigo-700'],
  CONTACTED: ['Görüşüldü', 'bg-amber-100 text-amber-700'],
  WON: ['Müşteri oldu', 'bg-emerald-100 text-emerald-700'],
  LOST: ['Olumsuz', 'bg-gray-200 text-gray-600'],
};
const CHAT_STATUS = { BOT: ['Bot yanıtlıyor', 'bg-sky-100 text-sky-700'], HUMAN: ['Temsilcide', 'bg-violet-100 text-violet-700'], CLOSED: ['Kapalı', 'bg-gray-200 text-gray-600'] };
const Pill = ({ map, value }) => <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${map[value]?.[1] || ''}`}>{map[value]?.[0] || value}</span>;
const utmText = (u) => (u ? [u.utm_source, u.utm_campaign].filter(Boolean).join(' / ') || (u.gclid ? 'Google Ads' : u.fbclid ? 'Meta' : '') : '');

// Sohbet ayrıntısı: mesajlar, devral / bota ver / kapat, temsilci yanıtı (açıkken 4 sn'de bir yenilenir)
const ChatThread = ({ id, onChanged }) => {
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const listRef = useRef(null);
  useEffect(() => {
    let alive = true;
    const load = () => platformApi.get(`/chats/${id}`).then((r) => { if (alive) setChat(r.data); }).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [id, version]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [chat?.messages?.length]);

  const act = (fn) => fn().then(() => { setVersion((v) => v + 1); onChanged(); }).catch((e) => setError(errorMessage(e)));
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const body = text;
    setText('');
    act(() => platformApi.post(`/chats/${id}/messages`, { text: body }));
  };
  if (!chat) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  const lead = chat.lead;

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[30rem] rounded-2xl bg-white ring-1 ring-gray-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-black text-gray-900 flex items-center gap-2">{lead?.name || lead?.company || 'Ziyaretçi'} <Pill map={CHAT_STATUS} value={chat.status} /></p>
          <p className="text-xs text-gray-500 truncate">{formatDate(chat.createdAt, true)} · {chat.pageUrl}{utmText(chat.utm) && ` · ${utmText(chat.utm)}`}</p>
        </div>
        {chat.status !== 'HUMAN' && <button onClick={() => act(() => platformApi.patch(`/chats/${id}`, { status: 'HUMAN' }))} className="h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-black flex items-center gap-1.5"><Hand className="h-4 w-4" /> Devral</button>}
        {chat.status === 'HUMAN' && <button onClick={() => act(() => platformApi.patch(`/chats/${id}`, { status: 'BOT' }))} className="h-9 px-3 rounded-lg bg-gray-100 text-gray-700 text-xs font-black flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Bota ver</button>}
        {chat.status !== 'CLOSED' && <button onClick={() => act(() => platformApi.patch(`/chats/${id}`, { status: 'CLOSED' }))} className="h-9 px-3 rounded-lg bg-gray-100 text-gray-700 text-xs font-black flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Kapat</button>}
      </div>
      {lead && (
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100 flex flex-wrap gap-x-5 gap-y-1 text-sm text-emerald-900">
          <span className="font-black">Satış talebi #{lead.id}</span>
          {lead.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{lead.company}</span>}
          {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1 underline"><Phone className="h-3.5 w-3.5" />{lead.phone}</a>}
          {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1 underline"><Mail className="h-3.5 w-3.5" />{lead.email}</a>}
        </div>
      )}
      <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-3 bg-gray-50">
        {chat.messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${m.role === 'USER' ? 'bg-white ring-1 ring-gray-200 text-gray-800' : m.role === 'AGENT' ? 'bg-violet-600 text-white' : 'bg-sky-50 ring-1 ring-sky-100 text-gray-800'}`}>
              <p className={`text-[10px] font-black mb-0.5 flex items-center gap-1 ${m.role === 'AGENT' ? 'text-violet-200' : 'text-gray-400'}`}>
                {m.role === 'USER' ? <><UserRound className="h-3 w-3" />Ziyaretçi</> : m.role === 'BOT' ? <><Bot className="h-3 w-3" />Bot</> : 'Siz'} · {formatDate(m.createdAt, true)}
              </p>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="px-5 py-2 text-xs text-red-600 bg-red-50">{error}</p>}
      <form onSubmit={send} className="p-3 border-t border-gray-100 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={chat.status === 'CLOSED' ? 'Sohbet kapalı' : 'Yanıt yazın (gönderince konuşmayı devralırsınız, bot susar)'} disabled={chat.status === 'CLOSED'}
          className="flex-1 h-11 rounded-xl bg-gray-50 px-4 text-sm outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50" />
        <button disabled={!text.trim() || chat.status === 'CLOSED'} className="h-11 px-4 rounded-xl bg-violet-600 text-white text-sm font-black flex items-center gap-1.5 disabled:opacity-40"><Send className="h-4 w-4" /> Gönder</button>
      </form>
    </div>
  );
};

const Leads = () => {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { platformApi.get('/leads', { params: { status: status || undefined } }).then((r) => setData(r.data)).catch(() => setData({ data: [], counts: {} })); }, [status, version]);
  const update = (id, patch) => platformApi.patch(`/leads/${id}`, patch).then(() => setVersion((v) => v + 1));
  if (!data) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[['', 'Tümü'], ...Object.entries(LEAD_STATUS).map(([k, [l]]) => [k, l])].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k)} className={`h-9 px-3 rounded-lg text-xs font-black ${status === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}{k && data.counts[k] ? ` (${data.counts[k]})` : ''}</button>
        ))}
      </div>
      {data.data.length === 0 ? <p className="p-10 text-center text-gray-400 rounded-2xl bg-white ring-1 ring-gray-100">Talep yok.</p> : (
        <div className="rounded-2xl bg-white ring-1 ring-gray-100 divide-y divide-gray-50">
          {data.data.map((l) => (
            <div key={l.id} className="p-4 md:p-5 grid md:grid-cols-[minmax(0,1fr)_14rem] gap-4">
              <div className="min-w-0">
                <p className="font-black text-gray-900 flex flex-wrap items-center gap-2">{l.name || 'İsimsiz'}{l.company && <span className="font-semibold text-gray-500">· {l.company}</span>}<Pill map={LEAD_STATUS} value={l.status} /><span className="text-[10px] font-black text-gray-400">{l.source === 'CHAT' ? 'SOHBET' : 'FORM'}</span></p>
                <p className="mt-1 text-sm text-gray-600 flex flex-wrap gap-x-4">
                  {l.phone && <a href={`tel:${l.phone}`} className="text-indigo-600 font-semibold">{l.phone}</a>}
                  {l.email && <a href={`mailto:${l.email}`} className="text-indigo-600 font-semibold">{l.email}</a>}
                  <span className="text-gray-400">{formatDate(l.createdAt, true)}{utmText(l.utm) && ` · ${utmText(l.utm)}`}</span>
                </p>
                {l.message && <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{l.message}</p>}
                <textarea defaultValue={l.note} onBlur={(e) => e.target.value !== l.note && update(l.id, { note: e.target.value })} placeholder="Not (kaydetmek için alanın dışına tıklayın)" rows={1}
                  className="mt-2 w-full rounded-lg bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 resize-y" />
              </div>
              <select value={l.status} onChange={(e) => update(l.id, { status: e.target.value })} className="premium-input !py-2 text-sm self-start">
                {Object.entries(LEAD_STATUS).map(([k, [lbl]]) => <option key={k} value={k}>{lbl}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Canlı destek: tanıtım sitesindeki sohbetler (bot otomatik yanıtlar; temsilci devralabilir) ve satış talepleri.
 */
const PlatformLiveChat = () => {
  const [tab, setTab] = useState('chats');
  const [filter, setFilter] = useState('');
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (tab !== 'chats') return undefined;
    const load = () => platformApi.get('/chats', { params: { filter: filter || undefined } }).then((r) => setList(r.data)).catch(() => setList({ data: [], stats: {} }));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [tab, filter, version]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-violet-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-violet-500/25 shrink-0"><MessagesSquare className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Canlı Destek</h1>
            <p className="text-gray-500 text-sm mt-1">Tanıtım sitesindeki sohbetler ve satış talepleri. Bot otomatik yanıtlar; isterseniz konuşmayı devralırsınız.</p>
          </div>
        </div>
        <button onClick={() => setVersion((v) => v + 1)} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200 lg:mr-14"><RefreshCw className="h-4 w-4 mr-1.5" /> Yenile</button>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        {[['chats', `Sohbetler${list?.stats?.waiting ? ` · ${list.stats.waiting} bekliyor` : ''}`], ['leads', 'Satış talepleri']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {tab === 'leads' ? <Leads /> : (
        <div className="grid xl:grid-cols-[24rem_minmax(0,1fr)] gap-5 items-start">
          <div className="rounded-2xl bg-white ring-1 ring-gray-100 overflow-hidden">
            <div className="p-3 flex gap-1.5 border-b border-gray-100">
              {[['', 'Tümü'], ['waiting', 'Temsilci bekleyen'], ['lead', 'Talep bırakan']].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={`h-8 px-3 rounded-lg text-xs font-black ${filter === k ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>{l}</button>
              ))}
            </div>
            <div className="max-h-[calc(100vh-18rem)] overflow-y-auto divide-y divide-gray-50">
              {!list ? <p className="p-8 text-center text-gray-400">Yükleniyor…</p> : list.data.length === 0 ? <p className="p-8 text-center text-gray-400 text-sm">Henüz sohbet yok.</p> : list.data.map((c) => (
                <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selected === c.id ? 'bg-violet-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    {c.unread && <span className="h-2 w-2 rounded-full bg-violet-600 shrink-0" />}
                    <span className="font-bold text-gray-900 truncate flex-1">{c.lead?.name || c.lead?.company || c.lead?.phone || 'Ziyaretçi'}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{formatDate(c.lastMessageAt, true)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{c.last?.text}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Pill map={CHAT_STATUS} value={c.status} />
                    {c.needsHuman && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-700">Temsilci istiyor</span>}
                    {c.lead && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700">İletişim bıraktı</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {selected ? <ChatThread key={selected} id={selected} onChanged={() => setVersion((v) => v + 1)} /> : <p className="p-16 text-center text-gray-400 rounded-2xl bg-white ring-1 ring-gray-100">Soldan bir sohbet seçin.</p>}
        </div>
      )}
    </div>
  );
};

export default PlatformLiveChat;
