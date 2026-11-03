-- Gelir-gider: KDV oranı, fiş/fatura eki, düzenli gelir/gider
ALTER TABLE "CashEntry" ADD COLUMN "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CashEntry" ADD COLUMN "fileName" TEXT;
ALTER TABLE "CashEntry" ADD COLUMN "storedName" TEXT;
ALTER TABLE "CashEntry" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "CashEntry" ADD COLUMN "recurringId" INTEGER;

CREATE TABLE "CashRecurring" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "method" TEXT,
    "description" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunMonth" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRecurring_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashRecurring_tenantId_idx" ON "CashRecurring"("tenantId");

ALTER TABLE "CashRecurring" ADD CONSTRAINT "CashRecurring_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashEntry" ADD CONSTRAINT "CashEntry_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "CashRecurring"("id") ON DELETE SET NULL ON UPDATE CASCADE;
