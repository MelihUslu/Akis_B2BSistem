// UAT-05 Stokta olmayan ürün için teklif: bayi katalogdan teklif ister → yönetici fiyatlayıp gönderir →
// bayi teklifi onaylar → sipariş oluşur ve yöneticinin onayına düşer.
import { test, expect, money, withVat, alertBox, confirm, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const D = DEALERS.teklif;
const P = PRODUCTS.tukendi;
const QTY = 5;
const TOTAL = withVat(P.price * QTY);
const NOTE = 'UAT: iki hafta içinde lazım';
let orderId;

test('bayi stokta olmayan ürün için katalogdan teklif ister', async ({ as }) => {
  const page = await as('teklif');
  await page.goto('/bayi');
  await page.getByPlaceholder('Ürün adı, SKU, barkod veya marka ile ara').fill(P.sku);
  await expect(page.getByText('Tükendi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ekle', exact: true })).toHaveCount(0); // sepete eklenemez
  await page.getByRole('button', { name: 'Teklif iste', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Teklif İste' });
  await expect(dialog).toContainText(P.name);
  await expect(dialog).toContainText('Stokta yok · tedarik için teklif');
  await dialog.getByLabel('Miktar').fill(String(QTY));
  await dialog.getByPlaceholder('Teslim tarihi, toplu alım planı vb.').fill(NOTE);
  await dialog.getByRole('button', { name: 'Talebi Gönder' }).click();
  await expect(alertBox(page)).toContainText('Teklif Talebi Gönderildi');

  await page.goto('/bayi/quotes');
  await expect(page.getByText('Hazırlanıyor').first()).toBeVisible();
});

test('yönetici talebi açar, fiyatlar ve bayiye gönderir', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/quotes');
  const row = page.getByRole('button').filter({ hasText: D.company });
  await expect(row).toContainText('Bayi teklif talebi');
  await expect(row).toContainText('Fiyat Bekleniyor');
  await row.click();

  await expect(page.getByText(P.name).first()).toBeVisible();
  await expect(page.getByText(NOTE).first()).toBeVisible();
  await expect(page.getByText(money(TOTAL)).first()).toBeVisible(); // katalog fiyatıyla hesaplandı
  await page.getByRole('button', { name: 'Gönder', exact: true }).click();
  await expect(alertBox(page)).toContainText('Teklif müşteriye gönderilsin mi?');
  await confirm(page, 'Gönder');
  await expect(alertBox(page)).toContainText('Teklif Gönderildi');
});

test('bayi teklifi onaylar; sipariş oluşur ve yöneticinin onayına düşer', async ({ as }) => {
  const page = await as('teklif');
  await page.goto('/bayi/quotes');
  await page.getByRole('button').filter({ hasText: 'Gönderildi' }).click();
  await expect(page.getByText(money(TOTAL)).first()).toBeVisible();
  await page.getByRole('button', { name: 'Onayla ve Sipariş Ver' }).click();
  await expect(alertBox(page)).toContainText('Teklifi onaylıyor musunuz?');
  await confirm(page, 'Siparişe Dönüştür');
  await expect(alertBox(page)).toContainText('Sipariş Oluşturuldu');
  await confirm(page, 'Siparişe Git');
  await expect(page).toHaveURL(/\/bayi\/orders\/\d+$/);
  orderId = Number(page.url().match(/(\d+)$/)[1]);
  await expect(page.getByText('Onay Bekliyor').first()).toBeVisible();

  const admin = await as('admin');
  await admin.goto('/admin/orders');
  await expect(orderRow(admin, orderId)).toContainText(D.company);
  await expect(orderRow(admin, orderId)).toContainText(money(TOTAL));
  await admin.goto('/admin/quotes');
  await expect(admin.getByRole('button').filter({ hasText: D.company })).toContainText('Kabul Edildi');
});
