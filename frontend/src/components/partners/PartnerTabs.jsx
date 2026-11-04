import { useEffect, useState } from 'react';
import { FileSpreadsheet, Undo2, Printer, Bell, Check, Trash2, Upload, FileDown, Paperclip, RotateCcw } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { downloadFile } from '../../utils/download';
import { formatTRY, formatDate, formatMoney } from '../../utils/format';
import { TX_SOURCES } from '../../utils/partner';

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Cari hareketleri: tarih / borç-alacak / kaynak / açıklama filtresi, yürüyen bakiye, Excel, ters kayıt, makbuz.
 */
export const LedgerTab = ({ partner, version, onChanged, showAlert }) => {
  const [filter, setFilter] = useState({ from: '', to: '', type: '', source: '', q: '' });
  const [query, setQuery] = useState(filter);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(filter); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [filter]);
  useEffect(() => {
    const params = { ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), page, limit: 50 };
    api.get(`/partners/${partner.id}/transactions`, { params }).then((r) => setData(r.data)).catch(() => setData({ rows: [], totals: {}, pagination: {} }));
  }, [partner.id, query, page, version]);

  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });
  const cur = partner.currency || 'TRY';
  const money = (v) => formatMoney(v, cur);

  const reverse = async (t) => {
    const reason = window.prompt(`Ters kayıt nedeni (${money(t.amount)} · ${t.description || ''}):`);
    if (!reason) return;
    try {
      const res = await api.post(`/partners/${partner.id}/transactions/${t.id}/reverse`, { reason });
      showAlert({ type: 'success', title: 'Ters kayıt', message: res.data.message });
      onChanged();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yapılamadı', message: errorMessage(err, 'Ters kayıt yapılamadı.') });
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <input type="date" className="premium-input !py-2 text-xs" title="Başlangıç" value={filter.from} onChange={set('from')} />
        <input type="date" className="premium-input !py-2 text-xs" title="Bitiş" value={filter.to} onChange={set('to')} />
        <select className="premium-input !py-2 text-xs" value={filter.type} onChange={set('type')}>
          <option value="">Borç + alacak</option><option value="DEBT">Yalnız borç</option><option value="CREDIT">Yalnız alacak</option>
        </select>
        <select className="premium-input !py-2 text-xs" value={filter.source} onChange={set('source')}>
          <option value="">Tüm kaynaklar</option>
          {Object.entries(TX_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input className="premium-input !py-2 text-xs col-span-2 sm:col-span-1" placeholder="Açıklamada ara" value={filter.q} onChange={set('q')} />
        <div className="flex gap-2 col-span-2 sm:col-span-3">
          <button type="button" onClick={() => setFilter({ from: '', to: '', type: '', source: '', q: '' })} className="flex items-center px-3 h-9 rounded-xl text-xs font-black text-gray-500 bg-gray-100"><RotateCcw className="h-3.5 w-3.5 mr-1" /> Temizle</button>
          <button type="button" onClick={() => downloadFile(`/partners/${partner.id}/transactions/export`, Object.fromEntries(Object.entries(query).filter(([, v]) => v)), 'hareketler.xlsx')}
            className="flex items-center px-3 h-9 rounded-xl text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel'e aktar</button>
        </div>
      </div>

      {!data ? <p className="text-xs text-gray-400 py-6 text-center">Yükleniyor...</p> : (<>
        <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
          <span>Borç: <b className="text-red-600">{money(data.totals.debt)}</b></span>
          <span>Alacak: <b className="text-emerald-600">{money(data.totals.credit)}</b></span>
          <span>{data.pagination.total} hareket</span>
        </div>
        {data.rows.length === 0 ? <p className="text-xs text-gray-400 py-6 text-center">Bu filtrede hareket yok.</p> : (
          <div className="divide-y divide-gray-50">
            {data.rows.map((t) => {
              const src = TX_SOURCES[t.source] || TX_SOURCES.MANUAL;
              return (
                <div key={t.id} className={`py-2.5 flex gap-3 ${t.reversed ? 'opacity-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 break-words">{t.description || (t.type === 'DEBT' ? 'Borç' : 'Alacak')}</p>
                    <p className="text-[10px] text-gray-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span>{formatDate(t.date)}</span>
                      <span className={`px-1.5 py-0.5 rounded font-black uppercase ${src.className}`}>{src.label}</span>
                      {t.reversed && <span className="font-black text-red-500">Ters kaydedildi</span>}
                      {t.createdByName && <span>· {t.createdByName}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black tabular-nums ${t.type === 'DEBT' ? 'text-red-600' : 'text-emerald-600'}`}>{money(t.amount)} <span className="text-[9px] uppercase">{t.type === 'DEBT' ? 'B' : 'A'}</span></p>
                    {t.currency !== 'TRY' && <p className="text-[10px] text-gray-400 tabular-nums">kur {t.rate} · {formatTRY(t.amountTRY)}</p>}
                    <p className="text-[10px] text-gray-400 tabular-nums">Bakiye {money(t.balanceAfter)}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 w-7">
                    {t.payment && <a href={`/print/receipt/${t.payment.id}`} target="_blank" rel="noreferrer" title={`Makbuz ${t.payment.receiptNo ?? ''}`} className="p-1 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Printer className="h-4 w-4" /></a>}
                    {t.reversible && <button type="button" onClick={() => reverse(t)} title="Ters kayıt" className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Undo2 className="h-4 w-4" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {data.pagination.pages > 1 && (
          <div className="flex justify-center gap-2 pt-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 h-8 rounded-lg text-xs font-black bg-gray-100 disabled:opacity-40">Önceki</button>
            <span className="text-xs font-bold text-gray-500 self-center">{page} / {data.pagination.pages}</span>
            <button disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)} className="px-3 h-8 rounded-lg text-xs font-black bg-gray-100 disabled:opacity-40">Sonraki</button>
          </div>
        )}
        {!query.from && <p className="text-[10px] text-gray-400">Açılış bakiyesi (hareket öncesi): {money(data.openingBalance)}</p>}
      </>)}
    </div>
  );
};

// Görüşme notları ve hatırlatmalar
export const NotesTab = ({ partner, notes, currentUserId, onChanged, showAlert }) => {
  const [body, setBody] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/partners/${partner.id}/notes`, { body, remindAt: remindAt ? new Date(remindAt).toISOString() : null });
      setBody(''); setRemindAt('');
      onChanged();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Not kaydedilemedi.') });
    }
  };
  const act = (fn) => fn().then(onChanged).catch((err) => showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İşlem yapılamadı.') }));
  const now = new Date();

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="rounded-xl bg-gray-50 p-3 space-y-2">
        <textarea required maxLength={2000} className="premium-input !bg-white h-20 resize-none" placeholder="Örn: Aradım, cuma ödeme yapacak." value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center text-xs font-bold text-gray-500"><Bell className="h-3.5 w-3.5 mr-1" /> Hatırlat:</label>
          <input type="datetime-local" className="premium-input !bg-white !py-1.5 !w-auto text-xs" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
          <button className="ml-auto px-4 h-9 rounded-xl text-xs font-black text-white bg-gray-900">Notu Ekle</button>
        </div>
        <p className="text-[10px] text-gray-400">Hatırlatma zamanı gelince size bildirim gelir (saatlik kontrol edilir).</p>
      </form>
      {notes.length === 0 ? <p className="text-xs text-gray-400">Henüz not yok.</p> : notes.map((n) => {
        const due = n.remindAt && !n.doneAt && new Date(n.remindAt) <= now;
        return (
          <div key={n.id} className={`rounded-xl ring-1 p-3 ${n.doneAt ? 'ring-gray-100 opacity-60' : due ? 'ring-amber-300 bg-amber-50/40' : 'ring-gray-100'}`}>
            <p className={`text-sm text-gray-800 whitespace-pre-line ${n.doneAt ? 'line-through' : ''}`}>{n.body}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-gray-400">
              <span>{n.user?.name || '—'} · {formatDate(n.createdAt, true)}</span>
              {n.remindAt && <span className={`flex items-center font-bold ${due ? 'text-amber-700' : ''}`}><Bell className="h-3 w-3 mr-0.5" />{formatDate(n.remindAt, true)}</span>}
              <span className="ml-auto flex gap-1">
                <button type="button" onClick={() => act(() => api.patch(`/partners/${partner.id}/notes/${n.id}`, { done: !n.doneAt }))} className="flex items-center px-2 py-1 rounded-lg font-black text-emerald-700 hover:bg-emerald-50"><Check className="h-3 w-3 mr-0.5" /> {n.doneAt ? 'Geri aç' : 'Tamamlandı'}</button>
                {n.user?.id === currentUserId && <button type="button" onClick={() => act(() => api.delete(`/partners/${partner.id}/notes/${n.id}`))} className="p-1 rounded-lg text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Belgeler: yetkiyle indirilir (herkese açık adresi yoktur)
export const DocumentsTab = ({ partner, documents, onChanged, showAlert, confirm }) => {
  const [busy, setBusy] = useState(false);
  const upload = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    setBusy(true);
    try {
      await api.post(`/partners/${partner.id}/documents`, data);
      onChanged();
    } catch (err) {
      showAlert({ type: 'error', title: 'Yüklenemedi', message: errorMessage(err, 'Belge yüklenemedi.') });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d) => {
    if (!(await confirm({ title: 'Belge silinsin mi?', message: d.name, confirmText: 'Sil' }))) return;
    api.delete(`/partners/${partner.id}/documents/${d.id}`).then(onChanged).catch(() => {});
  };
  return (
    <div className="space-y-3">
      <label className={`flex items-center justify-center gap-2 h-16 rounded-xl border-2 border-dashed border-gray-200 text-xs font-black text-gray-500 cursor-pointer hover:border-brand-300 hover:text-brand-600 ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
        <Upload className="h-4 w-4" /> {busy ? 'Yükleniyor...' : 'Belge yükle (PDF, görsel, Excel, Word · en fazla 15 MB)'}
        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.xlsx,.xls,.docx,.csv,.txt" onChange={upload} />
      </label>
      {documents.length === 0 ? <p className="text-xs text-gray-400">Belge yok. Vergi levhası, sözleşme, imza sirküleri gibi belgeleri ekleyebilirsiniz.</p> : documents.map((d) => (
        <div key={d.id} className="flex items-center gap-3 rounded-xl ring-1 ring-gray-100 p-3">
          <Paperclip className="h-4 w-4 text-gray-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-800 truncate">{d.name}</p>
            <p className="text-[10px] text-gray-400">{kb(d.size)} · {d.uploadedBy || '—'} · {formatDate(d.createdAt)}</p>
          </div>
          <button type="button" onClick={() => downloadFile(`/partners/${partner.id}/documents/${d.id}`, {}, d.name)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="İndir"><FileDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => remove(d)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Sil"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
};
