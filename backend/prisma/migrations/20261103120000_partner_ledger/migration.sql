-- Cari defteri: hareket kaynağı / ters kayıt, tahsilat-ödeme ayrıntıları, etiket ve sorumlu,
-- görüşme notları, belgeler, ekstre bağlantısıyla mutabakat. Mevcut veriler korunur.

-- DropForeignKey
ALTER TABLE "Reconciliation" DROP CONSTRAINT "Reconciliation_userId_fkey";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "ownerId" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "paymentId" INTEGER,
ADD COLUMN     "reversalOfId" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "createdByName" TEXT,
ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'IN',
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "note" TEXT,
ADD COLUMN     "receiptNo" INTEGER;

-- AlterTable
ALTER TABLE "Reconciliation" ADD COLUMN     "responderName" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PartnerNote" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "body" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDocument" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementRequest" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sentTo" TEXT,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "createdByName" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "response" TEXT,
    "responseNote" TEXT,
    "responderName" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerNote_tenantId_idx" ON "PartnerNote"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerNote_companyId_idx" ON "PartnerNote"("companyId");

-- CreateIndex
CREATE INDEX "PartnerNote_tenantId_remindAt_idx" ON "PartnerNote"("tenantId", "remindAt");

-- CreateIndex
CREATE INDEX "PartnerDocument_tenantId_idx" ON "PartnerDocument"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerDocument_companyId_idx" ON "PartnerDocument"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementRequest_tokenHash_key" ON "StatementRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "StatementRequest_tenantId_idx" ON "StatementRequest"("tenantId");

-- CreateIndex
CREATE INDEX "StatementRequest_companyId_idx" ON "StatementRequest"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialTransaction_reversalOfId_key" ON "FinancialTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_date_idx" ON "FinancialTransaction"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_receiptNo_key" ON "Payment"("tenantId", "receiptNo");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNote" ADD CONSTRAINT "PartnerNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNote" ADD CONSTRAINT "PartnerNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNote" ADD CONSTRAINT "PartnerNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementRequest" ADD CONSTRAINT "StatementRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementRequest" ADD CONSTRAINT "StatementRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Mevcut hareketlerin kaynağı açıklama ve bağlantılarından çıkarılır
UPDATE "FinancialTransaction" SET "source" = 'RETURN' WHERE "description" LIKE 'İade #RMA-%';
UPDATE "FinancialTransaction" SET "source" = 'ORDER' WHERE "source" = 'MANUAL' AND "orderId" IS NOT NULL;
UPDATE "FinancialTransaction" SET "source" = 'PAYMENT' WHERE "source" = 'MANUAL' AND ("description" LIKE 'Sanal POS%' OR "description" LIKE '%tahsilat%' OR "description" LIKE 'Kartla%');
UPDATE "FinancialTransaction" SET "source" = 'ERP' WHERE "source" = 'MANUAL' AND "description" LIKE 'ERP%';
