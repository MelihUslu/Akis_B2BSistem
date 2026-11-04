-- Personel yönetimi: personel kartı, izin, masraf / avans, personel hedefi, firma içi duyuru.
-- Gelir-gider kaydına kaynak bağı (personel ödemesi; tekil: mükerrer ödeme engellenir).
-- AlterTable
ALTER TABLE "CashEntry" ADD COLUMN     "sourceRef" TEXT;

-- CreateTable
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "title" TEXT,
    "hireDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" INTEGER,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClaim" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "fileName" TEXT,
    "storedName" TEXT,
    "mimeType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" INTEGER,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" INTEGER,
    "paidByName" TEXT,
    "paymentMethod" TEXT,
    "cashEntryId" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffTarget" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "targetAmount" DOUBLE PRECISION NOT NULL,
    "bonusRate" DOUBLE PRECISION NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'SALES',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "achievedAmount" DOUBLE PRECISION,
    "bonusAmount" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "closedByName" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "paidAt" TIMESTAMP(3),
    "paidById" INTEGER,
    "paidByName" TEXT,
    "paymentMethod" TEXT,
    "cashEntryId" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAnnouncement" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "departments" TEXT[],
    "createdById" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenantId_status_idx" ON "LeaveRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClaim_cashEntryId_key" ON "StaffClaim"("cashEntryId");

-- CreateIndex
CREATE INDEX "StaffClaim_tenantId_status_idx" ON "StaffClaim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StaffClaim_employeeId_idx" ON "StaffClaim"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffTarget_cashEntryId_key" ON "StaffTarget"("cashEntryId");

-- CreateIndex
CREATE INDEX "StaffTarget_tenantId_period_idx" ON "StaffTarget"("tenantId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "StaffTarget_employeeId_period_key" ON "StaffTarget"("employeeId", "period");

-- CreateIndex
CREATE INDEX "StaffAnnouncement_tenantId_createdAt_idx" ON "StaffAnnouncement"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashEntry_sourceRef_key" ON "CashEntry"("sourceRef");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClaim" ADD CONSTRAINT "StaffClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClaim" ADD CONSTRAINT "StaffClaim_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTarget" ADD CONSTRAINT "StaffTarget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffTarget" ADD CONSTRAINT "StaffTarget_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAnnouncement" ADD CONSTRAINT "StaffAnnouncement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

