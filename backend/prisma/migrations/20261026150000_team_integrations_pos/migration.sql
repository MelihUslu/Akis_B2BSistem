-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "applicationNote" TEXT,
ADD COLUMN     "externalCode" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ADMIN';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cargoCompany" TEXT,
ADD COLUMN     "exportedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "token" TEXT,
ADD COLUMN     "userId" INTEGER;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "posApiKey" TEXT,
ADD COLUMN     "posMode" TEXT NOT NULL DEFAULT 'SANDBOX',
ADD COLUMN     "posProvider" TEXT,
ADD COLUMN     "posSecretEnc" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "permissions" JSONB;

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "events" JSONB NOT NULL,
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "lastAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

-- CreateIndex
CREATE INDEX "Webhook_tenantId_idx" ON "Webhook"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_externalCode_key" ON "Company"("tenantId", "externalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_token_key" ON "Payment"("token");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Veri: mevcut yöneticiler firma sahibidir (tüm yetkiler); her bayinin ilk kullanıcısı ana kullanıcıdır
UPDATE "User" SET "isOwner" = true WHERE "role" = 'ADMIN';
UPDATE "User" u SET "isOwner" = true
WHERE u."role" = 'BAYI' AND u."id" = (SELECT MIN(u2."id") FROM "User" u2 WHERE u2."companyId" = u."companyId" AND u2."role" = 'BAYI');
