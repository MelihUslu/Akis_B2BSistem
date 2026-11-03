// Stres testi: kullanıcı sayısı kademeli artar (varsayılan 200'e kadar). Sistem nerede yavaşlıyor, nerede hata vermeye başlıyor?
// Eşikler bilerek gevşek: amaç kırılma noktasını görmek; sonuçta %95 süre ve hata oranının hangi aşamada bozulduğuna bakın.
import { sessions } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';

const PEAK = Number(__ENV.PEAK || 200);
const steps = [0.25, 0.5, 0.75, 1].map((f) => Math.round(PEAK * f));
export const options = {
  scenarios: {
    bayiler: { executor: 'ramping-vus', exec: 'dealer', startVUs: 0, stages: steps.flatMap((t) => [{ duration: '1m', target: Math.round(t * 0.9) }, { duration: '2m', target: Math.round(t * 0.9) }]).concat([{ duration: '1m', target: 0 }]) },
    yoneticiler: { executor: 'ramping-vus', exec: 'admin', startVUs: 0, stages: steps.flatMap((t) => [{ duration: '1m', target: Math.max(1, Math.round(t * 0.1)) }, { duration: '2m', target: Math.max(1, Math.round(t * 0.1)) }]).concat([{ duration: '1m', target: 0 }]) }
  },
  thresholds: { http_req_failed: ['rate<0.05'], 'http_req_duration{kind:read}': ['p(95)<2000'] }
};
export const setup = () => sessions();
export const dealer = (s) => dealerJourney(s.dealer || s.admin);
export const admin = (s) => adminJourney(s.admin || s.dealer);
export { handleSummary } from './lib/summary.js';
