// Yük testi: normal yoğun gün. Bayiler (%85) ve yöneticiler (%15), 50 eşzamanlı kullanıcıya kadar.
import { sessions, THRESHOLDS } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';

const PEAK = Number(__ENV.PEAK || 50);
export const options = {
  scenarios: {
    bayiler: { executor: 'ramping-vus', exec: 'dealer', startVUs: 0, stages: [{ duration: '1m', target: Math.round(PEAK * 0.85) }, { duration: __ENV.HOLD || '3m', target: Math.round(PEAK * 0.85) }, { duration: '30s', target: 0 }] },
    yoneticiler: { executor: 'ramping-vus', exec: 'admin', startVUs: 0, stages: [{ duration: '1m', target: Math.max(1, Math.round(PEAK * 0.15)) }, { duration: __ENV.HOLD || '3m', target: Math.max(1, Math.round(PEAK * 0.15)) }, { duration: '30s', target: 0 }] }
  },
  thresholds: THRESHOLDS
};
export const setup = () => sessions();
export const dealer = (s) => dealerJourney(s.dealer || s.admin);
export const admin = (s) => adminJourney(s.admin || s.dealer);
export { handleSummary } from './lib/summary.js';
