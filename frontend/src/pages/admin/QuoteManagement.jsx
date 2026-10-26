import React, { useEffect, useState } from 'react';
import {
  FileSignature, ChevronDown, Send, XCircle, Clock, CheckCircle2, Layers
} from 'lucide-react';
import FilterTabs from '../../components/shared/FilterTabs';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatTRY, formatDate } from '../../utils/format';
import { QUOTE_STATUS, itemName } from '../../utils/quote';

const FILTERS = [
  { id: 'PENDING', label: 'Fiyat Bekleyen', icon: Clock, tone: 'orange' },
  { id: 'QUOTED', label: 'Teklif Verilen', icon: Send, tone: 'violet' },
  { id: 'ACCEPTED', label: 'Siparişe Dönen', icon: CheckCircle2, tone: 'emerald' },
  { id: '', label: 'Tümü', icon: Layers, tone: 'slate' },
];
const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const QuoteManagement = () => {
  const [quotes, setQuotes] = useState([]);
  const [filter, setFilter] = useState('PENDING');
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState({ prices: {}, adminNote: '', validUntil: inAWeek() });
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => api.get('/quotes', { params: filter ? { status: filter } : {} }).then((res) => setQuotes(res.data)).catch(() => {});
  useEffect(() => { load(); }, [filter]);

  const open = (q) => {
    if (openId === q.id) return setOpenId(null);
    setOpenId(q.id);
    setDraft({
      prices: Object.fromEntries(q.items.map(i => [i.id, i.quotedPrice ?? ''])),
      adminNote: q.adminNote || '',
      validUntil: q.validUntil ? q.validUntil.slice(0, 10) : inAWeek()
    });
  };

  const respond = async (q) => {
    try {
      const res = await api.patch(`/quotes/${q.id}/respond`, {
        items: q.items.map(i => ({ id: i.id, quotedPrice: draft.prices[i.id] })),
        adminNote: draft.adminNote, validUntil: draft.validUntil
      });
      showAlert({ type: 'success', title: 'Teklif Gönderildi', message: res.data.message });
      setOpenId(null);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Teklif kaydedilemedi.') });
    }
  };

  const reject = async (q) => {
    const ok = await confirm({ title: 'Teklif reddedilsin mi?', message: 'Bayiye fiyat verilemediği bildirilecek. Not alanına yazdığınız açıklama iletilir.', confirmText: 'Reddet' });
    if (!ok) return;
    try {
      await api.post(`/quotes/${q.id}/reject`, { adminNote: draft.adminNote });
      setOpenId(null);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İşlem yapılamadı.') });
    }
  };

  const draftTotal = (q) => q.items.reduce((s, i) => s + (parseFloat(draft.prices[i.id]) || 0) * i.quantity, 0);

  return (
    <div className="space-y-6">
      {alertElement}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><FileSignature className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Teklif Talepleri</h1>
            <p className="text-gray-500 text-sm mt-1">Bayilerin fiyat istediği ürünleri fiyatlandırın. Bayi onaylarsa teklif fiyatlarıyla sipariş oluşur.</p>
          </div>
        </div>
        </div>
        <FilterTabs tabs={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {quotes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">Bu filtrede teklif talebi yok.</div>
      ) : quotes.map((q) => {
        const status = QUOTE_STATUS[q.status];
        const editable = ['PENDING', 'QUOTED', 'EXPIRED'].includes(q.status);
        return (
          <div key={q.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${openId === q.id ? 'border-indigo-400' : 'border-gray-100'}`}>
            <button onClick={() => open(q)} className="w-full p-6 flex justify-between items-center text-left">
              <div className="flex flex-wrap gap-x-8 gap-y-2 items-center">
                <div><p className="text-xs font-bold text-gray-400 uppercase">Teklif</p><p className="font-bold text-gray-900">#TK-{q.id}</p></div>
                <div><p className="text-xs font-bold text-gray-400 uppercase">Bayi</p><p className="font-semibold text-gray-800">{q.company.name}</p></div>
                <div><p className="text-xs font-bold text-gray-400 uppercase">Tarih</p><p className="text-sm text-gray-700">{formatDate(q.createdAt, true)}</p></div>
                <div><p className="text-xs font-bold text-gray-400 uppercase">Kalem</p><p className="text-sm text-gray-700">{q.items.length}</p></div>
                {q.totals && <div><p className="text-xs font-bold text-gray-400 uppercase">Teklif (KDV dahil)</p><p className="font-black text-indigo-600">{formatTRY(q.totals.total)}</p></div>}
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${status.className}`}>{status.label}</span>
                {q.order && <span className="text-xs font-black text-emerald-600">#AK-{q.order.id}</span>}
              </div>
              <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${openId === q.id ? 'rotate-180' : ''}`} />
            </button>

            {openId === q.id && (
              <div className="border-t border-gray-50 bg-gray-50/50 p-6 space-y-4">
                {q.note && <p className="text-sm text-gray-700 bg-white p-4 rounded-xl border border-gray-100"><b>Bayi notu:</b> {q.note}</p>}
                <div className="space-y-2">
                  {q.items.map((i) => (
                    <div key={i.id} className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{itemName(i)}</p>
                        <p className="text-xs text-gray-500">{i.product.sku}{i.variantLabel && ` · ${i.variantLabel}`} · {i.quantity} {i.product.unit}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase">Birim fiyat (₺, KDV hariç)</label>
                        <input type="number" step="0.01" min="0" disabled={!editable} className="premium-input !py-2 w-32" value={draft.prices[i.id]}
                          onChange={(e) => setDraft({ ...draft, prices: { ...draft.prices, [i.id]: e.target.value } })} />
                        <span className="text-sm font-black text-gray-900 w-28 text-right">{formatTRY((parseFloat(draft.prices[i.id]) || 0) * i.quantity)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {editable && (
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_12rem] gap-4">
                    <div><label className="premium-label">Bayiye not</label><input className="premium-input !bg-white" value={draft.adminNote} onChange={(e) => setDraft({ ...draft, adminNote: e.target.value })} placeholder="Örn: Fiyatlara nakliye dahildir." /></div>
                    <div><label className="premium-label">Geçerlilik</label><input type="date" className="premium-input !bg-white" value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} /></div>
                  </div>
                )}
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 pt-2">
                  <p className="text-sm font-bold text-gray-500">Ara toplam (KDV hariç): <span className="text-gray-900">{formatTRY(draftTotal(q))}</span></p>
                  {editable && (
                    <div className="flex gap-3">
                      <button onClick={() => reject(q)} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100"><XCircle className="h-4 w-4 mr-1.5" /> Reddet</button>
                      <button onClick={() => respond(q)} className="btn-gradient"><Send className="h-4 w-4 mr-2" /> {q.status === 'PENDING' ? 'Teklifi Gönder' : 'Teklifi Güncelle'}</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default QuoteManagement;
