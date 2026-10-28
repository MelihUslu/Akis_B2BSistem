import { useEffect, useState } from 'react';
import { LifeBuoy, Plus, Search, MessageSquareReply, Hourglass, CheckCheck, Archive, Send, Flame, X, BookOpen, Clock, UploadCloud, MonitorSmartphone, Timer } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import TicketThread from '../../components/shared/TicketThread';
import TicketList from '../../components/shared/TicketList';
import FilterTabs from '../../components/shared/FilterTabs';
import { TICKET_CATEGORIES } from '../../components/shared/supportMeta';
import { PendingAttachments, AttachButton } from '../../components/shared/Attachments';
import useAttachments from '../../hooks/useAttachments';
import { Field, IconInput, TextArea, Segmented } from '../../components/form/FormKit';
import HelpCenter from '../../components/support/HelpCenter';
import HelpArticleModal from '../../components/support/HelpArticleModal';
import SuggestedArticles from '../../components/support/SuggestedArticles';

const EMPTY = { category: '', subject: '', body: '', priority: 'NORMAL' };
const UPLOAD = '/account/support/upload';

// Talebe otomatik eklenen bilgi: son ziyaret edilen panel sayfası ve tarayıcı/ekran bilgisi
const collectContext = () => {
  let last = {};
  try { last = JSON.parse(sessionStorage.getItem('akis_last_page') || '{}'); } catch { /* yok */ }
  return {
    page: last.page || '', pageTitle: last.title || '',
    userAgent: navigator.userAgent,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
};
const hoursText = (h) => (h >= 24 && h % 24 === 0 ? `${h / 24} gün` : `${h} saat`);

// Firmanın platforma (yazılım sağlayıcısına) açtığı destek talepleri
const SupportPage = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [tried, setTried] = useState(false);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const { alertElement, showAlert, confirm } = useAlert();
  const [sla, setSla] = useState({ HIGH: 2, NORMAL: 24 });
  const [context, setContext] = useState(null);
  const [articleId, setArticleId] = useState(null);
  const onUploadError = (message) => showAlert({ type: 'error', title: 'Dosya eklenemedi', message });
  const att = useAttachments(api, UPLOAD, onUploadError);

  const load = () => api.get('/account/support')
    .then((r) => { setTickets(r.data); setNow(Date.now()); })
    .catch(() => {})
    .finally(() => setLoading(false));
  useEffect(() => {
    load();
    api.get('/account/support-meta').then((r) => setSla(r.data.slaHours)).catch(() => {});
  }, []);

  const open = (id) => api.get(`/account/support/${id}`).then((r) => { setSelected(r.data); setForm(null); });

  // Bildirimden gelindiyse (?ticket=12) ilgili talep açılır
  useEffect(() => {
    const fromLink = parseInt(new URLSearchParams(window.location.search).get('ticket'));
    if (fromLink) open(fromLink).catch(() => {});
  }, []);

  const rate = async (rating, comment) => {
    try {
      const res = await api.post(`/account/support/${selected.id}/rate`, { rating, comment });
      await open(selected.id);
      load();
      showAlert({ type: 'success', title: 'Teşekkürler', message: res.data.message });
      return true;
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Değerlendirme kaydedilemedi.') });
      return false;
    }
  };

  const startNew = () => { setForm(EMPTY); setTried(false); setSelected(null); setContext(collectContext()); att.reset(); };

  const create = async (e) => {
    e.preventDefault();
    if (!form.category || form.subject.trim().length < 3 || form.body.trim().length < 10) { setTried(true); return; }
    try {
      if (att.uploading) return showAlert({ type: 'info', title: 'Bekleyin', message: 'Dosyalar yükleniyor, birazdan tekrar deneyin.' });
      const res = await api.post('/account/support', { ...form, attachments: att.files, context });
      att.reset();
      await load();
      open(res.data.ticket.id);
      showAlert({ type: 'success', title: 'Talep Açıldı', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Talep açılamadı.') });
    }
  };

  const reply = async (body, close, attachments) => {
    try {
      await api.post(`/account/support/${selected.id}/messages`, { body, attachments });
      await open(selected.id);
      load();
      return true;
    } catch (err) {
      showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Gönderilemedi.') });
      return false;
    }
  };

  const close = async () => {
    const ok = await confirm({ type: 'info', title: 'Talep kapatılsın mı?', message: 'Sorununuz çözüldüyse kapatın. Daha sonra yazarsanız talep yeniden açılır.', confirmText: 'Kapat' });
    if (!ok) return;
    await api.post(`/account/support/${selected.id}/close`);
    open(selected.id);
    load();
  };

  const count = (st) => tickets.filter((t) => t.status === st).length;
  const term = query.trim().toLocaleLowerCase('tr-TR');
  const visible = tickets
    .filter((t) => !filter || t.status === filter)
    .filter((t) => !term || t.subject.toLocaleLowerCase('tr-TR').includes(term) || String(t.id) === term.replace('#', ''));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const err = (cond) => tried && cond;

  return (
    <div className="space-y-6">
      {alertElement}
      {articleId && (
        <HelpArticleModal id={articleId} client={api} onClose={() => setArticleId(null)}
          onNeedHelp={() => { setArticleId(null); if (!form) startNew(); }} />
      )}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 shrink-0"><LifeBuoy className="h-6 w-6 text-white" /></div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Destek</h1>
            <p className="text-gray-500 text-sm mt-1">Sistemle ilgili soru ve sorunlarınızı bize iletin; yanıtlar burada ve bildirimlerde görünür.</p>
          </div>
        </div>
        <button onClick={startNew} className="btn-gradient h-12 px-5 py-0"><Plus className="h-4 w-4 mr-1.5" /> YENİ TALEP</button>
      </div>

      {count('ANSWERED') > 0 && filter !== 'ANSWERED' && (
        <button onClick={() => setFilter('ANSWERED')} className="w-full flex items-center gap-3 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-left text-sm text-emerald-800 hover:bg-emerald-100/70">
          <MessageSquareReply className="h-4 w-4 shrink-0" />
          <span><b>{count('ANSWERED')} talebiniz</b> destek ekibi tarafından yanıtlandı. Görmek için tıklayın.</span>
        </button>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[24rem_minmax(0,1fr)] gap-6 items-start">
        {/* Sol: talep listesi */}
        <div className="card-premium">
          <div className="p-3 space-y-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Konu veya talep no ara"
                className="w-full h-10 pl-10 pr-3 rounded-xl bg-gray-50 border border-transparent text-sm font-semibold outline-none focus:bg-white focus:border-blue-300 focus:ring-4 focus:ring-blue-100 placeholder:text-gray-400 placeholder:font-medium" />
            </div>
            <FilterTabs compact value={filter} onChange={setFilter} tabs={[
              { id: '', label: 'Tümü', tone: 'slate', count: tickets.length },
              { id: 'ANSWERED', label: 'Yanıtlanan', icon: CheckCheck, tone: 'emerald', count: count('ANSWERED'), alert: true },
              { id: 'OPEN', label: 'Bekleyen', icon: Hourglass, tone: 'orange', count: count('OPEN') },
              { id: 'CLOSED', label: 'Kapalı', icon: Archive, tone: 'gray', count: count('CLOSED') },
            ]} />
          </div>
          <div className="max-h-[calc(100vh-22rem)] min-h-[20rem] overflow-y-auto custom-scrollbar">
            {loading ? <p className="py-16 text-center text-sm text-gray-400">Yükleniyor…</p> : (
              <TicketList tickets={visible} selectedId={selected?.id} onSelect={open} side="TENANT" now={now}
                emptyText={tickets.length ? 'Bu filtrede talep yok.' : 'Henüz talebiniz yok.'} />
            )}
          </div>
        </div>

        {/* Sağ: yeni talep / yazışma / boş durum */}
        {form ? (
          <form onSubmit={create} className="card-premium">
            <div className="modal-header items-center">
              <div>
                <h3 className="modal-title">Yeni Destek Talebi</h3>
                <p className="modal-subtitle">Ne kadar ayrıntı verirseniz o kadar hızlı çözeriz.</p>
              </div>
              <button type="button" onClick={() => setForm(null)} className="modal-close" aria-label="Kapat"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              <Field label="Konu türü" required error={err(!form.category) && 'Bir konu türü seçin.'}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(TICKET_CATEGORIES).map(([id, c]) => {
                    const on = form.category === id;
                    return (
                      <button key={id} type="button" onClick={() => setForm({ ...form, category: id })}
                        className={`text-left flex items-start gap-2.5 p-3 rounded-xl ring-1 transition-all ${on ? `ring-2 ${c.ring}` : 'ring-gray-100 hover:ring-gray-200 hover:bg-gray-50'}`}>
                        <span className={`p-1.5 rounded-lg shrink-0 ${c.tile}`}><c.icon className="h-4 w-4" /></span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-gray-900">{c.label}</span>
                          <span className="block text-[11px] text-gray-400 leading-snug">{c.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4">
                <Field label="Konu" required error={err(form.subject.trim().length < 3) && 'Kısa bir başlık yazın.'}>
                  <IconInput icon={MessageSquareReply} invalid={err(form.subject.trim().length < 3)} maxLength={200} value={form.subject} onChange={set('subject')} placeholder="Örn: Excel ile ürün yüklerken hata alıyorum" />
                </Field>
                <Field label="Öncelik" hint={`Hedef yanıt: ${hoursText(sla[form.priority] || 24)} içinde`}>
                  <Segmented size="sm" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
                    options={[{ value: 'NORMAL', label: 'Normal' }, { value: 'HIGH', label: 'Acil', icon: Flame, activeClass: 'bg-red-500 border-red-500 text-white shadow-md shadow-red-500/25' }]} />
                </Field>
              </div>
              <SuggestedArticles client={api} text={`${form.subject} ${form.body.slice(0, 200)}`} onOpen={setArticleId} />
              <Field label="Açıklama" required error={err(form.body.trim().length < 10) && 'En az 10 karakterlik bir açıklama yazın.'}
                hint="Ne yapmaya çalıştınız, ne oldu, ne bekliyordunuz? Varsa sipariş no, ürün kodu veya hata mesajını ekleyin.">
                <TextArea className="h-44" invalid={err(form.body.trim().length < 10)} maxLength={5000} value={form.body} onChange={set('body')} onPaste={att.onPaste}
                  placeholder={'1. Ürünler > Excel ile Toplu menüsüne girdim\n2. Fiyat dosyasını yükledim\n3. “Dosya işlenemedi” hatası aldım'} />
              </Field>
              <Field label="Ekler" hint="Ekran görüntüsü çözümü çok hızlandırır. Görseli kopyalayıp açıklama alanına Ctrl+V ile de yapıştırabilirsiniz.">
                <div {...att.dropProps} className={`rounded-xl border-2 border-dashed p-4 transition-all ${att.dragging ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <UploadCloud className="h-6 w-6 text-gray-300" />
                    <span className="text-xs text-gray-500 flex-1 min-w-[10rem]">Dosyaları buraya sürükleyin veya seçin · görsel, PDF, Excel, Word · en fazla 5 dosya, her biri 10 MB</span>
                    <AttachButton onFiles={att.addFiles} disabled={att.files.length >= 5} label="Dosya seç" />
                  </div>
                  {(att.files.length > 0 || att.uploading) && <div className="mt-3"><PendingAttachments files={att.files} uploading={att.uploading} onRemove={att.remove} /></div>}
                </div>
              </Field>
              {context && (
                <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                  <MonitorSmartphone className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                  <p>
                    Sorunu daha hızlı bulabilmemiz için talebe otomatik eklenecek:
                    {context.page && <> son açtığınız sayfa <b className="text-slate-700">{context.pageTitle || context.page}</b>,</>} tarayıcı, ekran boyutu ve paket bilgisi.
                    Şifre veya kişisel veri eklenmez.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer items-center">
              <p className="hidden md:flex items-center gap-1.5 text-[11px] text-gray-400 mr-auto"><Clock className="h-3.5 w-3.5" /> Genellikle aynı iş günü içinde yanıtlıyoruz.</p>
              <button type="button" onClick={() => setForm(null)} className="btn-secondary px-6">VAZGEÇ</button>
              <button className="btn-gradient h-12 py-0 px-8"><Send className="h-4 w-4 mr-2" /> GÖNDER</button>
            </div>
          </form>
        ) : selected ? (
          <TicketThread ticket={selected} side="TENANT" onReply={reply} onClose={close} onRate={rate} client={api} uploadPath={UPLOAD} onError={onUploadError} now={now} />
        ) : (
          <div className="space-y-4">
            <HelpCenter client={api} onOpen={setArticleId} />
            <div className="card-premium p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <p className="flex items-start gap-2.5 text-xs text-gray-500"><Timer className="h-4 w-4 text-indigo-500 shrink-0" /><span><b className="text-gray-800">Hedef süre:</b> acil talepleri {hoursText(sla.HIGH)}, diğerlerini {hoursText(sla.NORMAL)} içinde yanıtlarız.</span></p>
                <p className="flex items-start gap-2.5 text-xs text-gray-500"><BookOpen className="h-4 w-4 text-indigo-500 shrink-0" /><span><b className="text-gray-800">Ayrıntı verin:</b> hangi ekranda, ne yaparken olduğunu yazın; ekran görüntüsü ekleyin.</span></p>
              </div>
              <button onClick={startNew} className="btn-gradient h-11 px-5 py-0 shrink-0"><Plus className="h-4 w-4 mr-1.5" /> Yeni talep aç</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportPage;
