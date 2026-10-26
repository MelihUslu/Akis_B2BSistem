/*
 * Uygulamanın telefona kurulabilmesi ve zayıf bağlantıda açılabilmesi için basit service worker.
 * - API istekleri ve yüklenen dosyalar asla önbelleğe alınmaz (fiyat / stok her zaman günceldir).
 * - Sayfalar: önce ağ, bağlantı yoksa son açılan uygulama kabuğu.
 * - Derlenmiş JS/CSS ve ikonlar: önbellekten, arkada güncellenir.
 */
const CACHE = 'b2b-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return; // API başka adreste; dokunulmaz

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
