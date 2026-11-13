import { useEffect, useRef } from 'react';

// Cloudflare Turnstile widget'ı. VITE_TURNSTILE_SITEKEY tanımlıysa gösterilir; değilse hiçbir şey çizmez.
// Betik yalnızca bir kez yüklenir. Token 'onToken' ile verilir (süresi dolunca / hatada boş string).
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loader;
const loadScript = () => {
  if (window.turnstile) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC; s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return loader;
};

export default function Turnstile({ sitekey, onToken }) {
  const box = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!sitekey) return undefined;
    let active = true;
    loadScript().then(() => {
      if (!active || !box.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(box.current, {
        sitekey,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken('')
      });
    }).catch(() => {});
    return () => {
      active = false;
      try { if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current); } catch { /* yoksay */ }
    };
  }, [sitekey, onToken]);

  if (!sitekey) return null;
  return <div ref={box} className="flex justify-center min-h-[65px]" />;
}
