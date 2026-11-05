import { acquireSlot } from '../utils/redis.js';

/**
 * Ağır işler için firma başına eşzamanlılık sınırı (Excel dışa aktarımları, dönemsel rapor, tüm veri dışa aktarımı).
 * Bir firma aynı anda en fazla HEAVY_PER_TENANT (varsayılan 2) ağır iş çalıştırır; fazlası 429 alır. Böylece bir firma
 * birçok sekmeden art arda dışa aktarım başlatıp sunucu ve veritabanı işlemcisini doldurarak diğer firmaları
 * yavaşlatamaz ("gürültülü komşu" yük testi, 5 Kasım 2026). Sınır tüm sunucu süreçleri arasında Redis ile tutulur.
 */
const LIMIT = Math.max(1, parseInt(process.env.HEAVY_PER_TENANT) || 2);
const TTL_MS = 10 * 60 * 1000;

export const heavyLimit = async (req, res, next) => {
  // Bayi kendi siparişlerini dışa aktarırken firma payını değil kendi payını kullanır (yöneticiyi bekletmez)
  const scope = req.user?.role === 'BAYI' ? `${req.tenant?.id}:c${req.user.companyId}` : `${req.tenant?.id ?? 'platform'}`;
  const release = await acquireSlot(`heavy:${scope}`, LIMIT, TTL_MS).catch(() => () => {}); // Redis hatasında işi engelleme
  if (!release) {
    return res.status(429).set('Retry-After', '30').json({ message: 'Aynı anda çok fazla rapor / dışa aktarım hazırlanıyor. Biri bitince tekrar deneyin.' });
  }
  res.on('finish', release);
  res.on('close', release);
  next();
};
