// İstek sınırlayıcı. REDIS_URL tanımlıysa sayaçlar Redis'te tutulur (birden çok sunucu/konteyner
// aynı sınırı paylaşır); tanımlı değilse ya da Redis'e ulaşılamıyorsa bellek içi sayaç kullanılır.
let redis = null;
if (process.env.REDIS_URL) {
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    redis.on('error', (err) => {
      if (!redis.lastErrorLogged || Date.now() - redis.lastErrorLogged > 60000) {
        console.warn('[RateLimit] Redis hatası, bellek içi sayaca düşülüyor:', err.message);
        redis.lastErrorLogged = Date.now();
      }
    });
  } catch (error) {
    console.warn('[RateLimit] ioredis yüklenemedi, bellek içi sayaç kullanılacak:', error.message);
  }
}

const memoryStore = (windowMs) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.reset < now) hits.delete(key);
  }, windowMs).unref();

  return async (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return { count: 1, reset: now + windowMs };
    }
    entry.count++;
    return entry;
  };
};

const redisIncr = async (key, windowMs) => {
  const k = `rl:${key}`;
  const [[, count], [, ttl]] = await redis.multi().incr(k).pexpire(k, windowMs, 'NX').pttl(k).exec().then(r => [r[0], r[2]]);
  return { count, reset: Date.now() + (ttl > 0 ? ttl : windowMs) };
};

export const rateLimit = ({ windowMs, max, message }) => {
  const memory = memoryStore(windowMs);

  return async (req, res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    let entry;
    try {
      entry = redis?.status === 'ready' ? await redisIncr(key, windowMs) : await memory(key);
    } catch {
      entry = await memory(key);
    }
    if (entry.count > max) {
      res.set('Retry-After', Math.max(1, Math.ceil((entry.reset - Date.now()) / 1000)));
      return res.status(429).json({ message: message || 'Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.' });
    }
    next();
  };
};
