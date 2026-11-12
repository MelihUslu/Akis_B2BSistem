// İstek sınırlayıcı. REDIS_URL tanımlıysa sayaçlar Redis'te tutulur (birden çok sunucu/konteyner
// aynı sınırı paylaşır); tanımlı değilse ya da Redis'e ulaşılamıyorsa bellek içi sayaç kullanılır.
import { redisReady } from '../utils/redis.js';

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

const redisIncr = async (redis, key, windowMs) => {
  const k = `rl:${key}`;
  const [[, count], [, ttl]] = await redis.multi().incr(k).pexpire(k, windowMs, 'NX').pttl(k).exec().then(r => [r[0], r[2]]);
  return { count, reset: Date.now() + (ttl > 0 ? ttl : windowMs) };
};

// key: sayacın anahtarı (varsayılan IP + yol). Yolda kimlik olan uçlarda (/orders/:id) her kimlik ayrı sayılır;
// API anahtarı gibi bir kimlikle sınırlanacaksa key verilir.
export const rateLimit = ({ windowMs, max, message, key: keyOf }) => {
  const memory = memoryStore(windowMs);

  return async (req, res, next) => {
    const key = keyOf ? keyOf(req) : `${req.ip}:${req.baseUrl}${req.path}`;
    let entry;
    try {
      const redis = redisReady();
      entry = redis ? await redisIncr(redis, key, windowMs) : await memory(key);
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

/**
 * Hesap başına başarısız deneme sayacı (giriş, 2FA kodu). IP sınırından farkı: yalnızca başarısız denemeler sayılır ve
 * anahtar hesaptır; IP değiştirilerek tek hesaba yapılan dağıtık şifre denemesi de durur. Süre dolunca kendiliğinden açılır.
 */
export const failureLimiter = ({ windowMs, max, prefix }) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  const keyOf = (key) => `rlf:${prefix}:${key}`;
  const local = {
    count: (k) => { const e = hits.get(k); return e && e.reset > Date.now() ? e.count : 0; },
    fail: (k) => { const now = Date.now(); const e = hits.get(k); if (!e || e.reset < now) hits.set(k, { count: 1, reset: now + windowMs }); else e.count++; }
  };
  return {
    async blocked(key) {
      const k = keyOf(key);
      const redis = redisReady();
      if (redis) { try { return (parseInt(await redis.get(k)) || 0) >= max; } catch { /* bellek içi sayaca düş */ } }
      return local.count(k) >= max;
    },
    async fail(key) {
      const k = keyOf(key);
      const redis = redisReady();
      if (redis) { try { await redis.multi().incr(k).pexpire(k, windowMs, 'NX').exec(); return; } catch { /* bellek içi sayaca düş */ } }
      local.fail(k);
    },
    async reset(key) {
      const k = keyOf(key);
      hits.delete(k);
      const redis = redisReady();
      if (redis) await redis.del(k).catch(() => {});
    }
  };
};
