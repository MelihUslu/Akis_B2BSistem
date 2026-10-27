import { getSettingsMap, num } from './settingsService.js';
import { trackExternal } from './monitoring.js';

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const CACHE_MS = 60 * 60 * 1000; // 1 saat

let cache = null; // { rates: { USD, EUR }, date, source, fetchedAt }

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

/**
 * Döviz satış kurlarını döner. TCMB 1 saat önbelleklenir; erişilemezse
 * önce son başarılı değer, sonra Ayarlar'daki manuel kurlar kullanılır.
 * Ayarlarda manuel kur girilmişse ve TCMB yanıt vermiyorsa o kullanılır.
 */
export const getExchangeRates = async () => {
  // Testler için sabit kur: FX_FIXED="USD:40,EUR:45" (canlıda tanımlanmaz)
  if (process.env.FX_FIXED && process.env.NODE_ENV !== 'production') {
    const rates = Object.fromEntries(process.env.FX_FIXED.split(',').map((p) => p.split(':')).map(([k, v]) => [k.trim(), parseFloat(v)]));
    return { rates, date: null, source: 'FIXED', fetchedAt: Date.now() };
  }
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache;

  try {
    cache = { ...(await fetchFromTcmb()), fetchedAt: Date.now() };
    return cache;
  } catch (error) {
    console.warn('[Kur] TCMB kurları alınamadı:', error.message);
    if (cache) return { ...cache, stale: true };

    const settings = await getSettingsMap();
    const USD = num(settings.usd_try, 0);
    const EUR = num(settings.eur_try, 0);
    if (USD > 0 && EUR > 0) {
      return { rates: { USD, EUR }, date: null, source: 'MANUAL', fetchedAt: Date.now() };
    }
    // Kur yoksa TL ürünler satılmaya devam eder; döviz ürünlerinin fiyatı gizlenir
    return { rates: {}, date: null, source: 'UNAVAILABLE', fetchedAt: Date.now() };
  }
};

export const toTRY = (amount, currency, rates) => {
  if (!currency || currency === 'TRY' || currency === 'TL') return amount;
  const rate = rates[currency];
  return rate ? amount * rate : null; // null: kur bilinmiyor
};
