// API mesajlarının çevirisi: istemci X-Lang başlığı gönderir (bayi portalı TR/EN).
// Controller'lar Türkçe yazmaya devam eder; yanıttaki `message` alanı sözlükte varsa çevrilir.
import en from './en.js';

const DICTS = { en };

const translate = (lang, text) => (typeof text === 'string' && DICTS[lang]?.[text]) || text;

const langMiddleware = (req, res, next) => {
  const lang = String(req.headers['x-lang'] || '').toLowerCase().slice(0, 2);
  req.lang = DICTS[lang] ? lang : 'tr';
  if (req.lang !== 'tr') {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.message === 'string') {
        body = { ...body, message: translate(req.lang, body.message) };
      }
      return json(body);
    };
  }
  next();
};

export { translate, langMiddleware };
