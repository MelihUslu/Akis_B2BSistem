-- Depo yönetimi (WMS): stok hareket defteri (StockMovement), raf/göz (WarehouseBin) ve raf stoğu (BinStock).
-- Mevcut Warehouse / WarehouseStock korunur; bu tablolar üstüne gelişmiş katmanı ekler.

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "warehouseId" INTEGER,
    "binId" INTEGER,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "refType" TEXT,
    "refId" INTEGER,
    "userId" INTEGER,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseBin" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseBin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BinStock" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "binId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BinStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_createdAt_idx" ON "StockMovement"("tenantId", "productId", "createdAt");
CREATE INDEX "StockMovement_tenantId_warehouseId_createdAt_idx" ON "StockMovement"("tenantId", "warehouseId", "createdAt");
CREATE INDEX "StockMovement_tenantId_createdAt_idx" ON "StockMovement"("tenantId", "createdAt");
CREATE INDEX "WarehouseBin_tenantId_idx" ON "WarehouseBin"("tenantId");
CREATE INDEX "WarehouseBin_warehouseId_idx" ON "WarehouseBin"("warehouseId");
CREATE UNIQUE INDEX "WarehouseBin_warehouseId_code_key" ON "WarehouseBin"("warehouseId", "code");
CREATE INDEX "BinStock_tenantId_idx" ON "BinStock"("tenantId");
CREATE INDEX "BinStock_productId_idx" ON "BinStock"("productId");
CREATE UNIQUE INDEX "BinStock_binId_productId_key" ON "BinStock"("binId", "productId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseBin" ADD CONSTRAINT "WarehouseBin_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BinStock" ADD CONSTRAINT "BinStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BinStock" ADD CONSTRAINT "BinStock_binId_fkey" FOREIGN KEY ("binId") REFERENCES "WarehouseBin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BinStock" ADD CONSTRAINT "BinStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Firmalar arası ilişki denetimi: yeni WMS tablolarının ilişkileri de aynı firmaya ait olmalı (tenant_ref_check).
CREATE TRIGGER "tenant_ref_StockMovement_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
CREATE TRIGGER "tenant_ref_StockMovement_warehouseId" BEFORE INSERT OR UPDATE OF "warehouseId", "tenantId" ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Warehouse', 'warehouseId');
CREATE TRIGGER "tenant_ref_StockMovement_binId" BEFORE INSERT OR UPDATE OF "binId", "tenantId" ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('WarehouseBin', 'binId');
CREATE TRIGGER "tenant_ref_WarehouseBin_warehouseId" BEFORE INSERT OR UPDATE OF "warehouseId", "tenantId" ON "WarehouseBin" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Warehouse', 'warehouseId');
CREATE TRIGGER "tenant_ref_BinStock_binId" BEFORE INSERT OR UPDATE OF "binId", "tenantId" ON "BinStock" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('WarehouseBin', 'binId');
CREATE TRIGGER "tenant_ref_BinStock_productId" BEFORE INSERT OR UPDATE OF "productId", "tenantId" ON "BinStock" FOR EACH ROW EXECUTE FUNCTION tenant_ref_check('Product', 'productId');
