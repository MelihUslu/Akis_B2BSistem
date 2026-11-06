import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import prisma, { runAsPlatform } from '../utils/prisma.js';
import { withSlot } from '../utils/redis.js';
import { openXlsx } from '../utils/xlsxStream.js';

/**
 * Firmanın tüm verisini tek Excel dosyasına aktarır (KVKK / veri taşınabilirliği).
 * Şifreler, 2FA anahtarları ve POS anahtarları dahil edilmez.
 *
 * Bellek: tablolar sırayla ve 5.000 satırlık parçalarla okunur, satırlar akışla geçici dosyaya yazılır (utils/xlsxStream).
 * Eskiden bütün tablolar ve Excel dosyası bellekte kuruluyordu: 60 bin siparişli firmada tek dışa aktarım +2,8 GB
 * kullanıyor, sunucu süreçlerini bellek yetersizliğinden düşürüyordu (yük testi, 5 Kasım 2026). Aynı anda en fazla bir
 * dışa aktarım çalışır (tüm sunucularda); doluysa BusyError, çağıran "biraz sonra tekrar deneyin" yanıtı verir.
 * Dönen { file } geçici dosyadır: sendExportFile gönderip siler. signal: istemci ayrılırsa (sekme kapandı, zaman aşımı)
 * hazırlık her parçada kontrol edilip durdurulur; yük altında yarım kalan dışa aktarım tek hakkı dakikalarca tutuyordu.
 */
const PAGE = 5000;
const SHEET_ROWS = 1_000_000; // Excel sayfa sınırının (1.048.576) altında: aşan tablo "Ad 2", "Ad 3"… sayfalarına bölünür
const EXPORT_SLOT_MS = 15 * 60 * 1000;
const TMP_PREFIX = 'akis-disa-aktarim-';
export class ExportAborted extends Error {}

// Yarıda kalmış (süreç düşmüş) eski geçici dosyalar
const cleanupStale = async () => {
  const dir = os.tmpdir();
  const names = await fs.readdir(dir).catch(() => []);
  await Promise.all(names.filter((n) => n.startsWith(TMP_PREFIX)).map(async (n) => {
    const f = path.join(dir, n);
    const st = await fs.stat(f).catch(() => null);
    if (st && Date.now() - st.mtimeMs > 6 * 60 * 60 * 1000) await fs.rm(f, { force: true });
  }));
};

export const exportTenantWorkbook = (tenantId, { signal } = {}) => withSlot('tenant-export', 1, EXPORT_SLOT_MS, () => runAsPlatform(async () => {
  await cleanupStale();
  const w = { tenantId };
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
  const flat = (v) => (v instanceof Date ? v.toISOString() : (v && typeof v === 'object' ? JSON.stringify(v) : v));
  const file = path.join(os.tmpdir(), `${TMP_PREFIX}${tenantId}-${crypto.randomBytes(6).toString('hex')}.xlsx`);
  const book = openXlsx(file);

  const table = async (name, rows) => {
    const s = await book.sheet(name);
    const cols = Object.keys(rows[0]);
    await s.row(cols);
    for (const r of rows) await s.row(cols.map((k) => flat(r[k])));
    await s.end();
  };
  // Tablo id sırasıyla parça parça okunur; okunan parça yazılıp bir sonrakinden önce bırakılır
  const paged = async (name, model, args = {}, map = (r) => r) => {
    let sheet = null;
    let cols = null;
    let part = 1;
    let lastId = 0;
    for (;;) {
      if (signal?.aborted) throw new ExportAborted();
      const rows = await prisma[model].findMany({ ...args, where: { ...w, id: { gt: lastId } }, orderBy: { id: 'asc' }, take: PAGE });
      if (!rows.length) break;
      lastId = rows[rows.length - 1].id;
      for (const raw of rows) {
        const r = map(raw);
        cols ||= Object.keys(r);
        if (sheet && sheet.rows > SHEET_ROWS) { await sheet.end(); sheet = null; part++; }
        if (!sheet) {
          sheet = await book.sheet(part === 1 ? name : `${name} ${part}`);
          await sheet.row(cols);
        }
        await sheet.row(cols.map((k) => flat(r[k])));
      }
      if (rows.length < PAGE) break;
    }
    if (sheet) await sheet.end();
    else await table(name, [{ bilgi: 'Kayıt yok' }]);
  };

  try {
    await table('Firma', [{ ad: tenant.name, adres: tenant.slug, paket: tenant.plan.name, durum: tenant.status, kayit: tenant.createdAt, disaAktarim: new Date() }]);
    await paged('Kullanıcılar', 'user', { select: { id: true, name: true, email: true, role: true, companyId: true, isOwner: true, isActive: true, createdAt: true, lastLoginAt: true } });
    await paged('Bayiler', 'company');
    await paged('Kategoriler', 'category');
    await paged('Ürünler', 'product');
    await paged('Siparişler', 'order');
    await paged('Sipariş Kalemleri', 'orderItem');
    await paged('Cari Hareketler', 'financialTransaction');
    await paged('Tahsilatlar', 'payment', { select: { id: true, companyId: true, amount: true, method: true, provider: true, status: true, reference: true, cardLast4: true, paymentDate: true } });
    await paged('Teklifler', 'quoteRequest', { include: { items: true } }, ({ items: qi, ...q }) => ({ ...q, kalemler: JSON.stringify(qi) }));
    await paged('İadeler', 'returnRequest');
    await paged('Kuponlar', 'coupon');
    await paged('Özel Fiyatlar', 'specialPrice');
    await paged('Gelir-Gider', 'cashEntry');
    await paged('Sevkiyatlar', 'orderShipment');
    await paged('Bayi Hedefleri', 'dealerTarget');
    await paged('Personel', 'employee');
    await paged('Personel İzinleri', 'leaveRequest');
    await paged('Masraf ve Avans', 'staffClaim', {}, ({ storedName, ...r }) => r); // eslint-disable-line no-unused-vars
    await paged('Personel Hedefleri', 'staffTarget');
    await paged('Şirket Duyuruları', 'staffAnnouncement');
    await paged('Personel Ödemeleri', 'staffPayment');
    await paged('Toplu SMS', 'smsCampaign');
    await paged('Toplu SMS Alıcıları', 'smsCampaignRecipient');
    await paged('Toplu E-posta', 'mailCampaign');
    await paged('Toplu E-posta Alıcıları', 'mailCampaignRecipient');
    await paged('E-posta Aboneliğinden Çıkanlar', 'emailOptOut');
    await book.close();
  } catch (error) {
    await book.abort();
    throw error;
  }
  return { file, tenant };
}));

/** Dışa aktarım dosyasını indirme olarak gönderir ve geçici dosyayı siler. */
export const sendExportFile = async (res, file, filename) => {
  try {
    const { size } = await fs.stat(file);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', size);
    await pipeline(createReadStream(file), res).catch(() => {}); // indirme yarıda kesilirse sessizce biter
  } finally {
    await fs.rm(file, { force: true });
  }
};

/**
 * Firmanın tüm verisini kalıcı olarak siler (geri alınamaz). İşlem kayıtları korunur.
 */
// ─── Yüklenen dosyalar ───────────────────────────────────────────────────────
// private/partners: cari belgeleri (dosya adı t{kiracı}- ile başlar)
const UPLOAD_DIRS = ['images', 'support', 'private/partners', 'private/cash', 'private/hr'];
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

// "…/uploads/images/abc.png" → { dir: 'images', name: 'abc.png' }
const uploadRef = (url) => {
  const m = /\/uploads\/(images|support)\/([^/?#]+)/.exec(String(url || ''));
  return m && SAFE_NAME.test(m[2]) ? { dir: m[1], name: m[2] } : null;
};
const parseImages = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };

// Firmanın kayıtlarında geçen ve dosya adı firma önekiyle (t<id>-) başlayan tüm yüklemeler
const collectTenantFiles = async (tenantId) => {
  const [products, categories, tenant, messages] = await Promise.all([
    prisma.product.findMany({ where: { tenantId }, select: { images: true } }),
    prisma.category.findMany({ where: { tenantId }, select: { imageUrl: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true } }),
    prisma.supportMessage.findMany({ where: { tenantId }, select: { attachments: true } })
  ]);
  const refs = [
    ...products.flatMap((p) => parseImages(p.images)),
    ...categories.map((c) => c.imageUrl),
    tenant?.logoUrl,
    ...messages.flatMap((m) => (Array.isArray(m.attachments) ? m.attachments.map((a) => a.url) : []))
  ].map(uploadRef).filter(Boolean);

  for (const dir of UPLOAD_DIRS) {
    const prefixed = await fs.readdir(path.join('uploads', dir)).catch(() => []);
    prefixed.filter((n) => n.startsWith(`t${tenantId}-`)).forEach((name) => refs.push({ dir, name }));
  }
  const unique = new Map(refs.map((r) => [`${r.dir}/${r.name}`, r]));
  return [...unique.values()];
};

// Önceki sürümlerden kalan öneksiz dosyalar başka bir firma tarafından da kullanılıyorsa silinmez
const sharedWithOthers = async (tenantId, name) => {
  const others = { tenantId: { not: tenantId } };
  const [p, c, t] = await Promise.all([
    prisma.product.count({ where: { ...others, images: { contains: name } } }),
    prisma.category.count({ where: { ...others, imageUrl: { contains: name } } }),
    prisma.tenant.count({ where: { id: { not: tenantId }, logoUrl: { contains: name } } })
  ]);
  return p + c + t > 0;
};

const deleteFiles = async (tenantId, files) => {
  let deleted = 0;
  for (const f of files) {
    if (!f.name.startsWith(`t${tenantId}-`) && await sharedWithOthers(tenantId, f.name)) continue;
    try {
      await fs.unlink(path.join('uploads', f.dir, f.name));
      deleted++;
    } catch { /* zaten yok */ }
  }
  return deleted;
};

/**
 * Firmanın tüm verisini ve yüklediği dosyaları kalıcı olarak siler (KVKK).
 * Dosyalar, veritabanı silmesi başarıyla tamamlandıktan sonra silinir. Silinen dosya sayısını döndürür.
 */
export const purgeTenant = async (tenantId) => {
  const files = await runAsPlatform(() => collectTenantFiles(tenantId));
  await purgeTenantRecords(tenantId);
  return { deletedFiles: await runAsPlatform(() => deleteFiles(tenantId, files)) };
};

const purgeTenantRecords = (tenantId) => runAsPlatform(() => prisma.$transaction(async (tx) => {
  const w = { where: { tenantId } };
  await tx.notification.deleteMany(w);
  await tx.smsCampaignRecipient.deleteMany(w);
  await tx.smsCampaign.deleteMany(w);
  await tx.mailCampaignRecipient.deleteMany(w);
  await tx.mailCampaign.deleteMany(w);
  await tx.emailOptOut.deleteMany(w);
  await tx.pushSubscription.deleteMany(w);
  await tx.stockAlert.deleteMany(w);
  await tx.favorite.deleteMany(w);
  await tx.orderTemplate.deleteMany(w);
  await tx.quoteRevision.deleteMany(w);
  await tx.quoteRequestItem.deleteMany(w);
  await tx.quoteRequest.deleteMany(w);
  await tx.returnRequest.deleteMany(w);
  await tx.reconciliation.deleteMany(w);
  await tx.plasiyerPoint.deleteMany(w);
  await tx.financialTransaction.deleteMany(w);
  await tx.payment.deleteMany(w);
  await tx.invoice.deleteMany(w);
  await tx.deliveryAddress.deleteMany(w);
  await tx.companyContact.deleteMany(w);
  await tx.partnerNote.deleteMany(w);
  await tx.partnerDocument.deleteMany(w);
  await tx.statementRequest.deleteMany(w);
  await tx.customerLead.deleteMany(w);
  await tx.waMessage.deleteMany(w);
  await tx.waConversation.deleteMany(w);
  await tx.whatsappChannel.deleteMany(w);
  await tx.periodicReport.deleteMany(w);
  await tx.staffPayment.deleteMany(w);
  await tx.leaveRequest.deleteMany(w);
  await tx.staffClaim.deleteMany(w);
  await tx.staffTarget.deleteMany(w);
  await tx.staffAnnouncement.deleteMany(w);
  await tx.employee.updateMany({ ...w, data: { managerId: null } });
  await tx.employee.deleteMany(w);
  await tx.cashEntry.deleteMany(w);
  await tx.cashRecurring.deleteMany(w);
  await tx.transferNotice.deleteMany(w);
  await tx.warehouseStock.deleteMany(w);
  await tx.orderShipment.deleteMany(w);
  await tx.dealerTarget.deleteMany(w);
  await tx.orderItem.deleteMany(w);
  await tx.order.deleteMany(w);
  await tx.warehouse.deleteMany(w);
  await tx.specialPrice.deleteMany(w);
  await tx.productCompatibility.deleteMany(w);
  await tx.coupon.deleteMany(w);
  await tx.productVariantValue.deleteMany(w);
  await tx.productOptionValue.deleteMany(w);
  await tx.productOption.deleteMany(w);
  await tx.product.updateMany({ ...w, data: { parentId: null, alternativeToId: null } });
  await tx.product.deleteMany(w);
  await tx.category.updateMany({ ...w, data: { parentId: null } });
  await tx.category.deleteMany(w);
  await tx.setting.deleteMany(w);
  await tx.apiKey.deleteMany(w);
  await tx.webhookDelivery.deleteMany(w);
  await tx.webhook.deleteMany(w);
  await tx.supportMessage.deleteMany(w);
  await tx.supportTicket.deleteMany(w);
  await tx.subscriptionPayment.deleteMany(w);
  await tx.company.updateMany({ ...w, data: { plasiyerId: null } });
  await tx.user.deleteMany(w);
  await tx.company.deleteMany(w);
  // İzleme kayıtları (firmaya bağlı API istekleri, dış servis çağrıları, yavaş istekler)
  await tx.apiRequestLog.deleteMany(w);
  await tx.externalCall.deleteMany(w);
  await tx.slowRequest.deleteMany(w);
  await tx.tenant.delete({ where: { id: tenantId } });
}, { timeout: 60000 }));
