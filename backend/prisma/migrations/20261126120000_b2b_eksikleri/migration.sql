-- Sipariş notu / referans no, kargo ücreti, kanal (bayi / yönetici / plasiyer / teklif), otomatik onay, bayi iptali,
-- irsaliye no, kısmi sevkiyat, süreli özel fiyat, ürün-kategori görünürlüğü, sunucuda sepet, bayi hedefi ve ciro primi

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "visibleGroups" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "customerRef" TEXT,
ADD COLUMN     "despatchDate" TIMESTAMP(3),
ADD COLUMN     "despatchNumber" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "shippingFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "shippingVat" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "shippedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "visibleGroups" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SpecialPrice" ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cart" JSONB,
ADD COLUMN     "cartUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderShipment" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "trackingNumber" TEXT,
    "cargoCompany" TEXT,
    "items" JSONB NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealerTarget" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "bonusRate" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "achievedAmount" DOUBLE PRECISION,
    "paidAmount" DOUBLE PRECISION,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealerTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderShipment_tenantId_idx" ON "OrderShipment"("tenantId");

-- CreateIndex
CREATE INDEX "OrderShipment_orderId_idx" ON "OrderShipment"("orderId");

-- CreateIndex
CREATE INDEX "DealerTarget_tenantId_idx" ON "DealerTarget"("tenantId");

-- CreateIndex
CREATE INDEX "DealerTarget_companyId_idx" ON "DealerTarget"("companyId");

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShipment" ADD CONSTRAINT "OrderShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerTarget" ADD CONSTRAINT "DealerTarget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerTarget" ADD CONSTRAINT "DealerTarget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mevcut veriler: tekliften oluşan siparişler "QUOTE" kanalına; kargoya verilmiş / teslim edilmiş siparişlerin
-- onaylı kalemleri tamamen sevk edilmiş sayılır (kısmi sevkiyat hesabı eski siparişlerde doğru çıksın)
UPDATE "Order" o SET "channel" = 'QUOTE' FROM "QuoteRequest" q WHERE q."orderId" = o."id";
UPDATE "OrderItem" i SET "shippedQty" = i."quantity"
  FROM "Order" o WHERE o."id" = i."orderId" AND i."status" = 'APPROVED' AND o."deliveryMethod" = 'SHIPPING' AND o."status" IN ('SHIPPED', 'COMPLETED');
