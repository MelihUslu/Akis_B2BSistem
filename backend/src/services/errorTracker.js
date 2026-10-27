import crypto from 'crypto';
import prisma, { runAsPlatform, currentTenantId } from '../utils/prisma.js';
import { noteServerError } from './monitoring.js';
import { captureSentry } from './sentry.js';

/**
 * Hata izleme. Aynı hata (mesaj + ilk yığın satırı) tek kayıtta toplanır; ilk kez görülen hata
 * platform yöneticisine e-postayla bildirilir. Kayıt sırasında oluşan hata asla asıl akışı bozmaz.
 */
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));
// Değişken parçalar (sayılar, id'ler) parmak izini bozmasın
const normalize = (msg) => String(msg || '').replace(/\b\d+\b/g, 'N').replace(/[0-9a-f]{16,}/gi, 'H').slice(0, 300);

let recording = false; // kayıt sırasında oluşan hatanın yeniden kaydedilmesini önler

export const recordError = async ({ source = 'SERVER', error, message, stack, method, path, statusCode, tenantId, userId, userAgent }) => {
  if (recording) return;
  recording = true;
  try {
    const msg = clip(message || error?.message || String(error), 1000);
    const stk = clip(stack || error?.stack, 6000);
    const topFrame = (stk || '').split('\n').find((l) => l.trim().startsWith('at ')) || '';
    const fingerprint = crypto.createHash('sha1').update(`${source}|${normalize(msg)}|${topFrame.replace(/:\d+:\d+\)?$/, '')}|${path?.replace(/\/\d+/g, '/:id') || ''}`).digest('hex');
    const tenant = tenantId ?? currentTenantId() ?? null;
    if (source === 'SERVER') noteServerError();
    const before = await runAsPlatform(() => prisma.errorLog.findUnique({ where: { fingerprint }, select: { resolvedAt: true } }));
    const row = await runAsPlatform(() => prisma.errorLog.upsert({
      where: { fingerprint },
      create: { fingerprint, source, message: msg, stack: stk, method: clip(method, 10), path: clip(path, 300), statusCode, tenantId: tenant, userId, userAgent: clip(userAgent, 300) },
      update: { count: { increment: 1 }, lastSeenAt: new Date(), resolvedAt: null, tenantId: tenant, userId, statusCode }
    }));
    // Yeni hata ve "çözüldü" işaretlenmiş hatanın tekrar etmesi (regresyon) e-postayla bildirilir
    const regression = Boolean(before?.resolvedAt);
    if (row.count === 1 || regression) {
      const { sendPlatformAlert } = await import('./mailService.js');
      const label = regression ? 'Çözüldü denen hata tekrarladı' : 'Yeni hata';
      sendPlatformAlert({ subject: `${label} (${source}): ${msg.slice(0, 80)}`, text: `${method || ''} ${path || ''}\n${msg}\n\n${(stk || '').slice(0, 1500)}` }).catch(() => {});
    }
    captureSentry(error, { source, path, tenantId: tenant });
  } catch {
    /* hata kaydı yapılamadı; asıl akış etkilenmez */
  } finally {
    recording = false;
  }
};

/** Süreç düzeyinde yakalama: yakalanmamış hatalar ve kodda console.error ile loglanan Error nesneleri */
export const installErrorTracking = () => {
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    const error = args.find((a) => a instanceof Error);
    if (error) recordError({ error, message: `${args.filter((a) => typeof a === 'string').join(' ')} ${error.message}`.trim() });
  };
  process.on('unhandledRejection', (reason) => recordError({ error: reason instanceof Error ? reason : new Error(String(reason)), message: `Unhandled rejection: ${reason?.message || reason}` }));
  process.on('uncaughtException', (error) => { original('Uncaught exception:', error); recordError({ error }).finally(() => process.exit(1)); });
};

// Express hata ara katmanı için: istek bilgisiyle kaydet
export const recordRequestError = (req, error, statusCode) => recordError({
  error, method: req.method, path: req.originalUrl?.split('?')[0], statusCode,
  tenantId: req.tenant?.id, userId: req.user?.id, userAgent: req.headers['user-agent']
});
