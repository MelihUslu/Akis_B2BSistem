import prisma from '../utils/prisma.js';

/**
 * Yardım merkezi araması. Yazı sayısı az (yüzler) olduğu için yayındaki yazılar bellekte puanlanır:
 * başlık > anahtar kelime > özet > metin. Türkçe büyük/küçük harf ve ekler için kelime başı eşleşmesi yeterli.
 */
const norm = (s = '') => s.toLocaleLowerCase('tr-TR').normalize('NFC');
const STOP = new Set(['ve', 'ile', 'bir', 'bu', 'da', 'de', 'mi', 'mı', 'için', 'nasıl', 'ne', 'neden', 'var', 'yok', 'ama', 'çok', 'gibi', 'olarak', 'alıyorum', 'yapamıyorum']);
const terms = (q) => [...new Set(norm(q).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w)))].slice(0, 12);

// Kelime başı eşleşmesi: "faturası" → "fatura" yazısını bulur (ilk 5 harf kökü)
const hits = (text, w) => {
  const root = w.length > 5 ? w.slice(0, 5) : w;
  return text.split(/[^\p{L}\p{N}]+/u).filter((x) => x.startsWith(root)).length;
};

export const scoreArticle = (a, words) => {
  const title = norm(a.title), keys = norm(a.keywords), summary = norm(a.summary), body = norm(a.body);
  let score = 0, matched = 0;
  for (const w of words) {
    const s = hits(title, w) * 6 + hits(keys, w) * 4 + hits(summary, w) * 2 + Math.min(hits(body, w), 3);
    if (s) matched++;
    score += s;
  }
  // Çok kelimeli aramada kelimelerin çoğu eşleşen yazı öne çıksın
  return words.length ? score * (matched / words.length) : 0;
};

const LIST_FIELDS = { id: true, category: true, title: true, summary: true, keywords: true, body: true, sortOrder: true, views: true, helpfulYes: true, helpfulNo: true, updatedAt: true };

export const searchArticles = async ({ q = '', category = '', limit = 20 } = {}) => {
  const articles = await prisma.helpArticle.findMany({
    where: { isPublished: true, ...(category && { category }) },
    select: LIST_FIELDS,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const words = terms(q);
  const list = words.length
    ? articles.map((a) => ({ a, s: scoreArticle(a, words) })).filter((x) => x.s >= 2).sort((x, y) => y.s - x.s).map((x) => x.a)
    : articles;
  return list.slice(0, limit).map(({ body, keywords, ...a }) => a);
};

export const getArticle = async (id) => {
  const article = await prisma.helpArticle.findFirst({ where: { id, isPublished: true } });
  if (article) await prisma.helpArticle.update({ where: { id }, data: { views: { increment: 1 } } });
  return article;
};

export const articleFeedback = (id, helpful) =>
  prisma.helpArticle.updateMany({ where: { id, isPublished: true }, data: helpful ? { helpfulYes: { increment: 1 } } : { helpfulNo: { increment: 1 } } });

// Platform yönetimi
const CATEGORIES = ['TECHNICAL', 'BILLING', 'FEATURE', 'USAGE', 'OTHER'];
export const articleData = (b = {}) => {
  const title = String(b.title || '').trim().slice(0, 200);
  const body = String(b.body || '').trim().slice(0, 20000);
  if (title.length < 3 || body.length < 10) throw Object.assign(new Error('Başlık ve en az 10 karakterlik içerik girin.'), { status: 400 });
  return {
    title, body,
    category: CATEGORIES.includes(b.category) ? b.category : 'USAGE',
    summary: String(b.summary || '').trim().slice(0, 300),
    keywords: String(b.keywords || '').trim().slice(0, 500),
    isPublished: b.isPublished !== false,
    sortOrder: Number.isFinite(Number(b.sortOrder)) ? Math.trunc(Number(b.sortOrder)) : 0,
  };
};
