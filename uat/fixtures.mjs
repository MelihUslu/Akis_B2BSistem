// Senaryoların ortak parçaları: rol ile sayfa açma, pencere / alan bulma, tutar biçimi, katalogdan sepete ekleme.
import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'url';

const authFile = (key) => fileURLToPath(new URL(`./.data/auth/${key}.json`, import.meta.url));

export const test = base.extend({
  // const admin = await as('admin'); const bayi = await as('siparis') → her biri kendi oturumuyla ayrı tarayıcı bağlamı
  as: async ({ browser }, use) => {
    const contexts = [];
    await use(async (key, options = {}) => {
      const context = await browser.newContext({ storageState: authFile(key), ...options });
      contexts.push(context);
      return context.newPage();
    });
    for (const c of contexts) await c.close();
  }
});
export { expect };

// Uygulamadaki tutar biçimi: ₺3.240,00
export const money = (n) => `₺${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const withVat = (n) => Math.round(n * 1.2 * 100) / 100;

// Yan menü: geniş ekranın (lg, 1024 px) altında gizli, önce "Menü" düğmesiyle açılır (masaüstünde bir şey yapmaz)
export const openMenu = async (page) => {
  if (page.viewportSize().width < 1024) await page.getByRole('button', { name: 'Menü', exact: true }).click();
};

// Onay / bilgi penceresi (CustomAlert)
export const alertBox = (page) => page.getByRole('alertdialog');
export const confirm = (page, button) => alertBox(page).getByRole('button', { name: button, exact: true }).click();

// Etiketi verilen form alanı (etiket ile alan aynı kapta, etiketin hemen ardında)
export const field = (scope, label) => scope
  .locator(`xpath=.//label[starts-with(normalize-space(.), ${JSON.stringify(label)})]/following-sibling::*[1]`)
  .locator('xpath=descendant-or-self::*[self::input or self::select or self::textarea]').first();

// Katalogda SKU ile arar, miktarı girer ve sepete ekler
export const addFromCatalog = async (page, sku, qty) => {
  if (!page.url().endsWith('/bayi')) await page.goto('/bayi');
  const search = page.getByPlaceholder('Ürün adı, SKU, barkod veya marka ile ara');
  await search.fill(sku);
  await expect(page.getByText('1 ürün', { exact: true })).toBeVisible();
  await expect(page.getByText(`· ${sku}`)).toBeVisible(); // kartta "Marka · SKU"
  const qtyInput = page.getByLabel('Miktar', { exact: true });
  await qtyInput.fill(String(qty));
  // Telefonda miktar girilince açılan alt çubuk (sticky) kartın düğmesini örtebilir; kullanıcı gibi sayfa sona kaydırılır
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.getByRole('button', { name: 'Ekle', exact: true }).click();
  await expect(page.getByText(`Sepette ${qty}`, { exact: false })).toBeVisible();
};

// Sepeti açar ve ödeme sayfasına geçer
export const goToCheckout = async (page) => {
  await page.getByRole('button', { name: /Sepete git/ }).click();
  await page.getByRole('button', { name: /Siparişi tamamla/ }).click();
  await expect(page).toHaveURL(/\/bayi\/checkout$/);
};

// Ödeme sayfasında siparişi verir, sipariş numarasını döner
export const placeOrder = async (page) => {
  const submit = page.getByRole('button', { name: /Siparişi onayla/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  const box = alertBox(page);
  await expect(box).toContainText('Sipariş Oluşturuldu');
  const id = Number((await box.textContent()).match(/#AK-(\d+)/)[1]);
  return id;
};

// Yönetici: sipariş listesinde satır (numara tam eşleşir: #AK-1 ile #AK-11 karışmaz)
// Sipariş satırı: masaüstünde tablo satırı, telefonda kart (aynı bilgi ve düğmeler; görünmeyen düzen elenir)
export const orderRow = (page, id) => page.locator('tr, li').filter({ visible: true }).filter({ has: page.getByText(`#AK-${id}`, { exact: true }) });
