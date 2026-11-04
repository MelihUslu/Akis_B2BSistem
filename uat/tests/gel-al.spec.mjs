// UAT-04 Gel-Al: bayi depodan teslim almayı seçip saat belirler → yönetici onaylar, "hazır" işaretler → bayi
// bildirim alır → teslim edilince sipariş tamamlanır.
import { test, expect, money, withVat, alertBox, confirm, field, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS, PICKUP } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const P = PRODUCTS.gelal;
const QTY = 2;
const TOTAL = withVat(P.price * QTY);
let orderId;

// Yarın 14:30 (Türkiye saati), datetime-local biçiminde
const tomorrowAt = () => {
  const d = new Date(Date.now() + 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  return `${d}T14:30`;
};

test('bayi Gel-Al seçer, teslim alma zamanını belirleyip sipariş verir', async ({ as }) => {
  const page = await as('gelal');
  await page.goto('/bayi');
  await addFromCatalog(page, P.sku, QTY);
  await goToCheckout(page);

  const submit = page.getByRole('button', { name: /Siparişi onayla/ });
  await page.getByRole('button', { name: /Gel-Al/ }).click();
  await expect(page.getByText(PICKUP.address)).toBeVisible();
  await expect(page.getByText(PICKUP.hours)).toBeVisible();
  await expect(page.getByText('Kargo ücreti yok')).toBeVisible();
  await expect(submit).toBeDisabled(); // saat seçilmeden sipariş verilemez
  await expect(page.getByText('Gel-Al için teslim alma tarih ve saatini seçin.')).toBeVisible();

  await field(page, 'Teslim alacağınız tarih ve saat').fill(tomorrowAt());
  await expect(page.getByText(money(TOTAL)).first()).toBeVisible();
  orderId = await placeOrder(page);
});

test('yönetici Gel-Al siparişini onaylar ve teslim almaya hazır işaretler', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/orders');
  const row = orderRow(page, orderId);
  await expect(row).toContainText('Gel-Al');
  await expect(row).toContainText(DEALERS.gelal.company);

  await row.getByRole('button', { name: 'Onayla' }).click();
  await confirm(page, 'Onayla');
  await expect(alertBox(page)).toContainText(`#AK-${orderId} onaylandı.`);
  await confirm(page, 'Tamam');

  await row.getByRole('button', { name: 'Hazır' }).click();
  await expect(alertBox(page)).toContainText('Teslim Almaya Hazır');
  await confirm(page, 'Tamam');
  await expect(row).toContainText('Teslim Almaya Hazır');
});

test('bayi siparişin hazır olduğunu görür ve bildirim alır', async ({ as }) => {
  const page = await as('gelal');
  await page.goto(`/bayi/orders/${orderId}`);
  await expect(page.getByText('Teslim Almaya Hazır').first()).toBeVisible();
  await page.getByTitle('Bildirimler').click();
  await expect(page.getByRole('dialog', { name: 'Bildirimler' })).toContainText(`#AK-${orderId}`);
  await expect(page.getByRole('dialog', { name: 'Bildirimler' })).toContainText(/hazır/i);
});

test('yönetici teslim edildi işaretler; sipariş tamamlanır', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/orders');
  const row = orderRow(page, orderId);
  await row.getByRole('button', { name: 'Teslim' }).click();
  await expect(alertBox(page)).toContainText('Sipariş tamamlandı olarak işaretlendi.');
  await confirm(page, 'Tamam');
  await expect(row).toContainText('Teslim Edildi');

  const dealer = await as('gelal');
  await dealer.goto(`/bayi/orders/${orderId}`);
  await expect(dealer.getByText('Teslim Edildi').first()).toBeVisible();
});
