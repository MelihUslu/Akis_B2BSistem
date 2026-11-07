-- Bayi içinde sipariş onayı: kullanıcı başına onay kuralı ve onay talepleri
ALTER TABLE "User" ADD COLUMN "orderApproval" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "orderApprovalLimit" DOUBLE PRECISION;

CREATE TABLE "OrderRequest" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "reason" TEXT,
    "orderId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderRequest_orderId_key" ON "OrderRequest"("orderId");
CREATE INDEX "OrderRequest_tenantId_companyId_status_idx" ON "OrderRequest"("tenantId", "companyId", "status");

ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
