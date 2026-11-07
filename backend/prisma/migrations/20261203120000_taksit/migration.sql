-- Kartla ödemede taksit: firma ayarı ve ödemede taksit sayısı / karttan çekilen toplam
ALTER TABLE "Tenant" ADD COLUMN "posMaxInstallment" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "posInstallmentMin" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "Payment" ADD COLUMN "installment" INTEGER,
ADD COLUMN "paidTotal" DOUBLE PRECISION;
