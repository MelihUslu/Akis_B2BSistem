import fs from 'fs/promises';
import path from 'path';
import xlsx from 'xlsx';
import prisma, { runAsPlatform } from '../utils/prisma.js';

/**
 * Firmanın tüm verisini tek Excel dosyasına aktarır (KVKK / veri taşınabilirliği).
 * Şifreler, 2FA anahtarları ve POS anahtarları dahil edilmez.
 */
export const exportTenantWorkbook = (tenantId) => runAsPlatform(async () => {
  const w = { tenantId };
  const [tenant, users, companies, categories, products, orders, items, transactions, payments, quotes, returns, coupons, specials] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } }),
    prisma.user.findMany({ where: w, select: { id: true, name: true, email: true, role: true, companyId: true, isOwner: true, isActive: true, createdAt: true, lastLoginAt: true } }),
    prisma.company.findMany({ where: w }),
    prisma.category.findMany({ where: w }),
    prisma.product.findMany({ where: w }),
    prisma.order.findMany({ where: w }),
    prisma.orderItem.findMany({ where: w }),
    prisma.financialTransaction.findMany({ where: w }),
    prisma.payment.findMany({ where: w, select: { id: true, companyId: true, amount: true, method: true, provider: true, status: true, reference: true, cardLast4: true, paymentDate: true } }),
    prisma.quoteRequest.findMany({ where: w, include: { items: true } }),
    prisma.returnRequest.findMany({ where: w }),
    prisma.coupon.findMany({ where: w }),
    prisma.specialPrice.findMany({ where: w })
  ]);

  const flat = (rows) => rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : (v && typeof v === 'object' ? JSON.stringify(v) : v)])));
  const wb = xlsx.utils.book_new();
  const sheet = (name, rows) => xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(rows.length ? flat(rows) : [{ bilgi: 'Kayıt yok' }]), name);

  sheet('Firma', [{ ad: tenant.name, adres: tenant.slug, paket: tenant.plan.name, durum: tenant.status, kayit: tenant.createdAt, disaAktarim: new Date() }]);
  sheet('Kullanıcılar', users);
  sheet('Bayiler', companies);
  sheet('Kategoriler', categories);
  sheet('Ürünler', products);
  sheet('Siparişler', orders);
  sheet('Sipariş Kalemleri', items);
  sheet('Cari Hareketler', transactions);
  sheet('Tahsilatlar', payments);
  sheet('Teklifler', quotes.map(({ items: qi, ...q }) => ({ ...q, kalemler: JSON.stringify(qi) })));
  sheet('İadeler', returns);
  sheet('Kuponlar', coupons);
  sheet('Özel Fiyatlar', specials);
  return { buffer: xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }), tenant };
});

/**
 * Firmanın tüm verisini kalıcı olarak siler (geri alınamaz). İşlem kayıtları korunur.
 */
// ─── Yüklenen dosyalar ───────────────────────────────────────────────────────
// private/partners: cari belgeleri (dosya adı t{kiracı}- ile başlar)
const UPLOAD_DIRS = ['images', 'support', 'private/partners'];
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
  await tx.warehouseStock.deleteMany(w);
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
