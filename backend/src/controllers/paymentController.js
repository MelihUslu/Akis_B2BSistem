import prisma from '../utils/prisma.js';

export const getPayments = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { order: true }
    });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: 'Ödemeler getirilirken hata oluştu.' });
  }
};

export const createPayment = async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    const payment = await prisma.payment.create({
      data: {
        orderId: orderId ? parseInt(orderId) : null,
        amount: parseFloat(amount)
      }
    });
    res.status(201).json(payment);
  } catch (error) {
    res.status(400).json({ message: 'Ödeme kaydedilemedi.' });
  }
};
