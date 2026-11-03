// Ortak ayarlar: hedef adres, firma, oturum ve eşikler (k6 ortam değişkenleriyle değiştirilir)
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
export const TENANT = __ENV.TENANT || 'akis';

// Okuma isteklerinde %95'lik süre ve hata oranı sınırları; aşılırsa test başarısız olur
export const THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{kind:read}': ['p(95)<500', 'p(99)<1200'],
  'http_req_duration{kind:compute}': ['p(95)<800'],
  checks: ['rate>0.99']
};

export const headers = (token) => ({
  'Content-Type': 'application/json',
  'X-Tenant': TENANT,
  ...(token && { Authorization: `Bearer ${token}` })
});

/**
 * Oturum: hazır token (ADMIN_TOKEN / DEALER_TOKEN) ya da e-posta + şifreyle bir kez giriş.
 * Giriş ucunda 15 dakikada 20 deneme sınırı olduğu için her sanal kullanıcı ayrı giriş yapmaz; setup() bir kez alır.
 */
const login = (role) => {
  const token = __ENV[`${role}_TOKEN`];
  if (token) return token;
  const email = __ENV[`${role}_EMAIL`];
  const password = __ENV[`${role}_PASSWORD`];
  if (!email || !password) return null;
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password }), { headers: headers(), tags: { kind: 'auth' } });
  if (!check(res, { [`${role} girişi başarılı`]: (r) => r.status === 200 && r.json('token') })) {
    fail(`${role} girişi başarısız (${res.status}): ${res.body && res.body.slice(0, 200)}`);
  }
  return res.json('token');
};

export const sessions = () => {
  const admin = login('ADMIN');
  const dealer = login('DEALER');
  if (!admin && !dealer) fail('Oturum yok: ADMIN_TOKEN / DEALER_TOKEN ya da ADMIN_EMAIL + ADMIN_PASSWORD, DEALER_EMAIL + DEALER_PASSWORD verin.');
  // Sunucu ayakta mı?
  const health = http.get(`${BASE_URL}/health`, { tags: { kind: 'health' } });
  check(health, { 'sunucu ayakta': (r) => r.status === 200 });
  return { admin, dealer };
};
