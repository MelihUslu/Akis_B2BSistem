import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Send, Mic, Volume2, VolumeX, Check, CornerDownRight, Loader2 } from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Tarayıcı konuşma tanıma (Web Speech API) — Chrome/Android tam, iOS Safari değişken
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

const GREETING = 'Merhaba, ben Akkuş 👋 Panelde size yardımcı olurum. "Bu ay ciro ne?", "siparişleri aç" ya da "3000 TL kira gideri ekle" gibi yazabilir veya mikrofonla konuşabilirsiniz.';

const Akkus = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const [status, setStatus] = useState(null); // { enabled, reason }
  const scrollRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);
  useEffect(() => {
    if (open && !status) api.get('/assistant/status').then((r) => setStatus(r.data)).catch(() => setStatus({ enabled: false, reason: 'Asistan durumu alınamadı.' }));
  }, [open, status]);

  const speak = useCallback((text) => {
    if (!voice || !canSpeak || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[*_#>•]/g, ''));
      u.lang = 'tr-TR';
      window.speechSynthesis.speak(u);
    } catch { /* ses yoksa sessiz geç */ }
  }, [voice]);

  const send = useCallback(async (textArg) => {
    const text = (typeof textArg === 'string' ? textArg : input).trim();
    if (!text || busy) return;
    setInput('');
    const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const { data } = await api.post('/assistant/chat', { message: text, history });
      setMessages((m) => [...m, { role: 'assistant', text: data.reply, action: data.action || null, status: data.action ? 'pending' : null }]);
      speak(data.reply);
      if (data.navigate) { navigate(data.navigate); }
    } catch (err) {
      const msg = errorMessage(err, 'Yanıt alınamadı.');
      setMessages((m) => [...m, { role: 'assistant', text: msg }]);
    } finally { setBusy(false); }
  }, [input, busy, messages, navigate, speak]);

  // Onay kartı: işlemi mevcut uca gönderir
  const applyAction = async (idx) => {
    const msg = messages[idx];
    if (!msg?.action || msg.status !== 'pending') return;
    setMessages((m) => m.map((x, i) => (i === idx ? { ...x, status: 'applying' } : x)));
    try {
      const res = await api.post(msg.action.endpoint, msg.action.body);
      const okText = res.data?.message || 'İşlem uygulandı.';
      setMessages((m) => m.map((x, i) => (i === idx ? { ...x, status: 'done' } : x)).concat({ role: 'assistant', text: `✓ ${okText}` }));
      speak(okText);
    } catch (err) {
      const msg2 = errorMessage(err, 'İşlem uygulanamadı.');
      setMessages((m) => m.map((x, i) => (i === idx ? { ...x, status: 'pending' } : x)).concat({ role: 'assistant', text: `⚠ ${msg2}` }));
    }
  };
  const cancelAction = (idx) => setMessages((m) => m.map((x, i) => (i === idx ? { ...x, status: 'cancelled' } : x)));

  const toggleMic = () => {
    if (!SR) return;
    if (listening) { recRef.current?.stop(); return; }
    try {
      const rec = new SR();
      rec.lang = 'tr-TR';
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t; else interim += t;
        }
        setInput(finalText || interim);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => { setListening(false); if (finalText.trim()) send(finalText.trim()); };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch { setListening(false); }
  };

  if (user?.role !== 'ADMIN') return null;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} title="Akkuş asistan" aria-label="Akkuş asistanı aç"
          className="fixed bottom-6 right-6 z-[55] h-14 w-14 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform">
          <Sparkles className="h-6 w-6" />
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[60] sm:inset-auto sm:bottom-6 sm:right-6 sm:top-6 flex">
          <div className="sm:hidden absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative ml-auto w-full sm:w-[400px] h-full sm:h-auto sm:max-h-full bg-white sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-gray-100">
            {/* Başlık */}
            <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-br from-brand-600 to-brand-800 text-white shrink-0">
              <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center"><Sparkles className="h-5 w-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-black">Akkuş</div>
                <div className="text-[11px] text-white/70">Panel asistanı{status?.mock ? ' · demo' : ''}</div>
              </div>
              {canSpeak && (
                <button onClick={() => { setVoice((v) => !v); window.speechSynthesis?.cancel(); }} title={voice ? 'Sesi kapat' : 'Sesi aç'} className="p-2 rounded-lg hover:bg-white/10">
                  {voice ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Kapat" className="p-2 rounded-lg hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>

            {status && !status.enabled && (
              <div className="px-5 py-2 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100">{status.reason || 'Asistan şu an kullanılamıyor.'}</div>
            )}

            {/* Mesajlar */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/60">
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-600 text-white rounded-br-md' : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md shadow-sm'}`}>
                    {m.text}
                    {m.action && (m.status === 'pending' || m.status === 'applying') && (
                      <div className="mt-2.5 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <div className="text-[11px] font-bold text-gray-400 uppercase mb-1">Onay gerekiyor</div>
                        <div className="text-sm font-semibold text-gray-800">{m.action.summary}</div>
                        <div className="flex gap-2 mt-3">
                          <button disabled={m.status === 'applying'} onClick={() => applyAction(i)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 disabled:opacity-60">
                            {m.status === 'applying' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Uygula
                          </button>
                          <button disabled={m.status === 'applying'} onClick={() => cancelAction(i)} className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50">Vazgeç</button>
                        </div>
                      </div>
                    )}
                    {m.action && m.status === 'done' && <div className="mt-2 text-[11px] font-bold text-emerald-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Uygulandı</div>}
                    {m.action && m.status === 'cancelled' && <div className="mt-2 text-[11px] font-bold text-gray-400">Vazgeçildi</div>}
                  </div>
                </div>
              ))}
              {busy && <div className="flex justify-start"><div className="bg-white border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm"><Loader2 className="h-4 w-4 animate-spin text-brand-500" /></div></div>}
            </div>

            {/* Giriş */}
            <div className="p-3 border-t border-gray-100 bg-white shrink-0">
              {listening && <div className="text-[11px] font-bold text-red-500 mb-1.5 flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Dinleniyor…</div>}
              <div className="flex items-end gap-2">
                <textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Akkuş'a yazın ya da konuşun…" disabled={busy}
                  className="flex-1 resize-none max-h-28 premium-input !py-2.5 text-sm" />
                {SR && (
                  <button onClick={toggleMic} title="Konuş" className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${listening ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <Mic className="h-5 w-5" />
                  </button>
                )}
                <button onClick={() => send()} disabled={busy || !input.trim()} title="Gönder" className="shrink-0 h-10 w-10 rounded-xl bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-50">
                  <Send className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1"><CornerDownRight className="h-3 w-3" /> Yazma işlemleri (gelir-gider, ürün) onayınızla uygulanır.</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Akkus;
