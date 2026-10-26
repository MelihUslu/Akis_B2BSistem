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

const deliver = async (hook, event, payload, attempt = 1) => {
  const body = JSON.stringify({ event, createdAt: new Date().toISOString(), data: payload });
  let status = null;
  let error = null;
  try {
    const invalid = await validateWebhookUrl(hook.url);
    if (invalid) throw new Error(invalid);
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
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err.message;
  }

  await runAsPlatform(() => prisma.webhook.update({
    where: { id: hook.id },
    data: { lastStatus: status, lastError: error, lastAt: new Date() }
  })).catch(() => {});

  // Başarısızsa 30 sn ve 5 dk sonra tekrar dene
  if (error && attempt < 3) {
    setTimeout(() => deliver(hook, event, payload, attempt + 1), attempt === 1 ? 30_000 : 300_000).unref();
  }
  return { status, error };
};

/**
 * Olayı firmanın aboneliği olan webhook'larına gönderir. İşlemi bekletmez, hatalar loglanır.
 */
export const emitEvent = (tenantId, event, payload) => {
  runAsPlatform(() => prisma.webhook.findMany({ where: { tenantId, isActive: true } }))
    .then(hooks => hooks
      .filter(h => Array.isArray(h.events) && (h.events.includes(event) || h.events.includes('*')))
      .forEach(h => deliver(h, event, payload)))
    .catch(err => console.error('[Webhook]', event, err.message));
};

export const sendTestEvent = (hook) => deliver(hook, 'test.ping', { message: 'Bağlantı testi başarılı.' }, 3);
