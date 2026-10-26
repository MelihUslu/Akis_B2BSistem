-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "iyzicoCheckoutToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_iyzicoCheckoutToken_key" ON "Tenant"("iyzicoCheckoutToken");

