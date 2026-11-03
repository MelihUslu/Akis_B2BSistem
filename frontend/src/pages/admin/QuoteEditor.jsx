import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, FileSignature, Save, Send, Eye, Plus, Building2, CalendarClock, AlertTriangle, ShieldCheck, Trash2, XCircle, Info, UserPlus
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import AiDraftPanel from '../../components/quotes/AiDraftPanel';
import QuoteLines from '../../components/quotes/QuoteLines';
import ProductPicker from '../../components/quotes/ProductPicker';
import QuoteView from '../../components/quotes/QuoteView';
import PartnerForm from '../../components/partners/PartnerForm';
import { Section, Field } from '../../components/form/FormKit';
import { formatTRY } from '../../utils/format';
import { QUOTE_STATUS, addDays, newLineKey } from '../../utils/quote';

const toInput = (l) => ({
  key: newLineKey(),
  productId: l.productId || null,
  quantity: l.quantity ?? 1,
  discountRate: l.manualPrice ? 0 : l.discountRate || 0,
  manualPrice: Boolean(l.manualPrice),
  unitPrice: l.manualPrice ? l.unitPrice : null,
  matchStatus: l.productId ? l.matchStatus || 'MANUAL' : 'UNMATCHED',
  requestText: l.requestText || null,
  matchReason: l.matchReason || null,
  warnings: l.warnings || [],
  alternatives: l.alternatives || []
});
const toPayload = ({ key, ...l }) => l; // eslint-disable-line no-unused-vars

const Totals = ({ totals }) => (
  <div className="space-y-1.5 text-sm">
    {totals.discountTotal > 0 && <>
      <div className="flex justify-between text-gray-500"><span>Müşteri fiyatlarıyla toplam</span><span className="font-bold text-gray-700">{formatTRY(totals.listTotal)}</span></div>
      <div className="flex justify-between text-gray-500"><span>Teklif iskontosu</span><span className="font-bold text-emerald-600">−{formatTRY(totals.discountTotal)}</span></div>
    </>}
    <div className="flex justify-between text-gray-500"><span>Ara toplam (KDV hariç)</span><span className="font-bold text-gray-900">{formatTRY(totals.subtotal)}</span></div>
    <div className="flex justify-between text-gray-500"><span>KDV</span><span className="font-bold text-gray-900">{formatTRY(totals.vatAmount)}</span></div>
    <div className="flex justify-between pt-2 border-t border-gray-100 text-base font-black text-gray-900"><span>Genel toplam</span><span>{formatTRY(totals.total)}</span></div>
  </div>
);

// Yeni teklif / taslak düzenleme. Tüm fiyat hesapları her değişiklikte backend'de yapılır.
const QuoteForm = ({ meta, companies, quote, onReload, onCompanyAdded, showAlert, confirm }) => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [form, setForm] = useState(() => ({
    // Cari Hesaplar'dan "Teklif hazırla" ile gelindiyse müşteri önceden seçili
    companyId: quote?.companyId || (companies.some((c) => String(c.id) === params.get('companyId')) ? params.get('companyId') : ''),
    title: quote?.title || '',
    validUntil: quote?.validUntil ? quote.validUntil.slice(0, 10) : addDays(meta.defaults.validDays),
    paymentTerms: quote?.paymentTerms ?? meta.defaults.paymentTerms,
    deliveryTerms: quote?.deliveryTerms ?? meta.defaults.deliveryTerms,
    adminNote: quote?.adminNote || '',
    internalNote: quote?.internalNote || ''
  }));
  const [lines, setLines] = useState(() => (quote?.lines || []).map(toInput));
  const [ai, setAi] = useState(() => ({ aiRequest: quote?.aiRequest || '', aiMeta: quote?.aiMeta || null }));
  const [version, setVersion] = useState(0);
  const [priced, setPriced] = useState(() => (quote ? { keys: null, lines: quote.lines, totals: quote.totals, approval: quote.approval } : null));
  const [priceError, setPriceError] = useState(null);
  const [companyNotice, setCompanyNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const companySwitch = useRef(null);
  const [initialKeys] = useState(() => lines.map((l) => l.key));

  // İlk açılışta kayıtlı fiyatlar, sonra her değişiklikte backend hesabı
  useEffect(() => {
    if (!form.companyId) return undefined;
    const keys = lines.map((l) => l.key);
    const tid = setTimeout(() => {
      api.post('/quotes/price', { companyId: form.companyId, quoteId: quote?.id, items: lines.map(toPayload) })
        .then((r) => {
          const switched = companySwitch.current;
          if (switched) {
            companySwitch.current = null;
            const changes = r.data.lines.map((l, i) => ({ l, before: switched.prices[keys[i]] }))
              .filter(({ l, before }) => l.productId && before !== undefined && before !== l.unitPrice);
            setCompanyNotice({ name: switched.name, changes, manual: lines.some((l) => l.manualPrice) });
          }
          setPriced({ ...r.data, keys });
          setPriceError(null);
        })
        .catch((e) => setPriceError(errorMessage(e, 'Teklif hesaplanamadı.')));
    }, version === 0 ? 0 : 300);
    return () => clearTimeout(tid);
  }, [version, form.companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeLines = (next) => { setLines(next); setVersion((v) => v + 1); };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Hesaplanan değerler kalem anahtarına göre eşlenir (silme / ekleme sırasında kayma olmasın)
  const keys = priced?.keys || initialKeys;
  const calcByKey = Object.fromEntries((priced?.lines || []).map((c, i) => [keys[i], c]));
  const calc = lines.map((l) => calcByKey[l.key]);
  const unmatched = lines.filter((l) => !l.productId).length;
  const review = lines.filter((l) => l.productId && l.matchStatus === 'REVIEW').length;
  const errors = calc.reduce((n, c) => n + (c?.errors?.length || 0), 0);
  const fromDealer = quote?.source === 'DEALER';

  const chooseCompany = (e) => {
    const companyId = e.target.value;
    if (lines.length && form.companyId && companyId !== String(form.companyId)) {
      companySwitch.current = {
        name: companies.find((c) => String(c.id) === companyId)?.name,
        prices: Object.fromEntries(lines.map((l) => [l.key, calcByKey[l.key]?.unitPrice]))
      };
    }
    setForm({ ...form, companyId });
    setVersion((v) => v + 1);
  };

  const onAiDraft = (result, info) => {
    const fromAi = result.lines.map(toInput);
    const manual = lines.filter((l) => !l.requestText); // elle eklenen kalemler korunur
    changeLines([...fromAi, ...manual]);
    setAi({ aiRequest: info.text, aiMeta: { preferences: info.preferences, answers: info.answers, questions: info.questions, mock: Boolean(result.mock) } });
  };

  const addProduct = (p) => changeLines([...lines, { key: newLineKey(), productId: p.id, quantity: 1, discountRate: 0, manualPrice: false, unitPrice: null, matchStatus: 'MANUAL', requestText: null, matchReason: null, warnings: [], alternatives: [] }]);

  const save = async () => {
    if (!form.companyId) { showAlert({ type: 'warning', title: 'Müşteri seçin', message: 'Teklif için önce müşteri / bayi seçin.' }); return null; }
    const body = { ...form, items: lines.map(toPayload), aiRequest: ai.aiRequest || null, aiMeta: ai.aiMeta };
    setBusy(true);
    try {
      if (quote) { await api.put(`/quotes/${quote.id}`, body); return quote.id; }
      const res = await api.post('/quotes/draft', body);
      return res.data.id;
    } catch (err) {
      showAlert({ type: 'error', title: 'Kaydedilemedi', message: errorMessage(err, 'Teklif kaydedilemedi.') });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    const id = await save();
    if (!id) return;
    if (!quote) navigate(`/admin/quotes/${id}`, { replace: true });
    else onReload();
    showAlert({ type: 'success', title: 'Kaydedildi', message: 'Teklif taslağı kaydedildi. Müşteriye henüz gönderilmedi.' });
  };

  const preview = async () => {
    const win = window.open('', '_blank'); // açılır pencere engeline takılmasın diye önce açılır
    const id = await save();
    if (!id) { win?.close(); return; }
    if (win) win.location.href = `/print/quote/${id}`;
    if (!quote) navigate(`/admin/quotes/${id}`, { replace: true });
  };

  const submit = async () => {
    const needsApproval = priced?.approvalRequired;
    const ok = await confirm({
      type: 'info',
      title: needsApproval ? 'Onaya gönderilsin mi?' : 'Teklif müşteriye gönderilsin mi?',
      message: needsApproval
        ? 'Teklif yetki sınırınızı aşıyor; yönetici onayından sonra müşteriye iletilecek.'
        : 'Gönderilen sürüm değişmez olarak kaydedilir ve müşteri portalda görür. Değişiklik için yeni revizyon gerekir.',
      confirmText: needsApproval ? 'Onaya Gönder' : 'Gönder'
    });
    if (!ok) return;
    const id = await save();
    if (!id) return;
    try {
      const res = await api.post(`/quotes/${id}/submit`);
      showAlert({ type: res.data.status === 'PENDING_APPROVAL' ? 'info' : 'success', title: res.data.status === 'PENDING_APPROVAL' ? 'Onaya Gönderildi' : 'Teklif Gönderildi', message: res.data.message });
      if (!quote) navigate(`/admin/quotes/${id}`, { replace: true });
      else onReload();
    } catch (err) {
      const blockers = err.response?.data?.blockers;
      showAlert({ type: 'warning', title: 'Gönderilemedi', message: blockers?.length ? blockers.join('\n') : errorMessage(err, 'Teklif gönderilemedi.') });
      if (!quote) navigate(`/admin/quotes/${id}`, { replace: true });
    }
  };

  const rejectRequest = async () => {
    const ok = await confirm({ title: 'Teklif talebi reddedilsin mi?', message: 'Bayiye teklif verilemediği bildirilir. "Müşteriye açıklama" alanındaki metin iletilir.', confirmText: 'Reddet' });
    if (!ok) return;
    try {
      await api.post(`/quotes/${quote.id}/reject`, { adminNote: form.adminNote });
      onReload();
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'İşlem yapılamadı.') });
    }
  };

  const removeDraft = async () => {
    const ok = await confirm({ title: 'Taslak silinsin mi?', message: 'Bu işlem geri alınamaz.', confirmText: 'Sil' });
    if (!ok) return;
    try {
      await api.delete(`/quotes/${quote.id}`);
      navigate('/admin/quotes');
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Silinemedi.') });
    }
  };

  const status = quote ? QUOTE_STATUS[quote.status] : QUOTE_STATUS.DRAFT;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div className="flex items-center gap-4">
          <Link to="/admin/quotes" className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="page-icon"><FileSignature className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">{quote ? `${quote.code}${quote.revision > 1 ? ` · Revizyon ${quote.revision}` : ''}` : 'Yeni Teklif'}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${status.className}`}>{status.label}</span>
              {fromDealer && <span className="text-xs font-bold text-orange-600">Bayinin teklif talebi · {quote.user?.name}</span>}
              {quote?.approvalNote && <span className="text-xs font-bold text-amber-700">Onay notu: {quote.approvalNote}</span>}
            </div>
          </div>
        </div>
      </div>

      {quote?.note && <p className="text-sm text-gray-700 bg-orange-50 p-4 rounded-xl"><b>Bayinin notu:</b> {quote.note}</p>}
      {quote?.responseType === 'REVISION_REQUESTED' && (
        <p className="text-sm text-amber-800 bg-amber-50 p-4 rounded-xl"><b>Müşterinin revizyon talebi</b> ({quote.responseBy}): {quote.responseNote}</p>
      )}

      <Section icon={Building2} title="Müşteri ve Koşullar" description="Fiyatlar seçilen müşterinin fiyat listesi, özel fiyatları ve iskontolarıyla hesaplanır." color="indigo">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Müşteri / Bayi" required hint={!fromDealer && <button type="button" onClick={() => setAddingCustomer(true)} className="flex items-center font-bold text-indigo-600 hover:underline"><UserPlus className="h-3 w-3 mr-1" /> Listede yok mu? Yeni müşteri ekle</button>}>
            <select className="premium-input" value={form.companyId} onChange={chooseCompany} disabled={fromDealer}>
              <option value="">Müşteri seçin</option>
              {[['DEALER', 'Bayiler'], ['CUSTOMER', 'Müşteriler (portal dışı)']].map(([kind, label]) => {
                const group = companies.filter((c) => c.kind === kind && (c.status === 'ACTIVE' || String(c.id) === String(form.companyId)));
                return group.length > 0 && (
                  <optgroup key={kind} label={label}>
                    {group.map((c) => <option key={c.id} value={c.id}>{c.name}{c.dealerGroup && kind === 'DEALER' && c.dealerGroup !== 'STANDART' ? ` · ${c.dealerGroup}` : ''}{c.netDiscount ? ` · %${c.netDiscount} isk.` : ''}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </Field>
          <Field label="Teklif başlığı"><input className="premium-input" maxLength={160} value={form.title} onChange={set('title')} placeholder="Örn: Mağaza açılışı sarf malzemeleri" /></Field>
          <Field label="Geçerlilik tarihi" required icon={CalendarClock}><input type="date" className="premium-input" value={form.validUntil} min={addDays(0)} onChange={set('validUntil')} /></Field>
          <Field label="Ödeme koşulları"><input className="premium-input" maxLength={1000} value={form.paymentTerms} onChange={set('paymentTerms')} placeholder="Örn: 30 gün vadeli, havale / EFT" /></Field>
          <Field label="Teslimat koşulları"><input className="premium-input" maxLength={1000} value={form.deliveryTerms} onChange={set('deliveryTerms')} placeholder="Örn: Siparişten sonra 3 iş günü, depo teslim" /></Field>
          <Field label="Müşteriye açıklama" hint="Teklif belgesinde görünür."><input className="premium-input" maxLength={2000} value={form.adminNote} onChange={set('adminNote')} /></Field>
          <Field label="İç not" hint="Yalnızca ekibiniz görür; müşteriye ve PDF'e çıkmaz." className="md:col-span-3"><input className="premium-input" maxLength={2000} value={form.internalNote} onChange={set('internalNote')} /></Field>
        </div>
        {companyNotice && (
          <div className="flex items-start gap-2 text-xs font-semibold text-sky-800 bg-sky-50 rounded-xl p-3">
            <Info className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-black">Müşteri “{companyNotice.name}” olarak değiştirildi; fiyatlar bu müşteriye göre yeniden hesaplandı.</p>
              {companyNotice.changes.length ? companyNotice.changes.map(({ l, before }, i) => (
                <p key={i}>{l.name}: {before !== null && before !== undefined ? formatTRY(before) : '—'} → {l.unitPrice !== null ? formatTRY(l.unitPrice) : '—'}</p>
              )) : <p>Birim fiyatlarda değişiklik olmadı.</p>}
              {companyNotice.manual && <p className="text-amber-700">Elle girilen fiyatlar korunur; yeni müşteri için kontrol edin.</p>}
            </div>
            <button type="button" onClick={() => setCompanyNotice(null)} className="ml-auto text-sky-500"><XCircle className="h-4 w-4" /></button>
          </div>
        )}
      </Section>

      {addingCustomer && (
        <PartnerForm quick initialKind="CUSTOMER" onClose={() => setAddingCustomer(false)}
          onSaved={(c) => { setAddingCustomer(false); onCompanyAdded(c); chooseCompany({ target: { value: String(c.id) } }); }} />
      )}

      <AiDraftPanel ai={meta.ai} companyId={form.companyId} initialText={ai.aiRequest} initialPreferences={ai.aiMeta?.preferences} onDraft={onAiDraft} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-black text-gray-900">Teklif Kalemleri <span className="text-gray-400 font-bold">({lines.length})</span></h3>
          {!meta.can.price && <span className="text-[11px] font-bold text-gray-400">İskonto ve elle fiyat için “Teklif fiyatı” yetkisi gerekir.</span>}
        </div>
        <QuoteLines lines={lines} calc={calc} canPrice={meta.can.price} companyId={form.companyId} onChange={changeLines} />
        <div className="rounded-2xl bg-gray-50 p-4 flex flex-col md:flex-row md:items-center gap-3">
          <span className="flex items-center text-xs font-black text-gray-500 shrink-0"><Plus className="h-4 w-4 mr-1" /> Ürün ekle</span>
          <div className="flex-1"><ProductPicker companyId={form.companyId} onPick={addProduct} /></div>
        </div>
      </section>

      {priceError && <p className="text-xs font-bold text-red-600 bg-red-50 rounded-xl p-3">{priceError}</p>}

      {priced?.totals && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
          <div className="space-y-2">
            {priced.approval?.reasons?.length > 0 && (
              <div className={`rounded-xl p-4 text-xs font-semibold ${priced.approvalRequired ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>
                <p className="flex items-center font-black mb-1"><ShieldCheck className="h-4 w-4 mr-1.5" /> {priced.approvalRequired ? 'Bu teklif yönetici onayına gidecek' : 'Onay sınırı aşılıyor (onay yetkiniz olduğu için doğrudan gönderilebilir)'}</p>
                {priced.approval.reasons.map((r, i) => <p key={i}>• {r}</p>)}
              </div>
            )}
            {(unmatched > 0 || review > 0 || errors > 0) && (
              <p className="flex items-start text-xs font-bold text-red-600 bg-red-50 rounded-xl p-3">
                <AlertTriangle className="h-4 w-4 mr-1.5 shrink-0" />
                Gönderimden önce: {[unmatched && `${unmatched} eşleşmeyen kalemi çözün veya çıkarın`, review && `${review} kalemi teyit edin`, errors && `${errors} kalem uyarısını giderin`].filter(Boolean).join(', ')}.
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-gray-100 p-5"><Totals totals={priced.totals} /></div>
        </div>
      )}

      <div className="sticky bottom-0 z-30 -mx-3 md:-mx-8 lg:-mx-12 bg-white/90 backdrop-blur border-t border-gray-100 px-3 md:px-8 lg:px-12 py-3 flex flex-wrap items-center justify-end gap-2">
        {quote && !quote.sentRevision && quote.source === 'STAFF' && <button onClick={removeDraft} className="mr-auto flex items-center text-xs font-black text-red-500 hover:underline"><Trash2 className="h-4 w-4 mr-1" /> Taslağı sil</button>}
        {fromDealer && !quote.sentRevision && <button onClick={rejectRequest} className="mr-auto flex items-center px-4 h-11 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100"><XCircle className="h-4 w-4 mr-1.5" /> Talebi Reddet</button>}
        <button disabled={busy} onClick={saveDraft} className="flex items-center px-4 h-11 rounded-xl text-sm font-black text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"><Save className="h-4 w-4 mr-2" /> Taslağı Kaydet</button>
        <button disabled={busy || !lines.length} onClick={preview} className="flex items-center px-4 h-11 rounded-xl text-sm font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50"><Eye className="h-4 w-4 mr-2" /> Önizleme / PDF</button>
        <button disabled={busy || !lines.length} onClick={submit} className="btn-gradient disabled:opacity-50"><Send className="h-4 w-4 mr-2" /> {priced?.approvalRequired ? 'Onaya Gönder' : 'Gönder'}</button>
      </div>
    </div>
  );
};

const QuoteEditor = () => {
  const { id } = useParams();
  const { alertElement, showAlert, confirm } = useAlert();
  const [meta, setMeta] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loaded, setLoaded] = useState({ id: null, quote: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([api.get('/quotes/meta'), api.get('/companies', { params: { kind: 'DEALER,CUSTOMER' } })])
      .then(([m, c]) => { setMeta(m.data); setCompanies(c.data); })
      .catch((e) => setLoaded((s) => ({ ...s, error: errorMessage(e, 'Yüklenemedi.') })));
  }, []);
  useEffect(() => {
    if (!id) return;
    api.get(`/quotes/${id}`)
      .then((r) => setLoaded({ id, key: reloadKey, quote: r.data, error: null }))
      .catch((e) => setLoaded({ id, key: reloadKey, quote: null, error: errorMessage(e, 'Teklif bulunamadı.') }));
  }, [id, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const quote = id && loaded.id === id ? loaded.quote : null;

  if (loaded.error) return <div className="py-24 text-center text-gray-500">{loaded.error}</div>;
  if (!meta || (id && !quote)) return <div className="py-24 text-center text-gray-400">Yükleniyor...</div>;

  return (
    <>
      {alertElement}
      {!quote || quote.editable
        ? <QuoteForm key={`${quote?.id || 'new'}:${loaded.key ?? 0}`} meta={meta} companies={companies} quote={quote} onReload={reload} onCompanyAdded={(c) => setCompanies((list) => [...list, c])} showAlert={showAlert} confirm={confirm} />
        : <QuoteView key={`${quote.id}:${loaded.key}`} quote={quote} onReload={reload} showAlert={showAlert} confirm={confirm} />}
    </>
  );
};

export default QuoteEditor;
