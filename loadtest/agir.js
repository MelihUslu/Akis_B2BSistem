// Ağır uçlar yük altında: büyük firmanın normal kullanıcıları çalışırken aynı firmada ağır işler (Excel, 12 aylık rapor,
// yaşlandırma, ekstre, tüm veri dışa aktarımı) başlatılır. Tek bir ağır istek bir Node sürecini kilitleyip aynı süreçteki
// diğer istekleri bekletiyor mu? Karşılaştırma: http_req_duration{phase:sakin} ↔ {phase:agir_altinda}. Veri yazmaz.
//  USERS (varsayılan 300) normal kullanıcı, HEAVY (varsayılan 4) aynı anda ağır iş
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TENANT, headers } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, COMPANY_IDS, tokenFor } from './lib/tokens.js';

const USERS = Number(__ENV.USERS || 300);
const HEAVY = Number(__ENV.HEAVY || 4);
const normal = (phase, startTime) => ({ executor: 'constant-vus', exec: 'user', vus: USERS, duration: '3m', startTime, tags: { phase } });

export const options = {
  scenarios: {
    sakin: normal('sakin', '0s'),
    agir_altinda: normal('agir_altinda', '3m30s'),
    agir: { executor: 'constant-vus', exec: 'heavy', vus: HEAVY, duration: '3m', startTime: '3m30s', tags: { phase: 'agir' } }
  },
  thresholds: {
    'http_req_duration{phase:sakin}': ['p(95)<5000'],
    'http_req_duration{phase:agir_altinda}': ['p(95)<5000'],
    'http_req_failed{phase:sakin}': ['rate<0.01'],
    'http_req_failed{phase:agir_altinda}': ['rate<0.01'],
    'http_req_duration{phase:agir}': ['p(95)<120000'],
    'http_req_failed{phase:agir}': ['rate<0.01']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

// %80 bayi, %20 yönetici (büyük firmanın farklı hesapları)
export const user = () => ((__VU % 5 === 0) ? adminJourney(tokenFor(ADMIN_TOKENS, __VU + 100)) : dealerJourney(tokenFor(DEALER_TOKENS, __VU)));

const d = (x) => x.toISOString().slice(0, 10);
const range = (days) => `from=${d(new Date(Date.now() - days * 864e5))}&to=${d(new Date())}`;
const HEAVY_CALLS = [
  () => [`/reports/sales?${range(365)}`, '12 aylık satış raporu'],
  () => [`/reports/sales/export?${range(365)}`, 'satış raporu Excel'],
  () => ['/orders/export', 'sipariş Excel (5.000)'],
  () => ['/finance/aging', 'yaşlandırma'],
  () => ['/partners/export', 'cari listesi Excel'],
  () => [`/finance/statement/${COMPANY_IDS[Math.floor(Math.random() * COMPANY_IDS.length)]}/export`, 'cari ekstre Excel'],
  () => ['/account/export', 'firma verisi dışa aktarım']
];

const busy = new Counter('agir_mesgul_429');

export const heavy = () => {
  const [path, label] = HEAVY_CALLS[(__ITER + __VU) % HEAVY_CALLS.length]();
  const res = http.get(`${BASE_URL}/api${path}`, { headers: headers(ADMIN_TOKENS[0], TENANT), tags: { kind: 'heavy', name: label }, timeout: '180s', responseType: 'none', responseCallback: http.expectedStatuses(200, 429) });
  // 429: firmada aynı anda izin verilen ağır iş sayısı dolu (heavyLimit / tek dışa aktarım); tasarım gereği, hata sayılmaz
  if (res.status === 429) busy.add(1, { name: label });
  check(res, { [`${label} 200 / 429`]: (r) => r.status === 200 || r.status === 429 });
  if (res.status !== 200 && res.status !== 429) console.warn(`[${label}] ${res.status} ${res.error || ''}`);
  sleep(1);
};

export { handleSummary } from './lib/summary.js';
