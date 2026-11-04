import { useEffect, useState } from 'react';
import { Receipt, FileText, RefreshCw, Landmark, Check, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { platformApi, errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatDate, formatTRY } from '../../utils/format';

const PlatformPayments = () => {
  const [payments, setPayments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => {
    platformApi.get('/payments').then((res) => setPayments(res.data)).catch(() => {});
    platformApi.get('/transfers').then((res) => setTransfers(res.data)).catch(() => {});
  };

  // Havale bildirimi: hesaba geçtiyse onayla (abonelik uzar, fatura kesilir), görünmüyorsa reddet
  const approve = async (t) => {
    if (!(await confirm({ type: 'info', title: `${t.tenant.name} onaylansın mı?`, message: `${t.planName} · ${t.billingCycle === 'YEARLY' ? 'yıllık' : 'aylık'} · ${formatTRY(t.amount)} hesaba geçtiyse onaylayın. Abonelik uzatılır ve fatura kesilir.`, confirmText: 'Onayla' }))) return;
    try {
      const res = await platformApi.post(`/transfers/${t.id}/approve`, {});
      showAlert({ type: 'success', title: 'Onaylandı', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Onaylanamadı', message: errorMessage(err, 'Hata oluştu.') });
    }
    load();
  };
  const reject = async (t) => {
    const reason = window.prompt('Firmaya iletilecek sebep', 'Ödeme hesabımızda görünmüyor.');
    if (reason == null) return;
    try {
      const res = await platformApi.post(`/transfers/${t.id}/reject`, { reason });
      showAlert({ type: 'success', title: 'Reddedildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Hata oluştu.') });
    }
    load();
  };
  useEffect(() => { load(); }, []);

  const retry = async (p) => {
    try {
      const res = await platformApi.post(`/payments/${p.id}/invoice`);
      showAlert({ type: 'success', title: 'Fatura', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Fatura kesilemedi', message: errorMessage(err, 'Hata oluştu.') });
    }
    load();
  };
  const pdf = (p) => platformApi.get(`/payments/${p.id}/invoice/pdf`).then((r) => window.open(r.data.url, '_blank', 'noopener'))
    .catch((err) => showAlert({ type: 'error', title: 'PDF', message: errorMessage(err, 'PDF açılamadı.') }));

  const total = payments.filter((p) => p.status === 'SUCCESS').reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-8">
      {alertElement}
      <div className="flex items-center gap-4">
        <div className="page-icon"><Receipt className="h-6 w-6 text-brand-400" /></div>
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Ödemeler</h1>
          <p className="text-gray-500 text-sm mt-1">Son {payments.length} kayıt · Başarılı toplam {formatTRY(total)}</p>
        </div>
      </div>
      {transfers.length > 0 && (
        <div className="card-premium p-5 space-y-3 ring-2 ring-amber-200">
          <h2 className="text-sm font-black text-gray-900 flex items-center gap-2"><Landmark className="h-4 w-4 text-amber-600" /> Onay bekleyen havaleler ({transfers.length})</h2>
          <ul className="divide-y divide-gray-100">
            {transfers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="flex-1 min-w-48">
                  <Link to={`/tenants/${t.tenantId}`} className="font-bold text-gray-900 hover:text-brand-600">{t.tenant.name}</Link>
                  <p className="text-xs text-gray-500">{t.planName} · {t.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'} · gönderen <b>{t.senderName}</b> · açıklama {t.tenant.slug.toUpperCase()}-{t.planCode}{t.note && ` · ${t.note}`}</p>
                  <p className="text-[11px] text-gray-400">{formatDate(t.createdAt, true)}{t.createdByName && ` · ${t.createdByName}`}</p>
                </div>
                <span className="font-black tabular-nums text-gray-900">{formatTRY(t.amount)}</span>
                <div className="flex gap-2">
                  <button onClick={() => approve(t)} className="h-9 px-3 rounded-xl bg-emerald-600 text-white text-xs font-black flex items-center gap-1 hover:bg-emerald-700"><Check className="h-4 w-4" /> Hesaba geçti, onayla</button>
                  <button onClick={() => reject(t)} className="h-9 px-3 rounded-xl bg-white ring-1 ring-gray-200 text-gray-600 text-xs font-black flex items-center gap-1 hover:text-red-600"><X className="h-4 w-4" /> Reddet</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card-premium overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="list-head">
            <tr className="text-left text-[11px] font-black text-gray-500 uppercase tracking-[0.15em] whitespace-nowrap">
              <th className="px-6 py-4">Tarih</th><th className="px-6 py-4">Müşteri</th><th className="px-6 py-4">Paket</th>
              <th className="px-6 py-4">Yöntem</th><th className="px-6 py-4">Dönem</th><th className="px-6 py-4 text-right">Tutar</th><th className="px-6 py-4">Fatura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/70">
            {payments.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-slate-50/80 hover:shadow-[inset_3px_0_0_0_var(--color-brand-500)]">
                <td className="px-6 py-4 text-gray-500 font-semibold">{formatDate(p.createdAt, true)}</td>
                <td className="px-6 py-4"><Link to={`/tenants/${p.tenantId}`} className="font-bold text-gray-900 hover:text-brand-600">{p.tenant.name}</Link></td>
                <td className="px-6 py-4 font-semibold">{p.planCode} · {p.billingCycle === 'YEARLY' ? 'Yıllık' : 'Aylık'}</td>
                <td className="px-6 py-4 font-semibold">{p.method === 'IYZICO' ? 'iyzico' : p.reference?.startsWith('transfer:') ? 'Havale' : 'Manuel'}{p.reference && <span className="block text-[11px] text-gray-400">{p.reference}</span>}</td>
                <td className="px-6 py-4 text-gray-500">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</td>
                <td className={`px-6 py-4 text-right font-black ${p.status === 'SUCCESS' ? 'text-emerald-600' : 'text-red-500'}`}>{p.status === 'SUCCESS' ? formatTRY(p.amount) : 'Başarısız'}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {p.invoiceStatus === 'ISSUED' && <button onClick={() => pdf(p)} className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"><FileText className="h-3.5 w-3.5" /> {p.invoiceNumber || 'PDF'}</button>}
                  {p.invoiceStatus === 'PENDING' && <span className="text-xs font-bold text-brand-600">Kesiliyor…</span>}
                  {p.invoiceStatus === 'FAILED' && <button onClick={() => retry(p)} title={p.invoiceError || ''} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><RefreshCw className="h-3.5 w-3.5" /> Hata · tekrar dene</button>}
                  {!p.invoiceStatus && p.status === 'SUCCESS' && <button onClick={() => retry(p)} className="text-xs font-bold text-gray-400 hover:text-brand-600">Fatura kes</button>}
                </td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-gray-400 font-bold">Henüz ödeme yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PlatformPayments;
