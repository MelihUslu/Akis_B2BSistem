import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import PrintLayout from './print/PrintLayout';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { formatTRY, formatDate } from '../utils/format';
import { t } from '../i18n';

const balanceLabel = (b) => (b < 0 ? t('Borçlu') : b > 0 ? t('Alacaklı') : '');

/**
 * Cariye gönderilen ekstre bağlantısı (giriş gerektirmez): ekstreyi görüntüler, PDF olarak kaydeder,
 * "Mutabıkız" veya "İtirazımız var" yanıtı verir (bir kez).
 */
const StatementShare = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [form, setForm] = useState({ name: '', note: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/statement-links/${token}`).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e, t('Ekstre bulunamadı veya bağlantı geçersiz.'))));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/statement-links/${token}/respond`, { response: answer, ...form });
      setResult({ ok: true, message: res.data.message });
      load();
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err, t('Yanıt iletilemedi.')) });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="min-h-screen flex items-center justify-center p-6 text-center text-gray-500">{error}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('Yükleniyor...')}</div>;
  const c = data.company;

  return (
    <PrintLayout ready seller={data.seller} title={t('Cari Hesap Ekstresi')} printLabel={t('PDF olarak kaydet / yazdır')} toolbar={<LanguageSwitcher />}
      subtitle={<>{t('Tarih')}: {formatDate(data.periodEnd)}</>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 mb-6">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{t('Sayın')}</p>
          <p className="font-bold break-words">{c.name}</p>
          <p className="text-gray-600 leading-snug break-words">{c.address}{c.address && <br />}{[c.taxOffice, c.taxNumber].filter(Boolean).join(' V.D. / ')}{c.externalCode && ` · ${t('Cari kodu')}: ${c.externalCode}`}</p>
        </div>
        <div className="sm:text-right print:text-right">
          <p className="text-[10px] font-black text-gray-500 uppercase mb-1">{t('Bakiye')} ({formatDate(data.periodEnd)})</p>
          <p className={`text-2xl font-black ${data.balance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatTRY(Math.abs(data.balance))}</p>
          <p className="text-xs font-bold text-gray-500">{balanceLabel(data.balance)}</p>
        </div>
      </div>

      {/* Dar ekran: kart görünümü */}
      <div className="sm:hidden print:hidden divide-y divide-gray-100 border-y border-gray-200">
        <div className="py-2 flex justify-between text-xs"><b>{t('Açılış bakiyesi')}</b><span>{formatTRY(data.openingBalance)}</span></div>
        {[...data.transactions].reverse().map((r) => (
          <div key={r.id} className="py-2 flex justify-between gap-3 text-xs">
            <span className="min-w-0"><span className="block break-words">{r.description}</span><span className="text-gray-400">{formatDate(r.date)}</span></span>
            <span className="text-right shrink-0">
              <span className={`block font-bold ${r.type === 'DEBT' ? 'text-red-600' : 'text-emerald-600'}`}>{formatTRY(r.amount)} {r.type === 'DEBT' ? t('Borç') : t('Alacak')}</span>
              <span className="text-gray-400">{t('Bakiye')} {formatTRY(r.balanceAfter)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="hidden sm:block print:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-y border-gray-900 text-[10px] uppercase">
              <th className="py-2 text-left">{t('Tarih')}</th><th className="py-2 text-left">{t('Açıklama')}</th>
              <th className="py-2 text-right">{t('Borç')}</th><th className="py-2 text-right">{t('Alacak')}</th><th className="py-2 text-right">{t('Bakiye')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200"><td className="py-2" colSpan={4}><b>{t('Açılış bakiyesi')}</b></td><td className="py-2 text-right">{formatTRY(data.openingBalance)}</td></tr>
            {[...data.transactions].reverse().map((r) => (
              <tr key={r.id} className="border-b border-gray-200 align-top">
                <td className="py-2 whitespace-nowrap pr-2">{formatDate(r.date)}</td>
                <td className="py-2 pr-2 break-words">{r.description}</td>
                <td className="py-2 text-right whitespace-nowrap">{r.type === 'DEBT' ? formatTRY(r.amount) : ''}</td>
                <td className="py-2 text-right whitespace-nowrap">{r.type === 'CREDIT' ? formatTRY(r.amount) : ''}</td>
                <td className="py-2 text-right whitespace-nowrap">{formatTRY(r.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.response ? (
        <div className={`mt-8 flex items-start gap-2 rounded-xl border p-4 text-sm font-bold ${data.response.type === 'AGREED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          {data.response.type === 'AGREED' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
          <span>{data.response.type === 'AGREED' ? t('Mutabakat verildi') : t('İtiraz iletildi')} — {data.response.by}, {formatDate(data.response.at, true)}{data.response.note && `: “${data.response.note}”`}</span>
        </div>
      ) : (
        <div className="print:hidden mt-8 rounded-2xl bg-gray-50 p-5 space-y-4">
          <p className="text-sm font-black">{t('Bu ekstreye göre bakiyemiz')} {formatTRY(Math.abs(data.balance))} {balanceLabel(data.balance).toLocaleLowerCase('tr-TR')}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAnswer('AGREED')} className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-black ${answer === 'AGREED' ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 ring-1 ring-emerald-200'}`}><CheckCircle2 className="h-4 w-4 mr-1.5" /> {t('Mutabıkız')}</button>
            <button type="button" onClick={() => setAnswer('DISPUTED')} className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-black ${answer === 'DISPUTED' ? 'bg-amber-500 text-white' : 'bg-white text-amber-700 ring-1 ring-amber-200'}`}><AlertTriangle className="h-4 w-4 mr-1.5" /> {t('İtirazımız var')}</button>
          </div>
          {answer && (
            <form onSubmit={submit} className="space-y-3">
              <div><label className="premium-label">{t('Adınız soyadınız')} *</label><input required minLength={2} maxLength={120} className="premium-input !bg-white" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><label className="premium-label">{answer === 'DISPUTED' ? `${t('İtiraz nedeni')} *` : t('Not (isteğe bağlı)')}</label><textarea required={answer === 'DISPUTED'} maxLength={1000} className="premium-input !bg-white h-20 resize-none" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
              <button disabled={busy} className="btn-gradient disabled:opacity-50">{t('Yanıtı Gönder')}</button>
            </form>
          )}
        </div>
      )}
      {result && <p className={`print:hidden mt-4 text-sm font-bold ${result.ok ? 'text-emerald-700' : 'text-red-600'}`}>{result.message}</p>}
    </PrintLayout>
  );
};

export default StatementShare;
