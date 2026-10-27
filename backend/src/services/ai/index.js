import { redisReady } from '../../utils/redis.js';

/**
 * Yapay zekâ sağlayıcısı (yalnızca sunucu tarafında; anahtar istemciye hiç gönderilmez).
 *
 * Ortam değişkenleri:
 *   AI_PROVIDER     anthropic (varsayılan) | mock (yalnızca geliştirme / test ortamında, örnek yanıt üretir)
 *   AI_API_KEY      sağlayıcının API anahtarı (anthropic için ANTHROPIC_API_KEY de okunur)
 *   AI_MODEL        varsayılan: claude-opus-5-5
 *   AI_EFFORT       low | medium | high (varsayılan: medium)
 *   AI_TIMEOUT_MS   tek istek için bekleme süresi (varsayılan: 60000)
 *   AI_DAILY_LIMIT  firma başına günlük taslak sayısı (varsayılan: 200, 0 = sınırsız)
 *
 * Yeni bir sağlayıcı, generateJson({ task, system, prompt, input, schema }) → nesne döndüren bir modülle eklenir.
 */

export class AiError extends Error {
  constructor(code, detail) {
    super(AI_ERRORS[code]?.message || AI_ERRORS.UNAVAILABLE.message);
    this.code = code;
    this.status = AI_ERRORS[code]?.status || 502;
    this.detail = detail;
  }
}

const MANUAL = 'Teklifi manuel olarak hazırlamaya devam edebilirsiniz.';
export const AI_ERRORS = {
  NOT_CONFIGURED: { status: 503, message: `Yapay zekâ hizmeti yapılandırılmamış (sunucuda AI_API_KEY tanımlı değil). ${MANUAL}` },
  AUTH: { status: 503, message: `Yapay zekâ API anahtarı geçersiz veya yetkisiz. ${MANUAL}` },
  QUOTA: { status: 429, message: `Bugünkü yapay zekâ kullanım limitine ulaşıldı. ${MANUAL}` },
  RATE_LIMIT: { status: 429, message: `Yapay zekâ hizmeti şu an yoğun (sağlayıcı kullanım limiti). Biraz sonra tekrar deneyin. ${MANUAL}` },
  TIMEOUT: { status: 504, message: `Yapay zekâ zamanında yanıt vermedi. Tekrar deneyin. ${MANUAL}` },
  INVALID_RESPONSE: { status: 502, message: `Yapay zekâ yanıtı doğrulanamadı. Tekrar deneyin. ${MANUAL}` },
  REFUSAL: { status: 422, message: `Yapay zekâ bu talebi işlemedi. Talebi sadeleştirip tekrar deneyin. ${MANUAL}` },
  UNAVAILABLE: { status: 502, message: `Yapay zekâ hizmetine şu an ulaşılamıyor. ${MANUAL}` }
};

const isProduction = () => process.env.NODE_ENV === 'production';
const apiKey = () => process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const providerName = () => (process.env.AI_PROVIDER || 'anthropic').trim().toLowerCase();

// Ekranda gösterilecek durum (anahtar veya ayrıntı içermez)
export const aiStatus = () => {
  const name = providerName();
  if (name === 'mock') {
    return isProduction()
      ? { enabled: false, provider: name, reason: 'Örnek (mock) yapay zekâ canlı ortamda kullanılamaz. Sunucuda AI_PROVIDER ve AI_API_KEY tanımlayın.' }
      : { enabled: true, provider: name, mock: true, reason: 'Geliştirme modu: yanıtlar gerçek yapay zekâ değil, örnek eşleştirmedir.' };
  }
  if (name !== 'anthropic') return { enabled: false, provider: name, reason: `Desteklenmeyen yapay zekâ sağlayıcısı: ${name}.` };
  if (!apiKey()) return { enabled: false, provider: name, reason: 'Yapay zekâ yapılandırılmamış: sunucuda AI_API_KEY tanımlı değil.' };
  return { enabled: true, provider: name, model: process.env.AI_MODEL || 'claude-opus-5-5' };
};

let cached = null;
export const getAiProvider = async () => {
  const status = aiStatus();
  if (!status.enabled) throw new AiError('NOT_CONFIGURED', status.reason);
  const key = `${status.provider}:${status.model || ''}`;
  if (cached?.key === key) return cached.provider;
  const mod = status.mock ? await import('./mockProvider.js') : await import('./anthropicProvider.js');
  const provider = mod.createProvider({ apiKey: apiKey() });
  cached = { key, provider };
  return provider;
};

// Testler için sağlayıcıyı değiştirme
export const setAiProviderForTests = (provider) => { cached = provider ? { key: `${aiStatus().provider}:${aiStatus().model || ''}`, provider } : null; };

// Firma başına günlük sınır (Redis varsa sunucular arasında ortak sayaç)
const memoryCounts = new Map();
export const consumeAiQuota = async (tenantId) => {
  const limit = parseInt(process.env.AI_DAILY_LIMIT ?? '200', 10);
  if (!Number.isFinite(limit) || limit <= 0) return;
  const key = `ai:${tenantId}:${new Date().toISOString().slice(0, 10)}`;
  let count;
  const redis = redisReady();
  if (redis) {
    try {
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 26 * 60 * 60);
    } catch { count = undefined; }
  }
  if (count === undefined) {
    for (const k of memoryCounts.keys()) if (!k.endsWith(key.slice(-10))) memoryCounts.delete(k);
    count = (memoryCounts.get(key) || 0) + 1;
    memoryCounts.set(key, count);
  }
  if (count > limit) throw new AiError('QUOTA');
};
