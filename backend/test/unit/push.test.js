import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import webpush from 'web-push';

// Tarayıcı aboneliği taklidi: P-256 anahtarı + 16 bayt auth sırrı
const fakeSubscription = () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-device',
    keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
};

test('web push: VAPID imzalı, şifreli istek hazırlanır', () => {
  const vapid = webpush.generateVAPIDKeys();
  const details = webpush.generateRequestDetails(fakeSubscription(), JSON.stringify({ title: 'Sipariş onaylandı', url: '/bayi/orders/1' }), {
    vapidDetails: { subject: 'mailto:test@example.com', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    TTL: 60,
  });
  assert.equal(details.method, 'POST');
  assert.equal(details.headers['Content-Encoding'], 'aes128gcm');
  assert.match(details.headers.Authorization, /^vapid t=.+, k=/);
  assert.ok(details.body.length > 0);
  assert.ok(!details.body.toString().includes('Sipariş')); // içerik şifreli gider
});
