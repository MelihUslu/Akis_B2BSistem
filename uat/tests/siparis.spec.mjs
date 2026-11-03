// UAT-02 Siparişten tahsilata: bayi sipariş verir → yönetici onaylar → stok düşer, bayiye bildirim gider,
// cariye borç yazılır → yönetici tahsilat alır → borç kapanır.
import { test, expect, money, withVat, alertBox, confirm, field, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const D = DEALERS.siparis;
const P = PRODUCTS.matkap;
const QTY = 3;
const UNIT = P.price * (1 - D.netDiscount / 100); // bayinin net fiyatı
const TOTAL = withVat(UNIT * QTY);
let orderId;

test('bayi kendi iskontolu fiyatını görür ve cari hesapla sipariş verir', async ({ as }) => {
  const page = await as('siparis');
  await page.goto('/bayi');
  await expect(page.getByText(`Özel İskonto (%${D.netDiscount})`)).toBeVisible();

  await page.getByPlaceholder('Ürün adı, SKU, barkod veya marka ile ara').fill(P.sku);
  await expect(page.getByText(money(UNIT), { exact: true })).toBeVisible(); // net fiyat
  await expect(page.getByText(money(P.price), { exact: true })).toBeVisible(); // üstü çizili liste fiyatı

  await addFromCatalog(page, P.sku, QTY);
  await goToCheckout(page);
  await expect(page.getByRole('button', { name: /Cari Hesaptan Öde/ })).toBeVisible();
  await expect(page.getByText(money(TOTAL)).first()).toBeVisible();

  orderId = await placeOrder(page);
  await confirm(page, 'Siparişe Git');
  await expect(page).toHaveURL(new RegExp(`/bayi/orders/${orderId}$`));
  await expect(page.getByText('Onay Bekliyor').first()).toBeVisible();
});

test('yönetici bekleyen siparişi görür ve onaylar; stok düşer', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/orders');
  const row = orderRow(page, orderId);
  await expect(row).toContainText(D.company);
  await expect(row).toContainText(money(TOTAL));
  await expect(row).toContainText('Onay Bekliyor');

  await row.getByRole('button', { name: 'Onayla' }).click();
  await expect(alertBox(page)).toContainText(`#AK-${orderId} onaylansın mı?`);
  await confirm(page, 'Onayla');
  await expect(alertBox(page)).toContainText(`#AK-${orderId} onaylandı.`);

  await page.goto('/admin/products');
  await page.getByPlaceholder('Ürün adı veya SKU ara...').fill(P.sku);
  await expect(page.getByRole('row').filter({ hasText: P.sku })).toContainText(`${P.stock - QTY} Adet`);
});

test('bayi onayı ve bildirimi görür; tutar cari hesabına borç yazılmıştır', async ({ as }) => {
  const page = await as('siparis');
  await page.goto(`/bayi/orders/${orderId}`);
  await expect(page.getByText('Onaylandı').first()).toBeVisible();

  await page.getByTitle('Bildirimler').click();
  const panel = page.getByRole('dialog', { name: 'Bildirimler' });
  await expect(panel).toContainText('Siparişiniz onaylandı');
  await expect(panel).toContainText(`#AK-${orderId} numaralı siparişiniz onaylandı`);

  await page.goto('/bayi/finance');
  const balance = page.getByText('Güncel Bakiyeniz').locator('..');
  await expect(balance).toContainText(money(TOTAL));
  await expect(balance).toContainText('TOPLAM BORÇ TUTARI');
});

test('yönetici tahsilat alır; bayinin borcu kapanır', async ({ as }) => {
  const admin = await as('admin');
  await admin.goto('/admin/partners');
  await admin.getByPlaceholder('Unvan, vergi no, cari kodu, telefon, e-posta veya yetkili ara').fill(D.company);
  await admin.getByRole('button', { name: new RegExp(D.company) }).first().click();
  await expect(admin.getByRole('heading', { name: D.company })).toBeVisible();
  await admin.getByRole('button', { name: 'Tahsilat al' }).click();

  const dialog = admin.getByRole('dialog', { name: `Tahsilat al · ${D.company}` });
  await field(dialog, 'Tutar').fill(String(TOTAL));
  await field(dialog, 'Belge / dekont no').fill('UAT-MAKBUZ-1');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(admin.getByRole('dialog', { name: 'Tahsilat kaydedildi' })).toBeVisible();

  const page = await as('siparis');
  await page.goto('/bayi/finance');
  const balance = page.getByText('Güncel Bakiyeniz').locator('..');
  await expect(balance).toContainText(money(0));
  await expect(balance).toContainText('ALACAKLI DURUMDASINIZ');
});
