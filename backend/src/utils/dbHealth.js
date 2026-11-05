/**
 * Veritabanına ulaşılamıyor mu? Prisma bağlantı hatası görülünce bu süreç birkaç saniye "kapalı" sayar; o sırada gelen
 * istekler veritabanına hiç gitmeden 503 + Retry-After alır (middlewares/overload.js → dbGate), ön yüz okuma isteklerini
 * kendiliğinden yeniden dener. Süre dolunca istekler yeniden dener; veritabanı hâlâ kapalıysa işaret yenilenir.
 * Dayanıklılık testinde (5 Kasım 2026) 15 sn'lik kesintide kullanıcılar 500 aldı, kayıtlara 15 sn'de 11 bin satır
 * (870 yığın dökümü) yazıldı. Havuz zaman aşımı (P2024) kesinti sayılmaz: o yoğunluktur, yük atma ayrı ele alır.
 */
const DOWN_MS = 3000;
const CONNECTION = /Can't reach database|not currently accepting connections|Server has closed the connection|terminating connection|Connection refused|ECONNREFUSED|database system is (starting up|shutting down|in recovery mode)/i;

let downUntil = 0;
let lastLog = 0;

export const isDbUnavailable = (error) => ['P1001', 'P1002', 'P1017'].includes(error?.code) || CONNECTION.test(error?.message || '');

export const noteDbError = (error) => {
  if (!isDbUnavailable(error)) return;
  const now = Date.now();
  downUntil = now + DOWN_MS;
  if (now - lastLog > 10_000) {
    lastLog = now;
    console.error('[Veritabanı] Ulaşılamıyor, istekler kısa süre 503 ile karşılanıyor:', String(error.message).split('\n').filter(Boolean).pop());
  }
};

export const dbDown = () => Date.now() < downUntil;
