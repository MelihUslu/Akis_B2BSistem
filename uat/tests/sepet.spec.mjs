// UAT-17 Sepet: telefonda eklenen ürün bilgisayarda da sepette görünür (sunucuda saklanır); çıkış yapınca sepet
// tarayıcıdan silinir.
import { test, expect, addFromCatalog } from '../fixtures.mjs';
import { DEALERS, PRODUCTS } from '../data.mjs';

const P = PRODUCTS.sepet;
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

test('sepet cihazlar arasında taşınır, çıkışta silinir', async ({ as }) => {
  const phone = await as('sepet', PHONE);
  await phone.goto('/bayi');
  const saved = phone.waitForResponse((r) => r.url().endsWith('/api/cart') && r.request().method() === 'PUT');
  await addFromCatalog(phone, P.sku, 2);
  await saved;

  const desk = await as('sepet');
  await desk.goto('/bayi');
  await expect(desk.getByRole('button', { name: 'Sepetim' })).toContainText('2');
  await desk.getByRole('button', { name: 'Sepetim' }).click();
  await expect(desk.getByRole('dialog', { name: 'Sepetim' })).toContainText(`SKU: ${P.sku}`);
  await desk.getByRole('dialog', { name: 'Sepetim' }).getByRole('button', { name: 'Kapat' }).click();

  await desk.getByRole('button', { name: `${DEALERS.sepet.company} Yetkilisi` }).click();
  await desk.getByRole('menuitem', { name: 'Çıkış Yap' }).click();
  await expect(desk).toHaveURL(/\/login$/);
  const left = await desk.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('akis_cart')));
  expect(left).toEqual([]);
});
