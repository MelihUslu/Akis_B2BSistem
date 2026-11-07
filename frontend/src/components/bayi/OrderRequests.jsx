import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Undo2, ChevronRight, AlertTriangle, ClipboardCheck } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { formatTRY, formatDate } from '../../utils/format';
import EmptyState from '../shared/EmptyState';
import { t } from '../../i18n';

const STATUS = {
  PENDING: ['Onay bekliyor', 'bg-amber-100 text-amber-700'],
  APPROVING: ['İşleniyor', 'bg-blue-100 text-blue-700'],
  APPROVED: ['Onaylandı', 'bg-emerald-100 text-emerald-700'],
  REJECTED: ['Reddedildi', 'bg-red-100 text-red-600'],
  CANCELLED: ['Geri çekildi', 'bg-gray-100 text-gray-500'],
};
const PAYMENT = { CURRENT_ACCOUNT: 'Cari hesap', WIRE_TRANSFER: 'Havale / EFT' };

/**
 * Bayi içinde sipariş onayı: ana kullanıcı bekleyen talepleri onaylar / reddeder; çalışan kendi taleplerini görür ve
 * bekleyeni geri çeker. Bekleyen talepte güncel tutar ve sepet uyarıları (fiyat / stok değişmiş olabilir) gösterilir.
 */
const OrderRequests = ({ data, reload, showAlert, confirm }) => {
  const [busy, setBusy] = useState(null);
  const [rejecting, setRejecting] = useState(null); // { id, reason }

  const act = async (id, action, body) => {
    setBusy(id);
    try {
      const res = await api.post(`/order-requests/${id}/${action}`, body);
      showAlert({ type: 'success', title: t('Tamam'), message: res.data.message });
      setRejecting(null);
      reload();
    } catch (err) {
      showAlert({ type: 'error', title: t('İşlem yapılamadı'), message: errorMessage(err, t('Talep güncellenemedi.')) });
    } finally {
      setBusy(null);
    }
  };
  const approve = async (r) => {
    const total = r.current?.total ?? r.total;
    if (!(await confirm({ type: 'info', title: t('Sipariş onaylansın mı?'), message: t('{name} kullanıcısının {amount} tutarındaki siparişi firmaya iletilecek.', { name: r.user.name, amount: formatTRY(total) }), confirmText: t('Onayla') }))) return;
    act(r.id, 'approve');
  };

  if (!data.requests.length) return <EmptyState icon={ClipboardCheck}>{t('Onay talebi yok.')}</EmptyState>;

  return (
    <div className="space-y-4">
      {data.requests.map((r) => {
        const [label, cls] = STATUS[r.status] || STATUS.PENDING;
        const changed = r.current?.total != null && r.total != null && Math.abs(r.current.total - r.total) >= 0.01;
        return (
          <div key={r.id} className="card-premium p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-black text-gray-900">{r.mine ? t('Talebiniz') : r.user.name} <span className="text-xs font-semibold text-gray-400">· {formatDate(r.createdAt, true)}</span></p>
                <p className="text-xs text-gray-500 mt-0.5">{t(PAYMENT[r.paymentMethod] || r.paymentMethod)} · {r.deliveryMethod === 'PICKUP' ? t('Gel-Al') : t('Kargo')} · {t('{n} kalem', { n: r.itemCount })}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${cls}`}>{t(label)}</span>
            </div>

            <ul className="text-sm text-gray-700 divide-y divide-gray-50">
              {r.lines.map((l) => (
                <li key={l.productId} className="py-1.5 flex justify-between gap-3"><span className="truncate">{l.name}</span><span className="font-semibold tabular-nums whitespace-nowrap">{l.quantity} {l.unit}</span></li>
              ))}
            </ul>
            {r.note && <p className="text-xs text-gray-500">“{r.note}”</p>}

            <div className="flex flex-wrap items-end justify-between gap-3 pt-3 border-t border-gray-50">
              <div className="text-sm">
                {r.total != null && <p className="text-gray-500">{t('Talep tutarı')} <b className="text-gray-900">{formatTRY(r.total)}</b></p>}
                {changed && <p className="text-amber-700 font-semibold">{t('Güncel tutar')} {formatTRY(r.current.total)}</p>}
                {r.current?.errors?.map((e) => <p key={e} className="text-xs font-bold text-amber-700 flex items-start mt-1"><AlertTriangle className="h-3.5 w-3.5 mr-1 mt-0.5 shrink-0" /> {e}</p>)}
                {r.status === 'REJECTED' && <p className="text-xs text-red-600 mt-1">{r.decidedBy && `${r.decidedBy}: `}{r.reason || t('Neden belirtilmedi.')}</p>}
                {r.status === 'APPROVED' && r.decidedBy && <p className="text-xs text-gray-500 mt-1">{t('Onaylayan: {name}', { name: r.decidedBy })}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === 'APPROVED' && r.orderId && (
                  <Link to={`/bayi/orders/${r.orderId}`} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-white bg-gray-900 hover:bg-gray-800">#AK-{r.orderId} <ChevronRight className="h-3.5 w-3.5 ml-1" /></Link>
                )}
                {r.status === 'PENDING' && data.isOwner && (
                  <>
                    <button type="button" disabled={busy === r.id || r.current?.errors?.length > 0} onClick={() => approve(r)} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-sm font-bold inline-flex items-center hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4 mr-1.5" /> {t('Onayla')}</button>
                    <button type="button" disabled={busy === r.id} onClick={() => setRejecting({ id: r.id, reason: '' })} className="h-10 px-4 rounded-xl ring-1 ring-red-200 text-red-600 text-sm font-bold inline-flex items-center hover:bg-red-50 disabled:opacity-50"><X className="h-4 w-4 mr-1.5" /> {t('Reddet')}</button>
                  </>
                )}
                {r.status === 'PENDING' && r.mine && !data.isOwner && (
                  <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'cancel')} className="h-10 px-4 rounded-xl ring-1 ring-gray-200 text-gray-600 text-sm font-bold inline-flex items-center hover:bg-gray-50 disabled:opacity-50"><Undo2 className="h-4 w-4 mr-1.5" /> {t('Geri çek')}</button>
                )}
              </div>
            </div>

            {rejecting?.id === r.id && (
              <div className="flex flex-col sm:flex-row gap-2">
                <input autoFocus className="premium-input flex-1" maxLength={300} placeholder={t('Ret nedeni (isteğe bağlı)')} aria-label={t('Ret nedeni')}
                  value={rejecting.reason} onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })} />
                <button type="button" disabled={busy === r.id} onClick={() => act(r.id, 'reject', { reason: rejecting.reason })} className="h-11 px-4 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">{t('Reddet')}</button>
                <button type="button" onClick={() => setRejecting(null)} className="btn-secondary !h-11">{t('Vazgeç')}</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default OrderRequests;
