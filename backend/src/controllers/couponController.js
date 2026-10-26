import prisma from '../utils/prisma.js';

const parseCoupon = (body) => {
  const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const type = body.type === 'AMOUNT' ? 'AMOUNT' : 'PERCENT';
  const value = parseFloat(body.value);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error('Kupon kodu 3-30 karakter olmalı (harf, rakam, - ve _).');
  if (!Number.isFinite(value) || value <= 0) throw new Error('İndirim değeri sıfırdan büyük olmalıdır.');
  if (type === 'PERCENT' && value > 100) throw new Error('Yüzde indirim 100\'ü geçemez.');
  return {
    code,
    type,
    value,
    description: body.description || null,
    minSubtotal: parseFloat(body.minSubtotal) || 0,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(`${body.endsAt}`.length <= 10 ? `${body.endsAt}T23:59:59` : body.endsAt) : null,
    maxUses: body.maxUses !== '' && body.maxUses !== null && body.maxUses !== undefined ? parseInt(body.maxUses) : null,
    companyId: body.companyId ? parseInt(body.companyId) : null,
    dealerGroup: !body.companyId && body.dealerGroup ? body.dealerGroup : null,
    isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true'
  };
};

export const listCoupons = async (req, res) => {
  const coupons = await prisma.coupon.findMany({
    include: { company: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(coupons);
};

export const createCoupon = async (req, res) => {
  try {
    const coupon = await prisma.coupon.create({ data: parseCoupon(req.body) });
    res.status(201).json({ message: `${coupon.code} kuponu oluşturuldu.`, coupon });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ message: 'Bu kupon kodu zaten var.' });
    res.status(400).json({ message: error.message || 'Kupon oluşturulamadı.' });
  }
};

export const updateCoupon = async (req, res) => {
  try {
    const coupon = await prisma.coupon.update({ where: { id: parseInt(req.params.id) }, data: parseCoupon(req.body) });
    res.json({ message: 'Kupon güncellendi.', coupon });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ message: 'Bu kupon kodu zaten var.' });
    res.status(400).json({ message: error.message || 'Kupon güncellenemedi.' });
  }
};

export const deleteCoupon = async (req, res) => {
  const id = parseInt(req.params.id);
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return res.status(404).json({ message: 'Kupon bulunamadı.' });
  const used = await prisma.order.count({ where: { couponCode: coupon.code } });
  if (used > 0) {
    await prisma.coupon.update({ where: { id }, data: { isActive: false } });
    return res.json({ message: 'Kupon siparişlerde kullanıldığı için silinmedi, pasife alındı.' });
  }
  await prisma.coupon.deleteMany({ where: { id } });
  res.json({ message: 'Kupon silindi.' });
};
