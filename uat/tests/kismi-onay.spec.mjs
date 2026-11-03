// UAT-03 Kısmi onay: yönetici iki kalemli siparişte bir kalemi iptal eder. Yalnızca onaylanan kalemin stoğu düşer,
// tutarı cariye yazılır; bayi siparişi "Kısmen Onaylandı" görür.
import { test, expect, money, withVat, alertBox, confirm, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const D = DEALERS.kismi;
const KEEP = { ...PRODUCTS.vida, qty: 4 };
const DROP = { ...PRODUCTS.pense, qty: 2 };
const FULL = withVat(KEEP.price * KEEP.qty + DROP.price * DROP.qty);
const APPROVED = withVat(KEEP.price * KEEP.qty);
let orderId;

test('bayi iki kalemli sipariş verir', async ({ as }) => {
  const page = await as('kismi');
  await page.goto('/bayi');
  await addFromCatalog(page, KEEP.sku, KEEP.qty);
  await addFromCatalog(page, DROP.sku, DROP.qty);
  await goToCheckout(page);
  await expect(page.getByText(money(FULL)).first()).toBeVisible();
  orderId = await placeOrder(page);
});

test('yönetici bir kalemi iptal edip kararı kaydeder; yalnızca onaylanan kalemin stoğu düşer', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/orders');
  await orderRow(page, orderId).click();

  const detail = page.locator('aside').filter({ hasText: `#AK-${orderId}` });
  // Kalem satırı: ürün adını ve kalem düğmelerini birlikte içeren en içteki kutu
  const line = (name) => detail.locator('div').filter({ hasText: name }).filter({ has: page.getByTitle('İptal et') }).last();
  await line(DROP.name).getByTitle('İptal et').click();
  await expect(line(DROP.name).getByText(DROP.name)).toHaveClass(/line-through/);

  await detail.getByRole('button', { name: /KARARI KAYDET/ }).click();
  await expect(alertBox(page)).toContainText('1 kalem onaylanacak, 1 kalem iptal edilecek');
  await confirm(page, 'Kaydet');
  await expect(alertBox(page)).toContainText('Sipariş Güncellendi');
  await expect(alertBox(page)).toContainText(`Yeni tutar: ${money(APPROVED)}`);
  await confirm(page, 'Tamam');
  await expect(orderRow(page, orderId)).toContainText('Kısmen Onaylandı');
  await expect(orderRow(page, orderId)).toContainText('1 iptal');

  await page.goto('/admin/products');
  const search = page.getByPlaceholder('Ürün adı veya SKU ara...');
  await search.fill(KEEP.sku);
  await expect(page.getByRole('row').filter({ hasText: KEEP.sku })).toContainText(`${KEEP.stock - KEEP.qty} Adet`);
  await search.fill(DROP.sku);
  await expect(page.getByRole('row').filter({ hasText: DROP.sku })).toContainText(`${DROP.stock} Adet`);
});

test('bayi kısmi onayı görür; cariye yalnızca onaylanan tutar yazılmıştır', async ({ as }) => {
  const page = await as('kismi');
  await page.goto(`/bayi/orders/${orderId}`);
  await expect(page.getByText('Kısmen Onaylandı').first()).toBeVisible();
  await expect(page.getByText(money(APPROVED)).first()).toBeVisible();

  await page.getByTitle('Bildirimler').click();
  await expect(page.getByRole('dialog', { name: 'Bildirimler' })).toContainText('Siparişiniz kısmen onaylandı');

  await page.goto('/bayi/finance');
  await expect(page.getByText('Güncel Bakiyeniz').locator('..')).toContainText(money(APPROVED));
});
