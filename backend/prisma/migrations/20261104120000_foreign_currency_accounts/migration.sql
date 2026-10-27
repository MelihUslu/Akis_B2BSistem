-- Dövizli cari (USD / EUR): cari para birimi, hareket kuru ve TL karşılığı, sipariş kurları. Mevcut tüm cariler TL kalır.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY';

-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "amountTRY" DOUBLE PRECISION,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN     "rate" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fxRates" JSONB;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "accountAmount" DOUBLE PRECISION,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'TRY',
ADD COLUMN     "rate" DOUBLE PRECISION NOT NULL DEFAULT 1;


-- Mevcut hareketler ve tahsilatlar TL'dir: TL karşılığı tutarın kendisi, kur 1
UPDATE "FinancialTransaction" SET "amountTRY" = "amount" WHERE "amountTRY" IS NULL;
UPDATE "Payment" SET "accountAmount" = "amount" WHERE "accountAmount" IS NULL;
