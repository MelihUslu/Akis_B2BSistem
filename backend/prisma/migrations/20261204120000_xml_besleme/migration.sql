-- Bayilere XML ürün beslemesi: bayinin gizli besleme anahtarı
ALTER TABLE "Company" ADD COLUMN "feedToken" TEXT,
ADD COLUMN "feedTokenAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Company_feedToken_key" ON "Company"("feedToken");
