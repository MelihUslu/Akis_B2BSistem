// Ani yük: kampanya duyurusu gibi kısa sürede çok sayıda bayinin aynı anda girmesi; sonrasında toparlanma.
import { sessions } from './lib/config.js';
import { dealerJourney } from './lib/flows.js';

const PEAK = Number(__ENV.PEAK || 150);
export const options = {
  scenarios: {
    ani_yuk: { executor: 'ramping-vus', exec: 'dealer', startVUs: 0, stages: [{ duration: '30s', target: 10 }, { duration: '10s', target: PEAK }, { duration: '1m', target: PEAK }, { duration: '10s', target: 10 }, { duration: '1m', target: 10 }, { duration: '10s', target: 0 }] }
  },
  thresholds: { http_req_failed: ['rate<0.02'], 'http_req_duration{kind:read}': ['p(95)<1500'] }
};
export const setup = () => sessions();
export const dealer = (s) => dealerJourney(s.dealer || s.admin);
export { handleSummary } from './lib/summary.js';
