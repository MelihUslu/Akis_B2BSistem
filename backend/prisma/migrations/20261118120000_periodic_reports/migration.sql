-- CreateTable
CREATE TABLE "PeriodicReport" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodicReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeriodicReport_tenantId_createdAt_idx" ON "PeriodicReport"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodicReport_tenantId_period_from_key" ON "PeriodicReport"("tenantId", "period", "from");

-- AddForeignKey
ALTER TABLE "PeriodicReport" ADD CONSTRAINT "PeriodicReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

