-- Gel-Al sipariş: teslimat yöntemi, planlanan teslim alma zamanı, hazır olma anı
ALTER TABLE "Order" ADD COLUMN "deliveryMethod" TEXT NOT NULL DEFAULT 'SHIPPING';
ALTER TABLE "Order" ADD COLUMN "pickupAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "readyAt" TIMESTAMP(3);
