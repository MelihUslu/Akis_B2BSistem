-- Personel yönetimi eksikleri: kısmi ödeme ve avans kapanışı (StaffPayment), departman yöneticisi, izin hakkı (firma
-- yıllık izni, devir), yarım gün izin. Eski tek ödeme alanları (paidById, paidByName, paymentMethod, cashEntryId)
-- önce StaffPayment'a taşınır, sonra kaldırılır; gelir-gider kaydının kaynak anahtarı STAFF_PAY:<ödeme> olur.

-- Personel kartı ve izin
ALTER TABLE "Employee" ADD COLUMN "annualLeaveDays" INTEGER,
ADD COLUMN "leaveCarryDate" TIMESTAMP(3),
ADD COLUMN "leaveCarryDays" DOUBLE PRECISION,
ADD COLUMN "managerId" INTEGER;
CREATE INDEX "Employee_managerId_idx" ON "Employee"("managerId");
ALTER TABLE "LeaveRequest" ADD COLUMN "half" TEXT;

-- Ödemeler
CREATE TABLE "StaffPayment" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "method" TEXT,
    "claimId" INTEGER,
    "targetId" INTEGER,
    "advanceId" INTEGER,
    "cashEntryId" INTEGER,
    "note" TEXT,
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffPayment_cashEntryId_key" ON "StaffPayment"("cashEntryId");
CREATE INDEX "StaffPayment_tenantId_idx" ON "StaffPayment"("tenantId");
CREATE INDEX "StaffPayment_claimId_idx" ON "StaffPayment"("claimId");
CREATE INDEX "StaffPayment_targetId_idx" ON "StaffPayment"("targetId");
CREATE INDEX "StaffPayment_advanceId_idx" ON "StaffPayment"("advanceId");

ALTER TABLE "StaffClaim" ADD COLUMN "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "settledAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Mevcut ödemeler yeni yapıya (tek seferde tamamı ödenmiş kabul edilir)
INSERT INTO "StaffPayment" ("tenantId", "employeeId", "kind", "amount", "date", "method", "claimId", "cashEntryId", "createdById", "createdByName", "createdAt")
SELECT c."tenantId", c."employeeId", 'PAYOUT', c."amount", c."paidAt", c."paymentMethod", c."id", c."cashEntryId", c."paidById", c."paidByName", c."paidAt"
FROM "StaffClaim" c WHERE c."paidAt" IS NOT NULL;
UPDATE "StaffClaim" SET "paidAmount" = "amount" WHERE "paidAt" IS NOT NULL;

INSERT INTO "StaffPayment" ("tenantId", "employeeId", "kind", "amount", "date", "method", "targetId", "cashEntryId", "createdById", "createdByName", "createdAt")
SELECT t."tenantId", t."employeeId", 'PAYOUT', COALESCE(t."paidAmount", t."bonusAmount", 0), t."paidAt", t."paymentMethod", t."id", t."cashEntryId", t."paidById", t."paidByName", t."paidAt"
FROM "StaffTarget" t WHERE t."paidAt" IS NOT NULL;
UPDATE "StaffTarget" SET "paidAmount" = 0 WHERE "paidAmount" IS NULL;

UPDATE "CashEntry" e SET "sourceRef" = 'STAFF_PAY:' || p."id" FROM "StaffPayment" p WHERE p."cashEntryId" = e."id";

-- Eski tek ödeme alanları
DROP INDEX "StaffClaim_cashEntryId_key";
DROP INDEX "StaffTarget_cashEntryId_key";
ALTER TABLE "StaffClaim" DROP COLUMN "cashEntryId", DROP COLUMN "paidById", DROP COLUMN "paidByName", DROP COLUMN "paymentMethod";
ALTER TABLE "StaffTarget" DROP COLUMN "cashEntryId", DROP COLUMN "paidById", DROP COLUMN "paidByName", DROP COLUMN "paymentMethod",
ALTER COLUMN "paidAmount" SET NOT NULL,
ALTER COLUMN "paidAmount" SET DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "StaffClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "StaffTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayment" ADD CONSTRAINT "StaffPayment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "StaffClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

