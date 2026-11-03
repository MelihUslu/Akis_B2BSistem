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

/**
 * Kısa süreli kilit (birden fazla süreç / sunucu arasında). Alınırsa serbest bırakma fonksiyonu, alınamazsa null döner.
 * Redis yoksa süreç içi kilit kullanılır (tek süreçte doğru çalışır).
 */
const localLocks = new Set();
export const tryLock = async (key, ttlMs) => {
  const r = redisReady();
  if (!r) {
    if (localLocks.has(key)) return null;
    localLocks.add(key);
    const timer = setTimeout(() => localLocks.delete(key), ttlMs);
    timer.unref?.();
    return async () => { clearTimeout(timer); localLocks.delete(key); };
  }
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const got = await r.set(`lock:${key}`, token, 'PX', ttlMs, 'NX').catch(() => null);
  if (got !== 'OK') return null;
  return async () => {
    await r.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, `lock:${key}`, token).catch(() => {});
  };
};

/** Bir anahtarı bir kez "kullanıldı" olarak işaretler (tek kullanımlık kodlar). İlk seferde true, sonra false. */
const localOnce = new Map(); // key -> son geçerlilik (ms)
export const markOnce = async (key, ttlMs) => {
  const r = redisReady();
  if (r) {
    const got = await r.set(`once:${key}`, '1', 'PX', ttlMs, 'NX').catch(() => undefined);
    if (got !== undefined) return got === 'OK';
  }
  const now = Date.now();
  for (const [k, exp] of localOnce) if (exp < now) localOnce.delete(k);
  if (localOnce.has(key)) return false;
  localOnce.set(key, now + ttlMs);
  return true;
};

