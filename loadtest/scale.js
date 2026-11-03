// Ölçek testi: aynı anda ADMINS yönetici + DEALERS bayi (varsayılan 1000 + 1000), her biri kendi hesabıyla.
// 3 dk'da tepeye çıkar, HOLD süresince tutar, 1 dk'da iner. Gerçekçi veri gerekir (seed/seed.mjs).
import { THRESHOLDS } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const ADMINS = Number(__ENV.ADMINS || 1000);
const DEALERS = Number(__ENV.DEALERS || 1000);
const RAMP = __ENV.RAMP || '3m';
const HOLD = __ENV.HOLD || '5m';
const stages = (n) => [{ duration: RAMP, target: n }, { duration: HOLD, target: n }, { duration: '1m', target: 0 }];

export const options = {
  scenarios: {
    bayiler: { executor: 'ramping-vus', exec: 'dealer', startVUs: 0, stages: stages(DEALERS), gracefulRampDown: '30s' },
    yoneticiler: { executor: 'ramping-vus', exec: 'admin', startVUs: 0, stages: stages(ADMINS), gracefulRampDown: '30s' }
  },
  // Ölçek testinde eşikler daha geniş: kırılma noktasını görmek için test durdurulmaz
  thresholds: { ...THRESHOLDS, 'http_req_duration{kind:read}': ['p(95)<1500'], 'http_req_duration{kind:compute}': ['p(95)<2000'] },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

// Senaryolar ayrı VU havuzlarıyla çalışır; __VU iki havuzda da 1'den başlamaz, sırayla hesaplara dağıtılır
export const dealer = () => dealerJourney(tokenFor(DEALER_TOKENS, __VU));
export const admin = () => adminJourney(tokenFor(ADMIN_TOKENS, __VU));
export { handleSummary } from './lib/summary.js';
