import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { hotp, verifyTotp, base32Encode, base32Decode } from '../../src/utils/totp.js';
import { encrypt, decrypt } from '../../src/utils/secretBox.js';
import { signPayload, isPrivateIp, validateWebhookUrl, guardedLookup } from '../../src/services/webhookService.js';
import { verifyNotification } from '../../src/services/paytrService.js';
import { cleanAttachments } from '../../src/services/supportService.js';
import { sessionRevoked, passwordProblem } from '../../src/services/passwordResetService.js';

test('TOTP: RFC 4226 test vektörleri', () => {
  const secret = Buffer.from('12345678901234567890');
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  expected.forEach((code, counter) => assert.equal(hotp(secret, counter), code));
});

test('TOTP: geçerli kod ±30 sn pencerede kabul, eski kod red', () => {
  const secret = base32Encode(crypto.randomBytes(20));
  const now = Date.now();
  const code = hotp(base32Decode(secret), Math.floor(now / 30000));
  assert.ok(verifyTotp(secret, code, now));
  assert.ok(verifyTotp(secret, code, now + 30000));
  assert.ok(!verifyTotp(secret, code, now + 5 * 60000));
  assert.ok(!verifyTotp(secret, '000000x', now));
});

test('secretBox: şifrele / çöz; değiştirilmiş veri reddedilir', () => {
  const box = encrypt('pos-secret-123');
  assert.notEqual(box, 'pos-secret-123');
  assert.equal(decrypt(box), 'pos-secret-123');
  const tampered = box.slice(0, -2) + (box.endsWith('A') ? 'B' : 'A') + box.slice(-1);
  assert.throws(() => decrypt(tampered));
});

test('webhook imzası: HMAC-SHA256 hex', () => {
  const body = JSON.stringify({ event: 'order.created', id: 1 });
  assert.equal(signPayload('s3cret', body), crypto.createHmac('sha256', 's3cret').update(body).digest('hex'));
});

test('PayTR bildirimi: doğru hash kabul, yanlış hash red', () => {
  const creds = { merchantKey: 'KEY', merchantSalt: 'SALT' };
  const body = { merchant_oid: 'ORD1', status: 'success', total_amount: '1000' };
  body.hash = crypto.createHmac('sha256', 'KEY').update('ORD1SALTsuccess1000').digest('base64');
  assert.ok(verifyNotification(creds, body));
  assert.ok(!verifyNotification(creds, { ...body, total_amount: '1' }));
  assert.ok(!verifyNotification(creds, { ...body, hash: 'kisa' }));
});

test('destek ekleri: yalnızca bizim yüklediğimiz dosyalar, en fazla 5', () => {
  const ok = { url: 'http://localhost:5001/uploads/support/t1-abcdef0123.png', name: 'a.png', type: 'image/png', size: 10 };
  assert.equal(cleanAttachments([ok]).length, 1);
  assert.equal(cleanAttachments([{ ...ok, url: 'https://evil.com/x.png' }]), undefined);
  assert.equal(cleanAttachments([{ ...ok, url: 'http://x/uploads/support/../../.env' }]), undefined);
  assert.equal(cleanAttachments([{ ...ok, url: 'http://x/uploads/support/t1-a.html' }]), undefined);
  assert.equal(cleanAttachments(Array(8).fill(ok)).length, 5);
});

test('oturum iptali: şifre değişiminden önce verilen token geçersiz', () => {
  const changedAt = new Date('2026-10-01T12:00:00Z');
  assert.ok(sessionRevoked({ iat: changedAt.getTime() / 1000 - 60 }, changedAt));
  assert.ok(!sessionRevoked({ iat: changedAt.getTime() / 1000 + 60 }, changedAt));
  assert.ok(!sessionRevoked({ iat: 1 }, null));
  assert.ok(passwordProblem('kisa'));
  assert.equal(passwordProblem('yeterliuzun'), null);
});

test('webhook SSRF koruması: iç ağ, eşlemeli IPv6 ve özel aralıklar reddedilir; dış adres geçer', () => {
  for (const ip of ['127.0.0.1', '10.2.3.4', '172.20.0.5', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', '::ffff:10.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '64:ff9b::a00:1', 'fd00::1', 'fe80::1', 'ff02::1', 'yanlis']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2a00:1450:4001::200e']) assert.equal(isPrivateIp(ip), false, ip);
});

test('webhook adresi (canlı ortam): yalnızca https, IP ile iç ağ yok, kullanıcı adı / parola yok; çözümleme anında da denetlenir', async () => {
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.match(await validateWebhookUrl('http://ornek.com/hook'), /https/);
    assert.match(await validateWebhookUrl('https://127.0.0.1/hook'), /İç ağ/);
    assert.match(await validateWebhookUrl('https://[::ffff:10.0.0.1]/hook'), /İç ağ/);
    assert.match(await validateWebhookUrl('https://2130706433/hook'), /İç ağ/); // 127.0.0.1'in sayı biçimi
    assert.match(await validateWebhookUrl('https://a:b@ornek.com/hook'), /parola/);
    assert.match(await validateWebhookUrl('file:///etc/passwd'), /http/);
    // Bağlantı sırasında çözülen adres iç ağdaysa (DNS rebinding) bağlanılmaz
    const err = await new Promise((resolve) => guardedLookup('localhost', {}, (e) => resolve(e)));
    assert.equal(err?.code, 'EPRIVATEADDR');
  } finally {
    process.env.NODE_ENV = env;
  }
});

test('hesap başına hatalı deneme sayacı: sınırda kilitlenir, başka hesap etkilenmez, başarılı giriş sıfırlar', async () => {
  const { failureLimiter } = await import('../../src/middlewares/rateLimit.js');
  const limiter = failureLimiter({ windowMs: 60_000, max: 3, prefix: 'birim' });
  for (let i = 0; i < 3; i++) {
    assert.equal(await limiter.blocked('a'), false);
    await limiter.fail('a');
  }
  assert.equal(await limiter.blocked('a'), true);
  assert.equal(await limiter.blocked('b'), false);
  await limiter.reset('a');
  assert.equal(await limiter.blocked('a'), false);
});
