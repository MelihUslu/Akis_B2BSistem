-- Cari türleri (bayi / portal dışı müşteri / tedarikçi) ve yetkili kişiler. Mevcut tüm cariler bayi (DEALER) olarak kalır.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "email" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DEALER',
ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "CompanyContact" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyContact_tenantId_idx" ON "CompanyContact"("tenantId");

-- CreateIndex
CREATE INDEX "CompanyContact_companyId_idx" ON "CompanyContact"("companyId");

-- CreateIndex
CREATE INDEX "Company_tenantId_kind_idx" ON "Company"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

