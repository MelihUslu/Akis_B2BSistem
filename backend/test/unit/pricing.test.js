import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals, unitPriceFor, qtyDiscountFor } from '../../src/services/pricingService.js';

const ctx = (over = {}) => ({
  rates: { USD: 40, EUR: 45 }, netDiscount: 0, groupDiscount: 0, qtyThreshold: 0, qtyRate: 0, globalHide: false, specialPrices: new Map(), ...over
});

test('computeTotals: KDV kalem bazında hesaplanır', () => {
  const t = computeTotals([{ price: 100, quantity: 2, vatRate: 20 }, { price: 50, quantity: 1, vatRate: 10 }], null);
  assert.deepEqual(t, { subtotal: 250, discountAmount: 0, vatAmount: 45, total: 295 });
});

test('computeTotals: yüzde kupon KDV öncesi uygulanır ve KDV orantılı düşer', () => {
  const t = computeTotals([{ price: 100, quantity: 1, vatRate: 20 }], { type: 'PERCENT', value: 10 });
  assert.equal(t.discountAmount, 10);
  assert.equal(t.vatAmount, 18);
  assert.equal(t.total, 108);
});

test('computeTotals: sabit tutarlı kupon ara toplamı aşamaz', () => {
  const t = computeTotals([{ price: 30, quantity: 1, vatRate: 20 }], { type: 'FIXED', value: 500 });
  assert.equal(t.discountAmount, 30);
  assert.equal(t.total, 0);
});

test('unitPriceFor: bayi ve grup iskontosu art arda, miktar indirimi eşikte uygulanır', () => {
  const c = ctx({ netDiscount: 10, groupDiscount: 5, qtyThreshold: 10, qtyRate: 5 });
  const product = { id: 1, price: 100, currency: 'TL' };
  assert.equal(unitPriceFor(product, 1, c).unit, 85.5);        // 100 × 0.90 × 0.95
  assert.equal(unitPriceFor(product, 10, c).unit, 81.23);      // 85.5 × 0.95
  assert.equal(qtyDiscountFor(9, c), 0);
});

test('unitPriceFor: döviz fiyatı kurla TL’ye çevrilir, kur yoksa null', () => {
  assert.equal(unitPriceFor({ id: 1, price: 10, currency: 'USD' }, 1, ctx()).unit, 400);
  assert.equal(unitPriceFor({ id: 1, price: 10, currency: 'USD' }, 1, ctx({ rates: {} })), null);
});

test('unitPriceFor: özel fiyat iskontoların yerine geçer; en dar kapsam ve uygun kademe seçilir', () => {
  const specialPrices = new Map([[1, [
    { rank: 1, minQty: 1, price: 95 },   // herkese
    { rank: 3, minQty: 1, price: 90 },   // bu bayiye
    { rank: 3, minQty: 50, price: 80 }   // bu bayiye, 50+ adet
  ]]]);
  const c = ctx({ netDiscount: 20, specialPrices });
  assert.deepEqual(unitPriceFor({ id: 1, price: 100, currency: 'TL' }, 10, c), { unit: 90, base: 90, qtyDiscount: 0, source: 'SPECIAL' });
  assert.equal(unitPriceFor({ id: 1, price: 100, currency: 'TL' }, 60, c).unit, 80);
});

test('unitPriceFor: varyantın kendi özel fiyatı yoksa ana ürünün özel fiyatı geçerli', () => {
  const c = ctx({ specialPrices: new Map([[1, [{ rank: 2, minQty: 1, price: 70 }]]]) });
  assert.equal(unitPriceFor({ id: 5, parentId: 1, price: 100, currency: 'TL' }, 1, c).unit, 70);
});
