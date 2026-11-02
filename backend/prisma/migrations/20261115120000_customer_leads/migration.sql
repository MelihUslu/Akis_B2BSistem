-- CreateTable
CREATE TABLE "CustomerLead" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'OTHER',
    "campaign" TEXT NOT NULL DEFAULT '',
    "request" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT NOT NULL DEFAULT '',
    "viaForm" BOOLEAN NOT NULL DEFAULT false,
    "utm" JSONB,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLead_tenantId_createdAt_idx" ON "CustomerLead"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerLead_tenantId_phone_idx" ON "CustomerLead"("tenantId", "phone");

-- AddForeignKey
ALTER TABLE "CustomerLead" ADD CONSTRAINT "CustomerLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

