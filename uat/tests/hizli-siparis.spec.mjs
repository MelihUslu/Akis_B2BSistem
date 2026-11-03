// UAT-06 Hızlı Sipariş: Excel'den yapıştırılan SKU listesi. Stoktakiler sepete eklenir; stokta olmayan işaretlenir ve
// eklenmez (teklif istenebilir); bulunamayan kod bildirilir.
import { test, expect, alertBox } from '../fixtures.mjs';
import { PRODUCTS } from '../data.mjs';

const A = PRODUCTS.hizli1, B = PRODUCTS.hizli2, OUT = PRODUCTS.tukendi;
const UNKNOWN = 'UAT-YOK-BOYLE';

test('yapıştırılan listeden stoktakiler sepete eklenir, stokta olmayan ve bulunamayan ayrılır', async ({ as }) => {
  const page = await as('hizli');
  await page.goto('/bayi/quick-order');
  await page.getByPlaceholder(/AK-18-MATKAP\t10/).fill([`${A.sku}\t3`, `${B.sku}\t6`, `${OUT.sku}\t2`, `${UNKNOWN}\t1`].join('\n'));
  await page.getByRole('button', { name: 'Listeye Aktar' }).click();
  await page.getByRole('button', { name: 'Ürünleri Getir' }).click();

  await expect(page.getByText('Bulunan Ürünler (3)')).toBeVisible();
  await expect(page.getByText(`Bulunamayan kodlar: ${UNKNOWN}`)).toBeVisible();
  await expect(page.getByText('Stokta yok · sepete eklenmez')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Stokta olmayanlar için teklif iste (1)' })).toBeVisible();

  await page.getByRole('button', { name: 'Sepete Ekle (2)' }).click();
  await expect(alertBox(page)).toContainText('Bazı ürünler sepete eklenmedi');
  await expect(alertBox(page)).toContainText('1 ürün stokta yok');
  await alertBox(page).getByRole('button', { name: 'Tamam' }).click();

  // Sepet: yalnızca stoktaki iki ürün, girilen miktarlarla
  const cart = page.getByRole('dialog', { name: 'Sepetim' });
  await expect(cart).toContainText(`SKU: ${A.sku}`);
  await expect(cart).toContainText(`SKU: ${B.sku}`);
  await expect(cart).not.toContainText(OUT.sku);
  await expect(page.getByRole('button', { name: 'Sepetim' })).toContainText(String(3 + 6)); // rozet: toplam adet
});
