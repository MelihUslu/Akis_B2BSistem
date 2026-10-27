/**
 * İsteğe bağlı Sentry: SENTRY_DSN tanımlıysa ve @sentry/node kuruluysa sunucu hataları Sentry'ye de gönderilir.
 * Platformun kendi hata kaydı (Platform → Hatalar) her durumda çalışır; Sentry yalnızca ek bir kopyadır.
 * Kurulum: cd backend && npm install @sentry/node
 */
let sentry = null;
let loading = null;

const load = () => {
  if (!process.env.SENTRY_DSN) return null;
  loading ??= import('@sentry/node')
    .then((mod) => {
      mod.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development', tracesSampleRate: 0 });
      sentry = mod;
      return mod;
    })
    .catch(() => {
      console.warn('[Sentry] SENTRY_DSN tanımlı ama @sentry/node kurulu değil; Sentry kapalı.');
      return null;
    });
  return loading;
};

export const sentryEnabled = () => Boolean(sentry);

export const captureSentry = (error, context = {}) => {
  if (!process.env.SENTRY_DSN || !(error instanceof Error)) return;
  Promise.resolve(sentry || load()).then((s) => s?.captureException(error, { tags: { source: context.source }, extra: context })).catch(() => {});
};

load();
