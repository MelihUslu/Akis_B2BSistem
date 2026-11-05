-- Büyük veride sık sorgular için indeksler (yük testi, 10 kat veri: 50 bin ürün, 600 bin sipariş — 5 Kasım 2026).
-- Katalog araması "içinde geçen" (ILIKE '%…%') olduğu için trigram indeksi gerekir; pg_trgm PostgreSQL 13+'ta
-- veritabanı sahibi tarafından kurulabilen güvenilir bir eklentidir.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "Product_tenantId_sortOrder_createdAt_idx" ON "Product"("tenantId", "sortOrder", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product" USING GIN ("sku" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product" USING GIN ("barcode" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_brand_idx" ON "Product" USING GIN ("brand" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Order_tenantId_status_createdAt_totalAmount_idx" ON "Order"("tenantId", "status", "createdAt", "totalAmount");

-- Ürün sayfalarında %10 boş yer: ERP'nin stok / fiyat güncellemeleri satırı aynı sayfada yeniler (HOT), indekslere
-- (trigram dahil) yeni kayıt yazılmaz. Fiyata indeks bu yüzden yok: her fiyat güncellemesinde bütün indekslere yazdırıyordu.
ALTER TABLE "Product" SET (fillfactor = 90);
