-- Plasiyer saha ziyareti (plasiyer paneli → Ziyaretler; yönetim → Saha Ziyaretleri)
CREATE TABLE "Visit" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "plannedFor" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "doneAt" TIMESTAMP(3),
    "result" TEXT,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Visit_tenantId_userId_status_plannedFor_idx" ON "Visit"("tenantId", "userId", "status", "plannedFor");
CREATE INDEX "Visit_tenantId_companyId_doneAt_idx" ON "Visit"("tenantId", "companyId", "doneAt");

ALTER TABLE "Visit" ADD CONSTRAINT "Visit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
