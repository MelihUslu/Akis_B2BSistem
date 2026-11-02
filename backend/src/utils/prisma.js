import { AsyncLocalStorage } from 'node:async_hooks';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

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

const TENANT_MODELS = new Set([
  'User', 'Company', 'Category', 'Product', 'Order', 'OrderItem', 'Payment', 'FinancialTransaction',
  'PlasiyerPoint', 'Setting', 'Reconciliation', 'ReturnRequest', 'Notification', 'StockAlert', 'SubscriptionPayment',
  'ProductOption', 'ProductOptionValue', 'ProductVariantValue', 'SpecialPrice', 'Coupon', 'QuoteRequest',
  'QuoteRequestItem', 'Favorite', 'OrderTemplate', 'ApiKey', 'Webhook', 'SupportTicket', 'SupportMessage', 'Invoice', 'DeliveryAddress', 'Warehouse', 'WarehouseStock', 'WebhookDelivery', 'PushSubscription',
  'QuoteRevision', 'ProductCompatibility', 'CompanyContact',
  'PartnerNote', 'PartnerDocument', 'StatementRequest', 'CustomerLead', 'WhatsappChannel', 'WaConversation', 'WaMessage'
]);

const WHERE_OPERATIONS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'
]);

export const basePrisma = new PrismaClient();

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args);

        const store = tenantStorage.getStore();
        if (store?.platform) return query(args);

        const tenantId = store?.tenantId;
        if (!tenantId) {
          throw new Error(`[Tenant] Kiracı bağlamı olmadan ${model}.${operation} çağrıldı.`);
        }

        const scoped = { ...args };
        if (WHERE_OPERATIONS.has(operation)) scoped.where = { ...(args.where || {}), tenantId };
        if (operation === 'create') scoped.data = { ...args.data, tenantId };
        if (operation === 'createMany') {
          scoped.data = (Array.isArray(args.data) ? args.data : [args.data]).map(d => ({ ...d, tenantId }));
        }
        if (operation === 'upsert') scoped.create = { ...args.create, tenantId };
        return query(scoped);
      }
    }
  }
});

export default prisma;
