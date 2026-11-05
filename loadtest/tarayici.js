// Tarayıcıyla sayfa açılışı: gerçek Chromium oturumları bayi kataloğunu ve ödeme sayfasını açar; önce yük yokken
// (phase:sakin), sonra DEALERS (varsayılan 600) bayi API'ye yüklenirken (phase:yuk). Ölçülenler:
//  katalog_hazir_ms: katalog sayfasına gidişten ilk ürün kartının görünmesine kadar
//  odeme_hazir_ms:   ödeme sayfasına gidişten "Siparişi onayla" düğmesinin görünmesine kadar (sepet ve tutar hesaplandı)
//  ve k6'nın kendi web ölçüleri (browser_web_vital_fcp / lcp …).
// Ön yüz yük testi firmasına sabit derlenip Caddy'nin 8081 adresinden sunulur (README → Tarayıcıyla sayfa açılışı).
// Bayi sepetine ürün koyar (sunucudaki sepet); sipariş vermez. k6'nın tarayıcılı imajıyla çalışır (run.sh K6_IMAGE).
import { browser } from 'k6/browser';
import http from 'k6/http';
import encoding from 'k6/encoding';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, TENANT, headers } from './lib/config.js';
import { dealerJourney } from './lib/flows.js';
import { DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const WEB = __ENV.WEB_URL || 'http://akis_loadtest_caddy:8081';
const DEALERS = Number(__ENV.DEALERS || 600);
const PAGES = Number(__ENV.PAGES || 6); // her aşamada tarayıcı başına açılış
const chromium = (phase, startTime) => ({
  executor: 'per-vu-iterations', exec: 'open', vus: 2, iterations: PAGES, startTime, maxDuration: '4m', tags: { phase },
  options: { browser: { type: 'chromium' } }
});

export const options = {
  scenarios: {
    tarayici_sakin: chromium('sakin', '0s'),
    api_yuku: { executor: 'ramping-vus', exec: 'dealer', startTime: '2m30s', stages: [{ duration: '1m', target: DEALERS }, { duration: '4m', target: DEALERS }, { duration: '30s', target: 0 }], tags: { phase: 'api' } },
    tarayici_yuk: chromium('yuk', '4m')
  },
  thresholds: {
    'katalog_hazir_ms{phase:sakin}': ['p(95)<3000'],
    'katalog_hazir_ms{phase:yuk}': ['p(95)<8000'],
    'odeme_hazir_ms{phase:sakin}': ['p(95)<3000'],
    'odeme_hazir_ms{phase:yuk}': ['p(95)<8000'],
    checks: ['rate>0.95']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max']
};

const catalogReady = new Trend('katalog_hazir_ms', true);
const checkoutReady = new Trend('odeme_hazir_ms', true);

export const dealer = () => dealerJourney(tokenFor(DEALER_TOKENS, __VU));

// Oturum anahtarının içinden kullanıcı (imzası doğrulanmaz; yalnızca ön yüzün beklediği alanlar için)
const userOf = (token) => JSON.parse(encoding.b64decode(token.split('.')[1], 'rawurl', 's'));

// Sunucudaki sepete stokta 2–3 ürün (ödeme sayfası dolu açılsın)
const fillCart = (token) => {
  const h = { headers: headers(token, TENANT), tags: { name: 'hazırlık' } };
  const list = http.get(`${BASE_URL}/api/products?page=${1 + Math.floor(Math.random() * 5)}&limit=24&inStock=true`, h);
  const rows = ((list.status === 200 && list.json('data')) || []).filter((p) => p.inStock && !p.priceHidden && !(p.variants && p.variants.length)).slice(0, 3);
  const items = rows.map((p) => ({ id: p.id, quantity: Math.max(p.moq || 1, p.stepQuantity || 1), price: p.netPrice ?? p.price, vatRate: p.vatRate, moq: p.moq || 1, stepQuantity: p.stepQuantity || 1 }));
  http.put(`${BASE_URL}/api/cart`, JSON.stringify({ items }), { ...h, headers: { ...h.headers, 'Content-Type': 'application/json' } });
  return items.length;
};

export async function open() {
  const token = tokenFor(DEALER_TOKENS, 1 + Math.floor(Math.random() * 500));
  const u = userOf(token);
  const filled = fillCart(token);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // Oturum: ön yüz gibi localStorage'a (uat/global-setup.mjs ile aynı)
    await page.goto(`${WEB}/login`);
    await page.evaluate(([t, user]) => { localStorage.setItem('akis_token', t); localStorage.setItem('akis_user', user); },
      [token, JSON.stringify({ id: u.id, role: u.role, companyId: u.companyId, permissions: [] })]);

    let t0 = Date.now();
    await page.goto(`${WEB}/bayi`);
    const catalogOk = await page.waitForSelector('main button.line-clamp-2', { timeout: 60000 }).then(() => true).catch(() => false);
    if (catalogOk) catalogReady.add(Date.now() - t0);
    check(catalogOk, { 'katalog açıldı': (x) => x });

    if (filled) {
      t0 = Date.now();
      await page.goto(`${WEB}/bayi/checkout`);
      const checkoutOk = await page.waitForSelector('//button[contains(., "Siparişi onayla")]', { timeout: 60000 }).then(() => true).catch(() => false);
      if (checkoutOk) checkoutReady.add(Date.now() - t0);
      check(checkoutOk, { 'ödeme sayfası açıldı': (x) => x });
    }
  } finally {
    await page.close();
    await context.close();
  }
}

export { handleSummary } from './lib/summary.js';
