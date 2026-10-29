// Tanıtım sitesi yardımcıları: reklam kaynağı (UTM) ve reklam ölçümü

const UTM_KEY = 'akis_utm';
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref'];

// İlk girişteki reklam parametreleri oturum boyunca saklanır (sayfalar arasında kaybolmasın)
export const captureUtm = () => {
  try {
    const q = new URLSearchParams(window.location.search);
    const found = Object.fromEntries(UTM_PARAMS.filter((k) => q.get(k)).map((k) => [k, q.get(k).slice(0, 200)]));
    if (Object.keys(found).length) sessionStorage.setItem(UTM_KEY, JSON.stringify({ ...found, landing: window.location.pathname }));
  } catch { /* gizli sekme */ }
};

export const getUtm = () => {
  try { return JSON.parse(sessionStorage.getItem(UTM_KEY) || 'null') || undefined; } catch { return undefined; }
};

// ─── Reklam ölçümü (yalnızca ziyaretçi çerez onayı verdiyse yüklenir) ─────────
const CONSENT_KEY = 'akis_cookie_consent';
export const getConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
export const setConsent = (v) => { try { localStorage.setItem(CONSENT_KEY, v); } catch { /* gizli sekme */ } };

let loaded = false;
let ids = {};
const addScript = (src) => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); };

export const loadTracking = (tracking = {}) => {
  if (loaded || getConsent() !== 'all') return;
  ids = tracking;
  if (tracking.metaPixelId) {
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; }(window, document);
    /* eslint-enable */
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', tracking.metaPixelId);
    window.fbq('track', 'PageView');
  }
  if (tracking.googleTagId) {
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tracking.googleTagId)}`);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', tracking.googleTagId);
  }
  loaded = true;
};

// Dönüşüm olayları: 'lead' (demo talebi / sohbette iletişim) ve 'signup' (deneme hesabı)
export const trackEvent = (name) => {
  if (!loaded) return;
  if (window.fbq) window.fbq('track', name === 'signup' ? 'CompleteRegistration' : 'Lead');
  if (window.gtag) {
    window.gtag('event', name === 'signup' ? 'sign_up' : 'generate_lead');
    if (ids.googleAdsConversion) window.gtag('event', 'conversion', { send_to: ids.googleAdsConversion });
  }
};
