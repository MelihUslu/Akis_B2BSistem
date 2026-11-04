// UAT-09 Ürün: yönetici yeni ürün ekler → bayi katalogda kendi iskontolu fiyatı ve stokla görür.
import { test, expect, money, field } from '../fixtures.mjs';
import { DEALERS } from '../data.mjs';

const NEW = { name: 'Elmas Kesici Disk 115 mm', sku: 'UAT-YENI-DISK', price: 800, stock: 25 };

test('yönetici ürün ekler, bayi katalogda görür', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/products');
  await page.getByRole('button', { name: /Yeni ürün/ }).click();
  await expect(page.getByRole('heading', { name: 'Yeni Ürün' })).toBeVisible();

  await field(page, 'Ürün Adı').fill(NEW.name);
  await field(page, 'Stok Kodu (SKU)').fill(NEW.sku);
  await field(page, 'Kategori').selectOption({ label: 'El Aletleri' });
  await page.getByRole('button', { name: /Fiyat & Stok/ }).click();
  await field(page, 'Liste Fiyatı (KDV hariç)').fill(String(NEW.price));
  await field(page, 'Mevcut Stok').fill(String(NEW.stock));
  await page.getByRole('button', { name: /Ürünü oluştur/ }).click();
  await expect(page.getByRole('heading', { name: 'Yeni Ürün' })).toBeHidden();

  await page.getByPlaceholder('Ürün adı veya SKU ara...').fill(NEW.sku);
  await expect(page.getByRole('row').filter({ hasText: NEW.sku })).toContainText(`${NEW.stock} Adet`);

  // %10 iskontolu bayi
  const dealer = await as('siparis');
  await dealer.goto('/bayi');
  await dealer.getByPlaceholder('Ürün adı, SKU, barkod veya marka ile ara').fill(NEW.sku);
  await expect(dealer.getByText(NEW.name)).toBeVisible();
  await expect(dealer.getByText(money(NEW.price * (1 - DEALERS.siparis.netDiscount / 100)), { exact: true })).toBeVisible();
  await expect(dealer.getByText(`${NEW.stock} adet`)).toBeVisible();
});
