// Aşırı ani yük: kampanya bildirimi anı. Taban (1 dk) → 10 sn'de tepe hıza çıkış, 1 dk tepe → yeniden taban (2 dk).
// Bilgisayarda kapasiteyi değil davranışı gösterir: tepe sırasında hatalar düzgün mü (çökme, bellek taşması yok mu),
// tepe bitince sistem kaç saniyede toparlanıyor? Karşılaştırma: http_req_duration{phase:once} ↔ {phase:sonra}.
// Gelen istek hızı modeli: sunucu yavaşlasa da yeni bayi gelmeye devam eder (gerçekteki gibi); k6'nın kullanıcısı biterse
// gelemeyen açılışlar dropped_iterations olarak sayılır. Her yineleme bir bayinin uygulamayı açması: kategoriler,
// filtreler, katalog ilk sayfası ve portal ayarları (dealerJourney'nin ilk adımı). Sunucu aşırı yükte 503 + Retry-After
// döner (middlewares/overload.js); betik ön yüz gibi bekleyip yeniden dener. Veri yazmaz.
//  PEAK (varsayılan 600 açılış/sn ≈ 3000 bayi × 5 sn'de bir sayfa), BASE (varsayılan 20 açılış/sn), MAX_VUS (varsayılan 2000)
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { BASE_URL, TENANT, headers } from './lib/config.js';
import { DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const PEAK = Number(__ENV.PEAK || 600);
const BASE = Number(__ENV.BASE || 20);
const MAX_VUS = Number(__ENV.MAX_VUS || 2000);
const steady = (phase, startTime, duration) => ({ executor: 'constant-arrival-rate', exec: 'open', rate: BASE, timeUnit: '1s', duration, startTime, preAllocatedVUs: 50, maxVUs: 400, tags: { phase } });

export const options = {
  scenarios: {
    once: steady('once', '0s', '1m'),
    ani: {
      executor: 'ramping-arrival-rate', exec: 'open', startTime: '1m', startRate: BASE, timeUnit: '1s',
      stages: [{ target: PEAK, duration: '10s' }, { target: PEAK, duration: '1m' }, { target: BASE, duration: '10s' }],
      preAllocatedVUs: 500, maxVUs: MAX_VUS, tags: { phase: 'ani' }
    },
    sonra: steady('sonra', '2m20s', '2m')
  },
  thresholds: {
    'http_req_duration{phase:once}': ['p(95)<2000'],
    'http_req_duration{phase:sonra}': ['p(95)<2000'], // toparlandı mı
    'http_req_failed{phase:once}': ['rate<0.01'],
    'http_req_failed{phase:sonra}': ['rate<0.01'],
    'http_req_failed{phase:ani}': ['rate<0.5'] // tepede hata olabilir; ölçmek için geniş
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

// Kullanıcının gördüğü: uygulamanın açılma süresi (yeniden denemeler dahil) ve hiç açılamayan oturumlar
const openMs = new Trend('acilis_ms', true);
const busy = new Counter('mesgul_503');
const failedOpen = new Counter('acilamadi');
const PAGES = [['/categories', 'kategoriler'], ['/products/filters', 'filtreler'], ['/products?page=1&limit=24&sort=default', 'katalog'], ['/settings/portal', 'portal ayarları']];

export const open = () => {
  const token = tokenFor(DEALER_TOKENS, Math.floor(Math.random() * 100000) + 1);
  const params = (path) => ({ headers: headers(token, TENANT), timeout: '60s', tags: { name: path.split('?')[0] }, responseCallback: http.expectedStatuses(200, 503) });
  const t0 = Date.now();
  let todo = PAGES;
  // Ön yüz gibi: 503 (sunucu çok yoğun) alan okuma isteği Retry-After kadar (+0–1 sn) bekleyip en fazla 2 kez yeniden denenir
  for (let attempt = 0; todo.length && attempt < 3; attempt++) {
    if (attempt) sleep(Math.min(5, todo.retryAfter || 2) + Math.random());
    const responses = http.batch(todo.map(([path]) => ['GET', `${BASE_URL}/api${path}`, null, params(path)]));
    const again = [];
    responses.forEach((r, i) => {
      if (r.status === 503) { busy.add(1); again.push(todo[i]); again.retryAfter = parseInt(r.headers['Retry-After']) || 2; return; }
      const ok = check(r, { [`${todo[i][1]} 200`]: (x) => x.status === 200 });
      if (!ok && Math.random() < 0.02) console.warn(`[açılış] ${todo[i][0]} → ${r.status} ${r.error || String(r.body).slice(0, 120)}`);
    });
    todo = again;
  }
  if (todo.length) failedOpen.add(1); else openMs.add(Date.now() - t0);
};

export { handleSummary } from './lib/summary.js';
