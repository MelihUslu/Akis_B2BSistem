import crypto from 'crypto';
import dns from 'dns/promises';
import http from 'http';
import https from 'https';
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

// Bildirim gönderilmeyecek adres blokları: özel ağ, geri döngü, bağlantı yerel, paylaşımlı (CGNAT), çoklu yayın,
// belgeleme / deneme aralıkları; IPv6'da ayrıca IPv4 eşlemeli / uyumlu (::ffff:10.0.0.1 gibi) ve NAT64 / 6to4 biçimleri
// (IPv4 ve IPv6 ayrı listede: tek listede ::ffff:0:0/96 kuralı bütün IPv4 adreslerini de eşlerdi)
const BLOCKED_V4 = new net.BlockList();
const BLOCKED_V6 = new net.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) BLOCKED_V4.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 96], ['::ffff:0:0', 96], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]]) BLOCKED_V6.addSubnet(a, p, 'ipv6');

export const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) return BLOCKED_V4.check(ip, 'ipv4');
  if (net.isIPv6(ip)) return BLOCKED_V6.check(ip, 'ipv6');
  return true;
};

// Canlı ortamda bağlanırken çözülen adres de denetlenir: doğrulama ile istek arasında DNS kaydı iç ağa çevrilse
// (DNS rebinding) bağlantı kurulmaz. Adresi doğrudan IP olan istekler validateWebhookUrl'de denetlenir.
const strictMode = () => process.env.NODE_ENV === 'production';
export const guardedLookup = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true, family: options?.family || 0 }).then((addresses) => {
    if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
      return callback(Object.assign(new Error('İç ağ adreslerine bildirim gönderilemez.'), { code: 'EPRIVATEADDR' }));
    }
    if (options?.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  }, callback);
};

/**
 * Webhook adresi doğrulaması. Canlı ortamda sadece https ve dışarıdaki adreslere izin verilir
 * (iç ağa / sunucunun kendisine istek attırılmasını önler).
 */
export const validateWebhookUrl = async (raw) => {
  let url;
  try { url = new URL(raw); } catch { return 'Geçerli bir adres girin (https://...).'; }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Adres http(s) ile başlamalıdır.';
  if (url.username || url.password) return 'Adreste kullanıcı adı / parola olamaz.';
  if (!strictMode()) return null;
  if (url.protocol !== 'https:') return 'Canlı ortamda sadece https adreslere bildirim gönderilir.';
  try {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
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

// Tek HTTP denemesi: yönlendirme izlenmez, 8 sn sınırı, yanıt gövdesi okunmaz
const TIMEOUT_MS = 8000;
const postOnce = (rawUrl, headers, body) => new Promise((resolve, reject) => {
  const url = new URL(rawUrl);
  const req = (url.protocol === 'https:' ? https : http).request(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    lookup: strictMode() ? guardedLookup : undefined
  }, (res) => {
    clearTimeout(timer);
    resolve(res.statusCode);
    res.destroy();
  });
  const timer = setTimeout(() => req.destroy(new Error(`Zaman aşımı (${TIMEOUT_MS / 1000} sn)`)), TIMEOUT_MS);
  req.on('error', (err) => { clearTimeout(timer); reject(err); });
  req.end(body);
});

const post = async (hook, event, body) => {
  const invalid = await validateWebhookUrl(hook.url);
  if (invalid) return { status: null, error: invalid };
  try {
    const status = await postOnce(hook.url, {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Signature': signPayload(hook.secret, body),
      'User-Agent': 'AkisB2B-Webhook/1.0'
    }, body);
    return { status, error: status >= 200 && status < 300 ? null : `HTTP ${status}` };
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
