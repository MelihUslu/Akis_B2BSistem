import prisma, { runWithTenant, runAsPlatform } from '../utils/prisma.js';
import { getSettingsMap, num } from './settingsService.js';
import { tenantAccess } from '../middlewares/tenantMiddleware.js';
import { sendTrialEndingMail } from './mailService.js';

const create = async (userId, { type, title, message, link, dedupeKey }) => {
  if (dedupeKey) {
    const exists = await prisma.notification.findUnique({ where: { dedupeKey } });
    if (exists) return null;
  }
  try {
    return await prisma.notification.create({ data: { userId, type, title, message, link, dedupeKey } });
  } catch (error) {
    if (error.code === 'P2002') return null; // Aynı dedupeKey eşzamanlı oluşturulduysa yok say
    throw error;
  }
};

export const notifyUser = (userId, payload) => create(userId, payload);

export const notifyCompany = async (companyId, payload) => {
  const users = await prisma.user.findMany({ where: { companyId, role: 'BAYI' }, select: { id: true } });
  await Promise.all(users.map(u => create(u.id, payload.dedupeKey ? { ...payload, dedupeKey: `${payload.dedupeKey}:u${u.id}` } : payload)));
};

export const notifyAdmins = async (payload) => {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  await Promise.all(admins.map(u => create(u.id, payload)));
};

// Bildirim hataları asıl işlemi bozmasın
export const safeNotify = (promise) => promise.catch(err => console.error('[Bildirim] Gönderilemedi:', err.message));

/**
 * Stoğu tekrar gelen ürünler için "Gelince Haber Ver" diyen bayilere bildirim gönderir.
 */
export const notifyRestocked = async (productIds) => {
  if (!productIds?.length) return;
  const alerts = await prisma.stockAlert.findMany({
    where: { productId: { in: productIds }, notifiedAt: null, product: { stock: { gt: 0 }, isActive: true } },
    include: { product: { select: { name: true, sku: true } } }
  });

  for (const alert of alerts) {
    await create(alert.userId, {
      type: 'STOCK',
      title: 'Beklediğiniz ürün stokta!',
      message: `${alert.product.name} (${alert.product.sku}) tekrar stoklarımızda.`,
      link: '/bayi'
    });
    await prisma.stockAlert.update({ where: { id: alert.id }, data: { notifiedAt: new Date() } });
  }
};

/**
 * Vadesi yaklaşan / geçen siparişler için bayiye hatırlatma gönderir.
 * Sadece borçlu (bakiyesi eksi) firmalara gider; her sipariş için bir kez.
 */
export const runDueDateReminders = async () => {
  const settings = await getSettingsMap();
  const days = num(settings.due_reminder_days, 3);
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const orders = await prisma.order.findMany({
    where: {
      dueDate: { not: null, lte: horizon },
      status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED'] },
      company: { currentBalance: { lt: 0 } }
    },
    select: { id: true, companyId: true, dueDate: true, totalAmount: true }
  });

  for (const order of orders) {
    const overdue = order.dueDate < now;
    const dateText = order.dueDate.toLocaleDateString('tr-TR');
    await notifyCompany(order.companyId, {
      type: 'PAYMENT_DUE',
      title: overdue ? 'Ödeme vadesi geçti' : 'Ödeme vadeniz yaklaşıyor',
      message: overdue
        ? `#AK-${order.id} numaralı siparişinizin vadesi ${dateText} tarihinde doldu. Lütfen ödemenizi yapın.`
        : `#AK-${order.id} numaralı siparişinizin vadesi ${dateText}. Tutar: ₺${order.totalAmount.toLocaleString('tr-TR')}.`,
      link: '/bayi/finance',
      dedupeKey: `${overdue ? 'overdue' : 'due-soon'}:${order.id}`
    });
  }
};

// Deneme süresi bitmek üzere olan kiracıların yöneticilerine 3 gün ve 1 gün kala hatırlatma
const runTrialReminders = async (tenant) => {
  if (tenant.status !== 'TRIAL' || !tenant.trialEndsAt) return;
  const daysLeft = Math.ceil((tenant.trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (![3, 1].includes(daysLeft)) return;

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
  for (const admin of admins) {
    const created = await create(admin.id, {
      type: 'SYSTEM',
      title: `Deneme sürenizin bitmesine ${daysLeft} gün kaldı`,
      message: 'Kesintisiz devam etmek için Abonelik sayfasından bir paket seçin.',
      link: '/admin/subscription',
      dedupeKey: `trial:${tenant.id}:${daysLeft}:u${admin.id}`
    });
    if (created) sendTrialEndingMail({ to: admin.email, tenant, daysLeft }).catch(() => {});
  }
};

// Zamanlanmış işler her kiracı için kendi bağlamında ayrı ayrı çalışır
export const runScheduledJobs = async () => {
  const tenants = await runAsPlatform(() => prisma.tenant.findMany({ include: { plan: true } }));
  for (const tenant of tenants) {
    if (!tenantAccess(tenant).active) continue;
    await runWithTenant(tenant.id, async () => {
      await runDueDateReminders();
      await runTrialReminders(tenant);
    }).catch(err => console.error(`[Zamanlanmış İş] ${tenant.slug}:`, err.message));
  }
  if (process.env.AUTO_PURGE_CLOSED === 'true') await purgeExpiredClosedTenants(tenants);
};

// Kapatılıp 30 günlük bekleme süresi dolan hesapların verisi kalıcı silinir (KVKK)
const purgeExpiredClosedTenants = async (tenants) => {
  const { purgeTenant } = await import('./tenantDataService.js');
  const { audit } = await import('./auditService.js');
  for (const t of tenants.filter(t => t.closedAt && t.deletionScheduledAt && t.deletionScheduledAt < new Date())) {
    try {
      await purgeTenant(t.id);
      audit({ tenantId: t.id, actorType: 'SYSTEM', action: 'Kapatılan hesabın verisi otomatik silindi', details: { name: t.name, slug: t.slug } });
    } catch (err) {
      console.error(`[Otomatik silme] ${t.slug}:`, err.message);
    }
  }
};

export const startNotificationJobs = () => {
  const run = () => runScheduledJobs().catch(err => console.error('[Zamanlanmış İş] Hata:', err.message));
  setTimeout(run, 10 * 1000);
  setInterval(run, 60 * 60 * 1000); // saatlik
};
