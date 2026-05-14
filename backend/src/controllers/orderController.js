import prisma from '../utils/prisma.js';

export const getOrders = async (req, res) => {
  try {
    const isBayi = req.user.role === 'BAYI';
    const where = isBayi ? { companyId: req.user.companyId } : {};

    const orders = await prisma.order.findMany({
      where,
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

    const result = await prisma.$transaction(async (tx) => {
      // 1. Her bir kalemi güncelle ve stok düşümünü yönet
      for (const item of itemStatuses) {
        const currentItem = await tx.orderItem.findUnique({
          where: { id: parseInt(item.itemId) },
          include: { product: true }
        });

        if (!currentItem) continue;

        // Stok düşüm mantığı
        if (item.status === 'APPROVED' && !currentItem.isStockDeducted) {
          // Henüz düşülmemişse ve onaylanıyorsa: DÜŞ
          await tx.product.update({
            where: { id: currentItem.productId },
            data: { stock: { decrement: currentItem.quantity } }
          });
          await tx.orderItem.update({
            where: { id: currentItem.id },
            data: { status: 'APPROVED', isStockDeducted: true }
          });
        } else if (item.status === 'CANCELLED' && currentItem.isStockDeducted) {
          // Daha önce düşülmüşse ve şimdi iptal ediliyorsa: İADE ET
          await tx.product.update({
            where: { id: currentItem.productId },
            data: { stock: { increment: currentItem.quantity } }
          });
          await tx.orderItem.update({
            where: { id: currentItem.id },
            data: { status: 'CANCELLED', isStockDeducted: false }
          });
        } else {
          // Sadece statüyü güncelle (zaten doğru stok durumunda)
          await tx.orderItem.update({
            where: { id: parseInt(item.itemId) },
            data: { status: item.status }
          });
        }
      }

      // 2. Yeni toplam tutarı hesapla (Sadece onaylananlar)
      const updatedItems = await tx.orderItem.findMany({
        where: { orderId: parseInt(id), status: 'APPROVED' }
      });

      const newTotal = updatedItems.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);

      // 3. Sipariş durumunu ve tutarını güncelle
      const updatedOrder = await tx.order.update({
        where: { id: parseInt(id) },
        data: {
          totalAmount: newTotal,
          status: 'PARTIAL_APPROVED'
        }
      });

      return updatedOrder;
    });

    res.json({ message: 'Sipariş başarıyla güncellendi ve stoklar işlendi.', updatedOrder: result });
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

export const createOrder = async (req, res) => {
  try {
    const { companyId, items, totalAmount, paymentMethod } = req.body;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Siparişi oluştur
      const order = await tx.order.create({
        data: {
          userId,
          companyId,
          totalAmount,
          paymentMethod,
          status: 'PENDING',
          items: {
            create: items.map(item => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price
            }))
          }
        }
      });

      return order;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(400).json({ message: 'Sipariş oluşturulamadı.' });
  }
};
