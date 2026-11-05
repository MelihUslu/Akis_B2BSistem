import prisma from '../utils/prisma.js';
import { findVisibleProduct } from '../services/catalogAccess.js';

// ─── Favoriler ───────────────────────────────────────────────────────────────

export const addFavorite = async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (!(await findVisibleProduct(prisma, company, productId, { isMaster: true }))) return res.status(404).json({ message: 'Ürün bulunamadı.' });
    await prisma.favorite.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      update: {},
      create: { userId: req.user.id, productId }
    });
    res.json({ isFavorite: true });
  } catch (error) {
    res.status(400).json({ message: 'Favorilere eklenemedi.' });
  }
};

export const removeFavorite = async (req, res) => {
  await prisma.favorite.deleteMany({ where: { userId: req.user.id, productId: parseInt(req.params.productId) } });
  res.json({ isFavorite: false });
};

// ─── Sipariş şablonları (kaydedilmiş sepetler) ───────────────────────────────

const normalizeItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map(i => ({ sku: String(i.sku || '').trim(), quantity: parseInt(i.quantity) || 1 }))
    .filter(i => i.sku)
    .slice(0, 300);

export const listTemplates = async (req, res) => {
  const templates = await prisma.orderTemplate.findMany({
    where: { companyId: req.user.companyId },
    include: { user: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' }
  });
  res.json(templates);
};

export const createTemplate = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const items = normalizeItems(req.body.items);
  if (!name) return res.status(400).json({ message: 'Şablon adı girin.' });
  if (items.length === 0) return res.status(400).json({ message: 'Şablonda en az bir ürün olmalı.' });
  const template = await prisma.orderTemplate.create({
    data: { name, items, companyId: req.user.companyId, userId: req.user.id }
  });
  res.status(201).json({ message: `"${name}" şablonu kaydedildi.`, template });
};

export const updateTemplate = async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await prisma.orderTemplate.findFirst({ where: { id, companyId: req.user.companyId } });
  if (!existing) return res.status(404).json({ message: 'Şablon bulunamadı.' });
  const data = {};
  if (req.body.name !== undefined) data.name = String(req.body.name).trim() || existing.name;
  if (req.body.items !== undefined) data.items = normalizeItems(req.body.items);
  const template = await prisma.orderTemplate.update({ where: { id }, data });
  res.json({ message: 'Şablon güncellendi.', template });
};

export const deleteTemplate = async (req, res) => {
  await prisma.orderTemplate.deleteMany({ where: { id: parseInt(req.params.id), companyId: req.user.companyId } });
  res.json({ message: 'Şablon silindi.' });
};
