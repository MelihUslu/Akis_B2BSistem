// 100 firma, gürültülü komşu: bir firma ağır iş yaparken diğer firmaların yanıt süresi bozuluyor mu?
//  1) sakin (0–3 dk): 99 komşu firmanın kullanıcıları normal çalışır → taban ölçüm (phase:sakin)
//  2) gürültü (3:30–6:30 dk): komşular aynı yükle sürer (phase:gurultu); büyük firma (TENANT, 60.000 sipariş)
//     NOISY yönetici sekmesinden art arda ağır işler başlatır: 12 aylık satış raporu ve Excel'i, sipariş Excel'i,
//     yaşlandırma, cari listesi Excel'i, firmanın tüm verisinin dışa aktarımı.
// Karşılaştırma: http_req_duration{phase:sakin} ↔ {phase:gurultu} (yalnızca komşuların istekleri). Veri yazmaz.
// Hazırlık: seed.mjs (büyük firma) + seed/neighbors.mjs (komşular)
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { BASE_URL, TENANT, headers } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS } from './lib/tokens.js';

const NEIGHBORS = new SharedArray('neighbors', () => { try { return JSON.parse(open('./.data/neighbors.json')); } catch { return []; } });
const QUIET = Number(__ENV.QUIET || 300); // komşu firmalardaki eşzamanlı kullanıcı
const NOISY = Number(__ENV.NOISY || 8); // büyük firmada aynı anda ağır iş başlatan sekme
const quiet = (phase, startTime) => ({ executor: 'constant-vus', exec: 'neighbor', vus: QUIET, duration: '3m', startTime, tags: { phase } });

export const options = {
  scenarios: {
    sakin: quiet('sakin', '0s'),
    gurultu: quiet('gurultu', '3m30s'),
    agir: { executor: 'constant-vus', exec: 'heavy', vus: NOISY, duration: '3m', startTime: '3m30s', tags: { phase: 'agir' } }
  },
  // Alt ölçütler eşik tanımlanınca özette görünür; sınırlar kırılmayı görmek için geniş tutuldu
  thresholds: {
    'http_req_duration{phase:sakin}': ['p(95)<5000'],
    'http_req_duration{phase:gurultu}': ['p(95)<5000'],
    'http_req_failed{phase:sakin}': ['rate<0.01'],
    'http_req_failed{phase:gurultu}': ['rate<0.01'],
    'http_req_duration{phase:agir}': ['p(95)<120000']
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export const setup = () => { if (!NEIGHBORS.length) fail('Komşu firma yok: önce seed/neighbors.mjs çalıştırın.'); };

// Komşu: kullanıcıların %80'i bayi (katalog, arama, sepet), %20'si yönetici (panel, siparişler, rapor)
export const neighbor = () => {
  const firm = NEIGHBORS[(__VU - 1) % NEIGHBORS.length];
  const k = Math.floor((__VU - 1) / NEIGHBORS.length);
  if (k % 5 === 4) adminJourney(firm.admins[k % firm.admins.length], firm.slug);
  else dealerJourney(firm.dealers[k % firm.dealers.length], firm.slug);
};

const year = () => {
  const to = new Date();
  const d = (x) => x.toISOString().slice(0, 10);
  return `from=${d(new Date(to.getTime() - 365 * 864e5))}&to=${d(to)}`;
};
const HEAVY = [
  ['/reports/sales?' + year(), '12 aylık satış raporu'],
  ['/reports/sales/export?' + year(), 'satış raporu Excel'],
  ['/orders/export', 'sipariş Excel (5.000)'],
  ['/finance/aging', 'yaşlandırma'],
  ['/partners/export', 'cari listesi Excel'],
  ['/account/export', 'firma verisi dışa aktarım']
];

// Büyük firmanın yöneticisi (firma sahibi) ağır işleri sırayla başlatır
const busy = new Counter('agir_mesgul_429');

export const heavy = () => {
  const [path, label] = HEAVY[(__ITER + __VU) % HEAVY.length];
  const res = http.get(`${BASE_URL}/api${path}`, { headers: headers(ADMIN_TOKENS[0], TENANT), tags: { kind: 'heavy', name: label }, timeout: '180s', responseType: 'none', responseCallback: http.expectedStatuses(200, 429) });
  // 429: firmada aynı anda izin verilen ağır iş sayısı dolu (heavyLimit / tek dışa aktarım); tasarım gereği, hata sayılmaz
  if (res.status === 429) busy.add(1, { name: label });
  check(res, { [`${label} 200 / 429`]: (r) => r.status === 200 || r.status === 429 });
  if (res.status !== 200 && res.status !== 429) console.warn(`[${label}] ${res.status} ${res.error || ''}`);
  sleep(1);
};

export { handleSummary } from './lib/summary.js';
