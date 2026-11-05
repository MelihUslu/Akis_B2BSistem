// Uzun süre (gece, 2–4 saat): orta okuma yükü (USERS, varsayılan 300: %85 bayi, %15 yönetici) ve düşük hızda yazma
// (dakikada ~10 sipariş, onaylar, tahsilat, teklif). Bellek sızıntısı, açık kalan bağlantılar, büyüyen tablolar;
// saatlik, 30 dk'lık ve 10 dk'lık zamanlanmış işler yük altında birkaç kez çalışır. DURATION (varsayılan 3h).
// uzun.sh ile çalıştırılır: 5 dk'da bir süre, bellek, bağlantı ve tablo boyutu ölçümü. VERİ YAZAR (WRITE_OK=1, akis_load).
import { sleep } from 'k6';
import { THRESHOLDS } from './lib/config.js';
import { dealerJourney, adminJourney } from './lib/flows.js';
import { ADMIN_TOKENS, DEALER_TOKENS, tokenFor } from './lib/tokens.js';
import { buyer, approver, collector, quoter } from './kampanya.js';

const USERS = Number(__ENV.USERS || 300);
const DURATION = __ENV.DURATION || '3h';
const steady = (exec, vus) => ({ executor: 'constant-vus', exec, vus, duration: DURATION });

export const options = {
  scenarios: {
    bayiler: steady('dealer', Math.round(USERS * 0.85)),
    yoneticiler: steady('admin', Math.round(USERS * 0.15)),
    siparis: steady('orderSlow', 5),
    onay: steady('approveSlow', 2),
    tahsilat: steady('collectSlow', 1),
    teklif: steady('quoteSlow', 1)
  },
  thresholds: { ...THRESHOLDS, http_req_failed: ['rate<0.01'] },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

export const dealer = () => dealerJourney(tokenFor(DEALER_TOKENS, __VU));
export const admin = () => adminJourney(tokenFor(ADMIN_TOKENS, __VU));
// Kampanya testindeki yazma adımları, araya bekleme konarak yavaşlatılmış hâlde
export const orderSlow = () => { buyer(); sleep(10); };
export const approveSlow = () => { approver(); sleep(10); };
export const collectSlow = () => { collector(); sleep(30); };
export const quoteSlow = () => { quoter(); sleep(60); };

export { handleSummary } from './lib/summary.js';
