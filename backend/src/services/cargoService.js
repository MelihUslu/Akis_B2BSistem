import prisma, { runWithTenant, runAsPlatform } from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/secretBox.js';
import * as yurtici from './cargo/yurtici.js';
import { markShipped, markDelivered } from './orderShippingService.js';

export const CARGO_PROVIDERS = ['YURTICI'];

export const cargoCreds = (tenant) => {
  if (tenant?.cargoProvider !== 'YURTICI' || !tenant.cargoConfigEnc) return null;
  try { return { ...JSON.parse(decrypt(tenant.cargoConfigEnc)), mode: tenant.cargoMode === 'LIVE' ? 'LIVE' : 'TEST' }; } catch { return null; }
};
export const encryptCargoConfig = (config) => encrypt(JSON.stringify(config));

// Kimlik doğrulama denemesi: olmayan bir anahtarı sorgular; şifre yanlışsa servis hata döndürür
export const testCargo = (creds) => yurtici.queryShipment(creds, `AKTEST${Date.now()}`);

export const cargoKeyFor = (order) => `AK${order.id}`;

/** Siparişten kargo firmasında gönderi kaydı oluşturur (teslimat adresi il/ilçe içermelidir) */
export const createShipmentForOrder = async (tenant, orderId) => {
  const creds = cargoCreds(tenant);
  if (!creds) throw new Error('Kargo entegrasyonu bağlı değil (Ayarlar → Kargo).');
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { company: true } });
  if (!order) throw new Error('Sipariş bulunamadı.');
  if (order.deliveryMethod === 'PICKUP') throw new Error('Gel-Al siparişi için kargo gönderisi oluşturulmaz.');
  if (!['APPROVED', 'PARTIAL_APPROVED'].includes(order.status)) throw new Error('Gönderi, onaylanmış ve henüz kargolanmamış siparişler için oluşturulabilir.');
  if (order.shipmentKey && order.shipmentStatus !== 'CANCELLED') throw new Error('Bu sipariş için gönderi zaten oluşturulmuş.');
  const a = order.shippingAddress;
  if (!a?.city || !a?.district || !a?.line) throw new Error('Siparişin teslimat adresinde il ve ilçe yok. Bayinin teslimat adresini güncelleyin ya da takip numarasını elle girin.');

  const cargoKey = order.shipmentKey && order.shipmentStatus === 'CANCELLED' ? `${cargoKeyFor(order)}-${Date.now().toString(36).toUpperCase()}` : cargoKeyFor(order);
  await yurtici.createShipment(creds, {
    cargoKey,
    receiverName: (a.contactName ? `${order.company.name} (${a.contactName})` : order.company.name).slice(0, 200),
    address: `${a.line} ${a.district}/${a.city}`,
    city: a.city, district: a.district, phone: a.phone || order.company.phone,
    taxNumber: order.company.taxNumber, taxOfficeName: order.company.taxOffice,
    description: `Sipariş AK-${order.id}`
  });
  return prisma.order.update({
    where: { id: order.id },
    data: { shipmentProvider: 'YURTICI', shipmentKey: cargoKey, shipmentStatus: 'CREATED', shipmentInfo: 'Gönderi kaydı oluşturuldu, kargo teslim alınca takip numarası gelecek.', shipmentSyncedAt: new Date(), cargoCompany: 'YURTICI' }
  });
};

/** Kargo firmasından son durumu çeker; takip numarası gelince sipariş "Kargoda", teslim edilince "Teslim edildi" olur */
export const syncShipment = async (tenant, orderId) => {
  const creds = cargoCreds(tenant);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!creds || !order?.shipmentKey || order.shipmentProvider !== 'YURTICI') return order;
  const r = await yurtici.queryShipment(creds, order.shipmentKey);
  const info = { shipmentStatus: r.status === 'NOT_FOUND' ? order.shipmentStatus : r.status, shipmentInfo: r.statusText?.slice(0, 300) || null, shipmentSyncedAt: new Date() };

  if (r.trackingNumber && ['APPROVED', 'PARTIAL_APPROVED'].includes(order.status)) {
    const shipped = await markShipped(tenant, order, { trackingNumber: r.trackingNumber, cargoCompany: 'YURTICI', extra: info });
    return r.status === 'DELIVERED' ? markDelivered(tenant, shipped) : shipped;
  }
  if (r.status === 'DELIVERED' && order.status === 'SHIPPED') return markDelivered(tenant, order, info);
  return prisma.order.update({ where: { id: order.id }, data: { ...info, ...(r.trackingNumber && !order.trackingNumber && { trackingNumber: r.trackingNumber }) } });
};

export const cancelShipmentForOrder = async (tenant, orderId) => {
  const creds = cargoCreds(tenant);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!creds || !order?.shipmentKey) throw new Error('İptal edilecek gönderi yok.');
  if (order.status === 'SHIPPED' || order.status === 'COMPLETED') throw new Error('Kargo teslim alınmış gönderi buradan iptal edilemez; kargo şubesiyle görüşün.');
  await yurtici.cancelShipment(creds, order.shipmentKey);
  return prisma.order.update({ where: { id: order.id }, data: { shipmentStatus: 'CANCELLED', shipmentInfo: 'Gönderi iptal edildi.', shipmentSyncedAt: new Date() } });
};

// Zamanlanmış iş: kargo entegrasyonu açık firmalarda bekleyen gönderilerin durumunu günceller
export const syncAllShipments = async () => {
  const tenants = await runAsPlatform(() => prisma.tenant.findMany({ where: { cargoProvider: { not: null } } }));
  for (const tenant of tenants) {
    await runWithTenant(tenant.id, async () => {
      const orders = await prisma.order.findMany({
        where: { shipmentKey: { not: null }, shipmentStatus: { in: ['CREATED', 'IN_TRANSIT'] }, status: { in: ['APPROVED', 'PARTIAL_APPROVED', 'SHIPPED'] } },
        select: { id: true }, take: 200
      });
      for (const o of orders) await syncShipment(tenant, o.id).catch((err) => console.error(`[Kargo] ${tenant.slug} AK-${o.id}:`, err.message));
    }).catch((err) => console.error(`[Kargo] ${tenant.slug}:`, err.message));
  }
};
