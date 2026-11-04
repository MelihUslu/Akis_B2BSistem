// UAT-16 Bayi hedefi ve ciro primi: yönetici hedef tanımlar → bayi satışını ve ilerlemesini görür → yönetici dönemi
// kapatır, prim bayinin carisine alacak yazılır.
import { test, expect, money, alertBox, confirm, addFromCatalog, goToCheckout, placeOrder, orderRow } from '../fixtures.mjs';
import { DEALERS, PRODUCTS } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const D = DEALERS.hedef;
const P = PRODUCTS.hedef;
const SALES = P.price * 2;
const BONUS = SALES * 0.05;

test('yönetici bayiye bu ay için hedef tanımlar', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/finance');
  await page.getByRole('button', { name: 'Yeni hedef' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni bayi hedefi' });
  await dialog.getByLabel('Bayi').selectOption({ label: D.company });
  await dialog.getByRole('button', { name: 'Bu ay' }).click();
  await dialog.getByLabel('Hedef ciro').fill('2000');
  await dialog.getByLabel('Ciro primi yüzdesi').fill('5');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(alertBox(page)).toContainText('Hedef kaydedildi');
  await confirm(page, 'Tamam');
  await expect(page.getByRole('listitem').filter({ hasText: D.company })).toContainText('%0');
});

test('bayi sipariş verir; onaydan sonra hedefe ulaştığını görür', async ({ as }) => {
  const page = await as('hedef');
  await page.goto('/bayi');
  await addFromCatalog(page, P.sku, 2);
  await goToCheckout(page);
  const id = await placeOrder(page);

  const admin = await as('admin');
  await admin.goto('/admin/orders');
  await orderRow(admin, id).getByRole('button', { name: 'Onayla' }).click();
  await confirm(admin, 'Onayla');
  await expect(alertBox(admin)).toContainText('onaylandı');

  await page.goto('/bayi/finance');
  await expect(page.getByText('Satış hedefleriniz')).toBeVisible();
  await expect(page.getByText(/Hedefe ulaştınız!/)).toBeVisible();
  await expect(page.getByText('%150')).toBeVisible();
});

test('yönetici dönemi kapatır; prim bayinin carisine alacak yazılır', async ({ as }) => {
  const admin = await as('admin');
  await admin.goto('/admin/finance');
  await admin.getByRole('listitem').filter({ hasText: D.company }).getByRole('button', { name: 'Dönemi kapat' }).click();
  await confirm(admin, 'Primi yaz ve kapat');
  await expect(alertBox(admin)).toContainText(`₺${BONUS.toLocaleString('tr-TR')} prim cariye yazıldı`);

  const page = await as('hedef');
  await page.goto('/bayi/finance');
  await expect(page.getByText(`${money(BONUS)} ciro primi carinize alacak olarak yazıldı.`)).toBeVisible();
  await expect(page.getByText(/Ciro primi: /).first()).toBeVisible(); // ekstrede alacak satırı
});
