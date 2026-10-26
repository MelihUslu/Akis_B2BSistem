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
export const purgeTenant = (tenantId) => runAsPlatform(() => prisma.$transaction(async (tx) => {
  const w = { where: { tenantId } };
  await tx.notification.deleteMany(w);
  await tx.stockAlert.deleteMany(w);
  await tx.favorite.deleteMany(w);
  await tx.orderTemplate.deleteMany(w);
  await tx.quoteRequestItem.deleteMany(w);
  await tx.quoteRequest.deleteMany(w);
  await tx.returnRequest.deleteMany(w);
  await tx.reconciliation.deleteMany(w);
  await tx.plasiyerPoint.deleteMany(w);
  await tx.financialTransaction.deleteMany(w);
  await tx.payment.deleteMany(w);
  await tx.orderItem.deleteMany(w);
  await tx.order.deleteMany(w);
  await tx.specialPrice.deleteMany(w);
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
  await tx.webhook.deleteMany(w);
  await tx.supportMessage.deleteMany(w);
  await tx.supportTicket.deleteMany(w);
  await tx.subscriptionPayment.deleteMany(w);
  await tx.company.updateMany({ ...w, data: { plasiyerId: null } });
  await tx.user.deleteMany(w);
  await tx.company.deleteMany(w);
  await tx.tenant.delete({ where: { id: tenantId } });
}, { timeout: 60000 }));
