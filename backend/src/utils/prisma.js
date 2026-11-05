import { AsyncLocalStorage } from 'node:async_hooks';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { invalidate } from './cache.js';
import { noteDbError } from './dbHealth.js';

/**
 * Çok kiracılı (multi-tenant) veri izolasyonu.
 *
 * Her HTTP isteği bir bağlam içinde çalışır:
 *   - runWithTenant(tenantId, fn): tüm sorgulara otomatik `tenantId` filtresi eklenir
 *   - runAsPlatform(fn):           platform sahibi (SUPER_ADMIN) işlemleri, filtre uygulanmaz
 * Bağlam yoksa kiracıya ait tablolara yapılan sorgu HATA verir; böylece unutulan
 * bir filtre başka firmanın verisini sızdıramaz.
 */
export const tenantStorage = new AsyncLocalStorage();

export const runWithTenant = (tenantId, fn) => tenantStorage.run({ tenantId }, fn);
// fn içinde döndürülen Prisma sorgusu, bağlam içinde beklenir (Prisma sorguları await edilince çalışır;
// bağlam dışında beklenirse kiracı filtresi yanlış bağlamda uygulanırdı)
export const runAsPlatform = (fn) => tenantStorage.run({ platform: true }, async () => await fn());
export const currentTenantId = () => tenantStorage.getStore()?.tenantId ?? null;

/**
 * Veritabanı bağlantı havuzu (süreç başına). Varsayılan Prisma: çekirdek × 2 + 1.
 * DB_POOL_SIZE / DB_POOL_TIMEOUT (sn) ile ayarlanır; birden fazla süreç (WEB_CONCURRENCY) çalışıyorsa
 * toplam = süreç × havuz, PostgreSQL max_connections'ı (varsayılan 100) aşmamalı.
 */
function poolOptions() {
  const size = parseInt(process.env.DB_POOL_SIZE);
  const timeout = parseInt(process.env.DB_POOL_TIMEOUT);
  if (!(size > 0) && !(timeout > 0)) return undefined;
  const url = new URL(process.env.DATABASE_URL);
  if (size > 0) url.searchParams.set('connection_limit', String(size));
  if (timeout > 0) url.searchParams.set('pool_timeout', String(timeout));
  return { datasources: { db: { url: url.toString() } } };
}

const TENANT_MODELS = new Set([
  'User', 'Company', 'Category', 'Product', 'Order', 'OrderItem', 'Payment', 'FinancialTransaction',
  'PlasiyerPoint', 'Setting', 'Reconciliation', 'ReturnRequest', 'Notification', 'StockAlert', 'SubscriptionPayment',
  'ProductOption', 'ProductOptionValue', 'ProductVariantValue', 'SpecialPrice', 'Coupon', 'QuoteRequest',
  'QuoteRequestItem', 'Favorite', 'OrderTemplate', 'ApiKey', 'Webhook', 'SupportTicket', 'SupportMessage', 'Invoice', 'DeliveryAddress', 'Warehouse', 'WarehouseStock', 'WebhookDelivery', 'PushSubscription',
  'QuoteRevision', 'ProductCompatibility', 'CompanyContact',
  'PartnerNote', 'PartnerDocument', 'StatementRequest', 'CustomerLead', 'WhatsappChannel', 'WaConversation', 'WaMessage', 'PeriodicReport', 'CashEntry', 'CashRecurring', 'TransferNotice',
  'OrderShipment', 'DealerTarget',
  'Employee', 'LeaveRequest', 'StaffClaim', 'StaffTarget', 'StaffAnnouncement', 'StaffPayment'
]);

const WHERE_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'
]);

// Oturum kontrolü önbelleği (authMiddleware): kullanıcıya her yazmada ve firma durumu değişince temizlenir,
// böylece pasife alınan kullanıcı / askıya alınan bayi önbellek süresini beklemeden çıkarılır
const WRITE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
const touchesAuth = (model, operation, args) => {
  if (!WRITE_OPERATIONS.has(operation)) return false;
  if (model === 'User') return true;
  if (model !== 'Company') return false;
  return operation.startsWith('delete') || 'status' in (args?.data || {}) || 'status' in (args?.update || {});
};
const afterWrite = (model, operation, args, tenantId) => {
  if (touchesAuth(model, operation, args)) invalidate(tenantId ? `authuser:${tenantId}:` : 'authuser:');
};

export const basePrisma = new PrismaClient(poolOptions());

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      // Bağlantı hatası (veritabanı kapalı) görülürse kısa süre yeni istekler 503 alır (utils/dbHealth.js)
      async $allOperations(params) {
        try {
          return await scopedOperation(params);
        } catch (error) {
          noteDbError(error);
          throw error;
        }
      }
    }
  }
});

async function scopedOperation({ model, operation, args, query }) {
  if (!TENANT_MODELS.has(model)) return query(args);

  const store = tenantStorage.getStore();
  if (store?.platform) {
    const result = await query(args);
    afterWrite(model, operation, args, null);
    return result;
  }

  const tenantId = store?.tenantId;
  if (!tenantId) {
    throw new Error(`[Tenant] Kiracı bağlamı olmadan ${model}.${operation} çağrıldı.`);
  }

  const scoped = { ...args };
  if (WHERE_OPERATIONS.has(operation)) scoped.where = { ...(args.where || {}), tenantId };
  if (operation === 'create') scoped.data = { ...args.data, tenantId };
  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    scoped.data = (Array.isArray(args.data) ? args.data : [args.data]).map(d => ({ ...d, tenantId }));
  }
  if (operation === 'upsert') scoped.create = { ...args.create, tenantId };
  const result = await query(scoped);
  afterWrite(model, operation, args, tenantId);
  return result;
}

export default prisma;

/**
 * Firma içinde sıra numarası (makbuz, teklif no) verilirken işlem sonuna kadar tutulan kilit: aynı firmanın eşzamanlı
 * işlemleri numarayı sırayla alır ("en büyük + 1" çakışmaz), diğer firmalar beklemez. İşlem içinde, numara
 * hesaplanmadan önce çağrılır. (Kampanya günü yük testinde 10 eşzamanlı tahsilatın %6'sı makbuz numarası çakışmasıyla
 * düşüyordu; yeniden deneme yoğun yükte yetmiyordu.)
 */
const SEQUENCES = { RECEIPT: 7101, QUOTE: 7102 };
export const sequenceLock = (tx, name) => tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(${SEQUENCES[name]}::int, ${currentTenantId()}::int)`;
