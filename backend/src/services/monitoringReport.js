import { basePrisma as db } from '../utils/prisma.js';
import { jobLastRuns, trackJob } from './monitoring.js';

/**
 * İzleme raporları: platform panelindeki İzleme sayfası ve günlük özet e-postası.
 * Sayılar int olarak döner (PostgreSQL SUM/COUNT bigint döndürür).
 */
const n = (v) => Number(v ?? 0);
const pageOf = (q) => Math.max(1, parseInt(q.page) || 1);
const PAGE = 50;

const tenantNames = async (ids) => {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return new Map();
  const rows = await db.tenant.findMany({ where: { id: { in: list } }, select: { id: true, name: true } });
  return new Map(rows.map((t) => [t.id, t.name]));
};

export const monitoringOverview = async (hours = 24) => {
  const since = new Date(Date.now() - hours * 3600_000);
  const bucket = hours > 72 ? 'day' : 'hour';

  const [totals, series, routes, jobGroups, jobFailures, external, externalErrors, api, slowCount, newErrors, openErrors] = await Promise.all([
    db.$queryRaw`SELECT SUM("count") AS count, SUM("errors") AS errors, SUM("clientErrors") AS "clientErrors", SUM("totalMs") AS "totalMs", MAX("maxMs") AS "maxMs", SUM("slow") AS slow
      FROM "RequestMetric" WHERE "minute" >= ${since}`,
    db.$queryRaw`SELECT date_trunc(${bucket}, "minute") AS at, SUM("count") AS count, SUM("errors") AS errors, SUM("clientErrors") AS "clientErrors", SUM("totalMs") AS "totalMs", SUM("slow") AS slow
      FROM "RequestMetric" WHERE "minute" >= ${since} GROUP BY 1 ORDER BY 1`,
    db.$queryRaw`SELECT "method", "route", SUM("count") AS count, SUM("errors") AS errors, SUM("clientErrors") AS "clientErrors", SUM("totalMs") AS "totalMs", MAX("maxMs") AS "maxMs", SUM("slow") AS slow
      FROM "RequestMetric" WHERE "minute" >= ${since} GROUP BY "method", "route"`,
    db.jobRun.groupBy({ by: ['name'], where: { startedAt: { gte: since } }, _count: true, _avg: { durationMs: true }, _max: { startedAt: true } }),
    db.jobRun.groupBy({ by: ['name'], where: { startedAt: { gte: since }, ok: false }, _count: true, _max: { startedAt: true } }),
    db.externalCall.groupBy({ by: ['service'], where: { createdAt: { gte: since } }, _count: true, _avg: { durationMs: true }, _max: { durationMs: true } }),
    db.externalCall.groupBy({ by: ['service'], where: { createdAt: { gte: since }, ok: false }, _count: true, _max: { createdAt: true } }),
    db.$queryRaw`SELECT "tenantId", COUNT(*) AS count, COUNT(*) FILTER (WHERE "statusCode" >= 400) AS errors, AVG("durationMs") AS "avgMs", MAX("createdAt") AS "lastAt"
      FROM "ApiRequestLog" WHERE "createdAt" >= ${since} GROUP BY "tenantId" ORDER BY count DESC LIMIT 20`,
    db.slowRequest.count({ where: { createdAt: { gte: since } } }),
    db.errorLog.count({ where: { firstSeenAt: { gte: since } } }),
    db.errorLog.count({ where: { resolvedAt: null } })
  ]);

  const t = totals[0] || {};
  const count = n(t.count);
  const routeRows = routes.map((r) => ({
    method: r.method, route: r.route, count: n(r.count), errors: n(r.errors), clientErrors: n(r.clientErrors),
    avgMs: n(r.count) ? Math.round(n(r.totalMs) / n(r.count)) : 0, maxMs: n(r.maxMs), slow: n(r.slow)
  }));

  // Son hata mesajları (iş ve servis başına en yeni)
  const failedJobNames = jobFailures.map((j) => j.name);
  const failedServices = externalErrors.map((e) => e.service);
  const [lastJobErrors, lastServiceErrors] = await Promise.all([
    failedJobNames.length ? db.jobRun.findMany({ where: { name: { in: failedJobNames }, ok: false }, orderBy: { startedAt: 'desc' }, distinct: ['name'], select: { name: true, error: true } }) : [],
    failedServices.length ? db.externalCall.findMany({ where: { service: { in: failedServices }, ok: false }, orderBy: { createdAt: 'desc' }, distinct: ['service'], select: { service: true, operation: true, error: true } }) : []
  ]);
  const lastRunOk = await Promise.all(jobGroups.map((j) => db.jobRun.findFirst({ where: { name: j.name }, orderBy: { startedAt: 'desc' }, select: { ok: true, startedAt: true, durationMs: true } })));

  const jobs = jobGroups.map((j, i) => ({
    name: j.name, runs: j._count, avgMs: Math.round(j._avg.durationMs || 0),
    failures: jobFailures.find((f) => f.name === j.name)?._count || 0,
    last: lastRunOk[i],
    lastError: lastJobErrors.find((e) => e.name === j.name)?.error?.split('\n')[0] || null
  }));
  // Başarıda kayıt yazmayan işler (webhook kuyruğu) için bellekteki son çalışma
  for (const [name, run] of Object.entries(jobLastRuns())) {
    const row = jobs.find((j) => j.name === name);
    if (row) row.last = { ok: run.ok, startedAt: run.at, durationMs: run.durationMs };
    else jobs.push({ name, runs: null, avgMs: run.durationMs, failures: 0, last: { ok: run.ok, startedAt: run.at, durationMs: run.durationMs }, lastError: run.error || null });
  }

  const names = await tenantNames(api.map((a) => a.tenantId));

  return {
    hours,
    bucket,
    totals: {
      requests: count, errors: n(t.errors), clientErrors: n(t.clientErrors),
      errorRate: count ? +(n(t.errors) / count * 100).toFixed(2) : 0,
      avgMs: count ? Math.round(n(t.totalMs) / count) : 0, maxMs: n(t.maxMs), slow: slowCount,
      newErrors, openErrors
    },
    series: series.map((s) => ({ at: s.at, count: n(s.count), errors: n(s.errors), clientErrors: n(s.clientErrors), avgMs: n(s.count) ? Math.round(n(s.totalMs) / n(s.count)) : 0, slow: n(s.slow) })),
    busiest: [...routeRows].sort((a, b) => b.count - a.count).slice(0, 10),
    slowest: routeRows.filter((r) => r.count >= 3).sort((a, b) => b.avgMs - a.avgMs).slice(0, 10),
    failing: routeRows.filter((r) => r.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 10),
    jobs: jobs.sort((a, b) => b.failures - a.failures || a.name.localeCompare(b.name, 'tr')),
    external: external.map((e) => {
      const failures = externalErrors.find((f) => f.service === e.service)?._count || 0;
      const last = lastServiceErrors.find((l) => l.service === e.service);
      return {
        service: e.service, calls: e._count, failures, failureRate: e._count ? +(failures / e._count * 100).toFixed(1) : 0,
        avgMs: Math.round(e._avg.durationMs || 0), maxMs: e._max.durationMs || 0,
        lastError: last ? `${last.operation ? `${last.operation}: ` : ''}${last.error || ''}` : null
      };
    }).sort((a, b) => b.failures - a.failures || b.calls - a.calls),
    api: api.map((a) => ({ tenantId: a.tenantId, tenantName: names.get(a.tenantId) || `#${a.tenantId}`, count: n(a.count), errors: n(a.errors), avgMs: Math.round(n(a.avgMs)), lastAt: a.lastAt }))
  };
};

// ─── Ayrıntı listeleri ───────────────────────────────────────────────────────
const list = async (model, where, orderBy, q) => {
  const page = pageOf(q);
  const [rows, total] = await Promise.all([
    db[model].findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE }),
    db[model].count({ where })
  ]);
  return { rows, total, page, pageSize: PAGE };
};

const okFilter = (v) => (v === 'fail' ? { ok: false } : v === 'ok' ? { ok: true } : {});

export const listJobRuns = (q) => list('jobRun', { ...(q.name && { name: q.name }), ...okFilter(q.status) }, { startedAt: 'desc' }, q);

export const listExternalCalls = async (q) => {
  const r = await list('externalCall', { ...(q.service && { service: q.service }), ...okFilter(q.status) }, { createdAt: 'desc' }, q);
  const names = await tenantNames(r.rows.map((x) => x.tenantId));
  return { ...r, rows: r.rows.map((x) => ({ ...x, tenantName: x.tenantId ? names.get(x.tenantId) || `#${x.tenantId}` : null })) };
};

export const listApiRequests = async (q) => {
  const where = {
    ...(q.tenantId && { tenantId: parseInt(q.tenantId) }),
    ...(q.status === 'fail' && { statusCode: { gte: 400 } }),
    ...(q.status === 'ok' && { statusCode: { lt: 400 } }),
    ...(q.search && { path: { contains: String(q.search), mode: 'insensitive' } })
  };
  const r = await list('apiRequestLog', where, { createdAt: 'desc' }, q);
  const names = await tenantNames(r.rows.map((x) => x.tenantId));
  return { ...r, rows: r.rows.map((x) => ({ ...x, tenantName: names.get(x.tenantId) || `#${x.tenantId}` })) };
};

export const listSlowRequests = async (q) => {
  const r = await list('slowRequest', { ...(q.route && { route: q.route }) }, { createdAt: 'desc' }, q);
  const names = await tenantNames(r.rows.map((x) => x.tenantId));
  return { ...r, rows: r.rows.map((x) => ({ ...x, tenantName: x.tenantId ? names.get(x.tenantId) || `#${x.tenantId}` : null })) };
};

// Filtre seçenekleri (son 14 günde görülen iş ve servis adları)
export const monitoringFilters = async () => {
  const [jobs, services] = await Promise.all([
    db.jobRun.findMany({ distinct: ['name'], select: { name: true }, orderBy: { name: 'asc' } }),
    db.externalCall.findMany({ distinct: ['service'], select: { service: true }, orderBy: { service: 'asc' } })
  ]);
  return { jobs: [...new Set([...jobs.map((j) => j.name), ...Object.keys(jobLastRuns())])], services: services.map((s) => s.service) };
};

// ─── Günlük özet e-postası ───────────────────────────────────────────────────
const DIGEST_JOB = 'Günlük özet e-postası';
const DIGEST_HOUR = () => parseInt(process.env.DIGEST_HOUR || '8', 10);
const istanbulNow = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: parseInt(parts.hour, 10) };
};

export const buildDigest = async () => {
  const o = await monitoringOverview(24);
  const t = o.totals;
  const lines = [
    `Son 24 saat`,
    `İstek: ${t.requests.toLocaleString('tr-TR')} · sunucu hatası (5xx): ${t.errors} (%${t.errorRate}) · ortalama ${t.avgMs} ms · 1 sn üzeri: ${t.slow}`,
    `Hatalar: ${t.newErrors} yeni, ${t.openErrors} açık`
  ];
  const badJobs = o.jobs.filter((j) => j.failures > 0);
  lines.push(badJobs.length ? `Hata veren işler: ${badJobs.map((j) => `${j.name} (${j.failures})`).join(', ')}` : 'Arka plan işleri: sorunsuz');
  const badServices = o.external.filter((e) => e.failures > 0);
  lines.push(badServices.length ? `Dış servis hataları: ${badServices.map((e) => `${e.service} ${e.failures}/${e.calls}`).join(', ')}` : 'Dış servisler: sorunsuz');
  const apiCalls = o.api.reduce((s, a) => s + a.count, 0);
  if (apiCalls) lines.push(`Entegrasyon API: ${apiCalls} istek, ${o.api.reduce((s, a) => s + a.errors, 0)} hatalı`);
  if (o.slowest[0]) lines.push(`En yavaş uç: ${o.slowest[0].method} ${o.slowest[0].route} (ort. ${o.slowest[0].avgMs} ms)`);
  const healthy = t.errorRate < 1 && !badJobs.length && !badServices.length && !t.newErrors;
  return { subject: healthy ? 'Günlük özet: sorun yok' : 'Günlük özet: kontrol edilmesi gerekenler var', text: lines.join('\n'), overview: o };
};

export const sendDailyDigestIfDue = async () => {
  if (!process.env.PLATFORM_ALERT_EMAIL || process.env.DAILY_DIGEST === 'false') return;
  const { day, hour } = istanbulNow();
  if (hour < DIGEST_HOUR()) return;
  const sinceStartOfDay = new Date(`${day}T00:00:00+03:00`);
  const sent = await db.jobRun.findFirst({ where: { name: DIGEST_JOB, ok: true, startedAt: { gte: sinceStartOfDay } } });
  if (sent) return;
  await trackJob(DIGEST_JOB, async () => {
    const { subject, text } = await buildDigest();
    const { sendPlatformAlert } = await import('./mailService.js');
    await sendPlatformAlert({ subject, text });
  });
};
