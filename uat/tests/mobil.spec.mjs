// UAT-08 Telefon: bayi telefonda katalogdan sipariş verir; sayfalar yana taşmaz (yatay kaydırma yok).
import { test, expect, addFromCatalog, goToCheckout, placeOrder } from '../fixtures.mjs';
import { PRODUCTS } from '../data.mjs';

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('bayi telefonda sipariş verir', async ({ as }) => {
  const page = await as('mobil', PHONE);
  await page.goto('/bayi');
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);

  await addFromCatalog(page, PRODUCTS.mobil.sku, 2);
  await goToCheckout(page);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  await placeOrder(page);
});

for (const path of ['/bayi/quick-order', '/bayi/orders', '/bayi/quotes', '/bayi/finance', '/bayi/profile']) {
  test(`telefonda ${path} yana taşmaz`, async ({ as }) => {
    const page = await as('mobil', PHONE);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  });
}
