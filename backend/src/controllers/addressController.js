import prisma from '../utils/prisma.js';

// Bayi kendi firmasının adreslerini, yönetici ise rotadaki firmanın (/companies/:companyId/addresses) adreslerini yönetir
const companyIdOf = (req) => (req.user.role === 'BAYI' ? req.user.companyId : parseInt(req.params.companyId));

const clean = (b) => {
  const v = (k, n) => String(b[k] ?? '').trim().slice(0, n);
  const data = { title: v('title', 60), contactName: v('contactName', 80), phone: v('phone', 30), city: v('city', 40), district: v('district', 60), line: v('line', 300), postalCode: v('postalCode', 10) || null };
  const missing = [['title', 'Adres adı'], ['contactName', 'Teslim alacak kişi'], ['phone', 'Telefon'], ['city', 'İl'], ['district', 'İlçe'], ['line', 'Açık adres']]
    .filter(([k]) => !data[k]).map(([, label]) => label);
  return { data, error: missing.length ? `Eksik: ${missing.join(', ')}.` : null };
};

export const listAddresses = async (req, res) => {
  const companyId = companyIdOf(req);
  if (!companyId) return res.status(400).json({ message: 'Firma bulunamadı.' });
  res.json(await prisma.deliveryAddress.findMany({ where: { companyId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] }));
};

export const createAddress = async (req, res) => {
  const companyId = companyIdOf(req);
  const company = companyId && await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!company) return res.status(404).json({ message: 'Firma bulunamadı.' });
  const { data, error } = clean(req.body);
  if (error) return res.status(400).json({ message: error });
  const count = await prisma.deliveryAddress.count({ where: { companyId } });
  if (count >= 50) return res.status(400).json({ message: 'En fazla 50 adres eklenebilir.' });
  const makeDefault = count === 0 || req.body.isDefault === true;
  const address = await prisma.$transaction(async (tx) => {
    if (makeDefault) await tx.deliveryAddress.updateMany({ where: { companyId }, data: { isDefault: false } });
    return tx.deliveryAddress.create({ data: { ...data, companyId, isDefault: makeDefault } });
  });
  res.status(201).json({ message: 'Adres eklendi.', address });
};

const findOwn = (req) => prisma.deliveryAddress.findFirst({ where: { id: parseInt(req.params.id), companyId: companyIdOf(req) } });

export const updateAddress = async (req, res) => {
  const existing = await findOwn(req);
  if (!existing) return res.status(404).json({ message: 'Adres bulunamadı.' });
  const { data, error } = clean({ ...existing, ...req.body });
  if (error) return res.status(400).json({ message: error });
  const address = await prisma.$transaction(async (tx) => {
    if (req.body.isDefault === true) await tx.deliveryAddress.updateMany({ where: { companyId: existing.companyId }, data: { isDefault: false } });
    return tx.deliveryAddress.update({ where: { id: existing.id }, data: { ...data, ...(req.body.isDefault === true && { isDefault: true }) } });
  });
  res.json({ message: 'Adres güncellendi.', address });
};

export const deleteAddress = async (req, res) => {
  const existing = await findOwn(req);
  if (!existing) return res.status(404).json({ message: 'Adres bulunamadı.' });
  await prisma.$transaction(async (tx) => {
    await tx.deliveryAddress.delete({ where: { id: existing.id } });
    if (existing.isDefault) {
      const next = await tx.deliveryAddress.findFirst({ where: { companyId: existing.companyId }, orderBy: { createdAt: 'asc' } });
      if (next) await tx.deliveryAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  res.json({ message: 'Adres silindi.' });
};

/**
 * Sipariş için teslimat adresi: seçilen adres, yoksa varsayılan adres, o da yoksa firmanın kayıtlı adresi.
 * Siparişe kopyalanacak biçimde döner (sonradan adres değişse de sipariş etkilenmez).
 */
export const resolveShippingAddress = async (company, addressId) => {
  const pick = { title: true, contactName: true, phone: true, city: true, district: true, line: true, postalCode: true };
  if (addressId) {
    const chosen = await prisma.deliveryAddress.findFirst({ where: { id: parseInt(addressId), companyId: company.id }, select: pick });
    if (!chosen) return { error: 'Seçilen teslimat adresi bulunamadı.' };
    return { address: chosen };
  }
  const def = await prisma.deliveryAddress.findFirst({ where: { companyId: company.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: pick });
  if (def) return { address: def };
  return { address: company.address ? { title: 'Firma adresi', contactName: company.authorizedPerson || company.name, phone: company.phone || '', city: '', district: '', line: company.address } : null };
};
