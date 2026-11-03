// Duman testi: 1 kullanıcı, 30 sn. Tüm akışlar çalışıyor mu? Her değişiklikten sonra hızlı kontrol.
import { sessions, THRESHOLDS } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';

export const options = { vus: 1, duration: __ENV.DURATION || '30s', thresholds: THRESHOLDS };
export const setup = () => sessions();
export default (s) => {
  if (s.dealer) dealerJourney(s.dealer);
  if (s.admin) adminJourney(s.admin);
};
export { handleSummary } from './lib/summary.js';
