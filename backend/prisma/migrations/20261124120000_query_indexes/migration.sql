-- Sık kullanılan ilişki ve liste sorguları için indeksler (yük testinde tam tablo taraması yapıyordu):
-- sipariş kalemleri (orderId), bayinin siparişleri ve açık hesap bakiyesi (companyId), sipariş listesi / raporlar
-- (tenantId + createdAt / status), katalogda varyantlar (parentId) ve özellik değerleri (optionId).

-- CreateIndex
CREATE INDEX "Product_parentId_idx" ON "Product"("parentId");

-- CreateIndex
CREATE INDEX "Order_tenantId_createdAt_idx" ON "Order"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_companyId_createdAt_idx" ON "Order"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "ProductOptionValue_optionId_idx" ON "ProductOptionValue"("optionId");
