// UAT-13 Yönetici bayi adına sipariş (telefonla / WhatsApp'tan gelen sipariş): bayi seçilir, portal o bayinin
// fiyatlarıyla açılır, sipariş girilir; moddan çıkınca yönetim paneline dönülür.
import { test, expect, confirm, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS, ADMIN } from '../data.mjs';

const D = DEALERS.adina;
const P = PRODUCTS.adina;

test('yönetici telefonla gelen siparişi bayi adına girer', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/orders');
  await page.getByRole('button', { name: 'Bayi adına sipariş' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bayi adına sipariş' });
  await dialog.getByPlaceholder('Unvan veya vergi no ara').fill('Telefonla');
  await dialog.getByRole('button', { name: new RegExp(D.company) }).click();

  await expect(page).toHaveURL(/\/bayi$/);
  const banner = page.getByRole('status').first();
  await expect(banner).toContainText(`${D.company} adına işlem yapıyorsunuz`);
  await expect(banner).toContainText('yönetici modu');
  await addFromCatalog(page, P.sku, 5);
  await goToCheckout(page);
  const id = await placeOrder(page);
  await confirm(page, 'Siparişe Git');

  await page.getByRole('button', { name: 'Moddan çık' }).click();
  await expect(page).toHaveURL(/\/admin\/orders$/);
  await expect(orderRow(page, id)).toContainText(D.company);

  const dealer = await as('adina');
  await dealer.goto(`/bayi/orders/${id}`);
  await expect(dealer.getByText(`${ADMIN.name} (firma yetkilisi, sizin adınıza)`)).toBeVisible();
});
