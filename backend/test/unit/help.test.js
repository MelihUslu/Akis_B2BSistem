import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreArticle } from '../../src/services/helpService.js';

const articles = [
  { id: 1, title: 'Excel ile toplu ürün yükleme', keywords: 'excel, csv, içe aktar', summary: 'Ürünleri dosyayla ekleyin.', body: 'Ürün Yönetimi sayfasında Excel ile Toplu düğmesi.' },
  { id: 2, title: 'E-fatura entegrasyonu', keywords: 'fatura, e-arşiv, paraşüt', summary: 'Faturayı otomatik kesin.', body: 'Ayarlar → E-Fatura sekmesi.' },
  { id: 3, title: 'Kargo entegrasyonu', keywords: 'kargo, takip, yurtiçi', summary: 'Gönderiyi otomatik oluşturun.', body: 'Kargo takip numarası otomatik.' },
];
const best = (q) => {
  const words = q.toLocaleLowerCase('tr-TR').split(/\s+/).filter((w) => w.length >= 2);
  return articles.map((a) => ({ id: a.id, s: scoreArticle(a, words) })).sort((x, y) => y.s - x.s)[0];
};

test('yardım araması: ekli Türkçe kelimeler doğru yazıyı bulur', () => {
  assert.equal(best('excel dosyası yüklerken hata').id, 1);
  assert.equal(best('faturayı kesemiyorum').id, 2);
  assert.equal(best('kargom nerede takip').id, 3);
});

test('yardım araması: ilgisiz arama puan almaz', () => {
  assert.equal(best('zzzz qqqq').s, 0);
});
