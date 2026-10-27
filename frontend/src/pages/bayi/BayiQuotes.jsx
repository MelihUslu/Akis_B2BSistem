import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileSignature, CheckCircle2, XCircle, Clock, ChevronDown, FileDown, MessageSquareText } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import QuoteDocument from '../../components/quotes/QuoteDocument';
import { formatTRY, formatDate } from '../../utils/format';
import { QUOTE_STATUS } from '../../utils/quote';
import { t } from '../../i18n';
import PageHeader from '../../components/shared/PageHeader';
import EmptyState from '../../components/shared/EmptyState';

const BayiQuotes = () => {
  const [quotes, setQuotes] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [payment, setPayment] = useState('CURRENT_ACCOUNT');
  const [feedback, setFeedback] = useState(null); // { id, type, note }
  const navigate = useNavigate();
  const { alertElement, showAlert, confirm } = useAlert();

  const load = () => api.get('/quotes').then((res) => setQuotes(res.data)).catch(() => setQuotes([]));
  useEffect(() => { load(); }, []);

  const accept = async (q) => {
    const ok = await confirm({ type: 'info', title: t('Teklifi onaylıyor musunuz?'), message: t('{amount} (KDV dahil) tutarında sipariş oluşturulacak ve onay için firmaya iletilecek.', { amount: formatTRY(q.document.totals.total) }), confirmText: t('Siparişe Dönüştür') });
    if (!ok) return;
    try {
      const res = await api.post(`/quotes/${q.id}/accept`, { revision: q.revision, paymentMethod: payment });
      showAlert({ type: 'success', title: t('Sipariş Oluşturuldu'), message: res.data.message, confirmText: t('Siparişe Git'), onConfirm: () => navigate(`/bayi/orders/${res.data.orderId}`) });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('Onaylanamadı'), message: errorMessage(err, t('Teklif onaylanamadı.')) });
      if (err.response?.status === 409) load();
    }
  };

  const sendFeedback = async (e) => {
    e.preventDefault();
    try {
      const q = quotes.find((x) => x.id === feedback.id);
      const res = await api.post(`/quotes/${q.id}/feedback`, { revision: q.revision, type: feedback.type, note: feedback.note });
      setFeedback(null);
      showAlert({ type: 'success', title: t('İletildi'), message: res.data.message });
      load();
    } catch (err) {
      showAlert({ type: 'error', title: t('Hata'), message: errorMessage(err, t('Yanıt iletilemedi.')) });
    }
  };

  const cancel = async (q) => {
    const ok = await confirm({ title: t('Teklif talebi iptal edilsin mi?'), message: q.code, confirmText: t('İptal Et') });
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
      <PageHeader icon={FileSignature} title={t('Tekliflerim')} subtitle={t('Ürün detayından veya sepetten teklif isteyebilirsiniz. Onayladığınız teklif, teklif fiyatlarıyla siparişe dönüşür.')} />

      {quotes.length === 0 ? (
        <EmptyState icon={FileSignature}>{t('Henüz teklifiniz yok.')}</EmptyState>
      ) : quotes.map((q) => {
        const status = QUOTE_STATUS[q.status] || QUOTE_STATUS.PREPARING;
        const doc = q.document;
        const open = openId === q.id;
        return (
          <div key={q.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${open ? 'border-indigo-300' : 'border-gray-100'}`}>
            <button onClick={() => setOpenId(open ? null : q.id)} className="w-full p-5 md:p-6 flex justify-between items-center gap-3 text-left">
              <div className="flex flex-wrap gap-x-8 gap-y-2 items-center min-w-0">
                <div><p className="text-[10px] font-black text-gray-400 uppercase">{t('Teklif')}</p><p className="font-black text-gray-900">{q.code}{q.revision > 1 && <span className="text-xs text-gray-400"> · Rev. {q.revision}</span>}</p></div>
                <div><p className="text-[10px] font-black text-gray-400 uppercase">{t('Tarih')}</p><p className="text-sm text-gray-700">{formatDate(doc?.issuedAt || q.createdAt)}</p></div>
                {doc && <div><p className="text-[10px] font-black text-gray-400 uppercase">{t('Toplam (KDV dahil)')}</p><p className="font-black text-indigo-600">{formatTRY(doc.totals.total)}</p></div>}
                {doc?.validUntil && q.status === 'QUOTED' && <p className="text-xs font-bold text-amber-600 flex items-center"><Clock className="h-3.5 w-3.5 mr-1" /> {t('Son geçerlilik:')} {formatDate(doc.validUntil)}</p>}
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${status.className}`}>{t(status.label)}</span>
                {q.order && <span className="text-xs font-black text-emerald-600">{t('Sipariş')} #AK-{q.order.id}</span>}
              </div>
              <ChevronDown className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="border-t border-gray-50 p-5 md:p-6 space-y-5">
                {q.status === 'REVISING' && <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl p-3">{t('Bu teklif şu anda revize ediliyor. Güncel sürüm hazır olunca bildirim alacaksınız.')}</p>}
                {q.response?.type === 'REVISION_REQUESTED' && q.status === 'QUOTED' && <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-xl p-3">{t('Revizyon talebiniz iletildi')}: “{q.response.note}”</p>}
                {q.note && <p className="text-xs text-gray-500"><b>{t('Notunuz:')}</b> {q.note}</p>}

                {doc ? (
                  <div className="text-[12px]"><QuoteDocument doc={doc} /></div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {q.requestedItems.map((i, idx) => (
                      <div key={idx} className="py-3 flex justify-between gap-4 text-sm">
                        <span className="min-w-0"><b className="text-gray-900">{i.name}</b><span className="block text-xs text-gray-500">{[i.variantLabel, i.sku].filter(Boolean).join(' · ')}</span></span>
                        <span className="text-gray-700 whitespace-nowrap">{i.quantity} {i.unit}</span>
                      </div>
                    ))}
                    <p className="pt-3 text-xs font-bold text-gray-400">{t('Fiyat bekleniyor')}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 justify-end items-center">
                  {q.order && <Link to={`/bayi/orders/${q.order.id}`} className="text-xs font-black text-emerald-600 hover:underline">{t('Sipariş')} #AK-{q.order.id}</Link>}
                  {doc && <a href={`/print/quote/${q.id}`} target="_blank" rel="noreferrer" className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100"><FileDown className="h-4 w-4 mr-1.5" /> PDF</a>}
                  {q.status === 'PREPARING' && q.source === 'DEALER' && (
                    <button onClick={() => cancel(q)} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-gray-500 bg-gray-100 hover:bg-gray-200"><XCircle className="h-4 w-4 mr-1.5" /> {t('İptal')}</button>
                  )}
                  {q.canRespond && (
                    <>
                      <button onClick={() => setFeedback({ id: q.id, type: 'REVISION_REQUESTED', note: '' })} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-amber-700 bg-amber-50 hover:bg-amber-100"><MessageSquareText className="h-4 w-4 mr-1.5" /> {t('Revizyon İste')}</button>
                      <button onClick={() => setFeedback({ id: q.id, type: 'REJECTED', note: '' })} className="flex items-center px-4 py-2 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100"><XCircle className="h-4 w-4 mr-1.5" /> {t('Reddet')}</button>
                      <select className="premium-input !py-2 !w-auto text-xs" value={payment} onChange={(e) => setPayment(e.target.value)}>
                        <option value="CURRENT_ACCOUNT">{t('Cari hesap')}</option>
                        <option value="WIRE_TRANSFER">{t('Havale / EFT')}</option>
                      </select>
                      <button onClick={() => accept(q)} className="flex items-center px-5 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600"><CheckCircle2 className="h-4 w-4 mr-1.5" /> {t('Onayla ve Sipariş Ver')}</button>
                    </>
                  )}
                </div>

                {feedback?.id === q.id && (
                  <form onSubmit={sendFeedback} className="rounded-xl bg-gray-50 p-4 space-y-3">
                    <label className="premium-label">{feedback.type === 'REVISION_REQUESTED' ? `${t('Ne değişmeli?')} *` : t('Not (isteğe bağlı)')}</label>
                    <textarea required={feedback.type === 'REVISION_REQUESTED'} maxLength={1000} className="premium-input !bg-white h-20 resize-none" value={feedback.note} onChange={(e) => setFeedback({ ...feedback, note: e.target.value })} />
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setFeedback(null)} className="px-4 py-2 rounded-xl text-xs font-black text-gray-500 bg-white">{t('Vazgeç')}</button>
                      <button className="px-4 py-2 rounded-xl text-xs font-black text-white bg-gray-900">{feedback.type === 'REVISION_REQUESTED' ? t('Revizyon İste') : t('Teklifi Reddet')}</button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BayiQuotes;
