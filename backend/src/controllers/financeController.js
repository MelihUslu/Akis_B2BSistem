import prisma from '../utils/prisma.js';

export const createTransaction = async (req, res) => {
  try {
    const { companyId, type, amount, description } = req.body;

    const transaction = await prisma.$transaction(async (tx) => {
      // 1. İşlemi kaydet
      const t = await tx.financialTransaction.create({
        data: {
          companyId: parseInt(companyId),
          type, // DEBT (Borç), CREDIT (Alacak)
          amount: parseFloat(amount),
          description
        }
      });

      // 2. Şirket bakiyesini güncelle
      const balanceChange = type === 'CREDIT' ? parseFloat(amount) : -parseFloat(amount);
      
      await tx.company.update({
        where: { id: parseInt(companyId) },
        data: {
          currentBalance: { increment: balanceChange }
        }
      });

      return t;
    });

    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ message: 'Finansal işlem kaydedilemedi.' });
  }
};

export const getPlasiyerPoints = async (req, res) => {
  try {
    const points = await prisma.plasiyerPoint.findMany({
      include: {
        user: { select: { name: true, email: true } },
        order: { select: { totalAmount: true } }
      }
    });
    res.json(points);
  } catch (error) {
    res.status(500).json({ message: 'Puanlar getirilirken hata oluştu.' });
  }
};

// Sipariş onaylandığında prim puanı yazan yardımcı fonksiyon (Order onaylandığında çağrılmalı)
export const addPlasiyerPoints = async (userId, orderId, amount) => {
  const points = amount * 0.05; // Örnek: %5 prim
  await prisma.plasiyerPoint.create({
    data: {
      userId,
      orderId,
      points
    }
  });
};
