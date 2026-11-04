// UAT-12 Plasiyer: yalnızca kendi bayilerini görür, bayi adına sipariş verir; sipariş bayinin fiyatıyla ve plasiyerin
// adıyla kaydedilir, bayiye bildirim gider, yönetici kimin girdiğini görür.
import { test, expect, money, withVat, confirm, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS, PLASIYER } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const D = DEALERS.saha;
const P = PRODUCTS.saha;
const TOTAL = withVat(P.price * (1 - D.netDiscount / 100) * 2);
let orderId;

test('plasiyer yalnızca kendi bayisini görür ve onun adına sipariş verir', async ({ as }) => {
  const page = await as('plasiyer');
  await page.goto('/plasiyer');
  await expect(page.getByRole('heading', { name: 'Bayilerim' })).toBeVisible();
  const cards = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Sipariş ver' }) });
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(D.company);

  await cards.getByRole('button', { name: 'Sipariş ver' }).click();
  await expect(page).toHaveURL(/\/bayi$/);
  await expect(page.getByRole('status').first()).toContainText(`${D.company} adına işlem yapıyorsunuz`);
  await expect(page.getByText(`Özel İskonto (%${D.netDiscount})`)).toBeVisible(); // bayinin iskontosu

  await addFromCatalog(page, P.sku, 2);
  await goToCheckout(page);
  await expect(page.getByText(money(TOTAL)).first()).toBeVisible();
  orderId = await placeOrder(page);
  await confirm(page, 'Siparişe Git');
  await expect(page.getByText('Siparişi giren')).toBeVisible();

  await page.getByRole('button', { name: 'Moddan çık' }).click();
  await expect(page).toHaveURL(/\/plasiyer$/);
});

test('bayi siparişi ve bildirimi görür; yönetici plasiyerin girdiğini görür', async ({ as }) => {
  const dealer = await as('saha');
  await dealer.goto(`/bayi/orders/${orderId}`);
  await expect(dealer.getByText('Onay Bekliyor').first()).toBeVisible();
  await expect(dealer.getByText(`${PLASIYER.name} (plasiyer, sizin adınıza)`)).toBeVisible();
  await dealer.getByTitle('Bildirimler').click();
  await expect(dealer.getByRole('dialog', { name: 'Bildirimler' })).toContainText('Adınıza sipariş oluşturuldu');

  const admin = await as('admin');
  await admin.goto('/admin/orders');
  await orderRow(admin, orderId).click();
  const detail = admin.locator('aside').filter({ hasText: `#AK-${orderId}` });
  await expect(detail).toContainText('Plasiyer (bayi adına)');
  await expect(detail).toContainText(PLASIYER.name);
});
