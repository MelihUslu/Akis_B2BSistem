-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shipmentInfo" TEXT,
ADD COLUMN     "shipmentKey" TEXT,
ADD COLUMN     "shipmentProvider" TEXT,
ADD COLUMN     "shipmentStatus" TEXT,
ADD COLUMN     "shipmentSyncedAt" TIMESTAMP(3),
ADD COLUMN     "shippingAddress" JSONB;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "cargoConfigEnc" TEXT,
ADD COLUMN     "cargoMode" TEXT NOT NULL DEFAULT 'TEST',
ADD COLUMN     "cargoProvider" TEXT;

-- CreateTable
CREATE TABLE "DeliveryAddress" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "postalCode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryAddress_tenantId_idx" ON "DeliveryAddress"("tenantId");

-- CreateIndex
CREATE INDEX "DeliveryAddress_companyId_idx" ON "DeliveryAddress"("companyId");

-- AddForeignKey
ALTER TABLE "DeliveryAddress" ADD CONSTRAINT "DeliveryAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAddress" ADD CONSTRAINT "DeliveryAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

