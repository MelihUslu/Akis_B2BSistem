-- SMS bildirimi (Netgsm): firma ayarları ve kullanıcının cep telefonu / SMS tercihleri
ALTER TABLE "Tenant" ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "smsProvider" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "smsConfigEnc" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "smsTypes" JSONB;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "smsPrefs" JSONB;
