// UAT-14 Sipariş notu ve referans no, bayinin iptali: bayi notlu / referanslı sipariş verir, onay beklerken iptal eder;
// stok ayrılmaz, yönetici iptali ve notu görür.
import { test, expect, alertBox, confirm, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { PRODUCTS } from '../data.mjs';

const P = PRODUCTS.iptal;
const REF = 'SAS-2026-118';
const NOTE = 'Pazartesi teslim olsun';

test('bayi notlu sipariş verir ve onay beklerken iptal eder', async ({ as }) => {
  const page = await as('iptal');
  await page.goto('/bayi');
  await addFromCatalog(page, P.sku, 3);
  await goToCheckout(page);
  await page.getByLabel('Sipariş / referans numaranız').fill(REF);
  await page.getByLabel('Not', { exact: true }).fill(NOTE);
  const id = await placeOrder(page);
  await confirm(page, 'Siparişe Git');

  await expect(page.getByText(REF)).toBeVisible();
  await expect(page.getByText(NOTE)).toBeVisible();
  await page.getByRole('button', { name: 'Siparişi iptal et' }).click();
  await expect(alertBox(page)).toContainText('Sipariş iptal edilsin mi?');
  await confirm(page, 'Siparişi iptal et');
  await expect(alertBox(page)).toContainText('Sipariş iptal edildi');
  await confirm(page, 'Tamam');
  await expect(page.getByText('İptal Edildi').first()).toBeVisible();
  await expect(page.getByText('Bu siparişi siz iptal ettiniz')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siparişi iptal et' })).toHaveCount(0);

  const admin = await as('admin');
  await admin.goto('/admin/orders');
  await expect(orderRow(admin, id)).toContainText('İptal');
  await orderRow(admin, id).click();
  const detail = admin.locator('aside').filter({ hasText: `#AK-${id}` });
  await expect(detail).toContainText('Bayi siparişi iptal etti');
  await expect(detail).toContainText(NOTE);
  await expect(detail).toContainText(REF);

  // İptal edilen sipariş stok ayırmaz
  await admin.goto('/admin/products');
  await admin.getByPlaceholder('Ürün adı veya SKU ara...').fill(P.sku);
  const row = admin.getByRole('row').filter({ hasText: P.sku });
  await expect(row).toContainText(`${P.stock} Adet`);
  await expect(row).not.toContainText('ayrıldı');
});
