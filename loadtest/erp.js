// ERP API yükü: büyük firmanın normal kullanıcıları çalışırken ERP, /api/v1 ile bütün ürünlerin stok ve fiyatını
// 1.000'lik partilerle günceller (iki ayrı entegrasyon, iki anahtar). Ölçülenler:
//  - parti süresi ve bütün kataloğun bir kez güncellenme süresi (erp_parti_ms, erp_tam_tur)
//  - normal kullanıcılara etkisi: http_req_duration{phase:sakin} ↔ {phase:erp_altinda}
//  - API anahtarı başına dakikalık sınır (600): aynı anahtarla 700 istek → fazlası 429; aynı IP'deki başka firmanın
//    anahtarı etkilenmemeli (phase:komsu_erp)
// VERİ YAZAR (stok ve fiyat): WRITE_OK=1, yalnızca akis_load. Stok yalnızca artırılır (bekleyen siparişler stoğu aşmaz).
// Hazırlık: seed.mjs + seed/apikey.mjs. USERS (varsayılan 300) normal kullanıcı, BATCH (varsayılan 1000) parti boyu.
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, TENANT } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const KEYS = (() => { try { return JSON.parse(open('./.data/apikeys.json')); } catch { return null; } })();
const USERS = Number(__ENV.USERS || 300);
const BATCH = Number(__ENV.BATCH || 1000);
const normal = (phase, startTime) => ({ executor: 'constant-vus', exec: 'user', vus: USERS, duration: '3m', startTime, tags: { phase } });
const sync = (exec) => ({ executor: 'constant-vus', exec, vus: 1, duration: '3m', startTime: '3m30s', tags: { phase: 'erp' } });

export const options = {
  scenarios: {
    sakin: normal('sakin', '0s'),
    erp_altinda: normal('erp_altinda', '3m30s'),
    stok: sync('stockSync'),
    fiyat: sync('priceSync'),
    sinir: { executor: 'shared-iterations', exec: 'burst', vus: 20, iterations: 700, startTime: '7m45s', maxDuration: '1m', tags: { phase: 'sinir' } },
    komsu_erp: { executor: 'per-vu-iterations', exec: 'neighbor', vus: 1, iterations: 40, startTime: '7m50s', maxDuration: '1m', tags: { phase: 'komsu_erp' } }
  },
  thresholds: {
    'http_req_duration{phase:sakin}': ['p(95)<5000'],
    'http_req_duration{phase:erp_altinda}': ['p(95)<5000'],
    'http_req_failed{phase:sakin}': ['rate<0.01'],
    'http_req_failed{phase:erp_altinda}': ['rate<0.01'],
    'http_req_failed{phase:erp}': ['rate<0.01'],
    'http_req_failed{phase:komsu_erp}': ['rate==0'],
    erp_sinir_429: ['count>0'], // sınır çalışıyor
    erp_parti_ms: ['p(95)<30000']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

const batchMs = new Trend('erp_parti_ms', true);
const rounds = new Counter('erp_tam_tur');
const updated = new Counter('erp_guncellenen');
const limited = new Counter('erp_sinir_429');

const api = (method, path, key, body, tags) => http.request(method, `${BASE_URL}/api/v1${path}`, body ? JSON.stringify(body) : null, {
  headers: { 'X-API-Key': key, 'Content-Type': 'application/json' }, timeout: '120s', tags
});

export const setup = () => {
  if (!KEYS) fail('API anahtarı yok: önce seed/apikey.mjs çalıştırın.');
  if (__ENV.WRITE_OK !== '1') fail('Bu test stok ve fiyat yazar: WRITE_OK=1 verin (yalnızca akis_load).');
  if (KEYS.tenant !== TENANT) fail(`Anahtarlar "${KEYS.tenant}" firmasının; TENANT=${TENANT}.`);
  const res = api('GET', '/products?limit=1', KEYS.stock, null, { name: 'ürün sayısı' });
  if (res.status !== 200) fail(`Ürün listesi alınamadı: ${res.status} ${res.body}`);
  return { total: res.json('total') };
};

// %80 bayi, %20 yönetici
export const user = () => ((__VU % 5 === 0) ? adminJourney(tokenFor(ADMIN_TOKENS, __VU + 100)) : dealerJourney(tokenFor(DEALER_TOKENS, __VU)));

// seed.mjs SKU'ları: YT-00000 … (ERP'nin kendi listesi gibi sırayla dolaşılır)
const skus = (start, n, total) => Array.from({ length: Math.min(n, total - start) }, (_, i) => `YT-${String(start + i).padStart(5, '0')}`);
const pushBatch = (kind, path, key, makeItem, { total }) => {
  const perRound = Math.ceil(total / BATCH);
  const k = __ITER % perRound;
  const items = skus(k * BATCH, BATCH, total).map(makeItem);
  const t0 = Date.now();
  const res = api('PUT', path, key, items, { name: `${kind} partisi` });
  batchMs.add(Date.now() - t0, { kind });
  const ok = check(res, { [`${kind} 200`]: (r) => r.status === 200, [`${kind}: hepsi bulundu`]: (r) => r.status === 200 && r.json('updated') === items.length });
  if (!ok) console.warn(`[${kind}] ${res.status} ${String(res.body).slice(0, 200)}`);
  if (res.status === 200) updated.add(res.json('updated'), { kind });
  if (k === perRound - 1) rounds.add(1, { kind });
};

export const stockSync = (data) => pushBatch('stok', '/products/stock', KEYS.stock, (sku) => ({ sku, stock: 500 + Math.floor(Math.random() * 500) }), data);
export const priceSync = (data) => pushBatch('fiyat', '/products/prices', KEYS.price, (sku) => ({ sku, price: Math.round((20 + Math.random() * 2000) * 100) / 100 }), data);

// Aynı anahtarla 700 istek (dakikalık sınır 600): fazlası 429 almalı
export const burst = () => {
  const res = http.get(`${BASE_URL}/api/v1/products?limit=1`, { headers: { 'X-API-Key': KEYS.stock }, tags: { name: 'sınır denemesi' }, responseCallback: http.expectedStatuses(200, 429) });
  if (res.status === 429) limited.add(1);
  check(res, { 'sınır: 200 / 429': (r) => r.status === 200 || r.status === 429 });
};

// Aynı IP'den başka firmanın ERP'si: komşunun sınırı dolarken bunun istekleri geçmeli
export const neighbor = () => {
  const res = http.get(`${BASE_URL}/api/v1/products?limit=1`, { headers: { 'X-API-Key': KEYS.neighbor }, tags: { name: 'komşu ERP' } });
  check(res, { 'komşu ERP 200': (r) => r.status === 200 });
};

export { handleSummary } from './lib/summary.js';
