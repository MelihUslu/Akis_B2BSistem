-- AlterTable
ALTER TABLE "SubscriptionPayment" ADD COLUMN     "invoiceError" TEXT,
ADD COLUMN     "invoiceExternalId" TEXT,
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "invoiceStatus" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "invoiceAutoOn" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "invoiceConfigEnc" TEXT,
ADD COLUMN     "invoiceProvider" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "documentType" TEXT,
    "number" TEXT,
    "externalId" TEXT,
    "pdfUrl" TEXT,
    "amount" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

