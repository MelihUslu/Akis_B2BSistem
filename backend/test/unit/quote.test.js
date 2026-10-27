import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertQuantity } from '../../src/services/quoteCatalogService.js';
import { validateExtraction, validateMatch, resolveLines } from '../../src/services/quoteAiService.js';
import { sendBlockers, assertPricingAllowed, normalizeItems, QuoteError } from '../../src/services/quoteService.js';
import { aiStatus, AiError } from '../../src/services/ai/index.js';

const cup = { id: 11, parentId: 10, parent: null, unit: 'Adet', packUnit: 'Koli', packSize: 50, isActive: true };

test('convertQuantity: kayıtlı paket dönüşümü uygulanır, çoğul ve büyük harf yok sayılır', () => {
  assert.deepEqual(convertQuantity(cup, 20, 'adet'), { quantity: 20 });
  const r = convertQuantity(cup, 20, 'KOLİLER'.toLocaleLowerCase('tr-TR'));
  assert.equal(r.quantity, 1000);
  assert.match(r.note, /20 Koli × 50 = 1000 Adet/);
});

test('convertQuantity: dönüşüm kaydı yoksa tahmin edilmez', () => {
  const r = convertQuantity({ ...cup, packUnit: null, packSize: null }, 20, 'koli');
  assert.equal(r.quantity, undefined);
  assert.match(r.error, /kayıtlı dönüşüm yok/);
});

test('validateExtraction: geçersiz yanıt reddedilir, hatalı bağlantı indeksi düzeltilir', () => {
  assert.throws(() => validateExtraction({ foo: 1 }), (e) => e instanceof AiError && e.code === 'INVALID_RESPONSE');
  const r = validateExtraction({ items: [{ text: 'kapak', quantity: -3, compatibleWithItem: 0, searchTerms: ['kapak'] }, { text: 'x', compatibleWithItem: 9 }], questions: [{ itemIndex: 7, question: 'Kaç adet?' }] });
  assert.equal(r.items[0].quantity, 0);
  assert.equal(r.items[0].compatibleWithItem, -1); // kendine bağlanamaz
  assert.equal(r.items[1].compatibleWithItem, -1);
  assert.equal(r.questions[0].itemIndex, -1);
});

test('validateMatch: aday listesi dışındaki ürün kimliği reddedilir, alternatifler süzülür', () => {
  const cands = [[{ id: 1 }, { id: 2 }]];
  const r = validateMatch({ lines: [{ itemIndex: 0, productId: 999, quantity: 5, unit: '', certain: true, reason: '', warnings: [], alternativeIds: [2, 555] }, { itemIndex: 0, productId: 1 }], questions: [] }, 1, cands);
  const m = r.byNeed.get(0);
  assert.equal(m.productId, 0);
  assert.equal(m.rejected, true);
  assert.deepEqual(m.alternativeIds, [2]);
  assert.throws(() => validateMatch({ nope: true }, 1, cands), (e) => e.code === 'INVALID_RESPONSE');
});

test('resolveLines: aday yoksa eşleşmedi, belirsizse teyit, birim çevrimi gerekçeye yazılır', () => {
  const needs = [
    { text: '20 koli 8 oz bardak', quantity: 20, unit: 'koli', searchTerms: ['bardak'], compatibleWithItem: -1 },
    { text: 'uzay mekiği', quantity: 1, unit: '', searchTerms: ['uzay'], compatibleWithItem: -1 },
    { text: 'uyumlu kapak', quantity: 0, unit: '', searchTerms: ['kapak'], compatibleWithItem: 0 }
  ];
  const lid = { id: 21, parentId: null, parent: null, unit: 'Adet', isActive: true };
  const candidatesByNeed = [[{ id: 11, raw: cup }], [], [{ id: 21, raw: lid }]];
  const match = validateMatch({ lines: [
    { itemIndex: 0, productId: 11, quantity: 20, unit: 'koli', certain: true, reason: '8 oz varyantı.', warnings: [], alternativeIds: [] },
    { itemIndex: 2, productId: 21, quantity: 0, unit: '', certain: true, reason: 'Kapak.', warnings: [], alternativeIds: [] }
  ], questions: [] }, 3, candidatesByNeed);

  const lines = resolveLines({ needs, match, candidatesByNeed, compat: new Map() });
  assert.equal(lines[0].matchStatus, 'MATCHED');
  assert.equal(lines[0].quantity, 1000);
  assert.match(lines[0].matchReason, /Birim çevrimi/);
  assert.equal(lines[1].matchStatus, 'UNMATCHED');
  assert.equal(lines[1].productId, null);
  // Miktar yok ve uyumluluk katalogda tanımlı değil → kesinleşmez
  assert.equal(lines[2].matchStatus, 'REVIEW');
  assert.ok(lines[2].warnings.some((w) => /Uyumluluk katalogda tanımlı değil/.test(w)));

  const compat = new Map([[10, new Set([21])], [21, new Set([10])]]); // ana ürün ↔ kapak
  const ok = resolveLines({ needs, match, candidatesByNeed, compat });
  assert.match(ok[2].matchReason, /uyumlu olarak tanımlı/);
});

test('sendBlockers: eşleşmeyen, teyit bekleyen kalem ve geçmiş tarih gönderimi engeller', () => {
  const blockers = sendBlockers([
    { productId: null, requestText: 'x', errors: [] },
    { productId: 1, name: 'Bardak', matchStatus: 'REVIEW', errors: [] }
  ], { validUntil: new Date(Date.now() - 86400000) });
  assert.equal(blockers.length, 3);
  assert.deepEqual(sendBlockers([{ productId: 1, matchStatus: 'MATCHED', errors: [] }], { validUntil: new Date(Date.now() + 86400000) }), []);
});

test('assertPricingAllowed: yetkisiz kullanıcı iskonto / elle fiyat giremez, mevcut fiyatı koruyabilir', () => {
  const clerk = { role: 'ADMIN', isOwner: false, permissions: ['QUOTES'] };
  const pricer = { role: 'ADMIN', isOwner: false, permissions: ['QUOTES', 'QUOTE_PRICING'] };
  const items = normalizeItems([{ productId: 1, quantity: 5, discountRate: 12 }]);
  assert.throws(() => assertPricingAllowed(clerk, items), (e) => e instanceof QuoteError && e.status === 403);
  assert.doesNotThrow(() => assertPricingAllowed(pricer, items));
  assert.doesNotThrow(() => assertPricingAllowed(clerk, items, [{ productId: 1, discountRate: 12 }]));
  const manual = normalizeItems([{ productId: 1, quantity: 5, manualPrice: true, unitPrice: 9.5 }]);
  assert.throws(() => assertPricingAllowed(clerk, manual, [{ productId: 1, manualPrice: true, quotedPrice: 10 }]));
});

test('normalizeItems: ürünsüz kalem eşleşmedi sayılır, iskonto 0–100 aralığına sıkıştırılır', () => {
  const [a, b] = normalizeItems([{ quantity: 3, matchStatus: 'MATCHED' }, { productId: 2, quantity: 1, discountRate: 150, matchStatus: 'UNMATCHED' }]);
  assert.equal(a.matchStatus, 'UNMATCHED');
  assert.equal(b.discountRate, 100);
  assert.equal(b.matchStatus, 'REVIEW');
});

test('aiStatus: anahtar yoksa kapalı, örnek sağlayıcı canlıda kullanılamaz', () => {
  const env = { ...process.env };
  try {
    delete process.env.AI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_PROVIDER = 'anthropic';
    assert.equal(aiStatus().enabled, false);
    process.env.AI_PROVIDER = 'mock'; process.env.NODE_ENV = 'production';
    assert.equal(aiStatus().enabled, false);
    process.env.NODE_ENV = 'development';
    assert.equal(aiStatus().mock, true);
    process.env.AI_PROVIDER = 'anthropic'; process.env.AI_API_KEY = 'test';
    assert.equal(aiStatus().enabled, true);
  } finally {
    process.env = env;
  }
});

test('yaşlandırma: borç en yeni hareketlerden dağıtılır, en eski gecikme günü hesaplanır', async () => {
  const { agingFor } = await import('../../src/services/partnerLedgerService.js');
  const now = new Date('2026-06-30T12:00:00Z');
  const day = (n) => new Date(now.getTime() - n * 86400000);
  // 10.000 borç: 3.000 vadesi gelmemiş (5 gün önce, 30 gün vade), 4.000 20 gün gecikmiş, 3.000 75 gün gecikmiş
  const debts = [
    { amount: 3000, date: day(5) },
    { amount: 4000, date: day(50) },
    { amount: 3000, date: day(105) },
    { amount: 9999, date: day(400) } // ödenmiş eski borç (bakiyeye girmez)
  ];
  const r = agingFor({ currentBalance: -10000, paymentTermDays: 30 }, debts, now);
  assert.equal(r.notDue, 3000);
  assert.equal(r.d30, 4000);
  assert.equal(r.d90, 3000);
  assert.equal(r.unmatched, 0);
  assert.equal(r.oldestOverdueDays, 75);
  assert.equal(r.overdue, 7000);
  // Hareketle karşılanamayan bakiye tarihi bilinmeyen sütununa düşer
  const open = agingFor({ currentBalance: -500, paymentTermDays: 0 }, [], now);
  assert.equal(open.unmatched, 500);
  assert.equal(open.oldestOverdueDays, null);
});
