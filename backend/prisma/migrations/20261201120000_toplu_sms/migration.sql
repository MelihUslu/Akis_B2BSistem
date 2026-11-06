-- Toplu SMS: gönderimler ve alıcıları (Müşteriler → Toplu SMS)
CREATE TABLE "SmsCampaign" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "parts" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsCampaignRecipient" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "SmsCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsCampaign_tenantId_createdAt_idx" ON "SmsCampaign"("tenantId", "createdAt");

CREATE INDEX "SmsCampaignRecipient_campaignId_idx" ON "SmsCampaignRecipient"("campaignId");

ALTER TABLE "SmsCampaign" ADD CONSTRAINT "SmsCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SmsCampaign" ADD CONSTRAINT "SmsCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SmsCampaignRecipient" ADD CONSTRAINT "SmsCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SmsCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

