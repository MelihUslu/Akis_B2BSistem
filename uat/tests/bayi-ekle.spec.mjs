// UAT-10 Bayi açma: yönetici yeni bayi oluşturur → bayi verilen şifreyle girer, kendi iskontosunu görür.
import { test, expect, alertBox, confirm, field } from '../fixtures.mjs';

const NEW = { company: 'Yeni Bayi Hırdavat Ltd.', tax: '5550001112', email: 'yeni-bayi@uat.test', password: 'YeniBayi123!', discount: 15 };

test('yönetici bayi açar, bayi giriş yapar', async ({ as, page }) => {
  const admin = await as('admin');
  await admin.goto('/admin/dealers');
  await admin.getByRole('button', { name: /YENİ BAYİ/ }).click();
  await expect(admin.getByRole('heading', { name: 'Yeni Bayi' })).toBeVisible();

  await field(admin, 'Şirket Unvanı').fill(NEW.company);
  await field(admin, 'Vergi No').fill(NEW.tax);
  await field(admin, 'Giriş E-postası').fill(NEW.email);
  await field(admin, 'Geçici Şifre').fill(NEW.password);
  await field(admin, 'Net İskonto').fill(String(NEW.discount));
  await field(admin, 'Risk Limiti').fill('50000');
  await admin.getByRole('button', { name: /BAYİYİ OLUŞTUR/ }).click();
  await expect(alertBox(admin)).toContainText('Bayi Oluşturuldu');
  await confirm(admin, 'Tamam');
  await expect(admin.getByText(NEW.company)).toBeVisible();

  await page.goto('/login');
  await page.getByPlaceholder('ornek@sirket.com').fill(NEW.email);
  await page.getByPlaceholder('••••••••').fill(NEW.password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(page).toHaveURL(/\/bayi$/);
  await expect(page.getByText(`${NEW.company} · Özel İskonto (%${NEW.discount})`)).toBeVisible();
});
