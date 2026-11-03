import prisma, { runWithTenant, runAsPlatform } from '../utils/prisma.js';
import { getSettingsMap, num } from './settingsService.js';
import { tenantAccess } from '../middlewares/tenantMiddleware.js';
import { sendTrialEndingMail, sendNotificationMail } from './mailService.js';
import { wantsEmail, TYPE_PERMISSION } from './notificationPrefs.js';
import { currentTenantId } from '../utils/prisma.js';
import { withJobLock } from '../utils/redis.js';
import { trackJob, cleanupMonitoring, startMetricsFlush } from './monitoring.js';
import { sendDailyDigestIfDue } from './monitoringReport.js';
import { pushToUser } from './pushService.js';

// E-posta için firma bilgisi (ad, portal adresi); kısa süreli önbellek
const tenantCache = new Map();
const tenantForMail = async (tenantId) => {
  const hit = tenantCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.tenant;
  const tenant = await runAsPlatform(() => prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, customDomain: true, customDomainVerifiedAt: true } }));
  tenantCache.set(tenantId, { tenant, at: Date.now() });
  return tenant;
};

// Kullanıcı bu türü e-postayla almak istiyorsa bildirimi e-postayla da gönderir (asıl işlemi bekletmez)
const mailIfWanted = (userId, notification) => {
  const tenantId = currentTenantId();
  if (!tenantId) return;
  prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, role: true, isActive: true, notificationPrefs: true } })
    .then(async (user) => {
      if (!user?.isActive || !wantsEmail(user, notification.type)) return;
      await sendNotificationMail({ to: user.email, name: user.name, tenant: await tenantForMail(tenantId), notification });
    })
    .catch((err) => console.error('[Bildirim e-postası]', err.message));
};

const create = async (userId, { type, title, message, link, dedupeKey }) => {
  if (dedupeKey) {
    const exists = await prisma.notification.findUnique({ where: { dedupeKey } });
    if (exists) return null;
  }
  try {
    const notification = await prisma.notification.create({ data: { userId, type, title, message, link, dedupeKey } });
    mailIfWanted(userId, notification);
    pushToUser(userId, notification).catch((err) => console.error('[Push]', err.message));
    return notification;
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

// Yöneticilere bildirim: personel yalnızca ilgili yetkisi varsa alır (sipariş → Siparişler yetkisi gibi)
export const notifyAdmins = async (payload) => {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true, isOwner: true, permissions: true } });
  // anyPermission: yetkilerden biri yeterli (örn. rapor: sipariş ya da finans)
  const needed = payload.anyPermission || [TYPE_PERMISSION[payload.type]].filter(Boolean);
  const allowed = admins.filter((u) => !needed.length || u.isOwner || (Array.isArray(u.permissions) && needed.some((p) => u.permissions.includes(p))));
  await Promise.all(allowed.map(u => create(u.id, { ...payload, dedupeKey: payload.dedupeKey && `${payload.dedupeKey}:u${u.id}` })));
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
      status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'READY_FOR_PICKUP', 'COMPLETED'] },
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

/**
 * Cari görüşme notlarındaki hatırlatmalar: zamanı gelen, tamamlanmamış not için notu yazana bir kez bildirim.
 */
export const runPartnerReminders = async () => {
  const notes = await prisma.partnerNote.findMany({
    where: { remindAt: { lte: new Date() }, notifiedAt: null, doneAt: null, userId: { not: null } },
    include: { company: { select: { id: true, name: true } } },
    take: 500
  });
  for (const note of notes) {
    const claimed = await prisma.partnerNote.updateMany({ where: { id: note.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
    if (!claimed.count) continue;
    await create(note.userId, {
      type: 'REMINDER',
      title: `Hatırlatma: ${note.company.name}`,
      message: note.body.length > 160 ? `${note.body.slice(0, 160)}…` : note.body,
      link: `/admin/partners?id=${note.company.id}`
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
      await runPartnerReminders();
      await runTrialReminders(tenant);
      // Haftalık / aylık müşteri takip raporu (zamanı geldiyse)
      await import('./periodicReportService.js').then((m) => m.runPeriodicReports());
      // Düzenli gelir / gider (kira, maaş…): günü gelenler kaydedilir
      await import('../controllers/cashController.js').then((m) => m.runRecurringCash());
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

// Çok sunuculu kurulumda her iş tek sunucuda çalışır (Redis kilidi); böylece bayilere çift hatırlatma gitmez
// Her çalışma Platform → İzleme → Arka plan işleri'nde görünür; hata veren iş uyarı e-postası gönderir
export const startNotificationJobs = () => {
  const run = () => withJobLock('scheduled-hourly', 50 * 60 * 1000, () => trackJob('Saatlik işler (hatırlatmalar, deneme süresi)', async () => {
    await runScheduledJobs();
    await cleanupMonitoring();
  })).catch(err => console.error('[Zamanlanmış İş] Hata:', err.message));
  setTimeout(run, 10 * 1000);
  setInterval(run, 60 * 60 * 1000); // saatlik
  // Kargo gönderilerinin durumu (takip no, teslim) yarım saatte bir güncellenir
  const cargo = () => import('./cargoService.js').then((m) => withJobLock('cargo-sync', 25 * 60 * 1000, () => trackJob('Kargo durum senkronu', m.syncAllShipments))).catch(err => console.error('[Kargo senkron] Hata:', err.message));
  setInterval(cargo, 30 * 60 * 1000);
  // Başarısız webhook gönderimlerinin yeniden denenmesi (30 sn'de bir; çok sunuculu kurulumda kayıt kilidiyle tek gönderim)
  const hooks = () => import('./webhookService.js').then((m) => trackJob('Webhook kuyruğu', m.processWebhookQueue, { quietSuccess: true })).catch(err => console.error('[Webhook kuyruğu] Hata:', err.message));
  setInterval(hooks, 30 * 1000);
  // Günlük özet e-postası (08:00, PLATFORM_ALERT_EMAIL)
  const digest = () => withJobLock('daily-digest', 50 * 60 * 1000, () => sendDailyDigestIfDue()).catch(err => console.error('[Günlük özet] Hata:', err.message));
  setInterval(digest, 10 * 60 * 1000);
  startMetricsFlush();
};
