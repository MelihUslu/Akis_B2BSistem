import prisma from '../utils/prisma.js';
import { pushEnabled, publicKey, subscribe, unsubscribe } from '../services/pushService.js';

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

// Web Push (kurulan uygulama için telefon bildirimi)
export const pushConfig = (req, res) => res.json({ enabled: pushEnabled, publicKey: publicKey() });

export const pushSubscribe = async (req, res) => {
  try {
    if (!pushEnabled) return res.status(503).json({ message: 'Anlık bildirimler bu sunucuda kapalı.' });
    await subscribe(req.user.id, req.body?.subscription, req.headers['user-agent']);
    res.json({ message: 'Bu cihazda anlık bildirimler açıldı.' });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Abonelik kaydedilemedi.' });
  }
};

export const pushUnsubscribe = async (req, res) => {
  try {
    await unsubscribe(req.user.id, String(req.body?.endpoint || ''));
    res.json({ message: 'Bu cihazda anlık bildirimler kapatıldı.' });
  } catch {
    res.status(500).json({ message: 'Abonelik silinemedi.' });
  }
};
