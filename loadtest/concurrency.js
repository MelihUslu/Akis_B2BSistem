// Eşzamanlılık / doğruluk testi (VERİ YAZAR, yalnızca yük testi veritabanında):
//  1) Bayiler az stoklu "sıcak" ürünlerden aynı anda sipariş verir (talep stoğu kat kat aşar).
//  2) Ardından çok sayıda yönetici aynı anda bekleyen siparişleri onaylar (onayda stok düşer).
// Test sonrası kontrol: stok hiçbir üründe eksiye düşmemeli, onaylanan miktar başlangıç stoğunu aşmamalı (README → kontrol sorgusu).
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TENANT, headers } from './lib/config.js';
import { ADMIN_TOKENS, DEALER_TOKENS, tokenFor } from './lib/tokens.js';

if (__ENV.WRITE_OK !== '1') fail('Bu test veri yazar. Yalnızca yük testi veritabanında WRITE_OK=1 ile çalıştırın.');
if (TENANT === 'akis') fail('Varsayılan firmada çalışmaz; TENANT=yuktest verin.');

const HOT = (__ENV.HOT_IDS || '1,2,3,4,5').split(',').map(Number);
const approved = new Counter('onaylanan_siparis');
const rejected = new Counter('stok_yetersiz_red');

export const options = {
  scenarios: {
    siparis_yagmuru: { executor: 'constant-arrival-rate', exec: 'order', rate: Number(__ENV.RATE || 15), timeUnit: '1s', duration: '1m', preAllocatedVUs: 100, maxVUs: 400 },
    eszamanli_onay: { executor: 'constant-vus', exec: 'approve', vus: Number(__ENV.APPROVERS || 50), duration: '1m', startTime: '70s' }
  },
  thresholds: { 'http_req_failed{kind:write}': ['rate<0.01'] }
};

export const order = () => {
  const token = tokenFor(DEALER_TOKENS, __VU);
  const productId = HOT[Math.floor(Math.random() * HOT.length)];
  const res = http.post(`${BASE_URL}/api/orders`, JSON.stringify({ items: [{ productId, quantity: 5 }], paymentMethod: 'WIRE_TRANSFER' }),
    { headers: headers(token), tags: { kind: 'write', name: 'POST /orders' } });
  check(res, { 'sipariş oluştu': (r) => r.status === 201 });
};

// Her yönetici bekleyen siparişlerden rastgele birini alır ve tüm kalemleri onaylamaya çalışır
export const approve = () => {
  // Onaylayıcılar ilk APPROVER_POOL yönetici hesabını kullanır (sipariş yetkisi olanlar)
  const token = ADMIN_TOKENS[(__VU - 1) % Number(__ENV.APPROVER_POOL || 51)];
  const h = { headers: headers(token) };
  const list = http.get(`${BASE_URL}/api/orders?status=PENDING&page=1&limit=50`, { ...h, tags: { kind: 'read', name: '/orders?status=PENDING' } });
  const rows = (list.status === 200 && list.json('data')) || [];
  const hot = rows.filter((o) => o.items.some((i) => HOT.includes(i.productId)));
  if (!hot.length) return;
  const o = hot[Math.floor(Math.random() * hot.length)];
  const res = http.patch(`${BASE_URL}/api/orders/${o.id}/partial-approve`, JSON.stringify({ itemStatuses: o.items.map((i) => ({ itemId: i.id, status: 'APPROVED' })) }),
    { ...h, tags: { kind: 'approve', name: 'PATCH /orders/:id/partial-approve' }, responseCallback: http.expectedStatuses(200, 400) });
  if (res.status === 200) approved.add(1);
  else if (res.status === 400 && /stok/i.test(res.body)) rejected.add(1);
  check(res, { 'onay sonucu 200 ya da stok yetersiz (400)': (r) => r.status === 200 || r.status === 400 });
};
export { handleSummary } from './lib/summary.js';
