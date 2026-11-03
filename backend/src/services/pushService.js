import webpush from 'web-push';
import prisma from '../utils/prisma.js';

/**
 * Web Push: kurulan uygulama (PWA) kapalıyken de telefona / masaüstüne bildirim gönderir.
 * VAPID anahtarları yoksa push kapalıdır; panel içi bildirim ve e-posta etkilenmez.
 */
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
export const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:destek@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export const publicKey = () => (pushEnabled ? VAPID_PUBLIC_KEY : null);

const MAX_PER_USER = 10; // Bir kullanıcının en fazla 10 cihazı

export const subscribe = async (userId, { endpoint, keys } = {}, userAgent) => {
  if (!endpoint || !/^https:\/\//.test(endpoint) || !keys?.p256dh || !keys?.auth) {
    throw Object.assign(new Error('Geçersiz push aboneliği.'), { status: 400 });
  }
  const data = { userId, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent?.slice(0, 300) || null, lastUsedAt: new Date() };
  await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
  // Fazla cihaz varsa en eskileri sil
  const old = await prisma.pushSubscription.findMany({ where: { userId }, orderBy: { lastUsedAt: 'desc' }, skip: MAX_PER_USER, select: { id: true } });
  if (old.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
};

export const unsubscribe = (userId, endpoint) => prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });

// Bildirimi kullanıcının tüm cihazlarına gönderir; geçersizleşen (410/404) abonelikleri siler
export const pushToUser = async (userId, notification) => {
  if (!pushEnabled) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return 0;
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.message,
    url: notification.link || '/',
    tag: `n${notification.id}`,
  });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else console.error('[Push]', err.statusCode || '', err.message);
    }
  }));
  return sent;
};

// Toplu push: birden çok bildirimin alıcılarının abonelikleri tek sorguda okunur, gönderim sınırlı eşzamanlılıkla yapılır
export const pushToUsers = async (notifications, { concurrency = 20 } = {}) => {
  if (!pushEnabled || !notifications.length) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(notifications.map((n) => n.userId))] } } });
  if (!subs.length) return 0;
  const byUser = new Map();
  for (const s of subs) byUser.set(s.userId, [...(byUser.get(s.userId) || []), s]);
  const jobs = notifications.flatMap((n) => (byUser.get(n.userId) || []).map((s) => ({ s, payload: JSON.stringify({ title: n.title, body: n.message, url: n.link || '/', tag: `n${n.id}` }) })));
  let sent = 0;
  for (let i = 0; i < jobs.length; i += concurrency) {
    await Promise.all(jobs.slice(i, i + concurrency).map(async ({ s, payload }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error('[Push]', err.statusCode || '', err.message);
      }
    }));
  }
  return sent;
};

