// Kırılma noktası: saniyedeki bayi isteği kademeli artar (açık model: sunucu yavaşlasa da istek gelmeye devam eder).
// %95 süre 2 sn'yi ya da hata oranı %5'i geçince test durur; o anki istek hızı sistemin taşıyabildiği tavandır.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, headers } from './lib/config.js';
import { DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const MAX = Number(__ENV.MAX_RPS || 1500);
export const options = {
  scenarios: {
    artan_yuk: {
      executor: 'ramping-arrival-rate', startRate: 20, timeUnit: '1s', preAllocatedVUs: 200, maxVUs: Number(__ENV.MAX_VUS || 3000),
      // 30 sn ısınma (soğuk açılış sınır sanılmasın), sonra tavana doğru doğrusal artış
      stages: [{ duration: '30s', target: 20 }, { duration: __ENV.DURATION || '8m', target: MAX }]
    }
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '60s' }],
    http_req_duration: [{ threshold: 'p(95)<2000', abortOnFail: true, delayAbortEval: '60s' }],
    // Uç nokta bazında süreler özette görünsün diye (durdurmaz)
    ...Object.fromEntries(['/products', '/products?search', '/products/filters', '/orders (bayi)', '/orders/quote'].map((n) => [`http_req_duration{name:${n}}`, ['p(95)<600000']]))
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

// Bayi trafiğinin karışımı: katalog %50, arama %20, filtreler %10, siparişlerim %10, sepet hesabı %10
const TERMS = ['vida', 'matkap', 'anahtar', 'boya', 'kablo', 'eldiven', 'set', 'pense'];
export default () => {
  const token = tokenFor(DEALER_TOKENS, __VU);
  const h = { headers: headers(token) };
  const x = Math.random();
  let res;
  if (x < 0.5) res = http.get(`${BASE_URL}/api/products?page=${1 + Math.floor(Math.random() * 20)}&limit=24&sort=default`, { ...h, tags: { name: '/products' } });
  else if (x < 0.7) res = http.get(`${BASE_URL}/api/products?page=1&limit=24&search=${TERMS[Math.floor(Math.random() * TERMS.length)]}`, { ...h, tags: { name: '/products?search' } });
  else if (x < 0.8) res = http.get(`${BASE_URL}/api/products/filters`, { ...h, tags: { name: '/products/filters' } });
  else if (x < 0.9) res = http.get(`${BASE_URL}/api/orders`, { ...h, tags: { name: '/orders (bayi)' } });
  else res = http.post(`${BASE_URL}/api/orders/quote`, JSON.stringify({ items: [{ productId: 1 + Math.floor(Math.random() * 4000), quantity: 2 }] }), { ...h, tags: { name: '/orders/quote' } });
  check(res, { '200': (r) => r.status === 200 });
};
export { handleSummary } from './lib/summary.js';
