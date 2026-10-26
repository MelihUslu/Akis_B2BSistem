import prisma from '../utils/prisma.js';

export const getNotifications = async (req, res) => {
  try {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30
      }),
      prisma.notification.count({ where: { userId: req.user.id, isRead: false } })
    ]);
    res.json({ items, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Bildirimler getirilemedi.' });
  }
};

export const markRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { id: parseInt(req.params.id), userId: req.user.id },
      data: { isRead: true }
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: 'Bildirim güncellenemedi.' });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: 'Bildirimler güncellenemedi.' });
  }
};
