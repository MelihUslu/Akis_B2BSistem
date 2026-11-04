// UAT-15 Kısmi sevkiyat ve irsaliye: onaylanan siparişin bir kısmı kargoya verilir (kendi takip numarasıyla), kalan
// sonra gönderilir; tamamı gidince "Kargoda" olur. İrsaliye numarası girilir, bayi gönderileri ve irsaliyeyi görür.
import { test, expect, alertBox, confirm, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { PRODUCTS } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const A = { ...PRODUCTS.sevk1, qty: 2 };
const B = { ...PRODUCTS.sevk2, qty: 4 };
let orderId;

const openDetail = async (page) => {
  await page.goto('/admin/orders');
  await orderRow(page, orderId).click();
  return page.locator('aside').filter({ hasText: `#AK-${orderId}` });
};

test('bayi iki kalemli sipariş verir, yönetici onaylar', async ({ as }) => {
  const page = await as('sevk');
  await page.goto('/bayi');
  await addFromCatalog(page, A.sku, A.qty);
  await addFromCatalog(page, B.sku, B.qty);
  await goToCheckout(page);
  orderId = await placeOrder(page);

  const admin = await as('admin');
  await admin.goto('/admin/orders');
  await orderRow(admin, orderId).getByRole('button', { name: 'Onayla' }).click();
  await confirm(admin, 'Onayla');
  await expect(alertBox(admin)).toContainText(`#AK-${orderId} onaylandı.`);
});

test('yönetici bir kısmını gönderir; bayi ilk gönderiyi ve kalanı görür', async ({ as }) => {
  const admin = await as('admin');
  const detail = await openDetail(admin);
  await detail.getByRole('button', { name: /Bir kısmını gönder/ }).click();
  await detail.getByLabel(`${A.name} gönderilecek miktar`).fill('1');
  await detail.getByLabel(`${B.name} gönderilecek miktar`).fill('4');
  await detail.getByLabel('Kargo firması').selectOption('ARAS');
  await detail.getByLabel('Takip numarası').fill('TAKIP-1');
  await detail.getByRole('button', { name: 'Seçilenleri kargoya ver' }).click();
  await expect(alertBox(admin)).toContainText('Gönderi kaydedildi');
  await confirm(admin, 'Tamam');
  await expect(orderRow(admin, orderId)).toContainText('Onaylandı');

  const page = await as('sevk');
  await page.goto(`/bayi/orders/${orderId}`);
  await expect(page.getByText('1. gönderi')).toBeVisible();
  await expect(page.getByText('TAKIP-1')).toBeVisible();
  await expect(page.getByText(`1 / ${A.qty} Adet kargoya verildi; kalanı ayrıca gönderilecek.`)).toBeVisible();
});

test('kalan gönderilince sipariş kargoda olur; irsaliye numarası bayiye görünür', async ({ as }) => {
  const admin = await as('admin');
  let detail = await openDetail(admin);
  await detail.getByLabel('Kargo firması').selectOption('ARAS');
  await detail.getByLabel('Takip numarası').fill('TAKIP-2');
  await detail.getByRole('button', { name: /Kargoya Ver/ }).click();
  await expect(alertBox(admin)).toContainText('Kargoya Verildi');
  await confirm(admin, 'Tamam');
  await expect(orderRow(admin, orderId)).toContainText('Kargoda');

  detail = await openDetail(admin);
  await detail.getByLabel('İrsaliye numarası').fill('IRS-2026-0042');
  await detail.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(alertBox(admin)).toContainText('İrsaliye numarası kaydedildi.');

  const page = await as('sevk');
  await page.goto(`/bayi/orders/${orderId}`);
  await expect(page.getByText('2. gönderi')).toBeVisible();
  await expect(page.getByText('TAKIP-2')).toBeVisible();
  await expect(page.getByText('IRS-2026-0042')).toBeVisible();
});
