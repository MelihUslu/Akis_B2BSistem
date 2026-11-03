// UAT-07 Risk limiti: limiti yetersiz bayi cari hesapla sipariş veremez, uyarı görür; Havale/EFT ile verebilir.
import { test, expect, money, withVat, addFromCatalog, goToCheckout, placeOrder, confirm } from '../fixtures.mjs';
import { DEALERS, PRODUCTS } from '../data.mjs';

const D = DEALERS.limit;
const P = PRODUCTS.limit;
const TOTAL = withVat(P.price);

test('limit yetersizken cari hesapla sipariş engellenir, Havale/EFT ile verilir', async ({ as }) => {
  expect(TOTAL).toBeGreaterThan(D.riskLimit);
  const page = await as('limit');
  await page.goto('/bayi');
  await addFromCatalog(page, P.sku, 1);
  await goToCheckout(page);

  const submit = page.getByRole('button', { name: /SİPARİŞİ ONAYLA/ });
  await expect(page.getByText(`Kullanılabilir limit: ${money(D.riskLimit)}`).first()).toBeVisible();
  await expect(page.getByText(/Risk limitiniz yetersiz/)).toBeVisible();
  await expect(submit).toBeDisabled();

  await page.getByRole('button', { name: /Havale \/ EFT/ }).click();
  await expect(page.getByText(/Risk limitiniz yetersiz/)).toBeHidden();
  const id = await placeOrder(page);
  await confirm(page, 'Siparişe Git');
  await expect(page).toHaveURL(new RegExp(`/bayi/orders/${id}$`));
  await expect(page.getByText('Onay Bekliyor').first()).toBeVisible();
  await expect(page.getByText(money(TOTAL)).first()).toBeVisible();
});
