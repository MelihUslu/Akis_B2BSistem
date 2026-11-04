// UAT-18 Personel yönetimi: yönetici modülü açar, personel kartı oluşturur → personel izin ve fişli masraf talebi açar
// → yönetici onaylar (onay ödeme sayılmaz) → ödeme kaydedilir, Gelir-Gider'e bir kez yazılır → personel sonucu görür;
// departmana duyuru yalnızca o departmana gider; plasiyer kendi alanını telefonda açar.
import { test, expect, alertBox, confirm } from '../fixtures.mjs';
import { STAFF, PLASIYER } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const EXPENSE = 'Forklift yakıtı';
const item = (page, text) => page.getByRole('listitem').filter({ hasText: text });
const ok = async (page, text) => {
  await expect(alertBox(page)).toContainText(text);
  await confirm(page, 'Tamam');
};

test('yönetici modülü açar, personel kartlarını oluşturur ve departmana duyuru yayınlar', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/settings');
  await page.getByRole('switch', { name: 'Personel yönetimi' }).click();
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await ok(page, 'ayar güncellendi');
  await expect(page.getByRole('button', { name: 'Personel', exact: true })).toBeVisible(); // menü grubu

  await page.goto('/admin/personel');
  for (const [user, department, title, role] of [[STAFF, 'Depo', 'Depo sorumlusu', 'Yönetici paneli'], [PLASIYER, 'Satış', 'Plasiyer', 'Plasiyer']]) {
    await page.getByRole('button', { name: 'Yeni personel' }).click();
    const dialog = page.getByRole('dialog', { name: 'Yeni personel' });
    await dialog.getByLabel('Kullanıcı hesabı').selectOption({ label: `${user.name} · ${user.email} · ${role}` });
    await expect(dialog.getByLabel('Ad soyad')).toHaveValue(user.name); // hesaptan dolar
    await dialog.getByLabel('Departman').fill(department);
    await dialog.getByLabel('Görev').fill(title);
    await dialog.getByRole('button', { name: 'Kaydet' }).click();
    await ok(page, 'Personel kartı oluşturuldu');
    await expect(item(page, user.name)).toContainText(`${title} · ${department}`);
  }

  await page.getByRole('button', { name: 'Duyurular' }).click();
  await page.getByRole('button', { name: 'Yeni duyuru' }).click();
  const dialog = page.getByRole('dialog', { name: 'Yeni duyuru' });
  await dialog.getByLabel('Başlık').fill('Satış toplantısı');
  await dialog.getByLabel('Duyuru metni').fill('Pazartesi 09:00, toplantı salonu.');
  await dialog.getByRole('button', { name: /^Satış/ }).click();
  await dialog.getByRole('button', { name: 'Yayınla' }).click();
  await ok(page, 'Duyuru yayınlandı (1 personel)');
});

test('personel izin ve fişli masraf talebi açar', async ({ as }) => {
  const page = await as(STAFF.key);
  // Yetkisi olmayan ekip üyesi: ana sayfada firma özeti ve arama yok, Personel Alanım bağlantısı var
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Hoş geldiniz, Deniz' })).toBeVisible();
  await expect(page.getByText('Bu Ayki Satış')).toHaveCount(0);
  await expect(page.getByPlaceholder(/Ürün, bayi veya sipariş ara/)).toHaveCount(0);
  await page.getByRole('link', { name: /Personel Alanım İzin/ }).click();
  await expect(page).toHaveURL(/\/admin\/personel-alanim$/);
  await expect(page.getByText('Depo sorumlusu · Depo')).toBeVisible();

  await page.getByRole('button', { name: 'İzin talebi' }).click();
  const leave = page.getByRole('dialog', { name: 'İzin talebi' });
  await leave.getByLabel('Başlangıç').fill('2027-03-01'); // Pazartesi
  await leave.getByLabel('Bitiş').fill('2027-03-07'); // Pazar: hafta sonu sayılmaz
  await expect(leave.getByText('5 iş günü')).toBeVisible();
  await leave.getByRole('button', { name: 'Talep gönder' }).click();
  await ok(page, 'İzin talebiniz iletildi (5 iş günü)');

  await page.getByRole('button', { name: 'Masraf / avans' }).click();
  const claim = page.getByRole('dialog', { name: 'Masraf / avans talebi' });
  await claim.getByLabel('Tutar').fill('450,75');
  await claim.getByLabel('Açıklama').fill(EXPENSE);
  await claim.getByLabel('Fiş / fatura').setInputFiles({ name: 'fis.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 uat') });
  await claim.getByRole('button', { name: 'Talep gönder' }).click();
  await ok(page, 'Masraf talebiniz iletildi');
  await page.getByRole('button', { name: /^Masraf ve avans/ }).click();
  await expect(item(page, EXPENSE)).toContainText('Onay bekliyor');
  await expect(item(page, EXPENSE)).toContainText('fis.pdf');

  // Departmanı Depo: Satış duyurusunu görmez
  await page.getByRole('button', { name: /^Duyurular/ }).click();
  await expect(page.getByText('Duyuru yok.')).toBeVisible();
});

test('yönetici onaylar; onay ödeme sayılmaz; ödeme Gelir-Gider\'e yazılır', async ({ as }) => {
  const page = await as('admin');
  await page.goto('/admin/personel?tab=leaves');
  await item(page, STAFF.name).getByRole('button', { name: 'Onayla' }).click();
  await confirm(page, 'Onayla');
  await ok(page, 'İzin onaylandı');

  await page.goto('/admin/personel?tab=claims');
  await item(page, EXPENSE).getByRole('button', { name: 'Onayla' }).click();
  await confirm(page, 'Onayla');
  await ok(page, 'Ödeme ayrıca kaydedilir');
  await page.getByRole('button', { name: /^Ödeme bekleyen/ }).click();
  await expect(item(page, EXPENSE)).toContainText('Ödeme bekliyor');
  await expect(page.getByText('Ödeme bekleyen toplam ₺450,75')).toBeVisible();

  await item(page, EXPENSE).getByRole('button', { name: 'Öde' }).click();
  const pay = page.getByRole('dialog', { name: /Masraf ödemesi/ });
  await pay.getByRole('button', { name: 'Banka' }).click();
  await pay.getByRole('button', { name: 'Ödemeyi kaydet' }).click();
  await ok(page, 'Gelir-Gider');
  await page.getByRole('button', { name: /^Ödenen/ }).click();
  await expect(item(page, EXPENSE)).toContainText('Ödendi');
  await expect(item(page, EXPENSE)).toContainText(`Banka · ${'Ayşe Yönetici'}`);

  // Gelir-Gider'de bir kayıt, personel ödemesi olarak (buradan düzenlenemez)
  await page.goto('/admin/cash');
  const entry = item(page, EXPENSE);
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Personel masrafı');
  await expect(entry).toContainText('Personel ödemesi');
  await expect(entry.getByRole('button', { name: 'Sil' })).toHaveCount(0);
});

test('personel kararı ve ödemeyi görür; plasiyer kendi alanını telefonda açar', async ({ as }) => {
  const page = await as(STAFF.key);
  await page.goto('/admin/personel-alanim');
  await expect(item(page, '5 iş günü')).toContainText('Onaylandı');
  await expect(item(page, '5 iş günü')).toContainText('Onaylayan: Ayşe Yönetici');
  await page.getByRole('button', { name: /^Masraf ve avans/ }).click();
  await expect(item(page, EXPENSE)).toContainText('Ödendi');

  const phone = await as(PLASIYER.key, { viewport: { width: 390, height: 844 } });
  await phone.goto('/plasiyer');
  await phone.getByRole('link', { name: /Personel Alanım/ }).click();
  await expect(phone).toHaveURL(/\/plasiyer\/personel$/);
  await expect(phone.getByText('Plasiyer · Satış')).toBeVisible();
  await phone.getByRole('button', { name: /^Duyurular/ }).click();
  await expect(item(phone, 'Satış toplantısı')).toBeVisible();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
