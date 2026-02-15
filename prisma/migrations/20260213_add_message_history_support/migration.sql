-- AlterEnum: Add WHATSAPP_SOCIAL_FLOW to LeadSource
ALTER TYPE "LeadSource" ADD VALUE 'WHATSAPP_SOCIAL_FLOW';

-- AlterTable: Add columns to Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "messageType" TEXT DEFAULT 'text';
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex: Unique constraint on chatId + externalId
CREATE UNIQUE INDEX IF NOT EXISTS "Message_chatId_externalId_key" ON "Message"("chatId", "externalId");

-- CreateIndex: Index on externalId
CREATE INDEX IF NOT EXISTS "Message_externalId_idx" ON "Message"("externalId");
