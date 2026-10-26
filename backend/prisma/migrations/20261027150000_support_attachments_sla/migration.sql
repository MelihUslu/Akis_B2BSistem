-- AlterTable
ALTER TABLE "SupportMessage" ADD COLUMN     "attachments" JSONB;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "context" JSONB,
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "firstResponseAt" TIMESTAMP(3);


-- Açık taleplere hedef yanıt zamanı ver (acil 2 saat, normal 24 saat; son güncellemeden itibaren)
UPDATE "SupportTicket" SET "dueAt" = "updatedAt" + (CASE WHEN "priority" = 'HIGH' THEN INTERVAL '2 hours' ELSE INTERVAL '24 hours' END) WHERE "status" = 'OPEN';
