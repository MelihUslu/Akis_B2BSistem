import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import prisma, { runAsPlatform } from '../utils/prisma.js';

export const WEBHOOK_EVENTS = {
  'order.created': 'Yeni sipariş',
  'order.updated': 'Sipariş onaylandı / kargolandı / teslim edildi / iptal',
  'company.created': 'Yeni bayi veya bayilik başvurusu',
  'payment.received': 'Bayiden tahsilat (sanal POS)',
  'quote.created': 'Yeni teklif talebi',
  'quote.sent': 'Teklif müşteriye gönderildi',
  'quote.accepted': 'Müşteri teklifi kabul etti',
  'return.created': 'Yeni iade / değişim talebi',
  'invoice.issued': 'Sipariş faturası kesildi'
};

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const lower = ip.toLowerCase();
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80') || lower.startsWith('::ffff:127.') || lower === '::';
};

/**
 * Webhook adresi doğrulaması. Canlı ortamda sadece https ve dışarıdaki adreslere izin verilir
 * (iç ağa / sunucunun kendisine istek attırılmasını önler).
 */
export const validateWebhookUrl = async (raw) => {
  let url;
  try { url = new URL(raw); } catch { return 'Geçerli bir adres girin (https://...).'; }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Adres http(s) ile başlamalıdır.';
  if (process.env.NODE_ENV !== 'production') return null;
  if (url.protocol !== 'https:') return 'Canlı ortamda sadece https adreslere bildirim gönderilir.';
  try {
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (addresses.some(a => isPrivateIp(a.address))) return 'İç ağ adreslerine bildirim gönderilemez.';
  } catch {
    return 'Adres çözümlenemedi.';
  }
  return null;
};

export const signPayload = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('hex');

// Yeniden deneme aralıkları: 1 dk, 5 dk, 30 dk, 2 sa, 6 sa (toplam 6 deneme)
const BACKOFF_MS = [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

// Tek HTTP denemesi
const post = async (hook, event, body) => {
  const invalid = await validateWebhookUrl(hook.url);
  if (invalid) return { status: null, error: invalid };
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
        'X-Webhook-Signature': signPayload(hook.secret, body),
        'User-Agent': 'AkisB2B-Webhook/1.0'
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000)
    });
    return { status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { status: null, error: err.message };
  }
};

/**
 * Kayıttaki gönderimi bir kez dener. Kayıt önce SENDING'e "kilitlenir": birden çok sunucu çalışsa da
 * aynı gönderimi yalnızca biri yapar. Başarısızsa bir sonraki deneme zamanı yazılır.
 */
export const attemptDelivery = (deliveryId) => runAsPlatform(async () => {
  const locked = await prisma.webhookDelivery.updateMany({ where: { id: deliveryId, status: 'PENDING' }, data: { status: 'SENDING' } });
  if (locked.count === 0) return null;
  const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
  if (!d.webhook?.isActive) return prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'FAILED', lastError: 'Webhook kapalı veya silinmiş' } });

  const { status, error } = await post(d.webhook, d.event, d.body);
  const attempts = d.attempts + 1;
  const now = new Date();
  await prisma.webhook.update({ where: { id: d.webhookId }, data: { lastStatus: status, lastError: error, lastAt: now } }).catch(() => {});
  return prisma.webhookDelivery.update({
    where: { id: d.id },
    data: error
      ? { status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING', attempts, lastStatusCode: status, lastError: String(error).slice(0, 300), nextAttemptAt: new Date(now.getTime() + (BACKOFF_MS[attempts - 1] || 0)) }
      : { status: 'SUCCESS', attempts, lastStatusCode: status, lastError: null, deliveredAt: now }
  });
});

const enqueue = (hook, event, payload) => runAsPlatform(() => prisma.webhookDelivery.create({
  data: { tenantId: hook.tenantId, webhookId: hook.id, event, body: JSON.stringify({ event, createdAt: new Date().toISOString(), data: payload }) }
}));

/**
 * Olayı firmanın aboneliği olan webhook'larına gönderir: kayıt oluşturulur ve hemen denenir;
 * başarısız olanlar zamanlanmış iş tarafından yeniden denenir. Asıl işlemi bekletmez.
 */
export const emitEvent = (tenantId, event, payload) => {
  runAsPlatform(() => prisma.webhook.findMany({ where: { tenantId, isActive: true } }))
    .then((hooks) => Promise.all(hooks
      .filter((h) => Array.isArray(h.events) && (h.events.includes(event) || h.events.includes('*')))
      .map((h) => enqueue(h, event, payload).then((d) => attemptDelivery(d.id)))))
    .catch((err) => console.error('[Webhook]', event, err.message));
};

// Bağlantı testi: kuyruğa girmez, sonucu hemen döner
export const sendTestEvent = async (hook) => {
  const body = JSON.stringify({ event: 'test.ping', createdAt: new Date().toISOString(), data: { message: 'Bağlantı testi başarılı.' } });
  const result = await post(hook, 'test.ping', body);
  await runAsPlatform(() => prisma.webhook.update({ where: { id: hook.id }, data: { lastStatus: result.status, lastError: result.error, lastAt: new Date() } })).catch(() => {});
  return result;
};

// Elle yeniden gönder (başarısız ya da başarılı fark etmez; aynı gövde)
export const redeliver = (deliveryId) => runAsPlatform(async () => {
  await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
  return attemptDelivery(deliveryId);
});

/** Zamanlanmış iş: zamanı gelen yeniden denemeler; takılı kalan (SENDING) kayıtları geri alır; 30 günden eskileri siler */
export const processWebhookQueue = () => runAsPlatform(async () => {
  await prisma.webhookDelivery.updateMany({ where: { status: 'SENDING', createdAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: 'PENDING' } });
  const due = await prisma.webhookDelivery.findMany({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } }, select: { id: true }, orderBy: { nextAttemptAt: 'asc' }, take: 100 });
  for (const d of due) await attemptDelivery(d.id).catch((err) => console.error('[Webhook kuyruğu]', d.id, err.message));
  await prisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
});
