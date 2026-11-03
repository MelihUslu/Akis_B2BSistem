import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, FileSignature, Link2, Copy, RefreshCw, Ban, Mail, FileDown, PenLine, ShoppingCart, ShieldCheck, Undo2,
  CheckCircle2, AlertTriangle, History, MessageSquareText, Sparkles
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import QuoteDocument from './QuoteDocument';
import Modal from '../shared/Modal';
import { formatTRY, formatDate } from '../../utils/format';
import { QUOTE_STATUS, RESPONSE_LABEL } from '../../utils/quote';

/**
 * Gönderilmiş / onaydaki / sonuçlanmış teklif. Belge, gönderilen sürümün değişmez kopyasından gösterilir.
 */
const QuoteView = ({ quote, onReload, showAlert, confirm }) => {
  const [revision, setRevision] = useState(quote.sentRevision || null);
  const [doc, setDoc] = useState(null);
  const [history, setHistory] = useState([]);
  const [note, setNote] = useState('');
  const [mail, setMail] = useState(null); // { to, message }
  const [convert, setConvert] = useState(null); // { paymentMethod, warnings }
  const [busy, setBusy] = useState(false);
  const status = QUOTE_STATUS[quote.status] || QUOTE_STATUS.DRAFT;
  const pendingApproval = quote.status === 'PENDING_APPROVAL';

  useEffect(() => {
    api.get(`/quotes/${quote.id}/document`, { params: !pendingApproval && revision ? { revision } : {} })
      .then((r) => setDoc(r.data.document)).catch(() => setDoc(null));
  }, [quote.id, revision, pendingApproval]);
  useEffect(() => { api.get(`/quotes/${quote.id}/history`).then((r) => setHistory(r.data)).catch(() => {}); }, [quote.id]);

  const run = async (fn, success) => {
    setBusy(true);
    try {
      const res = await fn();
      if (success !== false) showAlert({ type: 'success', title: success || 'Tamam', message: res.data.message });
      onReload();
      return res;
    } catch (err) {
      showAlert({ type: 'error', title: 'İşlem yapılamadı', message: errorMessage(err, 'İşlem yapılamadı.') });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url) => {
    try { await navigator.clipboard.writeText(url); showAlert({ type: 'success', title: 'Kopyalandı', message: 'Bağlantı panoya kopyalandı. Müşteriye iletebilirsiniz.' }); } catch {
      showAlert({ type: 'info', title: 'Bağlantı', message: url });
    }
  };

  const createLink = async (rotate = false) => {
    if (rotate && !(await confirm({ title: 'Yeni bağlantı oluşturulsun mu?', message: 'Eski bağlantı çalışmaz hale gelir.', confirmText: 'Yenile' }))) return;
    const res = await run(() => api.post(`/quotes/${quote.id}/share`, { rotate }), false);
    if (res) copy(res.data.url);
  };

  const revoke = async () => {
    if (await confirm({ title: 'Bağlantı iptal edilsin mi?', message: 'Müşteri bu bağlantıyla teklifi artık açamaz.', confirmText: 'İptal Et' })) {
      run(() => api.delete(`/quotes/${quote.id}/share`), 'Bağlantı İptal Edildi');
    }
  };

  const revise = async () => {
    const ok = await confirm({ type: 'info', title: 'Yeni revizyon açılsın mı?', message: 'Teklif taslağa döner. Yeni sürüm gönderilene kadar müşteri mevcut teklifi kabul edemez.', confirmText: 'Revizyon Aç' });
    if (ok) run(() => api.post(`/quotes/${quote.id}/revise`), 'Revizyon Açıldı');
  };

  const sendMail = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/quotes/${quote.id}/email`, mail);
      setMail(null);
      showAlert({ type: res.data.delivered === res.data.total ? 'success' : 'warning', title: res.data.delivered ? 'E-posta' : 'E-posta Gönderilemedi', message: `${res.data.message}${res.data.delivered ? '' : `\n${res.data.url}`}` });
      onReload();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'E-posta gönderilemedi.') });
    } finally {
      setBusy(false);
    }
  };

  const doConvert = async (confirmWarnings = false) => {
    setBusy(true);
    try {
      const res = await api.post(`/quotes/${quote.id}/convert`, { paymentMethod: convert.paymentMethod, confirmWarnings });
      setConvert(null);
      showAlert({ type: 'success', title: 'Sipariş Oluşturuldu', message: res.data.message });
      onReload();
    } catch (err) {
      if (err.response?.data?.code === 'CONFIRM_REQUIRED') setConvert({ ...convert, warnings: err.response.data.warnings });
      else showAlert({ type: 'error', title: 'Siparişe Dönüştürülemedi', message: errorMessage(err, 'Sipariş oluşturulamadı.') });
    } finally {
      setBusy(false);
    }
  };

  const revisions = quote.revisions || [];
  const canMail = quote.status === 'QUOTED';

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between lg:items-end gap-4">
        <div className="flex items-center gap-4">
          <Link to="/admin/quotes" className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="page-icon"><FileSignature className="h-6 w-6 text-white" /></div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{quote.code}{quote.title && <span className="text-gray-400 font-bold text-lg"> · {quote.title}</span>}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${status.className}`}>{status.label}</span>
              <span className="font-bold text-indigo-600">{quote.company?.name}</span>
              {quote.sentRevision && <span className="text-gray-400 font-bold">Gönderilen sürüm: {quote.sentRevision}{quote.revision !== quote.sentRevision && ` · çalışılan: ${quote.revision}`}</span>}
              {quote.order && <span className="font-black text-emerald-600">Sipariş #AK-{quote.order.id}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {doc && <a href={`/print/quote/${quote.id}${!pendingApproval && revision ? `?revision=${revision}` : ''}`} target="_blank" rel="noreferrer" className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100"><FileDown className="h-4 w-4 mr-1.5" /> PDF</a>}
          {quote.can?.revise && <button disabled={busy} onClick={revise} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><PenLine className="h-4 w-4 mr-1.5" /> Revize Et</button>}
          {canMail && <button disabled={busy} onClick={() => setMail({ to: '', message: '' })} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-gray-700 bg-gray-100 hover:bg-gray-200"><Mail className="h-4 w-4 mr-1.5" /> E-posta</button>}
          {quote.status === 'ACCEPTED' && !quote.order && quote.can?.convert && (
            <button disabled={busy} onClick={() => setConvert({ paymentMethod: 'CURRENT_ACCOUNT', warnings: null })} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600"><ShoppingCart className="h-4 w-4 mr-1.5" /> Siparişe Dönüştür</button>
          )}
        </div>
      </div>

      {quote.responseType && (
        <div className={`rounded-xl p-4 text-sm ${quote.responseType === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-800' : quote.responseType === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
          <p className="font-black flex items-center"><MessageSquareText className="h-4 w-4 mr-1.5" /> Müşteri {RESPONSE_LABEL[quote.responseType]?.toLocaleLowerCase('tr-TR')}</p>
          <p className="text-xs mt-1">{quote.responseBy} · {quote.responseVia === 'LINK' ? 'paylaşım bağlantısı' : 'bayi portalı'} · {formatDate(quote.respondedAt, true)}</p>
          {quote.responseNote && <p className="mt-2">“{quote.responseNote}”</p>}
          {quote.status === 'ACCEPTED' && !quote.order && <p className="text-xs font-bold mt-2">Sipariş henüz oluşturulmadı. Stok ve koşulları kontrol edip “Siparişe Dönüştür” ile oluşturabilirsiniz; teklif fiyatları korunur.</p>}
        </div>
      )}

      {pendingApproval && (
        <div className="rounded-2xl bg-amber-50 p-5 space-y-3">
          <p className="flex items-center text-sm font-black text-amber-800"><ShieldCheck className="h-5 w-5 mr-2" /> Yönetici onayı bekleniyor</p>
          {(quote.approvalReasons || []).map((r, i) => <p key={i} className="text-xs font-semibold text-amber-800">• {r}</p>)}
          <p className="text-xs text-amber-700">Hazırlayan: {quote.preparedBy?.name || '—'} · Toplam {formatTRY(quote.totalAmount)}</p>
          <input className="premium-input !bg-white" placeholder="Not (isteğe bağlı)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {quote.can?.approve && <button disabled={busy} onClick={() => run(() => api.post(`/quotes/${quote.id}/approve`, { note }), 'Onaylandı')} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600"><CheckCircle2 className="h-4 w-4 mr-1.5" /> Onayla ve Gönder</button>}
            <button disabled={busy} onClick={() => run(() => api.post(`/quotes/${quote.id}/withdraw`, { note }), 'Taslağa Döndü')} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-amber-800 bg-white hover:bg-amber-100"><Undo2 className="h-4 w-4 mr-1.5" /> {quote.can?.approve ? 'Düzeltme için geri gönder' : 'Onaydan geri çek'}</button>
          </div>
        </div>
      )}

      {quote.sentRevision && !['CANCELLED'].includes(quote.status) && (
        <div className="rounded-2xl ring-1 ring-gray-100 bg-white p-5 space-y-3">
          <p className="flex items-center text-sm font-black text-gray-900"><Link2 className="h-4 w-4 mr-2 text-indigo-500" /> Müşteri bağlantısı</p>
          <p className="text-xs text-gray-500">Giriş gerektirmeyen, tahmin edilemez bağlantı. Müşteri gönderilen son sürümü görür; kabul eder, reddeder veya revizyon ister. İstediğiniz an iptal edebilirsiniz.</p>
          {quote.shareUrl ? (
            <div className="flex flex-col md:flex-row gap-2">
              <input readOnly className="premium-input font-mono text-xs" value={quote.shareUrl} onFocus={(e) => e.target.select()} />
              <div className="flex gap-2 shrink-0">
                <button onClick={() => copy(quote.shareUrl)} className="flex items-center px-3 h-11 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100"><Copy className="h-4 w-4 mr-1" /> Kopyala</button>
                <button disabled={busy} onClick={() => createLink(true)} title="Yeni bağlantı" className="flex items-center px-3 h-11 rounded-xl text-xs font-black text-gray-600 bg-gray-100 hover:bg-gray-200"><RefreshCw className="h-4 w-4" /></button>
                <button disabled={busy} onClick={revoke} title="İptal et" className="flex items-center px-3 h-11 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100"><Ban className="h-4 w-4" /></button>
              </div>
            </div>
          ) : (
            <button disabled={busy} onClick={() => createLink(false)} className="flex items-center px-4 h-10 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100"><Link2 className="h-4 w-4 mr-1.5" /> Bağlantı oluştur ve kopyala</button>
          )}
          <p className="text-[11px] text-gray-400">{quote.emailedAt ? `Son e-posta gönderimi: ${formatDate(quote.emailedAt, true)}` : 'Henüz e-postayla gönderilmedi.'}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <div className="rounded-2xl ring-1 ring-gray-100 bg-white p-5 md:p-8 text-[12px]">
          {revisions.length > 1 && !pendingApproval && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {revisions.map((r) => (
                <button key={r.revision} onClick={() => setRevision(r.revision)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black ${revision === r.revision ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  Rev. {r.revision} · {formatTRY(r.totalAmount)}
                </button>
              ))}
            </div>
          )}
          {pendingApproval && <p className="mb-4 text-[11px] font-black uppercase tracking-widest text-amber-600">Onaydaki içerik (henüz gönderilmedi)</p>}
          {doc ? <QuoteDocument doc={doc} /> : <p className="text-gray-400 text-center py-10">Belge yükleniyor...</p>}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-gray-50 p-5 space-y-2 text-xs">
            <p className="font-black text-gray-900 text-sm">Ayrıntılar</p>
            <p><span className="text-gray-400">Hazırlayan:</span> {quote.preparedBy?.name || '—'}</p>
            {quote.approvedByName && <p><span className="text-gray-400">Onaylayan:</span> {quote.approvedByName} · {formatDate(quote.approvedAt, true)}</p>}
            {quote.sentAt && <p><span className="text-gray-400">Gönderim:</span> {formatDate(quote.sentAt, true)}</p>}
            <p><span className="text-gray-400">Geçerlilik:</span> {quote.validUntil ? formatDate(quote.validUntil) : '—'}</p>
            {quote.internalNote && <p className="pt-2 border-t border-gray-200"><span className="text-gray-400">İç not:</span> {quote.internalNote}</p>}
            {quote.aiRequest && (
              <p className="pt-2 border-t border-gray-200"><span className="flex items-center text-violet-600 font-bold"><Sparkles className="h-3 w-3 mr-1" /> Yapay zekâ talebi{quote.aiMeta?.mock && ' (örnek mod)'}</span>“{quote.aiRequest}”</p>
            )}
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5 space-y-3">
            <p className="flex items-center font-black text-gray-900 text-sm"><History className="h-4 w-4 mr-1.5 text-gray-400" /> İşlem geçmişi</p>
            {history.length === 0 ? <p className="text-xs text-gray-400">Kayıt yok.</p> : history.map((h) => (
              <div key={h.id} className="text-xs border-l-2 border-gray-100 pl-3">
                <p className="font-bold text-gray-800">{h.action}</p>
                <p className="text-gray-400">{h.actorName || '—'}{h.actorType === 'CUSTOMER' && ' (müşteri)'}{h.impersonatedBy && ` · destek: ${h.impersonatedBy}`} · {formatDate(h.createdAt, true)}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {mail && (
        <Modal icon={Mail} title="Teklifi e-postayla gönder" onClose={() => setMail(null)}>
          <form onSubmit={sendMail} className="space-y-4">
            <div>
              <label className="premium-label">Alıcılar</label>
              <input className="premium-input" placeholder="Boş bırakırsanız müşterinin portal kullanıcılarına gider" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
              <p className="text-[11px] text-gray-400 mt-1">Birden fazla adresi virgülle ayırın. E-postada teklif bağlantısı bulunur.</p>
            </div>
            <div><label className="premium-label">Mesaj (isteğe bağlı)</label><textarea className="premium-input h-24 resize-none" value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} /></div>
            <button disabled={busy} className="btn-gradient w-full justify-center disabled:opacity-50"><Mail className="h-4 w-4 mr-2" /> Gönder</button>
          </form>
        </Modal>
      )}

      {convert && (
        <Modal icon={ShoppingCart} title="Siparişe dönüştür" onClose={() => setConvert(null)}>
          <p className="text-xs text-gray-500">Kabul edilen sürümün (Rev. {quote.sentRevision}) fiyatlarıyla sipariş oluşturulur ve sipariş onayına düşer. Güncel katalog fiyatı kullanılmaz.</p>
          <div>
            <label className="premium-label">Ödeme yöntemi</label>
            <select className="premium-input" value={convert.paymentMethod} onChange={(e) => setConvert({ ...convert, paymentMethod: e.target.value, warnings: null })}>
              <option value="CURRENT_ACCOUNT">Cari hesap</option>
              <option value="WIRE_TRANSFER">Havale / EFT</option>
            </select>
          </div>
          {convert.warnings?.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-4 space-y-1">
              <p className="flex items-center text-xs font-black text-amber-800"><AlertTriangle className="h-4 w-4 mr-1.5" /> Dikkat</p>
              {convert.warnings.map((w, i) => <p key={i} className="text-xs text-amber-800">• {w}</p>)}
            </div>
          )}
          <button disabled={busy} onClick={() => doConvert(Boolean(convert.warnings?.length))}
            className={`w-full flex items-center justify-center h-11 rounded-xl text-sm font-black text-white disabled:opacity-50 ${convert.warnings?.length ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
            <ShoppingCart className="h-4 w-4 mr-2" /> {convert.warnings?.length ? 'Uyarıları gördüm, yine de oluştur' : 'Siparişi Oluştur'}
          </button>
        </Modal>
      )}
    </div>
  );
};

export default QuoteView;
