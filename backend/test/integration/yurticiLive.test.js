/**
 * Yurtiçi Kargo'nun gerçek TEST servisine karşı (herkese açık YKTEST hesabı). Dış servise bağlı olduğu için
 * yalnızca istenince çalışır:  YURTICI_LIVE=1 npm run test:integration
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShipment, queryShipment, cancelShipment } from '../../src/services/cargo/yurtici.js';

const skip = process.env.YURTICI_LIVE !== '1' && 'YURTICI_LIVE=1 değil';
const creds = { username: 'YKTEST', password: 'YK', mode: 'TEST' };

test('Yurtiçi test servisi: oluştur → sorgula → iptal', { skip }, async () => {
  const key = `AKCI${Date.now()}`;
  await createShipment(creds, { cargoKey: key, receiverName: 'Test Alıcı', address: 'Atatürk Caddesi No:1 Kadıköy/İstanbul', city: 'İstanbul', district: 'Kadıköy', phone: '05551234567' });
  const q = await queryShipment(creds, key);
  assert.equal(q.rawStatus, 'NOP');
  assert.ok(await cancelShipment(creds, key));
  assert.equal((await queryShipment(creds, key)).status, 'NOT_FOUND');
  await assert.rejects(() => createShipment({ ...creds, password: 'yanlis' }, { cargoKey: `${key}X`, receiverName: 'a', address: 'uzun bir adres satırı', city: 'İstanbul', district: 'Kadıköy', phone: '1' }), /örtüşmüyor/);
});
