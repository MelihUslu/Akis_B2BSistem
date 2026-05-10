import prisma from '../utils/prisma.js';

export const getOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { name: true, email: true } },
        company: { select: { name: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Siparişler getirilirken hata oluştu.' });
  }
};

export const partialApproveOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemStatuses } = req.body; // [{ itemId: 1, status: 'APPROVED' | 'CANCELLED' }]

    // 1. Her bir kalemi güncelle
    for (const item of itemStatuses) {
      await prisma.orderItem.update({
        where: { id: parseInt(item.itemId) },
        data: { status: item.status }
      });
    }

    // 2. Yeni toplam tutarı hesapla (Sadece onaylananlar)
    const updatedItems = await prisma.orderItem.findMany({
      where: { orderId: parseInt(id), status: 'APPROVED' }
    });

    const newTotal = updatedItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);

    // 3. Sipariş durumunu ve tutarını güncelle
    const updatedOrder = await prisma.order.update({
      where: { id: parseInt(id) },
      data: {
        totalAmount: newTotal,
        status: 'PARTIAL_APPROVED'
      }
    });

    res.json({ message: 'Sipariş parçalı olarak onaylandı.', updatedOrder });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: 'Onay işlemi sırasında hata oluştu.' });
  }
};

export const shipOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { trackingNumber } = req.body;

    const order = await prisma.order.update({
      where: { id: parseInt(id) },
      data: {
        status: 'SHIPPED',
        trackingNumber: trackingNumber
      }
    });

    res.json({ message: 'Sipariş kargoya verildi.', order });
  } catch (error) {
    res.status(400).json({ message: 'Kargo bilgisi güncellenemedi.' });
  }
};
