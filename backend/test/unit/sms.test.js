import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ROOT_DOMAIN = 'akisb2b.com';
const { normalizePhone, smsText } = await import('../../src/services/smsService.js');
const { firmSmsTypes, smsPrefs, wantsSms } = await import('../../src/services/notificationPrefs.js');

test('cep telefonu: Türkiye biçimleri 5XXXXXXXXX olur; sabit hat ve eksik numara reddedilir', () => {
  for (const v of ['5321234567', '0532 123 45 67', '+90 532 123 45 67', '90 (532) 123-45-67', '0 532 123 45 67']) assert.equal(normalizePhone(v), '5321234567', v);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
  for (const v of ['0212 444 55 66', '532123456', '+1 555 123 4567', 'abc']) assert.throws(() => normalizePhone(v), /cep telefonu/, v);
});

test('SMS metni: firma adı, başlık, mesaj ve portal bağlantısı; uzunsa mesaj kısalır, bağlantı kalır', () => {
  const tenant = { name: 'Deniz Toptan', slug: 'deniz' };
  const short = smsText(tenant, { title: 'Siparişiniz onaylandı', message: '#AK-12 onaylandı.', link: '/bayi/orders/12' });
  assert.match(short, /^Deniz Toptan: Siparişiniz onaylandı\. #AK-12 onaylandı\. https?:\/\/deniz\.akisb2b\.com.*\/bayi\/orders\/12$/);
  const long = smsText(tenant, { title: 'Uzun', message: 'x'.repeat(600), link: '/bayi' });
  assert.ok(long.length <= 300);
  assert.match(long, /… https?:\/\/deniz\.akisb2b\.com.*\/bayi$/);
});

test('SMS türleri: firma ayarı yoksa varsayılan; kullanıcı kapatmadıkça açık; telefonu yoksa gitmez', () => {
  assert.deepEqual(firmSmsTypes({}), { dealer: ['ORDER', 'PAYMENT', 'PAYMENT_DUE'], staff: ['ORDER'] });
  const tenant = { smsTypes: { dealer: ['ORDER', 'HR'], staff: [] } };
  assert.deepEqual(firmSmsTypes(tenant).dealer, ['ORDER'], 'izin verilmeyen tür atılır');
  const dealer = { role: 'BAYI', phone: '5321234567', smsPrefs: {} };
  assert.deepEqual(smsPrefs(tenant, dealer), { ORDER: true });
  assert.equal(wantsSms(tenant, dealer, 'ORDER'), true);
  assert.equal(wantsSms(tenant, dealer, 'PAYMENT'), false, 'firma açmadı');
  assert.equal(wantsSms(tenant, { ...dealer, smsPrefs: { ORDER: false } }, 'ORDER'), false, 'kullanıcı kapattı');
  assert.equal(wantsSms(tenant, { ...dealer, phone: null }, 'ORDER'), false, 'telefon yok');
  assert.equal(wantsSms(tenant, { role: 'ADMIN', phone: '5051234567' }, 'ORDER'), false, 'ekip türü seçilmedi');
});
