-- Abonelik havale / EFT bildirimleri
CREATE TABLE "TransferNotice" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planCode" TEXT NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "senderName" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentId" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "rejectReason" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransferNotice_tenantId_status_idx" ON "TransferNotice"("tenantId", "status");

ALTER TABLE "TransferNotice" ADD CONSTRAINT "TransferNotice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
