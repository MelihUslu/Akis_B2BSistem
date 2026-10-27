import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, MessageSquareText, Clock, AlertTriangle } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import PrintLayout from './print/PrintLayout';
import QuoteDocument from '../components/quotes/QuoteDocument';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { formatDate } from '../utils/format';
import { t } from '../i18n';

const STATUS_NOTE = {
  ACCEPTED: { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Bu teklif kabul edildi.' },
  REJECTED: { icon: XCircle, tone: 'bg-red-50 text-red-600 border-red-200', text: 'Bu teklif reddedildi.' },
  EXPIRED: { icon: Clock, tone: 'bg-gray-50 text-gray-600 border-gray-200', text: 'Bu teklifin geçerlilik süresi doldu. Yeni teklif için firmayla iletişime geçin.' },
  REVISING: { icon: AlertTriangle, tone: 'bg-amber-50 text-amber-700 border-amber-200', text: 'Bu teklif şu anda revize ediliyor. Güncel sürüm hazır olunca bu bağlantıdan görebilirsiniz.' },
  CANCELLED: { icon: XCircle, tone: 'bg-gray-50 text-gray-600 border-gray-200', text: 'Bu teklif iptal edildi.' },
};

/**
 * Müşteriye gönderilen teklif bağlantısı (giriş gerektirmez). Müşteri teklifi görüntüler, PDF olarak kaydeder,
 * kabul eder, reddeder veya revizyon ister. Yanıt yalnızca görüntülenen sürüm için geçerlidir.
 */
const QuoteShare = () => {
  const { token } = useParams();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', note: '' });
  const [action, setAction] = useState(null); // ACCEPTED | REJECTED | REVISION_REQUESTED
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/quote-links/${token}`)
    .then((r) => { setQuote(r.data); setError(null); })
    .catch((e) => setError(errorMessage(e, t('Teklif bulunamadı veya bağlantı iptal edilmiş.'))));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/quote-links/${token}/respond`, { type: action, revision: quote.revision, name: form.name, note: form.note });
      setResult({ ok: true, message: res.data.message });
      setAction(null);
      load();
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err, t('Yanıt iletilemedi.')) });
      if (err.response?.status === 409) load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-500">{error}</div>;
  if (!quote) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('Yükleniyor...')}</div>;
  const doc = quote.document;
  const note = STATUS_NOTE[quote.status];

  return (
    <PrintLayout ready seller={doc.seller} title={t('Fiyat Teklifi')} printLabel={t('PDF olarak kaydet / yazdır')}
      toolbar={<LanguageSwitcher />}
      subtitle={<>{t('No')}: <b>{doc.code}</b>{doc.revision > 1 && ` · Rev. ${doc.revision}`}<br />{t('Tarih')}: {formatDate(doc.issuedAt)}</>}>
      {note && (
        <div className={`print:hidden mb-5 flex items-start gap-2 rounded-xl border p-3 text-sm font-bold ${note.tone}`}>
          <note.icon className="h-5 w-5 shrink-0" /> <span>{t(note.text)}{quote.response?.by && quote.status !== 'REVISING' && ` (${quote.response.by}, ${formatDate(quote.response.at, true)})`}</span>
        </div>
      )}
      {result && (
        <div className={`print:hidden mb-5 rounded-xl border p-3 text-sm font-bold ${result.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>{result.message}</div>
      )}

      <QuoteDocument doc={doc} />

      {quote.canRespond && (
        <div className="print:hidden mt-8 rounded-2xl bg-gray-50 p-5 space-y-4">
          {quote.response?.type === 'REVISION_REQUESTED' && (
            <p className="text-xs font-bold text-amber-700">{t('Revizyon talebiniz iletildi')}: “{quote.response.note}”</p>
          )}
          <p className="text-sm font-black">{t('Teklifi yanıtlayın')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAction('ACCEPTED')} className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-black ${action === 'ACCEPTED' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 ring-1 ring-emerald-200'}`}><CheckCircle2 className="h-4 w-4 mr-1.5" /> {t('Kabul Et')}</button>
            <button type="button" onClick={() => setAction('REVISION_REQUESTED')} className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-black ${action === 'REVISION_REQUESTED' ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 ring-1 ring-amber-200'}`}><MessageSquareText className="h-4 w-4 mr-1.5" /> {t('Revizyon İste')}</button>
            <button type="button" onClick={() => setAction('REJECTED')} className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-black ${action === 'REJECTED' ? 'bg-red-500 text-white' : 'bg-white text-red-600 ring-1 ring-red-200'}`}><XCircle className="h-4 w-4 mr-1.5" /> {t('Reddet')}</button>
          </div>
          {action && (
            <form onSubmit={respond} className="space-y-3">
              <div>
                <label className="premium-label">{t('Adınız soyadınız')} *</label>
                <input required minLength={2} maxLength={120} className="premium-input !bg-white" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="premium-label">{action === 'REVISION_REQUESTED' ? `${t('Ne değişmeli?')} *` : t('Not (isteğe bağlı)')}</label>
                <textarea required={action === 'REVISION_REQUESTED'} maxLength={1000} className="premium-input !bg-white h-24 resize-none" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              {action === 'ACCEPTED' && (
                <p className="text-xs text-gray-500">{t('{code} numaralı teklifi (revizyon {rev}) kabul ediyorsunuz. Firma siparişi hazırlayıp sizinle iletişime geçecek.', { code: doc.code, rev: doc.revision })}</p>
              )}
              <button disabled={busy} className="btn-gradient disabled:opacity-50">{busy ? t('Gönderiliyor...') : t('Yanıtı Gönder')}</button>
            </form>
          )}
        </div>
      )}
    </PrintLayout>
  );
};

export default QuoteShare;
