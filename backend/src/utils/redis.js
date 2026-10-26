// Paylaşılan Redis bağlantısı (REDIS_URL tanımlıysa). Yoksa ya da ulaşılamıyorsa null davranır;
// kullanan yerler (istek sınırlayıcı, iş kilidi) tek sunuculu davranışa düşer.
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    redis.on('error', (err) => {
      if (!redis.lastErrorLogged || Date.now() - redis.lastErrorLogged > 60000) {
        console.warn('[Redis] Bağlantı hatası, tek sunucu davranışına düşülüyor:', err.message);
        redis.lastErrorLogged = Date.now();
      }
    });
  } catch (error) {
    console.warn('[Redis] ioredis yüklenemedi:', error.message);
  }
}

export const redisReady = () => (redis?.status === 'ready' ? redis : null);

/**
 * Zamanlanmış işi birden çok sunucu arasında tek çalıştırır (Redis SET NX). Redis yoksa doğrudan çalıştırır.
 * ttlMs: kilidin en uzun süresi (iş çökerse kilit kendiliğinden açılır).
 */
export const withJobLock = async (name, ttlMs, fn) => {
  const r = redisReady();
  if (!r) return fn();
  const key = `job:${name}`;
  const token = `${process.pid}:${Date.now()}`;
  const got = await r.set(key, token, 'PX', ttlMs, 'NX').catch(() => 'OK'); // Redis hatasında işi kaçırmamak için çalıştır
  if (got !== 'OK') return null;
  try {
    return await fn();
  } finally {
    // Yalnızca kendi kilidimizi açarız
    await r.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token).catch(() => {});
  }
};
