// GÜVENLİK — kötüye kullanım / DoS dayanıklılığı.
// Yük testi değil: sınırların (rate limit, hesap kilidi, aşırı yük kapısı) saldırı altında TUTTUĞUNU doğrular.
// Veri YAZMAZ: giriş yanlış şifreyle denenir (kayıt oluşmaz), signup zorunlu alanlar eksik gönderilir
// (controller'a girmeden önce rate limit; girse de 400, oluşturmadan). Yalnızca yük testi backend'inde (akis_load) çalıştırın:
//   DOCKER_NETWORK=akis_b2bsistem_default BASE_URL=http://akis_loadtest_backend:5001 TENANT=yuktest ./loadtest/run.sh abuse
//
// Beklenen: hiç 5xx yok; 429 (sınır devrede) görülür; saldırı sürerken /health 200 kalır (canlılık).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TENANT, headers } from './lib/config.js';

const serverErrors = new Counter('server_errors'); // 5xx — olmamalı
const rateLimited = new Counter('rate_limited');    // 429 — görülmeli (sınır gerçekten devrede)

const LOGIN_TRIES = Number(__ENV.LOGIN_TRIES || 40);  // giriş IP sınırı 20 / hesap kilidi 10 → ikisi de aşılır
const SIGNUP_TRIES = Number(__ENV.SIGNUP_TRIES || 20); // signup IP sınırı 5 → aşılır

export const options = {
  scenarios: {
    login_brute: { executor: 'shared-iterations', exec: 'loginBrute', vus: 10, iterations: LOGIN_TRIES, maxDuration: '1m' },
    signup_flood: { executor: 'shared-iterations', exec: 'signupFlood', vus: 5, iterations: SIGNUP_TRIES, maxDuration: '1m' },
    canary: { executor: 'constant-vus', exec: 'canary', vus: 1, duration: '30s' }
  },
  thresholds: {
    server_errors: ['count<1'],  // saldırı altında hiç sunucu hatası (5xx) olmamalı
    rate_limited: ['count>0'],   // en az bir 429 — sınır gerçekten devrede
    'checks{kind:canary}': ['rate>0.99'] // canlılık: /health hep 200
  },
  summaryTrendStats: ['avg', 'p(95)', 'max']
};

const track = (res) => {
  if (res.status >= 500) serverErrors.add(1);
  if (res.status === 429) rateLimited.add(1);
};

// Giriş kaba kuvvet: var olmayan hesaba yanlış şifre. IP sınırı (20) ve hesap kilidi (10) devreye girmeli.
export function loginBrute() {
  const res = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: 'saldiri-abuse@example.com', password: 'yanlis-sifre-123' }),
    { headers: headers(null, TENANT), tags: { kind: 'auth_abuse' } });
  track(res);
  check(res, {
    'giris: 5xx yok': (r) => r.status < 500,
    'giris: 401 ya da 429': (r) => r.status === 401 || r.status === 429
  });
}

// Kayıt taşması: zorunlu alanlar eksik → oluşturmadan 400; rateLimit controller'dan önce → 5 sonrası 429.
export function signupFlood() {
  const res = http.post(`${BASE_URL}/api/public/signup`,
    JSON.stringify({ companyName: '', name: '', email: 'x', password: '1' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { kind: 'signup_abuse' } });
  track(res);
  check(res, {
    'signup: 5xx yok': (r) => r.status < 500,
    'signup: 400 ya da 429': (r) => r.status === 400 || r.status === 429
  });
}

// Canlılık: saldırı sürerken sağlık ucu 200 dönmeli.
export function canary() {
  const res = http.get(`${BASE_URL}/health`, { tags: { kind: 'canary' } });
  if (res.status >= 500) serverErrors.add(1);
  check(res, { 'canary saglik 200': (r) => r.status === 200 }, { kind: 'canary' });
  sleep(1);
}
