// Dayanıklılık: orta yük uzun süre (varsayılan 300 kullanıcı, 20 dk). Süreler zamanla uzuyor mu, bellek artıyor mu?
// Test sırasında sunucunun bellek kullanımını izleyin (README → izleme).
import { THRESHOLDS } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const USERS = Number(__ENV.USERS || 300);
const DURATION = __ENV.DURATION || '20m';
export const options = {
  scenarios: {
    bayiler: { executor: 'ramping-vus', exec: 'dealer', stages: [{ duration: '1m', target: Math.round(USERS * 0.85) }, { duration: DURATION, target: Math.round(USERS * 0.85) }, { duration: '30s', target: 0 }] },
    yoneticiler: { executor: 'ramping-vus', exec: 'admin', stages: [{ duration: '1m', target: Math.round(USERS * 0.15) }, { duration: DURATION, target: Math.round(USERS * 0.15) }, { duration: '30s', target: 0 }] }
  },
  thresholds: THRESHOLDS,
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};
export const dealer = () => dealerJourney(tokenFor(DEALER_TOKENS, __VU));
export const admin = () => adminJourney(tokenFor(ADMIN_TOKENS, __VU));
export { handleSummary } from './lib/summary.js';
