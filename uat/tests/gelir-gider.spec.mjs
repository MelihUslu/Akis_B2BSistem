// UAT-11 Gelir-Gider: yönetici gider ve gelir kaydeder → listede ve özet kartlarında görünür → silinince kalkar.
import { test, expect, money, alertBox, confirm } from '../fixtures.mjs';

test('gider ve gelir kaydı eklenir, özette görünür, silinir', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/cash');

  const add = async (type, amount, category, description) => {
    await page.getByRole('button', { name: type, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `${type} ekle` });
    await dialog.getByPlaceholder('0,00').fill(amount);
    await dialog.getByPlaceholder('ya da kendiniz yazın').fill(category);
    await dialog.getByPlaceholder(/^Örn\./).fill(description);
    await dialog.getByRole('button', { name: 'Kaydet' }).click();
    await expect(dialog).toBeHidden();
    await expect(alertBox(page)).toContainText(`${type} kaydedildi.`);
    await confirm(page, 'Tamam');
  };

  await add('Gider', '1250,50', 'Kira', 'UAT depo kirası');
  await add('Gelir', '400', 'Hurda satışı', 'UAT eski raf');

  const expense = page.getByRole('listitem').filter({ hasText: 'UAT depo kirası' });
  const income = page.getByRole('listitem').filter({ hasText: 'UAT eski raf' });
  await expect(expense).toContainText(`−${money(1250.5)}`);
  await expect(income).toContainText(`+${money(400)}`);
  await expect(page.getByText(money(1250.5)).first()).toBeVisible();

  await expense.getByRole('button', { name: 'Sil' }).click();
  await expect(alertBox(page)).toContainText('Kayıt silinsin mi?');
  await confirm(page, 'Sil');
  await expect(expense).toHaveCount(0);
  await expect(income).toHaveCount(1);
});
