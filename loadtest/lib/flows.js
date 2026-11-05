// Gerçekçi kullanıcı akışları. Yalnızca okuma yapar; POST /orders/quote sepet tutarını hesaplar, kayıt oluşturmaz.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { BASE_URL, headers } from './config.js';

const SEARCH_TERMS = ['vida', 'matkap', 'anahtar', 'bot', 'boya', 'kablo', 'eldiven', 'set'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const think = (min = 1, max = 3) => sleep(min + Math.random() * (max - min));

// tenant: çok firmalı testlerde kullanıcının firması (verilmezse TENANT)
const get = (path, token, kind = 'read', name = path, tenant) =>
  http.get(`${BASE_URL}/api${path}`, { headers: headers(token, tenant), tags: { kind, name } });

// Başarısız istek: durum kodu ve yanıtın başı yazılır (k6 özeti yalnızca sayıyı gösterir)
const ok = (res, label) => {
  const passed = check(res, { [`${label} 200`]: (r) => r.status === 200 });
  if (!passed) console.warn(`[${label}] ${res.request.method} ${res.request.url.replace(BASE_URL, '')} → ${res.status} ${res.error || ''} ${String(res.body || '').slice(0, 160)}`);
  return passed;
};

const items = (res) => {
  try { return res.json('items') || res.json('data') || []; } catch { return []; }
};

// Bayi: kataloğu açar, filtreler, arar, sayfa çevirir, sepet tutarını hesaplatır, siparişlerine bakar
export const dealerJourney = (token, tenant) => {
  let catalog = [];
  group('Bayi · katalog', () => {
    const responses = http.batch([
      ['GET', `${BASE_URL}/api/categories`, null, { headers: headers(token, tenant), tags: { kind: 'read', name: '/categories' } }],
      ['GET', `${BASE_URL}/api/products/filters`, null, { headers: headers(token, tenant), tags: { kind: 'read', name: '/products/filters' } }],
      ['GET', `${BASE_URL}/api/products?page=1&limit=24&sort=default`, null, { headers: headers(token, tenant), tags: { kind: 'read', name: '/products' } }],
      ['GET', `${BASE_URL}/api/settings/portal`, null, { headers: headers(token, tenant), tags: { kind: 'read', name: '/settings/portal' } }]
    ]);
    responses.forEach((r, i) => ok(r, ['kategoriler', 'filtreler', 'katalog', 'portal ayarları'][i]));
    catalog = items(responses[2]);
  });
  think();

  group('Bayi · arama ve sayfalama', () => {
    ok(get(`/products?page=1&limit=24&sort=default&search=${encodeURIComponent(pick(SEARCH_TERMS))}`, token, 'read', '/products?search', tenant), 'arama');
    think(0.5, 1.5);
    ok(get('/products?page=2&limit=24&sort=price_asc', token, 'read', '/products?page', tenant), 'sayfa 2');
    ok(get('/products?page=1&limit=24&inStock=true', token, 'read', '/products?inStock', tenant), 'stoktakiler');
  });
  think();

  // Sepet: stokta, fiyatı görünen, varyantsız 1–3 ürün
  const buyable = catalog.filter((p) => p.inStock && !p.priceHidden && !(p.variants && p.variants.length));
  if (buyable.length) {
    group('Bayi · sepet hesabı', () => {
      const cart = Array.from({ length: Math.min(buyable.length, 1 + Math.floor(Math.random() * 3)) }, () => pick(buyable))
        .map((p) => ({ productId: p.id, quantity: Math.max(p.moq || 1, p.stepQuantity || 1) }));
      const res = http.post(`${BASE_URL}/api/orders/quote`, JSON.stringify({ items: cart }), { headers: headers(token, tenant), tags: { kind: 'compute', name: '/orders/quote' } });
      check(res, { 'sepet hesabı 200': (r) => r.status === 200, 'sepet toplamı var': (r) => typeof r.json('total') === 'number' });
    });
    think();
  }

  group('Bayi · siparişlerim', () => {
    ok(get('/orders', token, 'read', '/orders (bayi)', tenant), 'siparişlerim');
  });
  think(2, 5);
};

// Yönetici: panel, menü rozetleri, sipariş listesi ve sayaçlar, ürün listesi, satış raporu
export const adminJourney = (token, tenant) => {
  group('Yönetici · panel', () => {
    ok(get('/dashboard', token, 'read', '/dashboard', tenant), 'panel');
    ok(get('/dashboard/menu-counts', token, 'read', '/dashboard/menu-counts', tenant), 'menü rozetleri');
  });
  think();
  group('Yönetici · siparişler', () => {
    ok(get('/orders?page=1&limit=20', token, 'read', '/orders (yönetici)', tenant), 'sipariş listesi');
    ok(get('/orders/stats', token, 'read', '/orders/stats', tenant), 'sipariş sayaçları');
  });
  think();
  group('Yönetici · ürünler', () => {
    ok(get('/products?isAdmin=true&page=1&limit=20', token, 'read', '/products (yönetici)', tenant), 'ürün listesi');
  });
  think();
  group('Yönetici · rapor', () => {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 864e5);
    const d = (x) => x.toISOString().slice(0, 10);
    ok(get(`/reports/sales?from=${d(from)}&to=${d(to)}`, token, 'read', '/reports/sales', tenant), 'satış raporu');
  });
  think(3, 6);
};
