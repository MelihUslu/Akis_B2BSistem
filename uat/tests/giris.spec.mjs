// UAT-01 Giriş ve yetki: doğru kullanıcı doğru panele düşer, yanlış şifre ve başka firmanın kullanıcısı giremez.
import { test, expect } from '../fixtures.mjs';
import { PASSWORD, ADMIN, DEALERS, OTHER_DEALER } from '../data.mjs';

const login = async (page, email, password = PASSWORD) => {
  await page.goto('/login');
  await page.getByPlaceholder('ornek@sirket.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
};

test('yanlış şifreyle giriş yapılamaz, hata mesajı görünür', async ({ page }) => {
  await login(page, DEALERS.siparis.email, 'yanlis-sifre');
  await expect(page.getByText('Geçersiz e-posta veya şifre.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('bayi girişte kataloğa düşer, yönetici paneline giremez', async ({ page }) => {
  await login(page, DEALERS.siparis.email);
  await expect(page).toHaveURL(/\/bayi$/);
  await expect(page.getByRole('heading', { name: 'Katalog' })).toBeVisible();
  await expect(page.getByText(DEALERS.siparis.company).first()).toBeVisible();

  await page.goto('/admin/orders');
  await expect(page).not.toHaveURL(/\/admin/);
});

test('yönetici girişte yönetim paneline düşer', async ({ page }) => {
  await login(page, ADMIN.email);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText(ADMIN.name).first()).toBeVisible();
});

test('başka firmanın bayisi bu firmanın adresinden giriş yapamaz', async ({ page }) => {
  await login(page, OTHER_DEALER.email);
  await expect(page.getByText('Geçersiz e-posta veya şifre.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('çıkış yapan bayi korunan sayfaları açamaz', async ({ as }) => {
  const page = await as('siparis');
  await page.goto('/bayi/orders');
  await expect(page.getByRole('heading', { name: 'Sipariş Geçmişim' })).toBeVisible();
  await page.getByRole('button', { name: `${DEALERS.siparis.company} Yetkilisi` }).click();
  await page.getByRole('menuitem', { name: 'Çıkış Yap' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/bayi/orders');
  await expect(page).toHaveURL(/\/login$/);
});
