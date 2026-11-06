import prisma, { runWithTenant, runAsPlatform, basePrisma } from '../utils/prisma.js';
import { getSettingsMap, num } from './settingsService.js';
import { tenantAccess } from '../middlewares/tenantMiddleware.js';
import { sendTrialEndingMail, sendNotificationMail, smtpConfigured } from './mailService.js';
import { wantsEmail, wantsSms, TYPE_PERMISSION } from './notificationPrefs.js';
import { smsActive, smsText, sendSmsBatch } from './smsService.js';
import { currentTenantId } from '../utils/prisma.js';
import { withJobLock } from '../utils/redis.js';
import { trackJob, cleanupMonitoring, startMetricsFlush } from './monitoring.js';
import { sendDailyDigestIfDue } from './monitoringReport.js';
import { pushToUsers } from './pushService.js';
import { accessFor, isVisibleTo } from './catalogAccess.js';

// E-posta için firma bilgisi (ad, portal adresi); kısa süreli önbellek
const tenantCache = new Map();
const tenantForMail = async (tenantId) => {
  const hit = tenantCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.tenant;
  const tenant = await runAsPlatform(() => prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, customDomain: true, customDomainVerifiedAt: true, smsEnabled: true, smsProvider: true, smsConfigEnc: true, smsTypes: true } }));
  tenantCache.set(tenantId, { tenant, at: Date.now() });
  return tenant;
};

// Firma bilgisi ve SMS ayarı değişince önbellek boşaltılır (Ayarlar → SMS kaydı hemen geçerli olsun)
export const forgetTenantForMail = (tenantId) => tenantCache.delete(tenantId);

const USER_FIELDS = { id: true, email: true, name: true, role: true, isActive: true, notificationPrefs: true, phone: true, smsPrefs: true };

// E-posta, SMS ve push arka planda: yalnızca isteyen ve aktif kullanıcılara, sırayla (asıl işlemi ve veritabanı havuzunu bekletmez)
const fanOut = (created, usersById) => {
  const tenantId = currentTenantId();
  if (!tenantId || !created.length) return;
  (async () => {
    let tenant;
    const loadTenant = async () => (tenant ??= await tenantForMail(tenantId));
    const mailTo = created.filter((n) => {
      const u = usersById.get(n.userId);
      return u?.email && u.isActive !== false && wantsEmail(u, n.type);
    });
    if (mailTo.length) {
      if (!smtpConfigured()) {
        if (process.env.NODE_ENV !== 'production') console.log(`[MAIL - SMTP tanımlı değil] ${mailTo.length} alıcıya bildirim e-postası: ${mailTo[0].title}`);
      } else {
        await loadTenant();
        for (const n of mailTo) {
          const u = usersById.get(n.userId);
          await sendNotificationMail({ to: u.email, name: u.name, tenant, notification: n }).catch((err) => console.error('[Bildirim e-postası]', err.message));
        }
      }
    }
    // SMS: firmada açıksa, cep telefonu olan ve bu türü kapatmamış kullanıcılara; hepsi tek Netgsm isteğinde
    if (created.some((n) => usersById.get(n.userId)?.phone) && smsActive(await loadTenant())) {
      const items = created.filter((n) => {
        const u = usersById.get(n.userId);
        return u && u.isActive !== false && wantsSms(tenant, u, n.type);
      }).map((n) => ({ phone: usersById.get(n.userId).phone, text: smsText(tenant, n) }));
      if (items.length) await sendSmsBatch(tenant, items).catch((err) => console.error('[SMS bildirimi]', err.message));
    }
    await pushToUsers(created);
  })().catch((err) => console.error('[Bildirim dağıtımı]', err.message));
};

/**
 * Bildirimleri toplu oluşturur: tekrar kontrolü tek sorguda, kayıt tek sorguda (createManyAndReturn).
 * targets: [{ id, email, name, role, isActive, notificationPrefs, dedupeKey }]. Oluşan bildirimleri döndürür.
 * (Eskiden alıcı başına 4–5 sorgu çalışıyordu; 1000 yöneticili firmada her sipariş binlerce sorgu üretiyordu.)
 */
const deliver = async (targets, { type, title, message, link }) => {
  if (!targets.length) return [];
  const keys = targets.map((t) => t.dedupeKey).filter(Boolean);
  let fresh = targets;
  if (keys.length) {
    const seen = new Set((await prisma.notification.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((n) => n.dedupeKey));
    fresh = targets.filter((t) => !t.dedupeKey || !seen.has(t.dedupeKey));
  }
  if (!fresh.length) return [];
  // skipDuplicates: aynı dedupeKey eşzamanlı oluşturulduysa sessizce atlanır
  const created = await prisma.notification.createManyAndReturn({
    data: fresh.map((t) => ({ userId: t.id, type, title, message, link, dedupeKey: t.dedupeKey || null })),
    skipDuplicates: true
  });
  fanOut(created, new Map(fresh.map((t) => [t.id, t])));
  return created;
};

const create = async (userId, payload) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_FIELDS });
  if (!user) return null;
  const [notification] = await deliver([{ ...user, dedupeKey: payload.dedupeKey || null }], payload);
  return notification || null;
};

export const notifyUser = (userId, payload) => create(userId, payload);

const withKeys = (users, dedupeKey) => users.map((u) => ({ ...u, dedupeKey: dedupeKey ? `${dedupeKey}:u${u.id}` : null }));

export const notifyCompany = async (companyId, payload) => {
  const users = await prisma.user.findMany({ where: { companyId, role: 'BAYI' }, select: USER_FIELDS });
  await deliver(withKeys(users, payload.dedupeKey), payload);
};

// Yöneticilere bildirim: personel yalnızca ilgili yetkisi varsa alır (sipariş → Siparişler yetkisi gibi)
export const notifyAdmins = async (payload) => {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { ...USER_FIELDS, isOwner: true, permissions: true } });
  // anyPermission: yetkilerden biri yeterli (örn. rapor: sipariş ya da finans)
  const needed = payload.anyPermission || [TYPE_PERMISSION[payload.type]].filter(Boolean);
  const allowed = admins.filter((u) => u.id !== payload.excludeUserId // excludeUserId: işlemi yapan kişi (kendi talebi için bildirim almaz)
    && (!needed.length || u.isOwner || (Array.isArray(u.permissions) && needed.some((p) => u.permissions.includes(p)))));
  await deliver(withKeys(allowed, payload.dedupeKey), payload);
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
    include: {
      product: { select: { name: true, sku: true, visibleGroups: true, categoryId: true, parent: { select: { visibleGroups: true, categoryId: true } } } },
      user: { select: { company: { select: { dealerGroup: true } } } }
    }
  });

  // Ürün abonelikten sonra bayinin grubuna kapatıldıysa bildirim gitmez (adı ve kodu sızmasın)
  const access = new Map();
  for (const alert of alerts) {
    const company = alert.user.company;
    const group = company?.dealerGroup || 'STANDART';
    if (!access.has(group)) access.set(group, await accessFor(prisma, company));
    if (!isVisibleTo(alert.product, access.get(group))) continue;
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

/**
 * Otomatik yenilenmeyen abonelik (havale / elle ödeme ya da yenilemesi durdurulmuş kart): bitişten 7, 3 ve 1 gün önce
 * abonelik yetkililerine hatırlatma. Kartla otomatik yenilenen abonelikte gönderilmez.
 */
export const runRenewalReminders = async (tenant, now = new Date()) => {
  if (tenant.status !== 'ACTIVE' || !tenant.currentPeriodEnd || (tenant.iyzicoSubscriptionRef && !tenant.cancelAtPeriodEnd)) return 0;
  const daysLeft = Math.ceil((new Date(tenant.currentPeriodEnd) - now) / (24 * 60 * 60 * 1000));
  if (![7, 3, 1].includes(daysLeft)) return 0;
  await notifyAdmins({
    type: 'SYSTEM',
    anyPermission: ['SETTINGS'],
    title: `Aboneliğinizin bitmesine ${daysLeft} gün kaldı`,
    message: `Erişiminiz ${new Date(tenant.currentPeriodEnd).toLocaleDateString('tr-TR')} tarihinde sona erer. Kesintisiz devam etmek için Abonelik sayfasından yenileyin.`,
    link: '/admin/subscription',
    dedupeKey: `renewal:${tenant.id}:${new Date(tenant.currentPeriodEnd).toISOString().slice(0, 10)}:${daysLeft}`
  });
  return 1;
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
      await runRenewalReminders(tenant);
      // Haftalık / aylık müşteri takip raporu (zamanı geldiyse)
      await import('./periodicReportService.js').then((m) => m.runPeriodicReports());
      // Düzenli gelir / gider (kira, maaş…): günü gelenler kaydedilir
      await import('../controllers/cashController.js').then(async (m) => { await m.runRecurringCash(); await m.checkBudgets(); });
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
/**
 * Okunmuş bildirimler 90, okunmamışlar 180 gün sonra silinir (tablo sınırsız büyümesin; bildirimlerine bakmayan
 * personelin satırları da birikmesin). Tekrar engelleme anahtarı olanlar (ör. vade hatırlatması) silinmez: silinirse
 * aynı eski sipariş için hatırlatma yeniden gönderilirdi.
 * Birikmiş çok kayıt tabloyu uzun süre kilitlemesin diye parça parça silinir; kalan bir sonraki saate kalır.
 */
export const NOTIFICATION_RETENTION_DAYS = 90;
export const UNREAD_NOTIFICATION_RETENTION_DAYS = 180;
export const cleanupNotifications = async ({ batch = 5000, maxBatches = 40 } = {}) => {
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 86400000);
  const unreadCutoff = new Date(Date.now() - UNREAD_NOTIFICATION_RETENTION_DAYS * 86400000);
  let deleted = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await basePrisma.$executeRaw`
      DELETE FROM "Notification" WHERE id IN (
        SELECT id FROM "Notification"
        WHERE "dedupeKey" IS NULL AND ("createdAt" < ${unreadCutoff} OR ("createdAt" < ${cutoff} AND "isRead" = true))
        LIMIT ${batch}
      )`;
    deleted += n;
    if (n < batch) break;
  }
  return deleted;
};

export const startNotificationJobs = () => {
  const run = () => withJobLock('scheduled-hourly', 50 * 60 * 1000, () => trackJob('Saatlik işler (hatırlatmalar, deneme süresi)', async () => {
    await runScheduledJobs();
    await cleanupMonitoring();
    await cleanupNotifications();
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
