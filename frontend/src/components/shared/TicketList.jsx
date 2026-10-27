import React from 'react';
import { Flame, Inbox, Timer, Paperclip, Star } from 'lucide-react';
import { TICKET_CATEGORIES, TICKET_STATUS, timeAgo, slaState } from './supportMeta';

/**
 * Destek talepleri listesi. side: bu ekranı kullanan taraf ('TENANT' | 'PLATFORM').
 * Karşı taraftan yanıt bekleyen talepler vurgulanır.
 */
const TicketList = ({ tickets, selectedId, onSelect, side, showTenant = false, now, emptyText = 'Talep yok.' }) => {
  if (tickets.length === 0) {
    return (
      <div className="py-16 text-center">
        <Inbox className="h-10 w-10 mx-auto text-gray-200 mb-2" />
        <p className="text-sm text-gray-400">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="divide-y divide-gray-100">
      {tickets.map((t, idx) => {
        const cat = TICKET_CATEGORIES[t.category] || TICKET_CATEGORIES.OTHER;
        const st = TICKET_STATUS[t.status] || TICKET_STATUS.OPEN;
        const last = t.messages?.[0];
        const active = selectedId === t.id;
        // Benim aksiyonumu bekleyen talep: firma için platform yanıtladıysa, platform için firma yazdıysa
        const needsMe = side === 'TENANT' ? t.status === 'ANSWERED' : t.status === 'OPEN';
        const lastByMe = last && last.authorType === side;
        // Hedef yanıt süresi yalnızca platform tarafında, yanıt bekleyen taleplerde gösterilir
        const sla = side === 'PLATFORM' && t.status === 'OPEN' ? slaState(t.dueAt, now) : null;
        return (
          <button key={t.id} onClick={() => onSelect(t.id)}
            className={`relative w-full text-left pl-5 pr-4 py-3.5 flex gap-3 transition-colors ${active ? 'bg-blue-50/80' : idx % 2 ? 'bg-slate-50/60 hover:bg-blue-50/40' : 'bg-white hover:bg-blue-50/40'}`}>
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${active ? 'bg-blue-600' : st.bar}`} />
            <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${cat.tile}`}><cat.icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`text-sm truncate ${needsMe ? 'font-black text-gray-900' : 'font-bold text-gray-800'}`}>{t.subject}</span>
                {t.priority === 'HIGH' && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" title="Yüksek öncelik" />}
                <span className="ml-auto text-[11px] text-gray-400 whitespace-nowrap shrink-0">{timeAgo(t.updatedAt, now)}</span>
              </span>
              {showTenant && <span className="block text-[11px] font-bold text-indigo-600 truncate">{t.tenant?.name} · {t.user?.name}</span>}
              <span className="block text-xs text-gray-500 truncate mt-0.5">
                {last ? <><span className="font-semibold text-gray-600">{lastByMe ? 'Siz' : side === 'TENANT' ? 'Destek' : last.authorName}:</span> {last.attachments?.length ? <Paperclip className="inline h-3 w-3 -mt-0.5 mr-0.5" /> : null}{last.body || 'Dosya gönderildi'}</> : '—'}
              </span>
              <span className="flex items-center gap-1.5 mt-1.5">
                <span className="font-mono text-[10px] text-gray-400">#{t.id}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${st.className}`}>{st.label}</span>
                {sla && <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${sla.className}`}><Timer className="h-3 w-3" /> {sla.label}</span>}
                {t.rating && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700" title="Memnuniyet puanı"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{t.rating}</span>}
                {side === 'TENANT' && t.status === 'CLOSED' && !t.rating && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">Puan verin</span>}
                {needsMe && !sla && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-600 text-white">{side === 'TENANT' ? 'Yeni yanıt' : 'Sırada'}</span>}
                <span className="text-[10px] text-gray-400 ml-auto">{t._count?.messages || 0} mesaj</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default TicketList;
