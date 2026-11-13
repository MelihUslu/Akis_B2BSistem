import { redisReady } from '../utils/redis.js';

/**
 * Giriş kötüye kullanım koruması: bir IP'den arka arkaya BAŞARISIZ giriş eşiği aşılınca o IP SÜRELİ bloke edilir;
 * tekrarında süre kademeli uzar, sonra kendiliğinden kalkar. Developer panelden görülebilir ve elle kaldırılabilir.
 *
 * Mevcut katmanlara EK: istek sınırı (rateLimit) ve hesap kilidi (loginGuard) dururken, bu katman saldırgan IP'yi
 * geçici olarak tamamen dışarıda tutar ve platform yöneticisine görünür/bildirilir kılar.
 *
 * Redis varsa paylaşılır (çok süreç/sunucu), yoksa bellek içi. Blok süreleri ortam değişkenleriyle ayarlanabilir.
 */
const FAIL_WINDOW_MS = Number(process.env.ABUSE_WINDOW_MS) || 15 * 60 * 1000;
// Bu kadar başarısız denemede IP bloke. Giriş uçlarındaki istek sınırı (rateLimit) 10-20 arası olduğu için,
// sayaç sınıra takılmadan eşiğe ulaşsın diye en düşük rateLimit'e (10) eşit tutulur.
const FAIL_THRESHOLD = Number(process.env.ABUSE_THRESHOLD) || 10;
const STEPS_MS = [15 * 60e3, 60 * 60e3, 6 * 60 * 60e3, 24 * 60 * 60e3]; // kademeli blok süreleri
const EVENTS_MAX = 200;

const now = () => Date.now();
const stepDuration = (level) => STEPS_MS[Math.min(level, STEPS_MS.length - 1)];

// Bellek içi yedek (Redis yoksa)
const mem = { fails: new Map(), blocks: new Map(), events: [], alerts: new Map() };
setInterval(() => {
  const n = now();
  for (const [k, v] of mem.fails) if (v.reset < n) mem.fails.delete(k);
  for (const [k, v] of mem.blocks) if (v.expiresAt < n) mem.blocks.delete(k);
}, 60e3).unref();

export const ipOf = (req) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || 'bilinmiyor';

// Loopback / bilinmeyen IP bloke edilmez: üretimde gerçek istemciler ters vekil (Caddy) arkasından gerçek IP ile gelir
// (trust proxy), loopback yalnızca iç/health/test isteğidir. Bu ayrıca testleri kendini bloke etmekten korur.
const EXEMPT = new Set(['127.0.0.1', '::1', 'localhost', 'bilinmiyor', '']);
const exempt = (ip) => EXEMPT.has(ip);

export const isBlocked = async (ip) => {
  const redis = redisReady();
  if (redis) {
    try { const s = await redis.get(`ab:block:${ip}`); const b = s && JSON.parse(s); return b && b.expiresAt > now() ? b : null; } catch { /* belleğe düş */ }
  }
  const b = mem.blocks.get(ip);
  return b && b.expiresAt > now() ? b : null;
};

const addEvent = async (ev) => {
  const e = { ...ev, at: new Date().toISOString() };
  const redis = redisReady();
  if (redis) { try { await redis.multi().lpush('ab:events', JSON.stringify(e)).ltrim('ab:events', 0, EVENTS_MAX - 1).exec(); return; } catch { /* belleğe düş */ } }
  mem.events.unshift(e);
  if (mem.events.length > EVENTS_MAX) mem.events.length = EVENTS_MAX;
};

const setBlock = async (block) => {
  const ttl = Math.max(1000, block.expiresAt - now());
  const redis = redisReady();
  if (redis) { try { await redis.multi().set(`ab:block:${block.ip}`, JSON.stringify(block), 'PX', ttl).zadd('ab:blocks', block.expiresAt, block.ip).exec(); return; } catch { /* belleğe düş */ } }
  mem.blocks.set(block.ip, block);
};

// Yeni blokta platform yöneticisine e-posta (aynı IP için saatte en çok bir kez; SMTP yoksa sessiz)
const alertBlock = (block) => {
  const last = mem.alerts.get(block.ip) || 0;
  if (now() - last < 60 * 60e3) return;
  mem.alerts.set(block.ip, now());
  import('./mailService.js')
    .then((m) => m.sendPlatformAlert?.({
      subject: `Giriş saldırısı: ${block.ip} bloke edildi`,
      text: `IP ${block.ip} arka arkaya ${block.count} başarısız giriş sonrası ${Math.round(stepDuration(block.level) / 60000)} dk bloke edildi (seviye ${block.level + 1}).\nUç: ${block.endpoint || '-'}\nDenenen e-posta: ${block.email || '-'}\n\nPlatform → Güvenlik'ten görülebilir / kaldırılabilir.`
    }))
    .catch(() => {});
};

/** Başarısız giriş: sayacı artır, eşik aşılırsa IP'yi (kademeli) blokla. Oluşan bloğu döndürür (yoksa null). */
export const recordFailure = async ({ ip, email, endpoint }) => {
  if (exempt(ip)) return null; // loopback / bilinmeyen IP sayılmaz, bloke edilmez
  let count;
  const redis = redisReady();
  if (redis) {
    try {
      const k = `ab:fail:${ip}`;
      const r = await redis.multi().incr(k).pexpire(k, FAIL_WINDOW_MS, 'NX').exec();
      count = r?.[0]?.[1];
    } catch { /* belleğe düş */ }
  }
  if (count === undefined) {
    const e = mem.fails.get(ip);
    if (!e || e.reset < now()) { mem.fails.set(ip, { count: 1, reset: now() + FAIL_WINDOW_MS }); count = 1; }
    else { e.count++; count = e.count; }
  }

  if (count < FAIL_THRESHOLD) return null;

  const existing = await isBlocked(ip);
  const level = existing ? existing.level + 1 : 0;
  const block = { ip, level, count, reason: 'Arka arkaya başarısız giriş', endpoint: endpoint || null, email: email || null, createdAt: new Date().toISOString(), expiresAt: now() + stepDuration(level) };
  await setBlock(block);
  await addEvent({ type: 'BLOCK', ip, endpoint: endpoint || null, email: email || null, level, detail: `${count} başarısız denemeden sonra ${Math.round(stepDuration(level) / 60000)} dk bloke` });
  // sayaç sıfırlanır (blok sonrası yeniden birikir)
  if (redis) redis.del(`ab:fail:${ip}`).catch(() => {}); else mem.fails.delete(ip);
  alertBlock(block);
  return block;
};

/** Başarılı giriş: IP'nin başarısız sayacını temizler. */
export const clearFailures = async (ip) => {
  const redis = redisReady();
  if (redis) redis.del(`ab:fail:${ip}`).catch(() => {}); else mem.fails.delete(ip);
};

export const recordAttackHit = ({ ip, endpoint }) => addEvent({ type: 'BLOCKED_HIT', ip, endpoint: endpoint || null, detail: 'Bloke IP yeniden denedi' });

export const listBlocks = async () => {
  const redis = redisReady();
  if (redis) {
    try {
      const ips = await redis.zrange('ab:blocks', 0, -1);
      const out = [];
      for (const ip of ips) {
        const s = await redis.get(`ab:block:${ip}`);
        if (s) out.push(JSON.parse(s)); else redis.zrem('ab:blocks', ip).catch(() => {});
      }
      return out.filter((b) => b.expiresAt > now()).sort((a, b) => b.expiresAt - a.expiresAt);
    } catch { /* belleğe düş */ }
  }
  return [...mem.blocks.values()].filter((b) => b.expiresAt > now()).sort((a, b) => b.expiresAt - a.expiresAt);
};

export const removeBlock = async (ip) => {
  const redis = redisReady();
  if (redis) { try { await redis.multi().del(`ab:block:${ip}`).zrem('ab:blocks', ip).exec(); } catch { /* belleğe düş */ } }
  mem.blocks.delete(ip);
  await addEvent({ type: 'UNBLOCK', ip, detail: 'Developer tarafından kaldırıldı' });
};

export const listEvents = async (limit = 100) => {
  const redis = redisReady();
  if (redis) {
    try { const arr = await redis.lrange('ab:events', 0, limit - 1); return arr.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean); } catch { /* belleğe düş */ }
  }
  return mem.events.slice(0, limit);
};

/** Giriş uçlarına konur: bloke IP'yi 429 ile reddeder. */
export const blockGuard = async (req, res, next) => {
  try {
    const ip = ipOf(req);
    if (exempt(ip)) return next();
    const b = await isBlocked(ip);
    if (b) {
      recordAttackHit({ ip: b.ip, endpoint: req.originalUrl });
      res.set('Retry-After', Math.max(1, Math.ceil((b.expiresAt - now()) / 1000)));
      return res.status(429).json({ message: 'Çok fazla başarısız giriş nedeniyle erişiminiz geçici olarak kısıtlandı. Lütfen bir süre sonra tekrar deneyin.', code: 'IP_BLOCKED' });
    }
  } catch { /* koruma hatası girişi engellemesin */ }
  next();
};
