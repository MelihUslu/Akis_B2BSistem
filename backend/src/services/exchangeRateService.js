import { getSettingsMap, num } from './settingsService.js';
import { trackExternal } from './monitoring.js';

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const CACHE_MS = 60 * 60 * 1000; // 1 saat

let cache = null; // { rates: { USD, EUR }, date, source, fetchedAt }
let pending = null; // süren TCMB isteği: aynı anda gelen istekler tek isteği bekler
let failedAt = 0; // son başarısız deneme: TCMB kapalıyken her istek 5 sn zaman aşımını beklemesin
const RETRY_MS = 60 * 1000;

const parseCurrency = (xml, code) => {
  const block = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)</Currency>`));
  if (!block) return null;
  const selling = block[1].match(/<ForexSelling>([\d.]+)<\/ForexSelling>/);
  return selling ? parseFloat(selling[1]) : null;
};

const fetchFromTcmb = () => trackExternal('TCMB', 'today.xml', fetchFromTcmbRaw);

const fetchFromTcmbRaw = async () => {
  const res = await fetch(TCMB_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
  const xml = await res.text();
  const USD = parseCurrency(xml, 'USD');
  const EUR = parseCurrency(xml, 'EUR');
  if (!USD || !EUR) throw new Error('TCMB yanıtı çözümlenemedi');
  const date = xml.match(/Tarih="([^"]+)"/)?.[1] || null;
  return { rates: { USD, EUR }, date, source: 'TCMB' };
};

const refresh = () => {
  pending ||= fetchFromTcmb()
    .then((fresh) => (cache = { ...fresh, fetchedAt: Date.now() }))
    .catch((error) => {
      failedAt = Date.now();
      console.warn('[Kur] TCMB kurları alınamadı:', error.message);
      return null;
    })
    .finally(() => { pending = null; });
  return pending;
};

/**
 * Döviz satış kurlarını döner. TCMB 1 saat önbelleklenir; erişilemezse
 * önce son başarılı değer, sonra Ayarlar'daki manuel kurlar kullanılır.
 * Ayarlarda manuel kur girilmişse ve TCMB yanıt vermiyorsa o kullanılır.
 * Süresi dolan kur yenilenirken istekler beklemez: son kur döner, yenisi arka planda çekilir. Eskiden saatte bir
 * her işçi süreçte o anki bütün istekler TCMB yanıtını (3–5 sn) bekliyordu (yük testi, 5 Kasım 2026).
 * TCMB'ye ulaşılamazsa 1 dakika yeniden denenmez.
 */
export const getExchangeRates = async () => {
  // Testler için sabit kur: FX_FIXED="USD:40,EUR:45" (canlıda tanımlanmaz)
  if (process.env.FX_FIXED && process.env.NODE_ENV !== 'production') {
    const rates = Object.fromEntries(process.env.FX_FIXED.split(',').map((p) => p.split(':')).map(([k, v]) => [k.trim(), parseFloat(v)]));
    return { rates, date: null, source: 'FIXED', fetchedAt: Date.now() };
  }
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_MS) return cache;
  const canRetry = now - failedAt >= RETRY_MS;
  if (cache) {
    if (canRetry) refresh();
    // "stale" yalnızca TCMB'ye ulaşılamadığında: sistem durumu sayfası uyarı gösterir
    return failedAt > cache.fetchedAt ? { ...cache, stale: true } : cache;
  }
  const fresh = pending || canRetry ? await refresh() : null;
  if (fresh) return fresh;

  const settings = await getSettingsMap();
  const USD = num(settings.usd_try, 0);
  const EUR = num(settings.eur_try, 0);
  if (USD > 0 && EUR > 0) {
    return { rates: { USD, EUR }, date: null, source: 'MANUAL', fetchedAt: Date.now() };
  }
  // Kur yoksa TL ürünler satılmaya devam eder; döviz ürünlerinin fiyatı gizlenir
  return { rates: {}, date: null, source: 'UNAVAILABLE', fetchedAt: Date.now() };
};

export const toTRY = (amount, currency, rates) => {
  if (!currency || currency === 'TRY' || currency === 'TL') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : null; // null: kur bilinmiyor
};
