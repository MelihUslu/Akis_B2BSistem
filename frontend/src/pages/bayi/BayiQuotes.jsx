import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSignature, CheckCircle2, XCircle, Clock } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import { formatTRY, formatDate } from '../../utils/format';
import { QUOTE_STATUS, itemName } from '../../utils/quote';
import { t } from '../../i18n';

const BayiQuotes = () => {
  const [quotes, setQuotes] = useState(null);
  const [payment, setPayment] = useState({});
  const navigate = useNavigate();
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => api.get('/quotes').then((res) => setQuotes(res.data)).catch(() => setQuotes([]));
  useEffect(() => { load(); }, []);

  const accept = async (q) => {
    const ok = await confirm({ type: 'info', title: t('Teklifi onaylıyor musunuz?'), message: t('{amount} (KDV dahil) tutarında sipariş oluşturulacak ve onay için firmaya iletilecek.', { amount: formatTRY(q.totals.total) }), confirmText: t('Siparişe Dönüştür') });
    if (!ok) return;
    try {
      const res = await api.post(`/quotes/${q.id}/accept`, { paymentMethod: payment[q.id] || 'CURRENT_ACCOUNT' });
      showAlert({ type: 'success', title: t('Sipariş Oluşturuldu'), message: res.data.message, confirmText: t('Siparişe Git'), onConfirm: () => navigate(`/bayi/orders/${res.data.orderId}`) });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('Onaylanamadı'), message: errorMessage(err, t('Teklif onaylanamadı.')) });
    }
  };

  const cancel = async (q) => {
    const ok = await confirm({ title: t('Teklif talebi iptal edilsin mi?'), message: `#TK-${q.id}`, confirmText: t('İptal Et') });
    if (!ok) return;
    try {
      await api.post(`/quotes/${q.id}/cancel`);
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('İptal edilemedi.')) });
    }
  };

  if (!quotes) return <div className="p-8 text-center text-gray-400">{t('Yükleniyor...')}</div>;

  return (
    <div className="space-y-6">
      {alertElement}
      <div>
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3 md:p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><FileSignature className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{t('Tekliflerim')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('Ürün detayından veya sepetten teklif isteyebilirsiniz. Onayladığınız teklif, teklif fiyatlarıyla siparişe dönüşür.')}</p>
          </div>
        </div>
      </div>

      {quotes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">{t('Henüz teklif talebiniz yok.')}</div>
      ) : quotes.map((q) => {
        const status = QUOTE_STATUS[q.status];
        return (
          <div key={q.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-4">
            <div className="flex flex-wrap justify-between gap-3 items-start">
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">#TK-{q.id} · {formatDate(q.createdAt, true)}</p>
                {q.validUntil && q.status === 'QUOTED' && <p className="text-xs font-bold text-amber-600 mt-1 flex items-center"><Clock className="h-3.5 w-3.5 mr-1" /> {t('Son geçerlilik:')} {formatDate(q.validUntil)}</p>}
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${status.className}`}>{t(status.label)}</span>
            </div>

            <div className="divide-y divide-gray-50">
              {q.items.map((i) => (
                <div key={i.id} className="py-3 flex justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{itemName(i)}</p>
                    <p className="text-xs text-gray-500">{i.product.sku}{i.variantLabel && ` · ${i.variantLabel}`} · {i.quantity} {i.product.unit}</p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    {i.quotedPrice !== null ? (
                      <><p className="font-black text-gray-900 text-sm">{formatTRY(i.quotedPrice * i.quantity)}</p><p className="text-[11px] text-gray-400">{formatTRY(i.quotedPrice)} / {i.product.unit}</p></>
                    ) : <p className="text-xs font-bold text-gray-400">{t('Fiyat bekleniyor')}</p>}
                  </div>
                </div>
              ))}
            </div>

            {q.note && <p className="text-xs text-gray-500"><b>{t('Notunuz:')}</b> {q.note}</p>}
            {q.adminNote && <p className="text-xs font-bold text-indigo-600"><b>{t('Yanıt:')}</b> {q.adminNote}</p>}

            {q.totals && (
              <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
                <div className="flex justify-between text-gray-500 font-bold"><span>{t('Ara toplam (KDV hariç)')}</span><span className="text-gray-900">{formatTRY(q.totals.subtotal)}</span></div>
                <div className="flex justify-between text-gray-500 font-bold"><span>{t('KDV')}</span><span className="text-gray-900">{formatTRY(q.totals.vatAmount)}</span></div>
                <div className="flex justify-between font-black text-gray-900 text-base"><span>{t('Toplam')}</span><span>{formatTRY(q.totals.total)}</span></div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-end items-center">
              {q.order && <Link to={`/bayi/orders/${q.order.id}`} className="text-xs font-black text-emerald-600 hover:underline">{t('Sipariş')} #AK-{q.order.id}</Link>}
              {['PENDING', 'QUOTED'].includes(q.status) && (
                <button onClick={() => cancel(q)} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-gray-500 bg-gray-100 hover:bg-gray-200"><XCircle className="h-4 w-4 mr-1.5" /> {t('İptal')}</button>
              )}
              {q.status === 'QUOTED' && (
                <>
                  <select className="premium-input !py-2 !w-auto text-xs" value={payment[q.id] || 'CURRENT_ACCOUNT'} onChange={(e) => setPayment({ ...payment, [q.id]: e.target.value })}>
                    <option value="CURRENT_ACCOUNT">{t('Cari hesap')}</option>
                    <option value="WIRE_TRANSFER">{t('Havale / EFT')}</option>
                  </select>
                  <button onClick={() => accept(q)} className="flex items-center px-5 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600"><CheckCircle2 className="h-4 w-4 mr-1.5" /> {t('Onayla ve Sipariş Ver')}</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BayiQuotes;
