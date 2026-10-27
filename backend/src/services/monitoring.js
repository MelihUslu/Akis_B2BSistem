import pkg from '@prisma/client';
import { basePrisma, currentTenantId } from '../utils/prisma.js';

/**
 * Platform izleme: API istek metrikleri, yavaş istekler, arka plan işleri, dış servis çağrıları,
 * entegrasyon (ERP) API istek kaydı ve uyarılar. İzleme kayıtları asıl işlemi asla bozmaz ve bekletmez.
 *
 * İstek metrikleri her istek için ayrı satır yazılmaz: bellekte dakika + uç bazında toplanır,
 * dakikada bir veritabanına eklenir (birden fazla sunucu aynı satıra toplar).
 */
const { Prisma } = pkg;
const db = basePrisma; // izleme tabloları kiracıya ait değildir
const SLOW_MS = 1000;

const quiet = (p) => Promise.resolve(p).catch((err) => console.error('[İzleme]', err.message));
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

// ─── İstek metrikleri ─────────────────────────────────────────────────────────
let buckets = new Map();
let slowBuffer = [];

const minuteOf = (d) => new Date(Math.floor(d / 60000) * 60000);

// Uç kalıbı: /api/orders/:id (sayısal / rastgele parçalar kalıba indirgenir; eşleşmeyen yollar tek grupta)
const routeOf = (req) => {
  if (req.route?.path) return `${req.baseUrl}${req.route.path === '/' ? '' : req.route.path}` || '/';
  return '(eşleşmeyen yol)';
};

export const requestMetrics = (req, res, next) => {
  if (!req.path.startsWith('/api') && !req.originalUrl.startsWith('/api')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      const route = routeOf(req);
      const key = `${minuteOf(Date.now()).toISOString()}|${req.method}|${route}`;
      const b = buckets.get(key) || { count: 0, errors: 0, clientErrors: 0, totalMs: 0, maxMs: 0, slow: 0 };
      b.count++;
      if (res.statusCode >= 500) b.errors++;
      else if (res.statusCode >= 400) b.clientErrors++;
      b.totalMs += ms;
      b.maxMs = Math.max(b.maxMs, ms);
      if (ms >= SLOW_MS) {
        b.slow++;
        if (slowBuffer.length < 500) slowBuffer.push({ method: req.method, route, path: clip(req.originalUrl.split('?')[0], 300), statusCode: res.statusCode, ms, tenantId: req.tenant?.id ?? null });
      }
      buckets.set(key, b);
    } catch { /* izleme hatası istek akışını etkilemez */ }
  });
  next();
};

export const flushMetrics = async () => {
  const rows = [...buckets.entries()];
  const slow = slowBuffer;
  buckets = new Map();
  slowBuffer = [];
  if (rows.length) {
    const values = rows.map(([key, b]) => {
      const [minute, method, route] = key.split('|');
      return Prisma.sql`(${new Date(minute)}, ${method}, ${route}, ${b.count}, ${b.errors}, ${b.clientErrors}, ${b.totalMs}, ${b.maxMs}, ${b.slow})`;
    });
    await db.$executeRaw`
      INSERT INTO "RequestMetric" ("minute", "method", "route", "count", "errors", "clientErrors", "totalMs", "maxMs", "slow")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("minute", "method", "route") DO UPDATE SET
        "count" = "RequestMetric"."count" + EXCLUDED."count",
        "errors" = "RequestMetric"."errors" + EXCLUDED."errors",
        "clientErrors" = "RequestMetric"."clientErrors" + EXCLUDED."clientErrors",
        "totalMs" = "RequestMetric"."totalMs" + EXCLUDED."totalMs",
        "maxMs" = GREATEST("RequestMetric"."maxMs", EXCLUDED."maxMs"),
        "slow" = "RequestMetric"."slow" + EXCLUDED."slow"`;
  }
  if (slow.length) await db.slowRequest.createMany({ data: slow });
};

// ─── Uyarılar (PLATFORM_ALERT_EMAIL; aynı konu saatte en fazla bir kez) ─────────
const lastAlert = new Map();
export const sendAlert = (key, subject, text) => {
  const now = Date.now();
  if (lastAlert.has(key) && now - lastAlert.get(key) < 60 * 60 * 1000) return;
  lastAlert.set(key, now);
  quiet(import('./mailService.js').then((m) => m.sendPlatformAlert({ subject, text })));
};

// ─── Arka plan işleri ────────────────────────────────────────────────────────
// Sık çalışan ve çoğu zaman iş yapmayan işler (webhook kuyruğu) başarıda kayıt yazmaz; son çalışma bellekte tutulur
const lastRuns = new Map();
export const jobLastRuns = () => Object.fromEntries(lastRuns);

export const trackJob = async (name, fn, { quietSuccess = false } = {}) => {
  const startedAt = new Date();
  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    lastRuns.set(name, { at: startedAt, ok: true, durationMs });
    if (!quietSuccess) await quiet(db.jobRun.create({ data: { name, startedAt, finishedAt: new Date(), ok: true, durationMs } }));
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    lastRuns.set(name, { at: startedAt, ok: false, durationMs, error: clip(error.message, 500) });
    await quiet(db.jobRun.create({ data: { name, startedAt, finishedAt: new Date(), ok: false, durationMs, error: clip(error.stack || error.message, 2000) } }));
    sendAlert(`job:${name}`, `Arka plan işi hata verdi: ${name}`, `${error.message}`);
    throw error;
  }
};

// ─── Dış servis çağrıları ────────────────────────────────────────────────────
export const recordExternal = ({ service, operation, ok, statusCode, durationMs, error, tenantId }) =>
  quiet(db.externalCall.create({
    data: { service, operation: clip(operation, 120), ok, statusCode: statusCode ?? null, durationMs: Math.round(durationMs), error: clip(error, 1000), tenantId: tenantId ?? currentTenantId() ?? null }
  }));

/**
 * Dış servis çağrısını sarar: süre ve sonuç kaydedilir, davranış değişmez (hata aynen fırlatılır).
 * fn içinde HTTP isteği + yanıt kontrolü yapılır; böylece HTTP 200 dönüp gövdede hata bildiren
 * servislerin (iyzico, PayTR) iş hataları da başarısız sayılır.
 */
export const trackExternal = async (service, operation, fn) => {
  const start = Date.now();
  try {
    const result = await fn();
    recordExternal({ service, operation, ok: true, durationMs: Date.now() - start });
    return result;
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    recordExternal({ service, operation, ok: false, statusCode: error?.status ?? error?.statusCode, durationMs: Date.now() - start, error: timeout ? 'Zaman aşımı' : error?.message });
    throw error;
  }
};

// ─── Entegrasyon (ERP) API istek kaydı ───────────────────────────────────────
export const apiRequestLogger = (req, res, next) => {
  const start = Date.now();
  let message = null;
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && body && typeof body === 'object') message = body.message || body.error || null;
    return json(body);
  };
  res.on('finish', () => {
    if (!req.tenant) return;
    quiet(db.apiRequestLog.create({
      data: {
        tenantId: req.tenant.id, apiKeyId: req.apiKey?.id ?? null, apiKeyName: clip(req.apiKey?.name, 80), isTest: Boolean(req.apiKey?.isTest),
        method: req.method, path: clip(req.originalUrl.split('?')[0], 300), statusCode: res.statusCode,
        durationMs: Date.now() - start, error: clip(message, 500)
      }
    }));
  });
  next();
};

// ─── Hata artışı ─────────────────────────────────────────────────────────────
const recentErrors = [];
export const noteServerError = () => {
  const now = Date.now();
  recentErrors.push(now);
  while (recentErrors.length && now - recentErrors[0] > 10 * 60 * 1000) recentErrors.shift();
  const limit = parseInt(process.env.ALERT_ERROR_SPIKE || '30', 10);
  if (recentErrors.length >= limit) {
    sendAlert('error-spike', `Hata artışı: son 10 dakikada ${recentErrors.length} hata`, 'Platform → İzleme ve Hatalar sayfalarını kontrol edin.');
  }
};

// ─── Saklama süresi ──────────────────────────────────────────────────────────
export const cleanupMonitoring = async () => {
  const days = (n) => new Date(Date.now() - n * 86400000);
  await Promise.all([
    db.requestMetric.deleteMany({ where: { minute: { lt: days(14) } } }),
    db.slowRequest.deleteMany({ where: { createdAt: { lt: days(7) } } }),
    db.jobRun.deleteMany({ where: { startedAt: { lt: days(14) } } }),
    db.externalCall.deleteMany({ where: { createdAt: { lt: days(14) } } }),
    db.apiRequestLog.deleteMany({ where: { createdAt: { lt: days(30) } } })
  ]);
};

export const startMetricsFlush = () => {
  const t = setInterval(() => quiet(flushMetrics()), 60 * 1000);
  t.unref();
};
