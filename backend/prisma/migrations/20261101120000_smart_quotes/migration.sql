-- Akıllı teklif modülü: mevcut teklif talepleri (RFQ) korunur ve genişletilir.
-- Var olan kayıtlar veri kaybı olmadan taşınır: teklif numarası mevcut id ile doldurulur,
-- eski kalem fiyatları "elle girilmiş fiyat" olarak işaretlenir.

-- DropForeignKey
ALTER TABLE "QuoteRequestItem" DROP CONSTRAINT "QuoteRequestItem_productId_fkey";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "packSize" INTEGER,
ADD COLUMN     "packUnit" TEXT;

-- AlterTable
ALTER TABLE "QuoteRequest" ADD COLUMN     "aiMeta" JSONB,
ADD COLUMN     "aiRequest" TEXT,
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvalReasons" JSONB,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" INTEGER,
ADD COLUMN     "approvedByName" TEXT,
ADD COLUMN     "convertedAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN     "deliveryTerms" TEXT,
ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "preparedById" INTEGER,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "responseBy" TEXT,
ADD COLUMN     "responseNote" TEXT,
ADD COLUMN     "responseType" TEXT,
ADD COLUMN     "responseVia" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentRevision" INTEGER,
ADD COLUMN     "shareTokenEnc" TEXT,
ADD COLUMN     "shareTokenHash" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'DEALER',
ADD COLUMN     "subtotal" DOUBLE PRECISION,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "totalAmount" DOUBLE PRECISION,
ADD COLUMN     "vatAmount" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "QuoteRequestItem" ADD COLUMN     "alternatives" JSONB,
ADD COLUMN     "basePrice" DOUBLE PRECISION,
ADD COLUMN     "discountRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "manualPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matchReason" TEXT,
ADD COLUMN     "matchStatus" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "requestText" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRate" DOUBLE PRECISION,
ADD COLUMN     "warnings" JSONB,
ALTER COLUMN "productId" DROP NOT NULL;


-- Mevcut teklifler: numara = id (eski bildirimlerdeki #TK-{id} referansları geçerli kalır)
UPDATE "QuoteRequest" SET "number" = "id" WHERE "number" IS NULL;
ALTER TABLE "QuoteRequest" ALTER COLUMN "number" SET NOT NULL;

-- Eski akışta fiyatı yönetici elle verirdi
UPDATE "QuoteRequestItem" SET "manualPrice" = true WHERE "quotedPrice" IS NOT NULL;
UPDATE "QuoteRequestItem" i SET "vatRate" = COALESCE(pp."vatRate", p."vatRate")
FROM "Product" p LEFT JOIN "Product" pp ON pp."id" = p."parentId"
WHERE p."id" = i."productId" AND i."vatRate" IS NULL;

-- Teklifleri bugüne kadar "Siparişler" yetkisiyle yöneten personel, teklif hazırlama ve fiyat verme yetkisini korur
UPDATE "User" SET "permissions" = "permissions" || '["QUOTES", "QUOTE_PRICING"]'::jsonb
WHERE "role" = 'ADMIN' AND jsonb_typeof("permissions") = 'array' AND "permissions" @> '["ORDERS"]'::jsonb
  AND NOT "permissions" @> '["QUOTES"]'::jsonb;

-- CreateTable
CREATE TABLE "ProductCompatibility" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "compatibleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRevision" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "quoteRequestId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "sentById" INTEGER,
    "sentByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCompatibility_tenantId_idx" ON "ProductCompatibility"("tenantId");

-- CreateIndex
CREATE INDEX "ProductCompatibility_compatibleId_idx" ON "ProductCompatibility"("compatibleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCompatibility_productId_compatibleId_key" ON "ProductCompatibility"("productId", "compatibleId");

-- CreateIndex
CREATE INDEX "QuoteRevision_tenantId_idx" ON "QuoteRevision"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRevision_quoteRequestId_revision_key" ON "QuoteRevision"("quoteRequestId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_shareTokenHash_key" ON "QuoteRequest"("shareTokenHash");

-- CreateIndex
CREATE INDEX "QuoteRequest_tenantId_status_idx" ON "QuoteRequest"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_tenantId_number_key" ON "QuoteRequest"("tenantId", "number");

-- AddForeignKey
ALTER TABLE "ProductCompatibility" ADD CONSTRAINT "ProductCompatibility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCompatibility" ADD CONSTRAINT "ProductCompatibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCompatibility" ADD CONSTRAINT "ProductCompatibility_compatibleId_fkey" FOREIGN KEY ("compatibleId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequestItem" ADD CONSTRAINT "QuoteRequestItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRevision" ADD CONSTRAINT "QuoteRevision_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

