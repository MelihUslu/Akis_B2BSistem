// UAT-19 B2B ekleri (7 Kasım): bayi içinde sipariş onayı, bayilere XML ürün beslemesi, çek / senet portföyü,
// plasiyer saha ziyareti. Her biri arayüzden, kullanıcının göreceği haliyle denenir.
import fs from 'fs';
import { test, expect, confirm, alertBox, field, addFromCatalog, goToCheckout } from '../fixtures.mjs';
import { DEALERS, DEALER_STAFF, PRODUCTS, API, TENANT } from '../data.mjs';

test.describe.configure({ mode: 'serial' });

const D = DEALERS.onay;
const P = PRODUCTS.onay;
// Yönetici oturumuyla doğrudan API çağrısı (yalnızca hazırlık / doğrulama için)
const adminToken = () => JSON.parse(fs.readFileSync(new URL('../.data/auth/admin.json', import.meta.url), 'utf8')).origins[0].localStorage.find((x) => x.name === 'akis_token').value;
const adminApi = (path) => fetch(`${API}${path}`, { headers: { 'X-Tenant': TENANT, Authorization: `Bearer ${adminToken()}` } }).then((r) => r.json());
const inDays = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');

test('bayi çalışanının siparişi ana kullanıcının onayına gider; ana kullanıcı onaylayınca sipariş olur', async ({ as }) => {
  const staff = await as(DEALER_STAFF.key);
  await addFromCatalog(staff, P.sku, 4);
  await goToCheckout(staff);
  await expect(staff.getByText(/ana kullanıcısının onayına gidecek/)).toBeVisible();
  await staff.getByRole('button', { name: /Onaya gönder/ }).click();
  await expect(alertBox(staff)).toContainText('Onaya Gönderildi');
  await confirm(staff, 'Onay Taleplerine Git');
  await expect(staff).toHaveURL(/tab=requests/);
  await expect(staff.getByText('Onay bekliyor')).toBeVisible();

  const owner = await as('onay');
  await owner.goto('/bayi/orders?tab=requests');
  const card = owner.locator('.card-premium').filter({ hasText: DEALER_STAFF.name });
  await expect(card).toContainText(P.name);
  await expect(card).toContainText('4 Adet');
  await card.getByRole('button', { name: 'Onayla', exact: true }).click();
  await confirm(owner, 'Onayla');
  await expect(alertBox(owner)).toContainText(/numaralı sipariş firmaya iletildi/);
  const id = Number((await alertBox(owner).textContent()).match(/#AK-(\d+)/)[1]);
  await confirm(owner, 'Tamam');
  await expect(card).toContainText('Onaylandı');
  await expect(card.getByRole('link', { name: `#AK-${id}` })).toBeVisible();

  // Sipariş çalışanın siparişlerinde görünür, firmaya düşmüştür
  await staff.goto(`/bayi/orders/${id}`);
  await expect(staff.getByText('Onay Bekliyor').first()).toBeVisible();
});

test('firma XML beslemesini açar; bayi adres üretir; adres bayinin fiyatıyla ürünleri verir', async ({ as }) => {
  const admin = await as('admin');
  await admin.goto('/admin/settings');
  await admin.getByRole('switch', { name: 'Bayilere XML ürün beslemesi' }).click();
  await admin.getByRole('button', { name: 'Kaydet', exact: true }).first().click();
  await expect(alertBox(admin)).toBeVisible();
  await confirm(admin, 'Tamam');

  const owner = await as('onay');
  await owner.goto('/bayi/profile');
  await owner.getByRole('button', { name: 'Besleme adresi oluştur' }).click();
  await expect(alertBox(owner)).toContainText('Besleme adresiniz hazır');
  await confirm(owner, 'Tamam');
  const url = (await owner.locator('code').filter({ hasText: '/api/public/feed/' }).textContent()).trim();
  // Adres UAT backend'inin iç portunu taşır; dışarıdan 5002 ile çağrılır
  const res = await owner.request.get(url.replace(/^https?:\/\/[^/]+\/api/, API));
  expect(res.status()).toBe(200);
  const xml = await res.text();
  expect(xml).toContain(`<StokKodu>${P.sku}</StokKodu>`);
  expect(xml).toMatch(new RegExp(`<StokKodu>${P.sku}</StokKodu>.*?<BayiFiyati>${P.price.toFixed(2)}</BayiFiyati>`, 's'));
});

test('çekle tahsilat portföye girer; portföyden tahsile verilir', async ({ as }) => {
  const partner = (await adminApi(`/partners?q=${encodeURIComponent(D.company)}`)).data[0];
  const admin = await as('admin');
  await admin.goto(`/admin/partners?id=${partner.id}`);
  await admin.getByRole('button', { name: 'Tahsilat al' }).click();
  const modal = admin.getByRole('dialog');
  await modal.getByRole('button', { name: 'Çek', exact: true }).click();
  await field(modal, 'Tutar').fill('750');
  await field(modal, 'Çek / senet no').fill('UAT-CEK-1');
  await field(modal, 'Vade tarihi').fill(inDays(30));
  await field(modal, 'Keşideci').fill('Usta Ahmet');
  await expect(modal).toContainText('Çek / Senet portföyüne girer');
  await modal.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(admin.getByRole('dialog')).toContainText('Tahsilat kaydedildi');

  await admin.goto('/admin/cheques');
  const row = admin.locator('tr').filter({ hasText: 'UAT-CEK-1' });
  await expect(row).toContainText('Usta Ahmet');
  await expect(row).toContainText('Portföyde');
  await row.getByRole('button', { name: 'Tahsile ver' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Tahsile ver', exact: true }).click();
  await expect(alertBox(admin)).toContainText('Tahsile verildi');
  await confirm(admin, 'Tamam');
  await expect(row).toContainText('Tahsile verildi');
});

test('plasiyer ziyaret kaydeder ve planlar; yönetici saha ziyaretlerinde görür', async ({ as }) => {
  const page = await as('plasiyer');
  await page.goto('/plasiyer');
  const card = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Sipariş ver' }) });
  await expect(card).toContainText('Hiç ziyaret edilmedi');
  await card.getByRole('button', { name: 'Ziyaret kaydet' }).click();
  const modal = page.getByRole('dialog');
  await modal.getByText('Sipariş alındı').click();
  await modal.getByLabel('Not').fill('Yeni sezon kataloğu bırakıldı');
  await modal.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(alertBox(page)).toContainText('Ziyaret kaydedildi');
  await confirm(page, 'Tamam');
  await expect(card).toContainText('Son ziyaret bugün');

  await card.getByRole('button', { name: 'Planla' }).click();
  await page.getByRole('dialog').getByLabel('Gün').fill(inDays(2));
  await page.getByRole('dialog').getByRole('button', { name: 'Planla', exact: true }).click();
  await expect(alertBox(page)).toContainText('Ziyaret planlandı');
  await confirm(page, 'Tamam');
  await expect(page.getByText(/Yaklaşan: /)).toContainText(DEALERS.saha.company);

  const admin = await as('admin');
  await admin.goto('/admin/visits');
  const visit = admin.locator('tr').filter({ hasText: 'Yeni sezon kataloğu bırakıldı' });
  await expect(visit).toContainText(DEALERS.saha.company);
  await expect(visit).toContainText('Sipariş alındı');
});
