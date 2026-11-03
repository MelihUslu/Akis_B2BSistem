// Yazma yükü: bayiler sipariş oluşturur (Havale/EFT, onay beklemede kalır). VERİ YAZAR.
// Yalnızca bu iş için açılmış bir test firmasında ve WRITE_OK=1 ile çalışır; varsayılan firmada (akis) çalışmaz.
// Oluşan siparişler "AK-…" olarak onay bekleyenlerde görünür; test sonrası test firmasıyla birlikte silin.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { BASE_URL, TENANT, headers, sessions } from './lib/config.js';

if (__ENV.WRITE_OK !== '1') fail('Bu test veri yazar. Çalıştırmak için WRITE_OK=1 verin.');
if (TENANT === 'akis' && __ENV.ALLOW_DEFAULT_TENANT !== '1') fail('Varsayılan firmada (akis) yazma testi çalışmaz; TENANT ile test firması verin.');

const RATE = Number(__ENV.RATE || 2); // saniyede sipariş
export const options = {
  scenarios: { siparis: { executor: 'constant-arrival-rate', rate: RATE, timeUnit: '1s', duration: __ENV.DURATION || '2m', preAllocatedVUs: 10, maxVUs: 50 } },
  thresholds: { http_req_failed: ['rate<0.01'], 'http_req_duration{kind:write}': ['p(95)<1500'] }
};

export const setup = () => {
  const s = sessions();
  if (!s.dealer) fail('Yazma testi için bayi oturumu gerekir (DEALER_TOKEN ya da DEALER_EMAIL + DEALER_PASSWORD).');
  const res = http.get(`${BASE_URL}/api/products?page=1&limit=48&inStock=true`, { headers: headers(s.dealer) });
  const products = (res.json('data') || []).filter((p) => p.inStock && !p.priceHidden && !(p.variants && p.variants.length));
  if (!products.length) fail('Sipariş verilebilecek stoklu ürün yok.');
  return { ...s, products: products.map((p) => ({ id: p.id, qty: Math.max(p.moq || 1, p.stepQuantity || 1) })) };
};

export default (s) => {
  const p = s.products[Math.floor(Math.random() * s.products.length)];
  const res = http.post(`${BASE_URL}/api/orders`, JSON.stringify({ items: [{ productId: p.id, quantity: p.qty }], paymentMethod: 'WIRE_TRANSFER' }),
    { headers: headers(s.dealer), tags: { kind: 'write', name: 'POST /orders' } });
  check(res, { 'sipariş oluştu 201': (r) => r.status === 201 });
  sleep(0.2);
};
export { handleSummary } from './lib/summary.js';
