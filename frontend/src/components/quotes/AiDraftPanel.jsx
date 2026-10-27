import { useState } from 'react';
import { Sparkles, Loader2, MessageCircleQuestion, AlertTriangle, FlaskConical } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { Toggle } from '../form/FormKit';

/**
 * Doğal dille yazılan ihtiyaçtan taslak kalemler. Yapay zekâ yalnızca katalogdaki ürünlerden önerir;
 * fiyat ve toplamlar backend'de hesaplanır. Sonuç taslaktır, otomatik gönderilmez.
 * onDraft(result, { text, preferences, answers }) ile kalemler editöre aktarılır.
 */
const AiDraftPanel = ({ ai, companyId, initialText = '', initialPreferences, onDraft }) => {
  const [text, setText] = useState(initialText);
  const [prefs, setPrefs] = useState(initialPreferences || { brand: '', budget: '', inStockOnly: false });
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]); // önceki tur soru-cevapları
  const [draftAnswers, setDraftAnswers] = useState({});
  const [state, setState] = useState({ loading: false, error: null });

  const run = async (extraAnswers = []) => {
    const allAnswers = [...answers, ...extraAnswers];
    setState({ loading: true, error: null });
    try {
      const res = await api.post('/quotes/ai/draft', { companyId, text, preferences: prefs, answers: allAnswers }, { timeout: 150000 });
      setAnswers(allAnswers);
      setQuestions(res.data.questions || []);
      setDraftAnswers({});
      setState({ loading: false, error: null });
      onDraft(res.data, { text, preferences: prefs, answers: allAnswers, questions: res.data.questions || [] });
    } catch (err) {
      setState({ loading: false, error: errorMessage(err, 'Yapay zekâ taslağı hazırlanamadı. Teklifi manuel olarak hazırlayabilirsiniz.') });
    }
  };

  const answerAndRun = () => {
    const extra = questions.map((q, i) => ({ question: q.question, answer: (draftAnswers[i] || '').trim() })).filter((a) => a.answer);
    run(extra);
  };

  if (!ai) return null;

  return (
    <section className="rounded-2xl ring-1 ring-violet-100 bg-gradient-to-br from-violet-50/70 to-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-violet-100 text-violet-600 shrink-0"><Sparkles className="h-4 w-4" /></div>
          <div>
            <h3 className="text-sm font-black text-gray-900">Yapay Zekâ ile Taslak</h3>
            <p className="text-xs text-gray-500 mt-0.5">İhtiyacı doğal dille yazın; katalogdan uygun ürünler, miktarlar ve eksik bilgi soruları gelsin. Her öneriyi kontrol edip düzenleyebilirsiniz.</p>
          </div>
        </div>
        {ai.mock && <span className="flex items-center text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full"><FlaskConical className="h-3 w-3 mr-1" /> Geliştirme modu · örnek yanıt</span>}
      </div>

      {!ai.enabled ? (
        <p className="flex items-start gap-2 text-xs font-bold text-gray-600 bg-white rounded-xl p-3 ring-1 ring-gray-100">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span>{ai.reason || 'Yapay zekâ kullanılamıyor.'} Teklifi aşağıdan manuel olarak hazırlayabilirsiniz.</span>
        </p>
      ) : (
        <>
          <textarea className="premium-input !bg-white h-28 resize-y" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Örn: 20 koli 8 oz karton bardak, uyumlu kapak ve 10 koli peçete için ekonomik bir teklif hazırla." />
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div><label className="premium-label">Marka tercihi (isteğe bağlı)</label><input className="premium-input !bg-white" value={prefs.brand} onChange={(e) => setPrefs({ ...prefs, brand: e.target.value })} /></div>
            <div><label className="premium-label">Bütçe / fiyat tercihi (isteğe bağlı)</label><input className="premium-input !bg-white" placeholder="Örn: ekonomik, en fazla 50.000 ₺" value={prefs.budget} onChange={(e) => setPrefs({ ...prefs, budget: e.target.value })} /></div>
            <label className="flex items-center gap-2 h-11 text-xs font-bold text-gray-600 cursor-pointer">
              <Toggle checked={prefs.inStockOnly} onChange={(v) => setPrefs({ ...prefs, inStockOnly: v })} color="emerald" /> Yalnızca stoktakiler
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={state.loading || !companyId || text.trim().length < 3} onClick={() => { setAnswers([]); run([]); }}
              className="flex items-center px-5 h-11 rounded-xl text-sm font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 shadow-md shadow-violet-500/20">
              {state.loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {state.loading ? 'Hazırlanıyor...' : 'Yapay Zekâ ile Taslak Hazırla'}
            </button>
            {!companyId && <span className="text-xs font-bold text-gray-400">Önce müşteri seçin (fiyatlar müşteriye göre hesaplanır).</span>}
          </div>
        </>
      )}

      {state.error && (
        <p className="flex items-start gap-2 text-xs font-bold text-red-600 bg-red-50 rounded-xl p-3"><AlertTriangle className="h-4 w-4 shrink-0" /> {state.error}</p>
      )}

      {questions.length > 0 && (
        <div className="rounded-xl bg-white ring-1 ring-violet-100 p-4 space-y-3">
          <p className="flex items-center text-xs font-black text-violet-700"><MessageCircleQuestion className="h-4 w-4 mr-1.5" /> Eksik bilgiler</p>
          {questions.map((q, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_16rem] gap-2 items-center">
              <p className="text-sm text-gray-700">{q.question}{q.about && <span className="block text-[11px] text-gray-400">“{q.about}”</span>}</p>
              <input className="premium-input !py-2" placeholder="Yanıt" value={draftAnswers[i] || ''} onChange={(e) => setDraftAnswers({ ...draftAnswers, [i]: e.target.value })} />
            </div>
          ))}
          <button type="button" disabled={state.loading || !Object.values(draftAnswers).some((v) => v.trim())} onClick={answerAndRun}
            className="text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 px-4 py-2 rounded-xl disabled:opacity-50">
            Yanıtla ve taslağı yenile
          </button>
        </div>
      )}
    </section>
  );
};

export default AiDraftPanel;
