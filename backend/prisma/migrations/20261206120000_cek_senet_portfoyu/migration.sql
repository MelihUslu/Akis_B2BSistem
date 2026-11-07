-- Çek / senet portföyü (Finans → Çek / Senet)
CREATE TABLE "Cheque" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "number" TEXT,
    "bankName" TEXT,
    "drawer" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PORTFOY',
    "statusAt" TIMESTAMP(3),
    "endorsedToId" INTEGER,
    "endorsePaymentId" INTEGER,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cheque_paymentId_key" ON "Cheque"("paymentId");
CREATE UNIQUE INDEX "Cheque_endorsePaymentId_key" ON "Cheque"("endorsePaymentId");
CREATE INDEX "Cheque_tenantId_status_dueDate_idx" ON "Cheque"("tenantId", "status", "dueDate");

ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_endorsedToId_fkey" FOREIGN KEY ("endorsedToId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_endorsePaymentId_fkey" FOREIGN KEY ("endorsePaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bugüne kadar çek / senetle alınmış, iptal edilmemiş tahsilatlar portföye "portföyde" olarak girer (yalnızca ekleme;
-- tahsilatlara ve cariye dokunulmaz). Gerçek durumları (bankada, tahsil edildi…) firma portföy ekranından işaretler.
INSERT INTO "Cheque" ("tenantId", "kind", "paymentId", "companyId", "number", "bankName", "amount", "currency", "dueDate", "status", "history", "updatedAt")
SELECT p."tenantId", p."method", p."id", p."companyId", p."reference", p."bankName", p."amount", p."currency", p."dueDate", 'PORTFOY', '[]', CURRENT_TIMESTAMP
FROM "Payment" p
WHERE p."method" IN ('CHECK', 'NOTE') AND p."direction" = 'IN' AND p."status" = 'COMPLETED'
  AND p."dueDate" IS NOT NULL AND p."companyId" IS NOT NULL;
