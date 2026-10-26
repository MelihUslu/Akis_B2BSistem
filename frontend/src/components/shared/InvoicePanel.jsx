import React, { useEffect, useState } from 'react';
import { FileText, Download, RefreshCw, Loader2, AlertTriangle, PenLine, X } from 'lucide-react';
import api, { errorMessage } from '../../services/api';

const TYPE = { E_FATURA: 'e-Fatura', E_ARSIV: 'e-Arşiv', KAGIT: 'Kâğıt fatura' };
const SOURCE = { PARASUT: 'Paraşüt', ERP: 'ERP', MANUAL: 'Elle girildi' };

/**
 * Siparişin faturası. Yönetici keser / numara girer; bayi yalnızca görür ve PDF'i açar.
 * canManage: yönetici ekranı (sipariş onay)
 */
const InvoicePanel = ({ orderId, orderStatus, canManage = false, onError }) => {
  const [state, setState] = useState({ loading: true, invoice: null, canIssue: false });
  const [manual, setManual] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/orders/${orderId}/invoice`)
    .then((r) => setState({ loading: false, invoice: r.data.invoice, canIssue: r.data.canIssue }))
    .catch(() => setState({ loading: false, invoice: null, canIssue: false }));
  useEffect(() => { load(); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arka planda kesilirken birkaç saniyede bir durumu yokla
  useEffect(() => {
    if (state.invoice?.status !== 'PENDING') return undefined;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [state.invoice?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const issue = async () => {
    setBusy(true);
    try {
      await api.post(`/orders/${orderId}/invoice`);
      setState((s) => ({ ...s, invoice: { ...(s.invoice || {}), status: 'PENDING' } }));
    } catch (err) {
      onError?.(errorMessage(err, 'Fatura kesilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const saveManual = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/orders/${orderId}/invoice`, manual);
      setManual(null);
      load();
    } catch (err) {
      onError?.(errorMessage(err, 'Kaydedilemedi.'));
    } finally {
      setBusy(false);
    }
  };

  const openPdf = async () => {
    const win = window.open('', '_blank');
    try {
      const r = await api.get(`/orders/${orderId}/invoice/pdf`);
      if (win) win.location.href = r.data.url; else window.location.href = r.data.url;
    } catch (err) {
      win?.close();
      onError?.(errorMessage(err, 'PDF açılamadı.'));
    }
  };

  if (state.loading) return null;
  const inv = state.invoice;
  const approved = ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED'].includes(orderStatus);
  if (!canManage && inv?.status !== 'ISSUED') return null;

  return (
    <div className="rounded-2xl ring-1 ring-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black text-gray-900 flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-500" /> Fatura</h4>
        {inv?.status === 'ISSUED' && <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-bold">Kesildi</span>}
        {inv?.status === 'PENDING' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[11px] font-bold"><Loader2 className="h-3 w-3 animate-spin" /> Kesiliyor</span>}
        {inv?.status === 'FAILED' && <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[11px] font-bold">Hata</span>}
      </div>

      {inv?.status === 'ISSUED' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold text-gray-900">{inv.number || '—'}</p>
            <p className="text-[11px] text-gray-400">{[TYPE[inv.documentType], canManage && SOURCE[inv.provider], inv.issuedAt && new Date(inv.issuedAt).toLocaleDateString('tr-TR')].filter(Boolean).join(' · ')}</p>
          </div>
          {(inv.provider === 'PARASUT' || inv.pdfUrl) && (
            <button onClick={openPdf} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100"><Download className="h-3.5 w-3.5" /> PDF</button>
          )}
        </div>
      )}

      {canManage && inv?.status === 'FAILED' && (
        <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-xl p-3"><AlertTriangle className="h-4 w-4 shrink-0" /> {inv.errorMessage}</p>
      )}

      {canManage && inv?.status !== 'ISSUED' && inv?.status !== 'PENDING' && !manual && (
        approved ? (
          <div className="flex flex-wrap gap-2">
            {state.canIssue && (
              <button disabled={busy} onClick={issue} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
                {inv?.status === 'FAILED' ? <><RefreshCw className="h-3.5 w-3.5" /> Tekrar dene</> : <><FileText className="h-3.5 w-3.5" /> Paraşüt ile fatura kes</>}
              </button>
            )}
            <button onClick={() => setManual({ number: '', documentType: 'E_ARSIV', pdfUrl: '' })} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200">
              <PenLine className="h-3.5 w-3.5" /> Fatura numarası gir
            </button>
          </div>
        ) : <p className="text-xs text-gray-400">Fatura, sipariş onaylandıktan sonra kesilebilir.</p>
      )}

      {manual && (
        <form onSubmit={saveManual} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-2">
          <input required autoFocus placeholder="Fatura numarası" className="h-10 rounded-xl bg-gray-50 border border-gray-200 px-3 text-sm font-mono outline-none focus:border-indigo-400" value={manual.number} onChange={(e) => setManual({ ...manual, number: e.target.value })} />
          <select className="h-10 rounded-xl bg-gray-50 border border-gray-200 px-2 text-sm" value={manual.documentType} onChange={(e) => setManual({ ...manual, documentType: e.target.value })}>
            {Object.entries(TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="url" placeholder="PDF bağlantısı (isteğe bağlı, https://…)" className="sm:col-span-2 h-10 rounded-xl bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:border-indigo-400" value={manual.pdfUrl} onChange={(e) => setManual({ ...manual, pdfUrl: e.target.value })} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" onClick={() => setManual(null)} className="inline-flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100"><X className="h-3.5 w-3.5" /> Vazgeç</button>
            <button disabled={busy} className="h-9 px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">Kaydet</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default InvoicePanel;
