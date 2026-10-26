import { API_PUBLIC_URL } from '../config.js';
import { WEBHOOK_EVENTS } from '../services/webhookService.js';

// ERP / entegratör API'sinin OpenAPI 3.1 tanımı (GET /api/v1/openapi.json, panelde /developer sayfasında gösterilir)
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, example) => ({ content: { 'application/json': { schema, ...(example && { example }) } } });
const list = (item) => ({ type: 'object', properties: { data: { type: 'array', items: item }, page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' } } });
const batchBody = (item, example) => ({ required: true, description: 'Dizi ya da { items: [...] }. Tek istekte en fazla 1000 kayıt.', ...json({ oneOf: [{ type: 'array', items: item }, { type: 'object', properties: { items: { type: 'array', items: item } } }] }, example) });
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } }
];
const errors = {
  401: { description: 'API anahtarı eksik, geçersiz ya da iptal edilmiş', ...json({ type: 'object', properties: { error: { type: 'string' } } }) },
  429: { description: 'Dakikalık istek sınırı (600) aşıldı' }
};

const build = () => ({
  openapi: '3.1.0',
  info: {
    title: 'B2B Portal Entegrasyon API',
    version: '1.0',
    description: [
      'ERP, muhasebe ve entegratör yazılımlarının firma verisine erişimi içindir.',
      'API anahtarı firma yönetim panelinde **Ayarlar → Entegrasyon** sayfasından oluşturulur ve yalnızca o firmanın verisine erişir.',
      'Tutarlar TL (aksi belirtilmedikçe) ve KDV hariçtir. Tarihler ISO 8601 biçimindedir.'
    ].join('\n\n')
  },
  servers: [{ url: `${API_PUBLIC_URL}/api/v1` }],
  security: [{ ApiKey: [] }],
  tags: [
    { name: 'Ürünler', description: 'Ürün kartı, stok ve fiyat senkronizasyonu' },
    { name: 'Cariler', description: 'Bayi (cari) kartları ve bakiyeler' },
    { name: 'Siparişler', description: 'Siparişlerin ERP\'ye aktarılması, kargo ve fatura bilgisinin geri yazılması' }
  ],
  paths: {
    '/products': {
      get: {
        tags: ['Ürünler'], summary: 'Ürünleri listele',
        description: 'Varyantlar ayrı satır olarak gelir (parentSku ile ana ürüne bağlanır).',
        parameters: [...pageParams, { name: 'updatedSince', in: 'query', description: 'Bu tarihten sonra değişenler', schema: { type: 'string', format: 'date-time' } }],
        responses: { 200: { description: 'Ürün listesi', ...json(list(ref('Product'))) }, ...errors }
      }
    },
    '/products/stock': {
      put: {
        tags: ['Ürünler'], summary: 'Stok güncelle',
        description: 'warehouse (depo kodu) verilirse o deponun stoğu, verilmezse toplam stok ayarlanır. Stoğu 0\'dan yükselen ürünler için "gelince haber ver" diyen bayilere bildirim gider.',
        requestBody: batchBody({ type: 'object', required: ['sku', 'stock'], properties: { sku: { type: 'string' }, stock: { type: 'integer' }, warehouse: { type: 'string', description: 'Depo kodu (ör. IST)' } } }, [{ sku: 'AKS-1001', stock: 120 }, { sku: 'AKS-1002', stock: 15, warehouse: 'ANK' }]),
        responses: { 200: { description: 'Sonuç', ...json({ type: 'object', properties: { updated: { type: 'integer' }, notFound: { type: 'array', items: { type: 'string' } } } }) }, ...errors }
      }
    },
    '/products/prices': {
      put: {
        tags: ['Ürünler'], summary: 'Liste fiyatlarını güncelle',
        requestBody: batchBody({ type: 'object', required: ['sku', 'price'], properties: { sku: { type: 'string' }, price: { type: 'number', description: 'KDV hariç' }, currency: { type: 'string', enum: ['TRY', 'USD', 'EUR'] } } }, [{ sku: 'AKS-1001', price: 1249.9 }]),
        responses: { 200: { description: 'Sonuç', ...json({ type: 'object', properties: { updated: { type: 'integer' }, notFound: { type: 'array', items: { type: 'string' } } } }) }, ...errors }
      }
    },
    '/products/upsert': {
      post: {
        tags: ['Ürünler'], summary: 'Ürün ekle / güncelle',
        description: 'SKU varsa günceller, yoksa ekler (yeni üründe name ve price zorunlu). Kategori adı yoksa oluşturulur. Paket ürün sınırı aşılırsa ilgili satır hata döner.',
        requestBody: batchBody({ type: 'object', required: ['sku'], properties: { sku: { type: 'string' }, name: { type: 'string' }, price: { type: 'number' }, currency: { type: 'string' }, vatRate: { type: 'number' }, stock: { type: 'integer' }, unit: { type: 'string' }, brand: { type: 'string' }, barcode: { type: 'string' }, category: { type: 'string' }, isActive: { type: 'boolean' } } }, [{ sku: 'AKS-2001', name: 'Akülü Matkap 18V', price: 2490, vatRate: 20, stock: 40, unit: 'Adet', category: 'Elektrikli El Aletleri' }]),
        responses: { 200: { description: 'Sonuç', ...json(ref('BatchResult')) }, ...errors }
      }
    },
    '/companies': {
      get: { tags: ['Cariler'], summary: 'Carileri listele', parameters: pageParams, responses: { 200: { description: 'Cari listesi', ...json(list(ref('Company'))) }, ...errors } }
    },
    '/companies/upsert': {
      post: {
        tags: ['Cariler'], summary: 'Cari ekle / güncelle',
        description: 'Önce externalCode (ERP cari kodu), bulunamazsa taxNumber ile eşleşir. Yeni caride giriş hesabı açılmaz; yönetici panelden kullanıcı ekler.',
        requestBody: batchBody({ type: 'object', properties: { externalCode: { type: 'string' }, taxNumber: { type: 'string' }, name: { type: 'string' }, taxOffice: { type: 'string' }, authorizedPerson: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' }, riskLimit: { type: 'number' }, netDiscount: { type: 'number', description: 'Yüzde' }, dealerGroup: { type: 'string', enum: ['STANDART', 'GOLD', 'VIP'] }, paymentTermDays: { type: 'integer' } } }, [{ externalCode: '120.01.001', name: 'Yıldız Yapı Ltd.', taxNumber: '1234567890', riskLimit: 250000 }]),
        responses: { 200: { description: 'Sonuç', ...json(ref('BatchResult')) }, ...errors }
      }
    },
    '/companies/balances': {
      put: {
        tags: ['Cariler'], summary: 'Cari bakiyeleri eşitle',
        description: 'ERP\'deki güncel bakiye (artı = cari alacaklı, eksi = borçlu). Fark, bayi ekstresinde "ERP bakiye düzeltmesi" olarak görünür.',
        requestBody: batchBody({ type: 'object', required: ['balance'], properties: { externalCode: { type: 'string' }, taxNumber: { type: 'string' }, balance: { type: 'number' }, description: { type: 'string' } } }, [{ externalCode: '120.01.001', balance: -18250.5 }]),
        responses: { 200: { description: 'Sonuç', ...json({ type: 'object', properties: { updated: { type: 'integer' }, unchanged: { type: 'integer' }, notFound: { type: 'array', items: { type: 'string' } } } }) }, ...errors }
      }
    },
    '/orders': {
      get: {
        tags: ['Siparişler'], summary: 'Siparişleri listele',
        description: 'Tipik kullanım: `?status=APPROVED,PARTIAL_APPROVED&exported=false` ile aktarılmamış onaylı siparişleri çekip her biri için /orders/{id}/exported çağırmak.',
        parameters: [...pageParams,
          { name: 'status', in: 'query', description: 'Virgülle ayrılmış durumlar', schema: { type: 'string', example: 'APPROVED,PARTIAL_APPROVED' } },
          { name: 'exported', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'since', in: 'query', description: 'Oluşturulma tarihi en erken', schema: { type: 'string', format: 'date' } }],
        responses: { 200: { description: 'Sipariş listesi', ...json(list(ref('Order'))) }, ...errors }
      }
    },
    '/orders/{id}': {
      get: { tags: ['Siparişler'], summary: 'Sipariş detayı', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Sipariş', ...json(ref('Order')) }, 404: { description: 'Bulunamadı' }, ...errors } }
    },
    '/orders/{id}/exported': {
      post: { tags: ['Siparişler'], summary: 'Siparişi "ERP\'ye aktarıldı" işaretle', description: 'exported=false listesinde tekrar gelmez.', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Tamam', ...json({ type: 'object', properties: { ok: { type: 'boolean' } } }) }, ...errors } }
    },
    '/orders/{id}/status': {
      patch: {
        tags: ['Siparişler'], summary: 'Kargoya verildi / teslim edildi',
        description: 'Onay ve iptal yalnızca panelden yapılır. Bayiye bildirim ve order.updated webhook\'u gider; firma ayarlıysa fatura otomatik kesilir.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, ...json({ type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['SHIPPED', 'COMPLETED'] }, trackingNumber: { type: 'string' }, cargoCompany: { type: 'string', enum: ['YURTICI', 'ARAS', 'MNG', 'SURAT', 'PTT', 'UPS', 'DHL', 'DIGER'] } } }, { status: 'SHIPPED', trackingNumber: '1234567890', cargoCompany: 'ARAS' }) },
        responses: { 200: { description: 'Tamam', ...json({ type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'string' } } }) }, 409: { description: 'Sipariş bu işlem için uygun durumda değil' }, ...errors }
      }
    },
    '/orders/{id}/invoice': {
      put: {
        tags: ['Siparişler'], summary: 'Fatura numarası / PDF yaz',
        description: 'Faturayı ERP kestiyse numarayı ve (varsa) herkese açık PDF adresini yazar. Bayi sipariş detayında görür; invoice.issued webhook\'u gider.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, ...json({ type: 'object', required: ['number'], properties: { number: { type: 'string' }, documentType: { type: 'string', enum: ['E_FATURA', 'E_ARSIV', 'KAGIT'] }, pdfUrl: { type: 'string', format: 'uri' }, issuedAt: { type: 'string', format: 'date-time' } } }, { number: 'ABC2026000000123', documentType: 'E_FATURA', pdfUrl: 'https://erp.example.com/fatura/123.pdf' }) },
        responses: { 200: { description: 'Kaydedildi' }, 400: { description: 'Eksik / geçersiz alan' }, ...errors }
      }
    }
  },
  webhooks: Object.fromEntries(Object.entries(WEBHOOK_EVENTS).map(([event, label]) => [event, {
    post: {
      summary: label,
      description: 'Panelde tanımlanan adrese POST edilir. Başlıklar: `X-Webhook-Event` (olay adı) ve `X-Webhook-Signature` (gövdenin, webhook gizli anahtarıyla HMAC-SHA256 hex imzası). İmzayı doğrulayın; 2xx dönmezseniz 3 kez yeniden denenir.',
      requestBody: json({ type: 'object', properties: { event: { type: 'string', const: event }, createdAt: { type: 'string', format: 'date-time' }, data: { type: 'object' } } }),
      responses: { 200: { description: 'Alındı' } }
    }
  }])),
  components: {
    securitySchemes: {
      ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key', description: 'Ayrıca `Authorization: Bearer <anahtar>` da kabul edilir.' }
    },
    schemas: {
      Product: { type: 'object', properties: { id: { type: 'integer' }, sku: { type: 'string' }, barcode: { type: ['string', 'null'] }, name: { type: 'string' }, brand: { type: ['string', 'null'] }, price: { type: 'number' }, currency: { type: 'string' }, vatRate: { type: 'number' }, stock: { type: 'integer', description: 'Tüm depoların toplamı' }, unit: { type: 'string' }, moq: { type: 'integer' }, stepQuantity: { type: 'integer' }, isActive: { type: 'boolean' }, category: { type: ['string', 'null'] }, parentSku: { type: ['string', 'null'] }, variantLabel: { type: ['string', 'null'] }, updatedAt: { type: 'string', format: 'date-time' } } },
      Company: { type: 'object', properties: { id: { type: 'integer' }, externalCode: { type: ['string', 'null'] }, name: { type: 'string' }, taxNumber: { type: ['string', 'null'] }, taxOffice: { type: ['string', 'null'] }, authorizedPerson: { type: ['string', 'null'] }, phone: { type: ['string', 'null'] }, address: { type: ['string', 'null'] }, status: { type: 'string', enum: ['ACTIVE', 'PASSIVE', 'PENDING'] }, dealerGroup: { type: 'string' }, riskLimit: { type: 'number' }, balance: { type: 'number', description: 'Artı = alacaklı, eksi = borçlu' }, netDiscount: { type: 'number' } } },
      Address: { type: ['object', 'null'], properties: { title: { type: 'string' }, contactName: { type: 'string' }, phone: { type: 'string' }, city: { type: 'string' }, district: { type: 'string' }, line: { type: 'string' }, postalCode: { type: ['string', 'null'] } } },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, number: { type: 'string', example: 'AK-1024' },
          status: { type: 'string', enum: ['PENDING', 'APPROVED', 'PARTIAL_APPROVED', 'SHIPPED', 'COMPLETED', 'CANCELLED'] },
          createdAt: { type: 'string', format: 'date-time' }, approvedAt: { type: ['string', 'null'] }, exportedAt: { type: ['string', 'null'] },
          paymentMethod: { type: 'string', enum: ['CURRENT_ACCOUNT', 'WIRE_TRANSFER'] },
          subtotal: { type: 'number' }, discountAmount: { type: 'number' }, vatAmount: { type: 'number' }, total: { type: 'number', description: 'KDV dahil' },
          couponCode: { type: ['string', 'null'] }, dueDate: { type: ['string', 'null'] }, cargoCompany: { type: ['string', 'null'] }, trackingNumber: { type: ['string', 'null'] },
          company: { type: 'object', properties: { id: { type: 'integer' }, externalCode: { type: ['string', 'null'] }, name: { type: 'string' }, taxNumber: { type: ['string', 'null'] }, taxOffice: { type: ['string', 'null'] } } },
          shippingAddress: ref('Address'),
          warehouse: { type: ['object', 'null'], properties: { code: { type: 'string' }, name: { type: 'string' } } },
          invoice: { type: ['object', 'null'], properties: { status: { type: 'string' }, number: { type: ['string', 'null'] }, documentType: { type: ['string', 'null'] }, issuedAt: { type: ['string', 'null'] } } },
          items: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, name: { type: 'string' }, variantLabel: { type: ['string', 'null'] }, quantity: { type: 'integer' }, unitPrice: { type: 'number', description: 'İskontolar sonrası, KDV hariç' }, vatRate: { type: 'number' }, status: { type: 'string', enum: ['APPROVED', 'CANCELLED'] } } } }
        }
      },
      BatchResult: { type: 'object', properties: { created: { type: 'integer' }, updated: { type: 'integer' }, errors: { type: 'array', items: { type: 'object', properties: { index: { type: 'integer' }, error: { type: 'string' } } } } } }
    }
  }
});

// Kod üreticileri için her işleme kararlı bir operationId (ör. putProductsStock, webhookOrderCreated)
const camel = (parts) => parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join('');
export const openApiSpec = () => {
  const spec = build();
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      op.operationId = camel([method, ...path.split('/').filter(Boolean).map((x) => x.replace(/[{}]/g, '').replace(/^id$/, 'byId'))]);
    }
  }
  for (const [event, ops] of Object.entries(spec.webhooks)) ops.post.operationId = camel(['webhook', ...event.split('.')]);
  return spec;
};
