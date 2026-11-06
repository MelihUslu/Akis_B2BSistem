import { useEffect, useState } from 'react';
import { Mail, Send, History, Users, AlertTriangle, CheckCircle2, XCircle, Info, Clock, FlaskConical } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import PageHeader from '../../components/shared/PageHeader';
import ModalHeader from '../../components/shared/ModalHeader';
import { formatDate } from '../../utils/format';
import RecipientPicker from '../../components/bulk/RecipientPicker';
import { PLACEHOLDERS, fillTemplate, usableEmails } from '../../components/bulk/shared';

/**
 * Toplu e-posta: bayiler, bayi olmayan müşteri carileri ve müşteri adayları seçilir; e-posta firmanın adıyla, yanıtlar
 * firmanın adresine gidecek şekilde arka planda gönderilir. Her e-postada abonelikten çıkma bağlantısı vardır;
 * çıkan adrese firmanın toplu e-postası bir daha gitmez. Günlük sınır ve hız sunucu ayarındadır.
 */
const STATUS = {
  SENT: [CheckCircle2, 'text-emerald-600', 'Gönderildi'],
  FAILED: [XCircle, 'text-red-500', 'Gönderilemedi'],
  PENDING: [Clock, 'text-gray-400', 'Sırada'],
  SENDING: [Clock, 'text-brand-500', 'Gönderiliyor']
};

const BulkMail = () => {
  const { alertElement, showAlert, confirm } = useAlert();
  const [meta, setMeta] = useState(null);
  const [view, setView] = useState('compose');
  const [selected, setSelected] = useState({});
  const [allAddresses, setAllAddresses] = useState(false);
  const [kind, setKind] = useState('INFO');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [detail, setDetail] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => { api.get('/bulk-mail/meta').then((r) => setMeta(r.data)).catch(() => setMeta({ failed: true })); }, [version]);

  // Geçmiş: gönderim sürerken birkaç saniyede bir yenilenir
  useEffect(() => {
    if (view !== 'history') return undefined;
    let alive = true;
    let timer;
    const load = () => api.get('/bulk-mail/campaigns').then((r) => {
      if (!alive) return;
      setHistory(r.data);
      if (r.data.some((c) => c.status === 'SENDING')) timer = setTimeout(load, 3000);
    }).catch(() => { if (alive) setHistory([]); });
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [view, version]);

  const chosen = Object.values(selected);
  const addresses = chosen.reduce((n, r) => n + (allAddresses ? usableEmails(r).length : 1), 0);
  const sample = chosen[0] || { name: 'Örnek Firma', contact: 'Örnek Yetkili', balance: -1250, currency: 'TRY' };
  const ready = subject.trim() && body.trim();
  const payload = () => ({ kind, subject, body, keys: Object.keys(selected), allAddresses });

  const sendTest = async () => {
    setBusy(true);
    try {
      const res = await api.post('/bulk-mail/test', payload());
      showAlert({ type: 'success', title: 'Deneme gönderildi', message: res.data.message });
    } catch (err) {
      showAlert({ type: 'error', title: 'Gönderilemedi', message: errorMessage(err, 'Deneme e-postası gönderilemedi.') });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const ok = await confirm({
      title: 'E-posta gönderilsin mi?',
      message: `${chosen.length} alıcıya (yaklaşık ${addresses} adres) ${kind === 'COMMERCIAL' ? 'ticari' : 'bilgilendirme'} e-postası gönderilecek. Gönderim arka planda sürer; ilerlemeyi Geçmiş'te görebilirsiniz.`,
      confirmText: 'Gönder'
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.post('/bulk-mail/send', payload());
      showAlert({ type: 'success', title: 'Gönderim başladı', message: res.data.message });
      setSelected({});
      setVersion((v) => v + 1);
      setView('history');
    } catch (err) {
      showAlert({ type: 'error', title: 'Başlatılamadı', message: errorMessage(err, 'Toplu e-posta başlatılamadı.') });
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (id) => api.get(`/bulk-mail/campaigns/${id}`).then((r) => setDetail(r.data)).catch((err) => showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Gönderim alınamadı.') }));

  if (!meta) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  if (meta.failed) return <p className="p-10 text-center text-gray-500">Toplu e-posta bilgileri alınamadı.</p>;
  const previewBody = fillTemplate(body, sample).trim();

  return (
    <div className="space-y-6">
      {alertElement}
      <PageHeader icon={Mail} title="Toplu E-posta" subtitle="Bayilerinize, müşterilerinize ve müşteri adaylarınıza firmanızın adıyla e-posta gönderin; yanıtlar size gelir."
        actions={(
          <div className="flex p-1 rounded-xl bg-gray-100">
            {[['compose', 'Yeni gönderim', Send], ['history', 'Geçmiş', History]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setView(id)} className={`flex items-center px-4 py-2 text-xs font-black rounded-lg ${view === id ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`}><Icon className="h-4 w-4 mr-1.5" /> {label}</button>
            ))}
          </div>
        )} />

      {!meta.active && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-100 p-4 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" /> <span>E-posta sunucusu (SMTP) tanımlı değil; gönderim yapılamaz. Platform yöneticisine başvurun.</span>
        </div>
      )}

      {view === 'compose' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_26rem] gap-6 items-start">
          <RecipientPicker meta={meta} endpoint="/bulk-mail/recipients" channel="email" selected={selected} setSelected={setSelected} />

          <div className="card-premium p-5 space-y-4 xl:sticky xl:top-24">
            <div className="flex p-1 rounded-xl bg-gray-100">
              {[['INFO', 'Bilgilendirme'], ['COMMERCIAL', 'Ticari']].map(([id, label]) => (
                <button key={id} onClick={() => setKind(id)} className={`flex-1 px-3 py-1.5 text-xs font-black rounded-lg ${kind === id ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`}>{label}</button>
              ))}
            </div>
            <p className="text-xs text-gray-500 flex items-start gap-2"><Info className="h-4 w-4 shrink-0" />
              {kind === 'INFO'
                ? 'Bayram tatili, teslimat günü, fiyat listesi güncellemesi gibi duyurular. Kampanya, indirim, yeni ürün tanıtımı ticaridir.'
                : 'Kampanya, indirim, yeni ürün. Bireysel alıcılardan (ör. müşteri adayları) önceden izin almış olmanız gerekir; tacirlere izin gerekmez ama ret hakları vardır. E-postaya "ticari ileti" notu eklenir.'}
            </p>
            <input className="premium-input" maxLength={meta.limits.subject} placeholder="Konu" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Konu" />
            <div>
              <textarea className="premium-input h-56 resize-y" maxLength={meta.limits.body} placeholder="E-posta metni… Boş satır yeni paragraf olur; bağlantılar tıklanabilir." value={body} onChange={(e) => setBody(e.target.value)} aria-label="E-posta metni" />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PLACEHOLDERS.map(([p, label]) => (
                  <button key={p} type="button" title={label} onClick={() => setBody((v) => `${v}${v && !/\s$/.test(v) ? ' ' : ''}${p}`)} className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] font-mono font-bold text-gray-600 hover:bg-brand-50 hover:text-brand-700">{p}</button>
                ))}
              </div>
            </div>
            {ready && (
              <div className="rounded-xl ring-1 ring-gray-100 bg-white p-4 space-y-2">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide">Önizleme · {chosen[0] ? chosen[0].name : 'örnek alıcı'}</p>
                <p className="text-sm font-bold text-gray-900">{fillTemplate(subject, sample)}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{previewBody}</p>
                <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">{kind === 'COMMERCIAL' ? 'Bu bir ticari iletidir. ' : ''}Toplu e-posta almak istemiyorsanız abonelikten çıkın.</p>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-gray-50 p-2"><dt className="text-[11px] text-gray-500">Adres ~</dt><dd className="font-black text-gray-900">{addresses}</dd></div>
              <div className="rounded-xl bg-gray-50 p-2"><dt className="text-[11px] text-gray-500">Bugün kalan</dt><dd className="font-black text-gray-900">{meta.limits.remaining.toLocaleString('tr-TR')} / {meta.limits.daily.toLocaleString('tr-TR')}</dd></div>
            </dl>
            <p className="text-[11px] text-gray-500">{meta.replyTo ? <>Yanıtlar <b>{meta.replyTo}</b> adresine gelir.</> : 'Firma e-postası tanımlı değil (Ayarlar → Genel); yanıtlar gönderen adrese gider.'}{meta.optOuts ? ` ${meta.optOuts} adres abonelikten çıkmış; onlara gönderilmez.` : ''}</p>
            {chosen.some((r) => r.source !== 'LEAD') && (
              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={allAddresses} onChange={(e) => setAllAddresses(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>Firmanın bütün adreslerine gönder (kapalıyken firma başına bir adres: önce ana kullanıcı). Aynı adrese bir kez gider.</span>
              </label>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2">
              <button type="button" disabled={busy || !meta.active || !ready} onClick={sendTest} className="btn-secondary h-12 disabled:opacity-50" title="Size, ilk seçilen alıcının bilgileriyle"><FlaskConical className="h-4 w-4 mr-1.5" /> Kendime deneme</button>
              <button disabled={busy || !meta.active || !chosen.length || !ready} onClick={send} className="btn-gradient h-12 disabled:opacity-50">
                <Send className="h-4 w-4 mr-2" /> {chosen.length ? `${chosen.length} alıcıya gönder` : 'Alıcı seçin'}
              </button>
            </div>
            {chosen.length > 0 && <button type="button" onClick={() => setSelected({})} className="w-full text-xs font-bold text-gray-400 hover:text-gray-600">Seçimi temizle</button>}
          </div>
        </div>
      ) : (
        <div className="card-premium p-5">
          {!history ? <p className="py-10 text-center text-sm text-gray-400">Yükleniyor…</p> : history.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">Henüz toplu e-posta yok.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] font-black text-gray-400 uppercase tracking-wider">{['Tarih', 'Gönderen', 'Tür', 'Konu', 'Durum'].map((h) => <th key={h} className="py-2 pr-4 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((c) => {
                    const done = c.sent + c.failed;
                    return (
                      <tr key={c.id} onClick={() => openDetail(c.id)} className="cursor-pointer hover:bg-gray-50">
                        <td className="py-3 pr-4 whitespace-nowrap font-semibold text-gray-900">{formatDate(c.createdAt, true)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap text-gray-600">{c.createdBy?.name || '—'}</td>
                        <td className="py-3 pr-4 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${c.kind === 'COMMERCIAL' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{c.kind === 'COMMERCIAL' ? 'Ticari' : 'Bilgilendirme'}</span></td>
                        <td className="py-3 pr-4 text-gray-700 max-w-sm truncate">{c.subject}</td>
                        <td className="py-3 pr-4 whitespace-nowrap min-w-[12rem]">
                          {c.status === 'SENDING' ? (
                            <div>
                              <p className="text-xs font-bold text-brand-600">Gönderiliyor · {done} / {c.total}</p>
                              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${Math.round((done / c.total) * 100)}%` }} /></div>
                            </div>
                          ) : c.failed === 0
                            ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="h-4 w-4" /> {c.sent} gönderildi</span>
                            : <span className="inline-flex items-center gap-1 text-red-600 font-bold"><XCircle className="h-4 w-4" /> {c.failed} hatalı{c.sent ? `, ${c.sent} gönderildi` : ''}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop" onClick={() => setDetail(null)} />
          <div className="modal-panel w-full max-w-2xl max-h-[90vh] flex flex-col">
            <ModalHeader icon={Users} title={`Gönderim · ${formatDate(detail.createdAt, true)}`} onClose={() => setDetail(null)} closeLabel="Kapat" />
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="rounded-xl bg-gray-50 p-3 space-y-1">
                <p className="text-sm font-bold text-gray-900">{detail.subject}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{detail.body}</p>
              </div>
              <p className="text-xs text-gray-500">{detail.kind === 'COMMERCIAL' ? 'Ticari' : 'Bilgilendirme'} · gönderen {detail.createdBy?.name || '—'} · {detail.sent} gönderildi{detail.failed ? `, ${detail.failed} hatalı` : ''}{detail.status === 'SENDING' ? ' · gönderim sürüyor' : ''}</p>
              <ul className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100">
                {detail.recipients.map((r) => {
                  const [Icon, color, label] = STATUS[r.status] || STATUS.PENDING;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-label={label} />
                      <span className="min-w-0 flex-1"><span className="font-semibold text-gray-900">{r.name}</span> <span className="text-xs text-gray-400">{meta.sources[r.source]}</span>{r.error && <span className="block text-xs text-red-600">{r.error}</span>}</span>
                      <span className="text-xs text-gray-500 truncate max-w-[14rem]">{r.email}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkMail;
