-- Toplu e-posta: gönderimler, alıcıları ve abonelikten çıkanlar (Müşteriler → Toplu E-posta)
CREATE TABLE "MailCampaign" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailCampaignRecipient" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailOptOut" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOptOut_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailCampaign_tenantId_createdAt_idx" ON "MailCampaign"("tenantId", "createdAt");

CREATE INDEX "MailCampaign_status_updatedAt_idx" ON "MailCampaign"("status", "updatedAt");

CREATE INDEX "MailCampaignRecipient_campaignId_status_idx" ON "MailCampaignRecipient"("campaignId", "status");

CREATE UNIQUE INDEX "EmailOptOut_tenantId_email_key" ON "EmailOptOut"("tenantId", "email");

ALTER TABLE "MailCampaign" ADD CONSTRAINT "MailCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailCampaign" ADD CONSTRAINT "MailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailCampaignRecipient" ADD CONSTRAINT "MailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailOptOut" ADD CONSTRAINT "EmailOptOut_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

