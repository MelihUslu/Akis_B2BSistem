/**
 * Süreç içi kısa süreli önbellek (rapor, panel gibi ağır ve herkese aynı sonuçlar için).
 * - Aynı anahtar için eşzamanlı istekler tek hesabı bekler (1000 yönetici aynı anda panel açsa hesap bir kez yapılır).
 * - Hata önbelleğe alınmaz; süre dolunca ilk istek yeniden hesaplar.
 * - Anahtar mutlaka firma kimliğini içermeli (ör. `sales:${tenantId}:…`).
 * Birden fazla süreçte (cluster) her süreç kendi önbelleğini tutar; süre kısa olduğu için tutarlılık yeterlidir.
 */
const MAX_ENTRIES = 1000;
const store = new Map(); // key -> { at, ttl, promise }

export const cached = (key, ttlMs, compute) => {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.promise;
  const promise = Promise.resolve().then(compute);
  store.set(key, { at: now, ttl: ttlMs, promise });
  promise.catch(() => { if (store.get(key)?.promise === promise) store.delete(key); });
  if (store.size > MAX_ENTRIES) {
    // En eski kayıtları at (Map ekleme sırasını korur)
    for (const k of store.keys()) { store.delete(k); if (store.size <= MAX_ENTRIES * 0.9) break; }
  }
  return promise;
};

// Bir firmanın önbelleğini (ya da önekle eşleşenleri) temizler: veri değişince taze sonuç için
export const invalidate = (prefix) => {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
};
