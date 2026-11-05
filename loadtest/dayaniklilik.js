// Dayanıklılık: sabit yük sürerken (USERS, varsayılan 200; %80 bayi, %20 yönetici; DURATION, varsayılan 7m)
// dayaniklilik.sh sırayla bir işçi süreci öldürür, Redis'i yeniden başlatır ve veritabanı bağlantılarını keser.
// Kesinti anında kısa süreli hata beklenir; sonrasında sistem kendiliğinden toparlanmalı (kalıcı hata yok).
// Hata ve süreler 10 sn'lik dilimlerle incelenir; olay zamanları results/dayaniklilik-olaylar.txt. Veri yazmaz.
// Doğrudan değil dayaniklilik.sh ile çalıştırılır.
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, tokenFor } from './lib/tokens.js';

const USERS = Number(__ENV.USERS || 200);

export const options = {
  scenarios: { yuk: { executor: 'constant-vus', exec: 'user', vus: USERS, duration: __ENV.DURATION || '7m' } },
  thresholds: { http_req_failed: ['rate<0.05'] }, // kesinti anlarındaki hatalar dahil
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export const user = () => ((__VU % 5 === 0) ? adminJourney(tokenFor(ADMIN_TOKENS, __VU + 100)) : dealerJourney(tokenFor(DEALER_TOKENS, __VU)));

export { handleSummary } from './lib/summary.js';
