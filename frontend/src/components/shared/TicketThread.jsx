import React, { useEffect, useRef, useState } from 'react';
import { Send, LifeBuoy, Flame, Lock, RotateCcw, Zap, CalendarDays, User, Timer, MonitorSmartphone, ChevronDown } from 'lucide-react';
import { TICKET_CATEGORIES, TICKET_STATUS, initials, slaState } from './supportMeta';
import { PendingAttachments, AttachButton, MessageAttachments } from './Attachments';
import useAttachments from '../../hooks/useAttachments';
import TicketRating, { Stars } from '../support/TicketRating';

const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (d.toDateString() === today.toDateString()) return 'Bugün';
  if (d.toDateString() === yesterday.toDateString()) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};
const clock = (date) => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

// Tarayıcı bilgisinden okunabilir özet: "Chrome 130 · macOS"
const browserSummary = (ua = '') => {
  const v = (re) => (ua.match(re) || [])[1];
  const browser = v(/Edg\/(\d+)/) ? `Edge ${v(/Edg\/(\d+)/)}`
    : v(/Chrome\/(\d+)/) ? `Chrome ${v(/Chrome\/(\d+)/)}`
      : v(/Firefox\/(\d+)/) ? `Firefox ${v(/Firefox\/(\d+)/)}`
        : v(/Version\/(\d+).*Safari/) ? `Safari ${v(/Version\/(\d+).*Safari/)}` : 'Tarayıcı';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ');
};

const ContextPanel = ({ context }) => {
  const [open, setOpen] = useState(false);
  if (!context) return null;
  const rows = [
    ['Son sayfa', context.pageTitle ? `${context.pageTitle} (${context.page})` : context.page],
    ['Tarayıcı', browserSummary(context.userAgent)],
    ['Ekran', context.screen],
    ['Dil / saat dilimi', [context.language, context.timezone].filter(Boolean).join(' · ')],
    ['Paket', context.plan],
    ['Abonelik', context.tenantStatus],
    ['Kullanıcı', context.role],
    ['IP', context.ip],
  ].filter(([, v]) => v);
  return (
    <div className="mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-100">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600">
        <MonitorSmartphone className="h-3.5 w-3.5" /> Teknik bilgiler
        <span className="font-normal text-slate-400 truncate">· {context.page || '—'} · {browserSummary(context.userAgent)}</span>
        <ChevronDown className={`h-3.5 w-3.5 ml-auto shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 pb-3 text-xs">
          {rows.map(([k, v]) => (<React.Fragment key={k}><dt className="text-slate-400">{k}</dt><dd className="text-slate-700 font-semibold break-all">{v}</dd></React.Fragment>))}
        </dl>
      )}
    </div>
  );
};

/**
 * Destek talebinin mesajlaşma görünümü. side: bu ekranı kullanan taraf ('TENANT' | 'PLATFORM');
 * kendi mesajları sağda gösterilir. onReply(body, close) -> Promise<boolean>
 * quickReplies: platform tarafında tek tıkla eklenen hazır yanıtlar
 * client / uploadPath: ek yükleme için axios örneği ve uç; showContext: talebin teknik bilgilerini göster (platform)
 * onRate(rating, comment): firma tarafında kapanan talebe memnuniyet puanı verir
 */
const TicketThread = ({ ticket, side, onReply, onClose, subtitle, quickReplies = [], client, uploadPath, showContext = false, now, onError, onRate }) => {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const att = useAttachments(client, uploadPath, onError);
  const sla = ticket.status === 'OPEN' ? slaState(ticket.dueAt, now) : null;
  const endRef = useRef(null);
  const cat = TICKET_CATEGORIES[ticket.category] || TICKET_CATEGORIES.OTHER;
  const st = TICKET_STATUS[ticket.status] || TICKET_STATUS.OPEN;
  const closed = ticket.status === 'CLOSED';

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [ticket.id, ticket.messages.length]);

  const canSend = (body.trim() || att.files.length) && !att.uploading && !sending;
  const send = async (close = false) => {
    if (!canSend) return;
    setSending(true);
    if (await onReply(body.trim(), close, att.files)) { setBody(''); att.reset(); }
    setSending(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(false); }
  };

  return (
    <div className="card-premium flex flex-col h-[calc(100vh-15rem)] min-h-[32rem]">
      {/* Başlık */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3">
          <span className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${cat.tile}`}><cat.icon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-gray-900 tracking-tight leading-snug">{ticket.subject}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="font-mono text-[11px] text-gray-400">#{ticket.id}</span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${st.className}`}>{st.label}</span>
              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${cat.tile}`}>{cat.label}</span>
              {ticket.priority === 'HIGH' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-red-600"><Flame className="h-3 w-3" /> Acil</span>}
              {sla && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${sla.className}`} title={`Hedef yanıt: ${new Date(ticket.dueAt).toLocaleString('tr-TR')}`}>
                  <Timer className="h-3 w-3" /> {side === 'TENANT' ? `Yanıt hedefi: ${new Date(ticket.dueAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : sla.label}
                </span>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400 mt-1.5">
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {subtitle || ticket.user?.name}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {new Date(ticket.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </p>
            {side === 'PLATFORM' && ticket.rating && (
              <p className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs">
                <span className="font-bold text-gray-600">Memnuniyet:</span><Stars value={ticket.rating} />
                {ticket.ratingComment && <span className="text-gray-600">“{ticket.ratingComment}”</span>}
              </p>
            )}
            {showContext && <ContextPanel context={ticket.context} />}
          </div>
          {onClose && !closed && (
            <button onClick={onClose} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200">
              <Lock className="h-3.5 w-3.5" /> Talebi kapat
            </button>
          )}
        </div>
      </div>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-4 bg-gradient-to-b from-slate-50/60 to-white">
        {ticket.messages.map((m, i) => {
          const mine = m.authorType === side;
          const fromSupport = m.authorType === 'PLATFORM';
          const day = dayLabel(m.createdAt);
          const showDay = i === 0 || day !== dayLabel(ticket.messages[i - 1].createdAt);
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="flex items-center gap-3 py-1">
                  <span className="flex-1 h-px bg-gray-200" />
                  <span className="text-[11px] font-bold text-gray-400">{day}</span>
                  <span className="flex-1 h-px bg-gray-200" />
                </div>
              )}
              <div className={`flex items-end gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
                <span className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black ${fromSupport ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white' : 'bg-blue-100 text-blue-700'}`}>
                  {fromSupport ? <LifeBuoy className="h-4 w-4" /> : initials(m.authorName)}
                </span>
                <div className={`max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  <span className="text-[11px] font-semibold text-gray-400 mb-1 px-1">
                    {mine ? 'Siz' : m.authorName}{fromSupport && side === 'TENANT' ? ' · Destek ekibi' : ''} · {clock(m.createdAt)}
                  </span>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white ring-1 ring-gray-100 text-gray-800 rounded-bl-md'}`}>
                    {m.body}
                    <MessageAttachments files={m.attachments} mine={mine} />
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Yanıt alanı */}
      <div className="border-t border-gray-100 p-4 space-y-3 bg-white">
        {closed && onRate && <TicketRating key={ticket.id} ticket={ticket} onRate={onRate} />}
        {closed && (
          <p className="flex items-center gap-2 text-xs font-semibold text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
            <RotateCcw className="h-3.5 w-3.5" /> Bu talep kapatıldı. {side === 'TENANT' ? 'Yazarsanız talep yeniden açılır.' : 'Yanıt yazarsanız firma bilgilendirilir.'}
          </p>
        )}
        {quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 mr-1"><Zap className="h-3 w-3" /> Hazır yanıt:</span>
            {quickReplies.map((q) => (
              <button key={q.label} type="button" onClick={() => setBody((b) => (b ? `${b}\n\n${q.text}` : q.text))}
                className="px-2.5 py-1 rounded-lg bg-gray-100 text-[11px] font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-700">{q.label}</button>
            ))}
          </div>
        )}
        <div {...att.dropProps} className={`rounded-2xl ring-1 transition-all bg-white ${att.dragging ? 'ring-2 ring-blue-500 bg-blue-50/40' : 'ring-gray-200 focus-within:ring-2 focus-within:ring-blue-400'}`}>
          <textarea className="w-full h-24 resize-none rounded-2xl px-4 pt-3 text-sm outline-none bg-transparent placeholder:text-gray-400"
            placeholder={att.dragging ? 'Dosyayı bırakın…' : side === 'TENANT' ? 'Mesajınızı yazın… (ekran görüntüsünü Ctrl+V ile yapıştırabilirsiniz)' : 'Firmaya yanıtınızı yazın…'} value={body}
            onChange={(e) => setBody(e.target.value)} onKeyDown={onKeyDown} onPaste={att.onPaste} maxLength={5000} />
          {(att.files.length > 0 || att.uploading) && <div className="px-3 pb-2"><PendingAttachments files={att.files} uploading={att.uploading} onRemove={att.remove} /></div>}
          <div className="flex items-center gap-2 px-3 pb-3 flex-wrap">
            {client && <AttachButton onFiles={att.addFiles} disabled={att.files.length >= 5} />}
            <span className="hidden md:inline text-[11px] text-gray-400"><kbd className="px-1 rounded bg-gray-100 font-sans">Ctrl</kbd> + <kbd className="px-1 rounded bg-gray-100 font-sans">Enter</kbd> ile gönder</span>
            <span className="ml-auto text-[11px] text-gray-300 tabular-nums">{body.length}/5000</span>
            {side === 'PLATFORM' && (
              <button disabled={!canSend} onClick={() => send(true)}
                className="h-9 px-3 rounded-xl bg-gray-100 text-xs font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-40">Yanıtla ve kapat</button>
            )}
            <button disabled={!canSend} onClick={() => send(false)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 shadow-sm shadow-blue-500/30">
              <Send className="h-3.5 w-3.5" /> {sending ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketThread;
