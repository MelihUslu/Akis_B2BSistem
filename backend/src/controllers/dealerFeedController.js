import prisma from '../utils/prisma.js';
import { feedEnabled, feedUrl, newFeedToken, forgetFeed, feedXmlForToken } from '../services/dealerFeedService.js';

/**
 * Bayinin XML ürün beslemesi (Profilim). Adresi yalnızca bayinin ana kullanıcısı görür, üretir, yeniler ve kapatır:
 * adres bayinin fiyatlarını içerir, parola gibi saklanmalıdır.
 */
const view = (company, enabled, isOwner) => ({
  enabled,
  isOwner,
  url: enabled && isOwner && company.feedToken ? feedUrl(company.feedToken) : null,
  active: Boolean(company.feedToken),
  createdAt: company.feedTokenAt
});

export const getMyFeed = async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
  res.json(view(company, await feedEnabled(), Boolean(req.user.isOwner)));
};

// Yeni adres üretir; varsa eskisi hemen geçersiz olur
export const createMyFeed = async (req, res) => {
  if (!req.user.isOwner) return res.status(403).json({ message: 'Besleme adresini bayinizin ana kullanıcısı yönetir.' });
  if (!(await feedEnabled())) return res.status(400).json({ message: 'Firma XML ürün beslemesini açmamış.' });
  const old = await prisma.company.findUnique({ where: { id: req.user.companyId } });
  const company = await prisma.company.update({ where: { id: old.id }, data: { feedToken: newFeedToken(), feedTokenAt: new Date() } });
  forgetFeed(old.feedToken);
  res.json({ message: old.feedToken ? 'Yeni adres üretildi; eski adres artık çalışmaz.' : 'Besleme adresiniz hazır.', feed: view(company, true, true) });
};

export const deleteMyFeed = async (req, res) => {
  if (!req.user.isOwner) return res.status(403).json({ message: 'Besleme adresini bayinizin ana kullanıcısı yönetir.' });
  const old = await prisma.company.findUnique({ where: { id: req.user.companyId } });
  const company = await prisma.company.update({ where: { id: old.id }, data: { feedToken: null, feedTokenAt: null } });
  forgetFeed(old.feedToken);
  res.json({ message: 'Besleme adresi kapatıldı.', feed: view(company, await feedEnabled(), true) });
};

// Herkese açık adres (anahtar adreste); geçersizse hep aynı 404
export const publicFeed = async (req, res) => {
  try {
    const xml = await feedXmlForToken(req.params.token);
    if (!xml) return res.status(404).type('text/plain').send('Besleme bulunamadı.');
    res.set('Cache-Control', 'private, max-age=300').type('application/xml; charset=utf-8').send(xml);
  } catch (error) {
    console.error('publicFeed error:', error);
    res.status(500).type('text/plain').send('Besleme hazırlanamadı.');
  }
};
