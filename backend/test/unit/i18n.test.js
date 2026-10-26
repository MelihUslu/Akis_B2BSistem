import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { langMiddleware, translate } from '../../src/i18n/index.js';

test('translate: bilinen mesaj çevrilir, bilinmeyen aynen kalır', () => {
  assert.equal(translate('en', 'Sipariş bulunamadı.'), 'Order not found.');
  assert.equal(translate('en', 'Sözlükte olmayan mesaj'), 'Sözlükte olmayan mesaj');
  assert.equal(translate('tr', 'Sipariş bulunamadı.'), 'Sipariş bulunamadı.');
});

test('langMiddleware: X-Lang başlığına göre yanıt mesajını çevirir', async () => {
  const app = express();
  app.use(langMiddleware);
  app.get('/', (req, res) => res.status(401).json({ message: 'Geçersiz e-posta veya şifre.', code: 'X' }));
  const srv = app.listen(0);
  const url = `http://localhost:${srv.address().port}/`;
  try {
    const en = await fetch(url, { headers: { 'X-Lang': 'en' } });
    assert.equal(en.status, 401);
    assert.deepEqual(await en.json(), { message: 'Invalid email or password.', code: 'X' });
    const tr = await fetch(url);
    assert.equal((await tr.json()).message, 'Geçersiz e-posta veya şifre.');
    const unknown = await fetch(url, { headers: { 'X-Lang': 'de' } });
    assert.equal((await unknown.json()).message, 'Geçersiz e-posta veya şifre.');
  } finally {
    srv.close();
  }
});
