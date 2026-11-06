import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, Send, History, Users, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import useAlert from '../../hooks/useAlert';
import PageHeader from '../../components/shared/PageHeader';
import ModalHeader from '../../components/shared/ModalHeader';
import { formatDate } from '../../utils/format';
import RecipientPicker from '../../components/bulk/RecipientPicker';
import { PLACEHOLDERS, fillTemplate as fill, phoneText } from '../../components/bulk/shared';

/**
 * Toplu SMS: bayiler, bayi olmayan müşteri carileri ve müşteri adayları süzülür, seçilir, firmanın Netgsm hesabıyla
 * gönderilir. Bilgilendirme ya da ticari (İYS süzgeçli, sonuna ret metni eklenir). Numaralar sunucuda kayıtlardan çözülür.
 */
// Netgsm'in Türkçe karakterli SMS sayımı (yaklaşık): 155'e kadar 1 SMS, uzunsa 150'şer karakterlik parçalar
const smsParts = (text) => (text.length <= 155 ? 1 : Math.ceil(text.length / 150));

const BulkSms = () => {
  const { alertElement, showAlert, confirm } = useAlert();
  const [meta, setMeta] = useState(null);
  const [view, setView] = useState('compose');
  const [selected, setSelected] = useState({}); // key → satır (kaynaklar arasında korunur)
  const [allNumbers, setAllNumbers] = useState(false);
  const [kind, setKind] = useState('INFO');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => { api.get('/bulk-sms/meta').then((r) => setMeta(r.data)).catch(() => setMeta({ failed: true })); }, []);

  useEffect(() => {
    if (view === 'history') api.get('/bulk-sms/campaigns').then((r) => setHistory(r.data)).catch(() => setHistory([]));
  }, [view]);

  const optOut = kind === 'COMMERCIAL' ? meta?.optOut || '' : '';
  const chosen = Object.values(selected);
  const numbers = chosen.reduce((n, r) => n + (allNumbers ? r.phones.length : 1), 0);
  const fullText = text.trim() ? `${text.trim()}${optOut ? ` ${optOut}` : ''}` : '';
  const preview = chosen[0] && fullText ? fill(fullText, chosen[0]) : fullText;
  const parts = preview ? smsParts(preview) : 0;

  const send = async () => {
    const ok = await confirm({
      title: 'SMS gönderilsin mi?',
      message: `${chosen.length} alıcıya (yaklaşık ${numbers} numara × ${parts} SMS = ${numbers * parts} SMS) ${kind === 'COMMERCIAL' ? 'ticari (İYS)' : 'bilgilendirme'} mesajı gönderilecek. Ücret firmanızın Netgsm hesabından düşer.`,
      confirmText: 'Gönder'
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.post('/bulk-sms/send', { kind, text, keys: Object.keys(selected), allNumbers });
      showAlert({ type: res.data.campaign.failed ? 'warning' : 'success', title: 'Gönderildi', message: res.data.message });
      setSelected({});
    } catch (err) {
      showAlert({ type: 'error', title: 'Gönderilemedi', message: errorMessage(err, 'Toplu SMS gönderilemedi.') });
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (id) => api.get(`/bulk-sms/campaigns/${id}`).then((r) => setDetail(r.data)).catch((err) => showAlert({ type: 'error', title: 'Hata', message: errorMessage(err, 'Gönderim alınamadı.') }));

  if (!meta) return <p className="p-10 text-center text-gray-400">Yükleniyor…</p>;
  if (meta.failed) return <p className="p-10 text-center text-gray-500">Toplu SMS bilgileri alınamadı.</p>;

  return (
    <div className="space-y-6">
      {alertElement}
      <PageHeader icon={MessageSquareText} title="Toplu SMS" subtitle="Bayilerinize, müşterilerinize ve müşteri adaylarınıza firmanızın Netgsm hesabıyla SMS gönderin."
        actions={(
          <div className="flex p-1 rounded-xl bg-gray-100">
            {[['compose', 'Yeni gönderim', Send], ['history', 'Geçmiş', History]].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setView(id)} className={`flex items-center px-4 py-2 text-xs font-black rounded-lg ${view === id ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`}><Icon className="h-4 w-4 mr-1.5" /> {label}</button>
            ))}
          </div>
        )} />

      {!meta.active && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-100 p-4 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>SMS kapalı ya da Netgsm bağlı değil; gönderim yapılamaz. <Link to="/admin/settings?tab=sms" className="font-bold underline">Ayarlar → SMS</Link></span>
        </div>
      )}

      {view === 'compose' ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-start">
          <RecipientPicker meta={meta} endpoint="/bulk-sms/recipients" channel="sms" selected={selected} setSelected={setSelected} />

          {/* Mesaj */}
          <div className="card-premium p-5 space-y-4 xl:sticky xl:top-24">
            <div className="flex p-1 rounded-xl bg-gray-100">
              {[['INFO', 'Bilgilendirme'], ['COMMERCIAL', 'Ticari (İYS)']].map(([id, label]) => (
                <button key={id} onClick={() => setKind(id)} className={`flex-1 px-3 py-1.5 text-xs font-black rounded-lg ${kind === id ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`}>{label}</button>
              ))}
            </div>
            <p className="text-xs text-gray-500 flex items-start gap-2"><Info className="h-4 w-4 shrink-0" />
              {kind === 'INFO'
                ? 'Bayram tatili, teslimat günü, sistem bakımı gibi duyurular. Kampanya, indirim, yeni ürün tanıtımı ticaridir.'
                : 'Kampanya, indirim, yeni ürün. Netgsm İYS süzgeciyle gönderilir (cariler tacir, adaylar bireysel); İYS\'de reddedene gitmez. Sonuna ret metni eklenir.'}
            </p>
            {kind === 'COMMERCIAL' && !meta.optOut && (
              <p className="text-xs font-semibold text-red-600">Ret metni tanımlı değil; ticari SMS gönderilemez. <Link to="/admin/settings?tab=sms" className="underline">Ayarlar → SMS</Link></p>
            )}
            <div>
              <textarea className="premium-input h-36 resize-none" maxLength={meta.limits.text} placeholder="Mesajınız…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PLACEHOLDERS.map(([p, label]) => (
                  <button key={p} type="button" title={label} onClick={() => setText((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}${p}`)} className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] font-mono font-bold text-gray-600 hover:bg-brand-50 hover:text-brand-700">{p}</button>
                ))}
              </div>
            </div>
            {preview && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-wide mb-1">Önizleme{chosen[0] ? ` · ${chosen[0].name}` : ''}</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{preview}</p>
              </div>
            )}
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-gray-50 p-2"><dt className="text-[11px] text-gray-500">Karakter</dt><dd className="font-black text-gray-900">{preview.length}</dd></div>
              <div className="rounded-xl bg-gray-50 p-2"><dt className="text-[11px] text-gray-500">SMS boyu</dt><dd className="font-black text-gray-900">{parts}</dd></div>
              <div className="rounded-xl bg-gray-50 p-2"><dt className="text-[11px] text-gray-500">Toplam SMS ~</dt><dd className="font-black text-gray-900">{numbers * parts}</dd></div>
            </dl>
            {chosen.some((r) => r.source !== 'LEAD') && (
              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={allNumbers} onChange={(e) => setAllNumbers(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>Firmanın bütün cep numaralarına gönder (kapalıyken firma başına bir numara: önce ana kullanıcı). Aynı numaraya bir kez gider.</span>
              </label>
            )}
            <button disabled={busy || !meta.active || !chosen.length || !text.trim() || (kind === 'COMMERCIAL' && !meta.optOut)} onClick={send} className="btn-gradient w-full h-12 disabled:opacity-50">
              <Send className="h-4 w-4 mr-2" /> {chosen.length ? `${chosen.length} alıcıya gönder` : 'Alıcı seçin'}
            </button>
            {chosen.length > 0 && <button type="button" onClick={() => setSelected({})} className="w-full text-xs font-bold text-gray-400 hover:text-gray-600">Seçimi temizle</button>}
          </div>
        </div>
      ) : (
        <div className="card-premium p-5">
          {!history ? <p className="py-10 text-center text-sm text-gray-400">Yükleniyor…</p> : history.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">Henüz toplu gönderim yok.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] font-black text-gray-400 uppercase tracking-wider">{['Tarih', 'Gönderen', 'Tür', 'Mesaj', 'Alıcı', 'Sonuç'].map((h) => <th key={h} className="py-2 pr-4 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((c) => (
                    <tr key={c.id} onClick={() => openDetail(c.id)} className="cursor-pointer hover:bg-gray-50">
                      <td className="py-3 pr-4 whitespace-nowrap font-semibold text-gray-900">{formatDate(c.createdAt, true)}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-gray-600">{c.createdBy?.name || '—'}</td>
                      <td className="py-3 pr-4 whitespace-nowrap"><span className={`px-2 py-0.5 rounded-md text-[11px] font-black ${c.kind === 'COMMERCIAL' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>{c.kind === 'COMMERCIAL' ? 'Ticari (İYS)' : 'Bilgilendirme'}</span></td>
                      <td className="py-3 pr-4 text-gray-700 max-w-sm truncate">{c.text}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-gray-700">{c.total} numara · {c.parts} boy</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        {c.failed === 0
                          ? <span className="inline-flex items-center gap-1 text-emerald-700 font-bold"><CheckCircle2 className="h-4 w-4" /> {c.sent} gönderildi</span>
                          : <span className="inline-flex items-center gap-1 text-red-600 font-bold"><XCircle className="h-4 w-4" /> {c.failed} hatalı{c.sent ? `, ${c.sent} gönderildi` : ''}</span>}
                      </td>
                    </tr>
                  ))}
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
              <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-800 whitespace-pre-wrap break-words">{detail.text}</div>
              <p className="text-xs text-gray-500">{detail.kind === 'COMMERCIAL' ? 'Ticari (İYS)' : 'Bilgilendirme'} · gönderen {detail.createdBy?.name || '—'} · {detail.sent} gönderildi{detail.failed ? `, ${detail.failed} hatalı` : ''}{detail.error ? ` · ${detail.error}` : ''}</p>
              <ul className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100">
                {detail.recipients.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    {r.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    <span className="min-w-0 flex-1"><span className="font-semibold text-gray-900">{r.name}</span> <span className="text-xs text-gray-400">{meta.sources[r.source]}</span>{r.error && <span className="block text-xs text-red-600">{r.error}</span>}</span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{phoneText(r.phone)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkSms;
