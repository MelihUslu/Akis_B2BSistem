// Kampanya günü (VERİ YAZAR, yalnızca yük testi veritabanında): yazma ağırlıklı karışık yük.
//  - siparis  : BUYERS bayi katalogdan 1–3 ürün seçer, sepeti hesaplatır, sipariş verir (cari hesap / havale karışık)
//  - onay     : APPROVERS yönetici bekleyen siparişleri onaylar (onayda stok düşer, cariye borç yazılır)
//  - tahsilat : CASHIERS finans yetkilisi bayilerden tahsilat girer (cariye alacak, makbuz numarası)
//  - teklif   : QUOTERS bayi teklif ister
//  - katalog  : BROWSERS bayi yalnızca gezer (okuma)
// Ölçülen: hata oranı ve süreler; kilit beklemesi ve bağlantı havuzu monitor.sh ile. Test sonrası doğruluk:
//   docker exec -w /app akis_loadtest_backend node /loadtest/seed/check.mjs
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TENANT, headers } from './lib/config.js';
import { dealerJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, COMPANY_IDS, tokenFor } from './lib/tokens.js';

if (__ENV.WRITE_OK !== '1') fail('Bu test veri yazar. Yalnızca yük testi veritabanında WRITE_OK=1 ile çalıştırın.');
if (TENANT === 'akis') fail('Varsayılan firmada çalışmaz; TENANT=yuktest verin.');

const N = (k, d) => Number(__ENV[k] || d);
const RAMP = __ENV.RAMP || '2m';
const HOLD = __ENV.HOLD || '5m';
const stages = (n) => [{ duration: RAMP, target: n }, { duration: HOLD, target: n }, { duration: '1m', target: 0 }];
const think = (a, b) => sleep(a + Math.random() * (b - a));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const created = new Counter('siparis_olustu');
const refusedLimit = new Counter('siparis_red_limit');
const refusedStock = new Counter('siparis_red_stok');
const approved = new Counter('onay_basarili');
const approveStock = new Counter('onay_red_stok');
const approveRace = new Counter('onay_yaris_kaybetti');
const collected = new Counter('tahsilat_girildi');
const quoted = new Counter('teklif_istendi');

export const options = {
  scenarios: {
    siparis: { executor: 'ramping-vus', exec: 'buyer', startVUs: 0, stages: stages(N('BUYERS', 600)), gracefulRampDown: '30s' },
    katalog: { executor: 'ramping-vus', exec: 'browser', startVUs: 0, stages: stages(N('BROWSERS', 300)), gracefulRampDown: '30s' },
    teklif: { executor: 'ramping-vus', exec: 'quoter', startVUs: 0, stages: stages(N('QUOTERS', 40)), gracefulRampDown: '30s' },
    onay: { executor: 'constant-vus', exec: 'approver', vus: N('APPROVERS', 50), duration: `${parseInt(RAMP) + parseInt(HOLD) + 1}m`, startTime: '30s' },
    tahsilat: { executor: 'constant-vus', exec: 'collector', vus: N('CASHIERS', 10), duration: `${parseInt(RAMP) + parseInt(HOLD)}m`, startTime: '30s' }
  },
  thresholds: {
    'http_req_failed{kind:write}': ['rate<0.01'],
    'http_req_failed{kind:read}': ['rate<0.01'],
    'http_req_duration{kind:write}': ['p(95)<2000'],
    'http_req_duration{kind:read}': ['p(95)<1500'],
    checks: ['rate>0.98']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

const req = (method, path, token, body, tags, expected = [200, 201]) => http.request(method, `${BASE_URL}/api${path}`, body ? JSON.stringify(body) : null,
  { headers: headers(token), tags, responseCallback: http.expectedStatuses(...expected) });

// Bayi: katalogdan stoktaki ürünleri görür, 1–3 tanesini sepete koyar, tutarı hesaplatır, sipariş verir
export const buyer = () => {
  const token = tokenFor(DEALER_TOKENS, __VU);
  const page = 1 + Math.floor(Math.random() * 20);
  const list = req('GET', `/products?page=${page}&limit=24&inStock=true`, token, null, { kind: 'read', name: '/products?inStock' });
  const products = (list.status === 200 && (list.json('items') || list.json('data'))) || [];
  const buyable = products.filter((p) => p.inStock && !p.priceHidden && !(p.variants && p.variants.length));
  if (!buyable.length) { think(2, 5); return; }
  const items = Array.from({ length: Math.min(buyable.length, 1 + Math.floor(Math.random() * 3)) }, () => pick(buyable))
    .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i)
    .map((p) => ({ productId: p.id, quantity: Math.max(p.moq || 1, p.stepQuantity || 1) * (1 + Math.floor(Math.random() * 3)) }));
  think(2, 5);
  req('POST', '/orders/quote', token, { items }, { kind: 'compute', name: '/orders/quote' });
  think(2, 5);
  const paymentMethod = Math.random() < 0.5 ? 'CURRENT_ACCOUNT' : 'WIRE_TRANSFER';
  const res = req('POST', '/orders', token, { items, paymentMethod, note: 'Kampanya siparişi' }, { kind: 'write', name: 'POST /orders' }, [201, 400]);
  if (res.status === 201) created.add(1);
  else if (/limit/i.test(res.body)) refusedLimit.add(1);
  else if (/stok/i.test(res.body)) refusedStock.add(1);
  else console.warn(`[sipariş 400] ${String(res.body).slice(0, 160)}`);
  check(res, { 'sipariş 201 ya da iş kuralı reddi (400)': (r) => r.status === 201 || r.status === 400 });
  think(10, 20);
};

export const browser = () => dealerJourney(tokenFor(DEALER_TOKENS, __VU + 5000));

// Bayi: teklif ister (stoktaki 1–2 ürün, yüksek miktar)
export const quoter = () => {
  const token = tokenFor(DEALER_TOKENS, __VU + 9000);
  const list = req('GET', `/products?page=${1 + Math.floor(Math.random() * 10)}&limit=24&inStock=true`, token, null, { kind: 'read', name: '/products?inStock' });
  const products = ((list.status === 200 && (list.json('items') || list.json('data'))) || []).filter((p) => !(p.variants && p.variants.length));
  if (products.length) {
    const items = [pick(products), pick(products)].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).map((p) => ({ productId: p.id, quantity: 50 + Math.floor(Math.random() * 200) }));
    const res = req('POST', '/quotes', token, { items, note: 'Kampanya için toplu fiyat' }, { kind: 'write', name: 'POST /quotes' }, [201, 400]);
    if (res.status === 201) quoted.add(1);
    else console.warn(`[teklif ${res.status}] ${String(res.body).slice(0, 160)}`);
    check(res, { 'teklif 201 ya da iş kuralı reddi': (r) => r.status === 201 || r.status === 400 });
  }
  think(15, 30);
};

// Yönetici: bekleyen siparişlerden birini seçip tüm kalemleri onaylar. Aynı siparişi başka yönetici önce onayladıysa
// 409 / 400 döner (yarışı kaybetti) ya da stok yetmez (400): ikisi de hata değil, sayılır.
export const approver = () => {
  const token = ADMIN_TOKENS[(__VU - 1) % N('APPROVER_POOL', 51)];
  const list = req('GET', `/orders?status=PENDING&page=${1 + Math.floor(Math.random() * 3)}&limit=50`, token, null, { kind: 'read', name: '/orders?status=PENDING' });
  const rows = (list.status === 200 && list.json('data')) || [];
  if (!rows.length) { think(1, 3); return; }
  const o = pick(rows);
  const res = req('PATCH', `/orders/${o.id}/partial-approve`, token, { itemStatuses: o.items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) },
    { kind: 'approve', name: 'PATCH /orders/:id/partial-approve' }, [200, 400, 409]);
  if (res.status === 200) approved.add(1);
  else if (/stok/i.test(res.body)) approveStock.add(1);
  else approveRace.add(1);
  check(res, { 'onay 200 / stok yetersiz / yarış': (r) => [200, 400, 409].includes(r.status) });
  think(1, 3);
};

// Finans: rastgele bir bayiden tahsilat (nakit / havale)
export const collector = () => {
  const token = ADMIN_TOKENS[(__VU - 1) % N('APPROVER_POOL', 51)];
  if (!COMPANY_IDS.length) fail('Firma listesi yok: seed.mjs ile yeniden üretin.');
  const companyId = pick(COMPANY_IDS);
  const res = req('POST', `/partners/${companyId}/payments`, token,
    { method: pick(['CASH', 'WIRE_TRANSFER']), amount: Math.round(500 + Math.random() * 19500), note: 'Kampanya tahsilatı' }, { kind: 'write', name: 'POST /partners/:id/payments' });
  if (res.status === 200 || res.status === 201) collected.add(1);
  else console.warn(`[tahsilat ${res.status}] ${String(res.body).slice(0, 160)}`);
  check(res, { 'tahsilat kaydedildi': (r) => r.status === 200 || r.status === 201 });
  think(2, 5);
};

export { handleSummary } from './lib/summary.js';
